import { parse } from 'yaml'

import { deleteConnection, getConnections, useProxy } from '@/api/kernel'
import {
  AbsolutePath,
  Exec,
  ExitApp,
  FileExists,
  GetEnv,
  GetSystemProxy,
  ReadFile,
  RemoveFile,
  WindowReloadApp,
  WriteFile,
} from '@/bridge'
import { CoreWorkingDirectory } from '@/constant/kernel'
import { OS, RequestProxyMode } from '@/enums/app'
import { ProxyGroupType, RulesetBehavior, RulesetFormat } from '@/enums/kernel'
import i18n from '@/lang'
import {
  useAppSettingsStore,
  useAppStore,
  useEnvStore,
  useKernelApiStore,
  usePluginsStore,
  useRulesetsStore,
} from '@/stores'
import {
  formatProxyHost,
  ignoredError,
  normalizeRequestProxy,
  stringifyNoFolding,
  message,
  confirm,
  APP_TITLE,
  getAutoStartConfiguration,
} from '@/utils'

// Permissions Helper
export const SwitchPermissions = async (enable: boolean) => {
  const { appPath } = useEnvStore().env
  const args = enable
    ? [
      'add',
      'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers',
      '/v',
      appPath,
      '/t',
      'REG_SZ',
      '/d',
      'RunAsAdmin',
      '/f',
    ]
    : [
      'delete',
      'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers',
      '/v',
      appPath,
      '/f',
    ]
  await Exec('reg', args, { Convert: true })
}

export const CheckPermissions = async () => {
  const { appPath } = useEnvStore().env
  try {
    const out = await Exec(
      'reg',
      [
        'query',
        'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers',
        '/v',
        appPath,
        '/t',
        'REG_SZ',
      ],
      { Convert: true },
    )
    return out.includes('RunAsAdmin')
  } catch {
    return false
  }
}

// Windows Task Scheduler helper
// TUN Permission Helper
export const GrantTUNPermission = async (path: string) => {
  const { os } = useEnvStore().env
  const absPath = await AbsolutePath(path)
  if (os === OS.Darwin) {
    const command = `chown root:admin "${absPath}"; chmod +sx "${absPath}"`
    await RunWithOsaScript(command, [], { admin: true, wait: true })
  } else if (os === OS.Linux) {
    await Exec('pkexec', [
      'setcap',
      'cap_net_bind_service,cap_net_admin,cap_dac_override=+ep',
      absPath,
    ])
  }
}

export const RunWithOsaScript = async (
  path: string,
  args: string[] = [],
  options: { admin?: boolean; wait?: boolean } = {},
) => {
  const { admin = false, wait = true, ...others } = options
  const escapedArgs = args.map((arg) => `'${arg.replace(/'/g, "'\\''")}'`).join(' ')
  let shellCmd = `${path} ${escapedArgs}`.trim()
  if (!wait) {
    shellCmd += ' > /dev/null 2>&1 &'
  }
  const escapedShellCmd = shellCmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  let appleScript = `do shell script "${escapedShellCmd}"`
  if (admin) {
    appleScript += ' with administrator privileges'
  }
  const osaArgs = ['-e', appleScript]
  return await Exec('osascript', osaArgs, others)
}

export const RunWithPowerShell = async (
  path: string,
  args: string[] = [],
  options: { admin?: boolean; hidden?: boolean; wait?: boolean } = {},
) => {
  const { admin = false, hidden = false, wait = true, ...others } = options
  const psArgs: string[] = []
  let command = `Start-Process -FilePath "${path}"`
  if (args.length > 0) {
    const argList = args.map((a) => `"${a.replace(/"/g, '""')}"`).join(',')
    command += ` -ArgumentList ${argList}`
  }
  if (admin) {
    command += ' -Verb RunAs'
  }
  if (hidden) {
    command += ' -WindowStyle Hidden'
  }
  if (wait) {
    command += ' -Wait'
  }
  psArgs.push('-NoProfile', '-Command', command)
  return await Exec('powershell', psArgs, { Convert: true, ...others })
}

const requestProxyCache: { proxyPromise: Promise<string> | null; lastAccessTime: number } = {
  proxyPromise: null,
  lastAccessTime: 0,
}

export const GetRequestProxy = async (mode?: App.RequestProxyMode, customProxy?: string) => {
  const appSettings = useAppSettingsStore()
  const requestProxyMode = mode ?? appSettings.app.requestProxyMode

  if (requestProxyMode === RequestProxyMode.None) {
    return ''
  }

  if (requestProxyMode === RequestProxyMode.Kernel) {
    const kernelProxy = useKernelApiStore().getProxyEndpoint()
    if (!kernelProxy) return ''

    const { schema, host, port, username, password } = kernelProxy
    const formattedHost = formatProxyHost(host)
    const encodedUsername = encodeURIComponent(username)
    const encodedPassword = password ? `:${encodeURIComponent(password)}` : ''
    const auth = username || password ? `${encodedUsername}${encodedPassword}@` : ''

    return `${schema}://${auth}${formattedHost}:${port}`
  }

  if (requestProxyMode === RequestProxyMode.Custom) {
    return normalizeRequestProxy(customProxy ?? appSettings.app.customProxy)
  }

  if (requestProxyCache.proxyPromise && Date.now() - requestProxyCache.lastAccessTime < 1000) {
    return requestProxyCache.proxyPromise
  }

  requestProxyCache.lastAccessTime = Date.now()
  requestProxyCache.proxyPromise = GetSystemProxy().catch(() => '')
  return requestProxyCache.proxyPromise
}

// Auto-start
const getPlistPath = async () => {
  const home = await GetEnv('HOME')
  return `${home}/Library/LaunchAgents/${APP_TITLE}.plist`
}

const getDesktopPath = async () => {
  const home = await GetEnv('HOME')
  return `${home}/.config/autostart/${APP_TITLE}.desktop`
}

export const IsAutoStartEnabled = async () => {
  const { os } = useEnvStore().env
  let isAutoStart = false
  if (os === OS.Windows) {
    isAutoStart = await Exec('Schtasks', ['/Query', '/TN', APP_TITLE, '/XML'], { Convert: true })
      .then(() => true)
      .catch(() => false)
  } else if (os === OS.Darwin) {
    const plistPath = await getPlistPath()
    isAutoStart = await FileExists(plistPath)
  } else if (os === OS.Linux) {
    const desktopPath = await getDesktopPath()
    isAutoStart = await FileExists(desktopPath)
  }
  return isAutoStart
}

export const EnableAutoStart = async (delay = 10) => {
  const { os, appPath, isPrivileged } = useEnvStore().env
  const configuration = getAutoStartConfiguration(os, appPath, delay)
  if (os === OS.Windows) {
    const xmlPath = await AbsolutePath('data/.cache/tasksch.xml')
    await WriteFile(xmlPath, configuration)
    const fn = isPrivileged ? Exec : RunWithPowerShell
    await fn('SchTasks', ['/Create', '/F', '/TN', APP_TITLE, '/XML', xmlPath], {
      admin: true,
      hidden: true,
    })
  } else if (os === OS.Darwin) {
    const plistPath = await getPlistPath()
    await WriteFile(plistPath, configuration)
    await Exec('launchctl', ['load', plistPath])
  } else if (os === OS.Linux) {
    const desktopPath = await getDesktopPath()
    await WriteFile(desktopPath, configuration)
  }
}

export const DisableAutoStart = async () => {
  const { os, isPrivileged } = useEnvStore().env
  if (os === OS.Windows) {
    const fn = isPrivileged ? Exec : RunWithPowerShell
    await fn('SchTasks', ['/Delete', '/F', '/TN', APP_TITLE], { admin: true, hidden: true })
  } else if (os === OS.Darwin) {
    const plistPath = await getPlistPath()
    await Exec('launchctl', ['unload', plistPath])
    await RemoveFile(plistPath)
  } else if (os === OS.Linux) {
    const desktopPath = await getDesktopPath()
    await RemoveFile(desktopPath)
  }
}

// Windows Task Scheduler Helper
export const QuerySchTask = async (appName: string) => {
  return await Exec('SchTasks', ['/Query', '/TN', appName], { Convert: true })
}

export const CreateSchTask = async (appName: string, xmlPath: string) => {
  const { isPrivileged } = useEnvStore().env
  const fn = isPrivileged ? Exec : RunWithPowerShell
  return await fn('SchTasks', ['/Create', '/F', '/TN', appName, '/XML', xmlPath], {
    admin: true,
    hidden: true,
  })
}

export const DeleteSchTask = async (appName: string) => {
  const { isPrivileged } = useEnvStore().env
  const fn = isPrivileged ? Exec : RunWithPowerShell
  return await fn('SchTasks', ['/Delete', '/F', '/TN', appName], { admin: true, hidden: true })
}

// macOS LaunchAgent Helper
const getLaunchAgentPath = (appName: string) => {
  return `~/Library/LaunchAgents/${appName}.plist`
}

export const QueryLaunchAgent = async (appName: string) => {
  const plistPath = getLaunchAgentPath(appName)
  // Use launchctl list to check if the agent is loaded
  const out = await Exec('launchctl', ['list', appName])
  if (!out || out.includes('Could not find')) {
    throw new Error('LaunchAgent not found')
  }
  return true
}

export const CreateLaunchAgent = async (appName: string, plistContent: string) => {
  const plistPath = getLaunchAgentPath(appName)
  // Expand ~ to actual home directory and write file
  const expandedPath = await Exec('sh', ['-c', `echo ${plistPath}`])
  const actualPath = expandedPath.trim()

  // Ensure LaunchAgents directory exists
  await Exec('sh', ['-c', 'mkdir -p ~/Library/LaunchAgents'])

  // Write the plist file using sh to handle the path expansion
  // We need to use a temporary approach - write via bridge and then move
  const tempPath = 'data/.cache/launchagent.plist'
  await WriteFile(tempPath, plistContent)
  const absTempPath = await AbsolutePath(tempPath)

  // Copy to LaunchAgents directory
  await Exec('sh', ['-c', `cp "${absTempPath}" "${actualPath}"`])

  // Remove temp file
  await ignoredError(Exec, 'rm', [absTempPath])

  // Load the launch agent
  await Exec('launchctl', ['load', actualPath])
}

export const DeleteLaunchAgent = async (appName: string) => {
  const plistPath = getLaunchAgentPath(appName)
  const expandedPath = await Exec('sh', ['-c', `echo ${plistPath}`])
  const actualPath = expandedPath.trim()

  // Unload the launch agent first (ignore errors if not loaded)
  await ignoredError(Exec, 'launchctl', ['unload', actualPath])

  // Remove the plist file
  await Exec('sh', ['-c', `rm -f "${actualPath}"`])
}

// Linux XDG Autostart Helper
const getDesktopFilePath = (appName: string) => {
  return `~/.config/autostart/${appName}.desktop`
}

export const QueryDesktopAutostart = async (appName: string) => {
  const desktopPath = getDesktopFilePath(appName)
  const expandedPath = await Exec('sh', ['-c', `echo ${desktopPath}`])
  const actualPath = expandedPath.trim()

  // Check if the .desktop file exists
  const out = await Exec('sh', ['-c', `test -f "${actualPath}" && echo "exists" || echo "not found"`])
  if (!out.includes('exists')) {
    throw new Error('Desktop autostart file not found')
  }
  return true
}

export const CreateDesktopAutostart = async (appName: string, desktopContent: string) => {
  const desktopPath = getDesktopFilePath(appName)
  const expandedPath = await Exec('sh', ['-c', `echo ${desktopPath}`])
  const actualPath = expandedPath.trim()

  // Ensure autostart directory exists
  await Exec('sh', ['-c', 'mkdir -p ~/.config/autostart'])

  // Write the .desktop file using a temporary file
  const tempPath = 'data/.cache/autostart.desktop'
  await WriteFile(tempPath, desktopContent)
  const absTempPath = await AbsolutePath(tempPath)

  // Copy to autostart directory
  await Exec('sh', ['-c', `cp "${absTempPath}" "${actualPath}"`])

  // Make it executable
  await Exec('sh', ['-c', `chmod +x "${actualPath}"`])

  // Remove temp file
  await ignoredError(Exec, 'rm', [absTempPath])
}

export const DeleteDesktopAutostart = async (appName: string) => {
  const desktopPath = getDesktopFilePath(appName)
  const expandedPath = await Exec('sh', ['-c', `echo ${desktopPath}`])
  const actualPath = expandedPath.trim()

  // Remove the .desktop file
  await Exec('sh', ['-c', `rm -f "${actualPath}"`])
}

// Others
export const handleUseProxy = async (group: any, proxy: any) => {
  if (
    ![ProxyGroupType.Selector, ProxyGroupType.Fallback, ProxyGroupType.UrlTest].includes(group.type)
  ) {
    return
  }

  if (group.now === proxy.name) return
  const promises: Promise<null>[] = []
  const appSettings = useAppSettingsStore()
  const kernelApiStore = useKernelApiStore()
  if (appSettings.app.kernel.autoClose) {
    const { connections } = await getConnections()
    promises.push(
      ...(connections || [])
        .filter((v) => v.chains.includes(group.name))
        .map((v) => deleteConnection(v.id)),
    )
  }
  await useProxy(encodeURIComponent(group.name), proxy.name)
  await Promise.all(promises)
  await kernelApiStore.refreshProviderProxies()
}

export const handleChangeMode = async (mode: 'direct' | 'global' | 'rule') => {
  const kernelApiStore = useKernelApiStore()

  if (mode === kernelApiStore.config.mode) return

  kernelApiStore.updateConfig({ mode })

  const { connections } = await getConnections()
  const promises = (connections || []).map((v) => deleteConnection(v.id))
  await Promise.all(promises)
}

export const addToRuleSet = async (id: 'direct' | 'reject' | 'proxy', payloads: string[]) => {
  const path = `data/rulesets/${id}.yaml`

  const rulesetsStoe = useRulesetsStore()
  let ruleset = rulesetsStoe.getRulesetById(id)
  if (!ruleset) {
    ruleset = {
      id,
      name: id,
      updateTime: 0,
      type: 'Manual',
      behavior: RulesetBehavior.Classical,
      format: RulesetFormat.Yaml,
      url: '',
      path,
      count: 0,
      disabled: false,
    }
    await rulesetsStoe.addRuleset(ruleset)
  }

  const content = (await ignoredError(ReadFile, path)) || '{}'
  const { payload = [] } = parse(content)
  payload.unshift(...payloads)
  await WriteFile(path, stringifyNoFolding({ payload: [...new Set(payload)] }))
  await rulesetsStoe.updateRuleset(id)
}

export const reloadApp = async () => {
  const { t } = i18n.global
  const appStore = useAppStore()
  const pluginsStore = usePluginsStore()

  appStore.isAppReloading = true

  let timedout = false
  const { destroy } = message.info('titlebar.reloadPending', 10 * 60 * 1000)

  const timeoutId = setTimeout(async () => {
    timedout = true
    appStore.isAppReloading = false
    destroy()
    confirm('Warning', t('titlebar.reloadTimeout')).then(WindowReloadApp)
  }, 10_000)

  try {
    await pluginsStore.onReloadTrigger()
    if (!timedout) {
      clearTimeout(timeoutId)
      WindowReloadApp()
    }
  } catch (err: any) {
    clearTimeout(timeoutId)
    confirm('Error', t('titlebar.reloadError', { reason: err })).then(WindowReloadApp)
  }

  appStore.isAppReloading = false
  destroy()
}

export const exitApp = async () => {
  const { t } = i18n.global
  const appStore = useAppStore()
  const envStore = useEnvStore()
  const pluginsStore = usePluginsStore()
  const appSettings = useAppSettingsStore()
  const kernelApiStore = useKernelApiStore()

  appStore.isAppExiting = true

  let timedout = false
  const { destroy } = message.info('titlebar.exitPending', 10 * 60 * 1000)

  const timeoutId = setTimeout(async () => {
    timedout = true
    appStore.isAppExiting = false
    destroy()
    confirm('Warning', t('titlebar.exitTimeout')).then(ExitApp)
  }, 10_000)

  try {
    if (kernelApiStore.running && appSettings.app.closeKernelOnExit) {
      await kernelApiStore.stopCore()
      if (appSettings.app.autoSetSystemProxy) {
        await envStore.clearSystemProxy()
      }
    }
    await pluginsStore.onShutdownTrigger()
    if (!timedout) {
      clearTimeout(timeoutId)
      ExitApp()
    }
  } catch (err: any) {
    clearTimeout(timeoutId)
    confirm('Error', t('titlebar.exitError', { reason: err })).then(ExitApp)
  }

  appStore.isAppExiting = false
  destroy()
}

export const getKernelFileName = (isAlpha = false) => {
  const envStore = useEnvStore()
  const { os } = envStore.env
  const fileSuffix = { [OS.Windows]: '.exe', [OS.Linux]: '', [OS.Darwin]: '' }[os]
  const alpha = isAlpha ? '-alpha' : ''
  return `mihomo${alpha}${fileSuffix}`
}

export const getKernelAssetFileName = (version: string, cpuLevel: 'v1' | 'v2' | 'v3' = 'v3') => {
  const envStore = useEnvStore()
  const { os, arch } = envStore.env
  const cpuLevelFlag = arch === 'amd64' ? `-${cpuLevel}` : ''
  const suffix = { [OS.Windows]: '.zip', [OS.Linux]: '.gz', [OS.Darwin]: '.gz' }[os]
  return `mihomo-${os}-${arch}${cpuLevelFlag}-${version}${suffix}`
}

export const processMagicVariables = (str: string) => {
  const { env } = useEnvStore()
  let result = str
  Object.entries({
    $APP_BASE_PATH: env.basePath,
    $CORE_BASE_PATH: CoreWorkingDirectory,
  }).forEach(([source, target]) => {
    result = result.replaceAll(source, target)
  })
  return result
}

export const getKernelRuntimeEnv = (isAlpha = false) => {
  const appSettings = useAppSettingsStore()
  const { env } = isAlpha ? appSettings.app.kernel.alpha : appSettings.app.kernel.main
  return Object.entries(env).reduce((p, [key, value]) => {
    p[key] = processMagicVariables(value)
    return p
  }, {} as Recordable)
}

export const getKernelRuntimeArgs = (isAlpha = false) => {
  const appSettings = useAppSettingsStore()
  const { args } = isAlpha ? appSettings.app.kernel.alpha : appSettings.app.kernel.main
  return args.map((arg) => processMagicVariables(arg))
}
