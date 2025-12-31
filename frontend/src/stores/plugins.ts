import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { parse } from 'yaml'

import { HttpGet, ReadFile, RemoveFile, WriteFile } from '@/bridge'
import { PluginHubFilePath, PluginsFilePath } from '@/constant/app'
import { PluginTrigger, PluginTriggerEvent } from '@/enums/app'
import { useAppSettingsStore, type ProfileType } from '@/stores'
import {
  omitArray,
  ignoredError,
  isNumber,
  updateTrayMenus,
  stringifyNoFolding,
  deepClone,
  confirm,
  asyncPool,
} from '@/utils'

import type { Plugin, Subscription, TrayContent, MenuItem } from '@/types/app'

// Pre-installed plugins configuration
// Enhanced version: supports backing up local subscription files (data/local/*.txt)
// Plugin files and crypto-js.js are pre-packaged and extracted by Go backend on startup
const PreinstalledPlugins: Plugin[] = [
  {
    // Use a unique ID to avoid being overwritten by Plugin-Hub updates
    id: 'plugin-sync-gists-enhanced',
    name: '配置同步 - Gists (增强版)',
    version: 'v1.1.0',
    description: '使用Gists同步GUI配置。增强版支持备份本地订阅源文件和本地规则集源文件。',
    tags: ['实用工具', '功能扩展', '提升体验'],
    type: 'File',  // Use local file (pre-packaged)
    url: 'https://raw.githubusercontent.com/sjnhnp/gfc/main/frontend/public/plugins/plugin-sync-configuration-gists-enhanced.js',  // Fallback URL
    path: 'data/plugins/plugin-sync-gists-enhanced.js',
    triggers: ['on::manual', 'on::ready'] as PluginTrigger[],
    hasUI: false,
    menus: {
      '立即备份': 'Backup',
      '同步至本地': 'Sync',
    },
    context: {
      profiles: {},
      subscriptions: {},
      rulesets: {},
      plugins: {},
      scheduledtasks: {},
    },
    status: 0,
    configuration: [
      {
        id: 'ID_u3272842',
        title: 'TOKEN',
        description: '拥有Gists访问权限的 token',
        key: 'Authorization',
        component: 'Input',
        value: '',
        options: [],
      },
      {
        id: 'ID_imjlb4rx',
        title: '密钥',
        description: '加密、解密使用的密钥',
        key: 'Secret',
        component: 'Input',
        value: '',
        options: [],
      },
    ],
    disabled: false,
    install: true,
    installed: true,  // Pre-installed with crypto-js.js
  },
]

const PluginsCache: Recordable<{ plugin: Plugin; code: string }> = {}

const PluginsTriggerMap: {
  [key in PluginTrigger]: {
    fnName: PluginTriggerEvent
    observers: string[]
  }
} = {
  [PluginTrigger.OnManual]: {
    fnName: PluginTriggerEvent.OnManual,
    observers: [],
  },
  [PluginTrigger.OnTrayUpdate]: {
    fnName: PluginTriggerEvent.OnTrayUpdate,
    observers: [],
  },
  [PluginTrigger.OnSubscribe]: {
    fnName: PluginTriggerEvent.OnSubscribe,
    observers: [],
  },
  [PluginTrigger.OnGenerate]: {
    fnName: PluginTriggerEvent.OnGenerate,
    observers: [],
  },
  [PluginTrigger.OnStartup]: {
    fnName: PluginTriggerEvent.OnStartup,
    observers: [],
  },
  [PluginTrigger.OnShutdown]: {
    fnName: PluginTriggerEvent.OnShutdown,
    observers: [],
  },
  [PluginTrigger.OnReady]: {
    fnName: PluginTriggerEvent.OnReady,
    observers: [],
  },
  [PluginTrigger.OnCoreStarted]: {
    fnName: PluginTriggerEvent.OnCoreStarted,
    observers: [],
  },
  [PluginTrigger.OnCoreStopped]: {
    fnName: PluginTriggerEvent.OnCoreStopped,
    observers: [],
  },
  [PluginTrigger.OnBeforeCoreStart]: {
    fnName: PluginTriggerEvent.OnBeforeCoreStart,
    observers: [],
  },
  [PluginTrigger.OnBeforeCoreStop]: {
    fnName: PluginTriggerEvent.OnBeforeCoreStop,
    observers: [],
  },
}

export const usePluginsStore = defineStore('plugins', () => {
  const appSettingsStore = useAppSettingsStore()

  const plugins = ref<Plugin[]>([])
  const pluginHub = ref<Plugin[]>([])

  const setupPlugins = async () => {
    const data = await ignoredError(ReadFile, PluginsFilePath)
    data && (plugins.value = parse(data))

    const list = await ignoredError(ReadFile, PluginHubFilePath)
    list && (pluginHub.value = JSON.parse(list))

    // Install pre-installed plugins if no plugins exist
    // Note: Plugin files and crypto-js.js are already extracted by the Go backend on startup
    if (plugins.value.length === 0 && PreinstalledPlugins.length > 0) {
      console.log('Registering pre-installed plugins...')

      for (const prePlugin of PreinstalledPlugins) {
        try {
          // Clone the plugin to avoid modifying the original
          const plugin = deepClone(prePlugin)

          // Read the plugin code from local file (already extracted by Go backend)
          const code = await ignoredError(ReadFile, plugin.path)
          if (code) {
            plugin.installed = true // Mark as installed since crypto-js.js is also pre-extracted
            plugins.value.push(plugin)
            PluginsCache[plugin.id] = { plugin, code }
            console.log(`Pre-installed plugin registered: ${plugin.name}`)
          } else {
            console.warn(`Plugin file not found: ${plugin.path}, will try HTTP download`)
            // Fallback: download from URL if local file not found
            if (plugin.type === 'Http' && plugin.url) {
              try {
                const { body } = await HttpGet<string>(plugin.url)
                await WriteFile(plugin.path, body)

                // Also download crypto-js.js
                const cryptoJsPath = 'data/third/sync-gui-gists/crypto-js.js'
                const cryptoJsExists = await ignoredError(ReadFile, cryptoJsPath)
                if (!cryptoJsExists) {
                  const { body: cryptoJs } = await HttpGet<string>(
                    'https://unpkg.com/crypto-js@latest/crypto-js.js',
                  )
                  await WriteFile(cryptoJsPath, cryptoJs)
                }

                plugin.installed = true
                plugins.value.push(plugin)
                PluginsCache[plugin.id] = { plugin, code: body }
                console.log(`Pre-installed plugin downloaded: ${plugin.name}`)
              } catch (downloadError) {
                console.error(`Failed to download plugin: ${plugin.name}`, downloadError)
              }
            }
          }
        } catch (error) {
          console.error(`Failed to install pre-installed plugin: ${prePlugin.name}`, error)
        }
      }

      // Save the plugins list
      if (plugins.value.length > 0) {
        await savePlugins()
      }

      // Load Plugin-Hub in background (non-blocking) to avoid "Deprecated" label
      if (pluginHub.value.length === 0) {
        HttpGet<string>(
          'https://raw.githubusercontent.com/GUI-for-Cores/Plugin-Hub/main/plugins/generic.json',
        ).then(async ({ body: body1 }) => {
          const { body: body2 } = await HttpGet<string>(
            'https://raw.githubusercontent.com/GUI-for-Cores/Plugin-Hub/main/plugins/gfc.json',
          )
          // Load custom plugin repository (optional, won't block if failed)
          let customPlugins: any[] = []
          try {
            const { body: body3 } = await HttpGet<string>(
              'https://raw.githubusercontent.com/sjnhnp/gfc/main/plugins/custom.json',
            )
            customPlugins = JSON.parse(body3)
          } catch (err) {
            console.warn('Failed to load custom plugin repository:', err)
          }
          pluginHub.value = [...JSON.parse(body1), ...JSON.parse(body2), ...customPlugins]
          await WriteFile(PluginHubFilePath, JSON.stringify(pluginHub.value))
          console.log('Plugin-Hub list loaded in background')
        }).catch((err) => console.warn('Failed to load Plugin-Hub in background:', err))
      }
    }

    for (const plugin of plugins.value) {
      const { id, triggers, path } = plugin
      const code = await ignoredError(ReadFile, path)
      if (code) {
        PluginsCache[id] = { plugin, code }
        triggers.forEach((trigger) => {
          PluginsTriggerMap[trigger].observers.push(id)
        })
      }
    }
  }

  const getPluginMetadata = (plugin: Plugin) => {
    const configuration: Recordable = {}
    for (const { key, value } of plugin.configuration) {
      configuration[key] = value
    }
    Object.assign(configuration, appSettingsStore.app.pluginSettings[plugin.id] ?? {})
    return deepClone({ ...plugin, ...configuration })
  }

  const isPluginUnavailable = (
    cache: undefined | { plugin: Plugin; code: string },
  ): cache is undefined => {
    return (
      !cache ||
      !cache.plugin ||
      cache.plugin.disabled ||
      (cache.plugin.install && !cache.plugin.installed)
    )
  }

  const reloadPlugin = async (plugin: Plugin, code = '', reloadTrigger = false) => {
    const { path } = plugin
    if (!code) {
      code = await ReadFile(path)
    }
    PluginsCache[plugin.id] = { plugin, code }
    reloadTrigger && updatePluginTrigger(plugin)
  }

  // Fixed: Maintain plugin execution order based on plugins.value array order
  const updatePluginTrigger = (plugin: Plugin, isUpdate = true) => {
    const triggers = Object.keys(PluginsTriggerMap) as PluginTrigger[]
    triggers.forEach((trigger) => {
      PluginsTriggerMap[trigger].observers = PluginsTriggerMap[trigger].observers.filter(
        (v) => v !== plugin.id,
      )
    })
    if (isUpdate) {
      plugin.triggers.forEach((trigger) => {
        PluginsTriggerMap[trigger].observers.push(plugin.id)
        // Sort observers based on their position in plugins.value to maintain consistent order
        PluginsTriggerMap[trigger].observers.sort((a, b) => {
          const indexA = plugins.value.findIndex((p) => p.id === a)
          const indexB = plugins.value.findIndex((p) => p.id === b)
          return indexA - indexB
        })
      })
    }
  }

  const savePlugins = () => {
    const p = omitArray(plugins.value, ['updating', 'loading', 'running'])
    return WriteFile(PluginsFilePath, stringifyNoFolding(p))
  }

  const addPlugin = async (plugin: Plugin) => {
    plugins.value.push(plugin)
    await _doUpdatePlugin(plugin).catch((_) => { })
    try {
      await savePlugins()
      updatePluginTrigger(plugin)
    } catch (error) {
      const idx = plugins.value.indexOf(plugin)
      if (idx !== -1) {
        plugins.value.splice(idx, 1)
      }
      throw error
    }
  }

  const deletePlugin = async (id: string) => {
    const idx = plugins.value.findIndex((v) => v.id === id)
    if (idx === -1) return

    // Try to call onUninstall before deleting (to cleanup UI components like custom actions)
    try {
      await manualTrigger(id, PluginTriggerEvent.OnUninstall)
    } catch {
      // Ignore errors if onUninstall is not defined or fails
    }

    const plugin = plugins.value.splice(idx, 1)[0]!
    try {
      await savePlugins()
      delete PluginsCache[id]
      updatePluginTrigger(plugin, false)
    } catch (error) {
      plugins.value.splice(idx, 0, plugin)
      throw error
    }
    plugin.path.startsWith('data') && (await RemoveFile(plugin.path).catch((_) => { }))
    // Remove configuration
    if (appSettingsStore.app.pluginSettings[plugin.id]) {
      if (await confirm('Tips', 'plugins.removeConfiguration').catch(() => 0)) {
        delete appSettingsStore.app.pluginSettings[plugin.id]
      }
    }
  }

  const editPlugin = async (id: string, newPlugin: Plugin) => {
    const idx = plugins.value.findIndex((v) => v.id === id)
    if (idx === -1) return
    const plugin = plugins.value.splice(idx, 1, newPlugin)[0]!
    try {
      await savePlugins()
      updatePluginTrigger(newPlugin)
    } catch (error) {
      plugins.value.splice(idx, 1, plugin)
      throw error
    }
  }

  const _doUpdatePlugin = async (plugin: Plugin) => {
    const isFromPluginHub = plugin.id.startsWith('plugin-')
    if (isFromPluginHub) {
      const newPlugin = pluginHub.value.find((v) => v.id === plugin.id)
      if (!newPlugin) throw 'Plugin not found. Please update the Plugin-Hub.'

      const [major_now, minor_now, patch_now] = (plugin.version || '').substring(1).split('.')
      const [major_new, minor_new, patch_new] = (newPlugin.version || '').substring(1).split('.')

      if (major_now !== major_new) {
        await editPlugin(plugin.id, deepClone(newPlugin))
        const userSettigns = appSettingsStore.app.pluginSettings[plugin.id]
        if (userSettigns) {
          appSettingsStore.app.pluginSettings[plugin.id] = newPlugin.configuration.reduce(
            (p, c) => {
              const value_now = userSettigns[c.key]
              const value_new = c.value
              const type_now = Array.isArray(value_now) ? 'array' : typeof value_now
              const type_new = Array.isArray(value_new) ? 'array' : typeof value_new
              return {
                ...p,
                [c.key]: type_now === type_new ? value_now : value_new,
              }
            },
            {},
          )
        }
      } else if (minor_now !== minor_new || patch_now !== patch_new) {
        plugin.version = newPlugin.version
        await editPlugin(plugin.id, plugin)
      }
    }

    let code = ''

    if (plugin.type === 'File') {
      code = await ReadFile(plugin.path).catch(() => '')
    }

    if (plugin.type === 'Http') {
      const { body } = await HttpGet(plugin.url)
      code = body
    }

    if (plugin.type !== 'File') {
      await WriteFile(plugin.path, code)
    }

    PluginsCache[plugin.id] = { plugin, code }
  }

  const updatePlugin = async (id: string) => {
    const plugin = plugins.value.find((v) => v.id === id)
    if (!plugin) throw id + ' Not Found'
    if (plugin.disabled) throw plugin.name + ' is Disabled'
    try {
      plugin.updating = true
      await _doUpdatePlugin(plugin)
      return `Plugin [${plugin.name}] updated successfully.`
    } finally {
      plugin.updating = false
    }
  }

  const updatePlugins = async () => {
    let needSave = false

    const update = async (plugin: Plugin) => {
      const result = { ok: true, id: plugin.id, name: plugin.name, result: '' }
      try {
        plugin.updating = true
        await _doUpdatePlugin(plugin)
        needSave = true
        result.result = `Plugin [${plugin.name}] updated successfully.`
      } catch (error: any) {
        result.ok = false
        result.result = `Failed to update plugin [${plugin.name}]. Reason: ${error.message || error}`
      } finally {
        plugin.updating = false
      }
      return result
    }

    const result = await asyncPool(
      5,
      plugins.value.filter((v) => !v.disabled),
      update,
    )

    if (needSave) await savePlugins()

    return result.flatMap((v) => (v.ok && v.value) || [])
  }

  const pluginHubLoading = ref(false)
  const findPluginInHubById = (id: string) => pluginHub.value.find((v) => v.id === id)
  const isDeprecated = (plugin: Plugin) => {
    if (!plugin.id.startsWith('plugin-')) return false
    // Exclude pre-installed enhanced plugins from deprecation check
    if (PreinstalledPlugins.some((p) => p.id === plugin.id)) return false
    return !findPluginInHubById(plugin.id)
  }
  const hasNewPluginVersion = (plugin: Plugin) => {
    const p = findPluginInHubById(plugin.id)
    if (!p) return false
    return p.version !== plugin.version
  }
  const updatePluginHub = async () => {
    pluginHubLoading.value = true
    try {
      const { body: body1 } = await HttpGet<string>(
        'https://raw.githubusercontent.com/GUI-for-Cores/Plugin-Hub/main/plugins/generic.json',
      )
      const { body: body2 } = await HttpGet<string>(
        'https://raw.githubusercontent.com/GUI-for-Cores/Plugin-Hub/main/plugins/gfc.json',
      )
      // Load custom plugin repository (optional, won't block if failed)
      let customPlugins: any[] = []
      try {
        const { body: body3 } = await HttpGet<string>(
          'https://raw.githubusercontent.com/sjnhnp/gfc/main/plugins/custom.json',
        )
        customPlugins = JSON.parse(body3)
      } catch (err) {
        console.warn('Failed to load custom plugin repository:', err)
      }
      pluginHub.value = [...JSON.parse(body1), ...JSON.parse(body2), ...customPlugins]
      await WriteFile(PluginHubFilePath, JSON.stringify(pluginHub.value))
    } finally {
      pluginHubLoading.value = false
    }
  }

  const getPluginById = (id: string) => plugins.value.find((v) => v.id === id)

  const getPluginCodefromCache = (id: string) => PluginsCache[id]?.code

  const onSubscribeTrigger = async (proxies: Recordable[], subscription: Subscription) => {
    const { fnName, observers } = PluginsTriggerMap[PluginTrigger.OnSubscribe]
    if (observers.length === 0) return proxies

    subscription = deepClone(subscription)

    for (const observer of observers) {
      const cache = PluginsCache[observer]

      if (isPluginUnavailable(cache)) continue

      const metadata = getPluginMetadata(cache.plugin)
      try {
        const fn = new window.AsyncFunction(
          'Plugin',
          'proxies',
          'subscription',
          `${cache.code}; return await ${fnName}(proxies, subscription)`,
        )
        proxies = await fn(metadata, proxies, subscription)
      } catch (error: any) {
        throw `${cache.plugin.name} : ` + (error.message || error)
      }

      if (!Array.isArray(proxies)) {
        throw `${cache.plugin.name} : Wrong result`
      }
    }

    return proxies
  }

  const noParamsTrigger = async (trigger: PluginTrigger, interruptOnError = false) => {
    const { fnName, observers } = PluginsTriggerMap[trigger]
    if (observers.length === 0) return

    for (const observer of observers) {
      const cache = PluginsCache[observer]

      if (isPluginUnavailable(cache)) continue

      const metadata = getPluginMetadata(cache.plugin)
      try {
        const fn = new window.AsyncFunction('Plugin', `${cache.code}; return await ${fnName}()`)
        const exitCode = await fn(metadata)
        if (isNumber(exitCode) && exitCode !== cache.plugin.status) {
          cache.plugin.status = exitCode
          editPlugin(cache.plugin.id, cache.plugin)
        }
      } catch (error: any) {
        const msg = `${cache.plugin.name} : ` + (error.message || error)
        if (interruptOnError) {
          throw msg
        }
        console.error(msg)
      }
    }
  }

  const onGenerateTrigger = async (config: Recordable, profile: ProfileType) => {
    const { fnName, observers } = PluginsTriggerMap[PluginTrigger.OnGenerate]
    if (observers.length === 0) return config

    profile = deepClone(profile)

    for (const observer of observers) {
      const cache = PluginsCache[observer]

      if (isPluginUnavailable(cache)) continue

      const metadata = getPluginMetadata(cache.plugin)
      try {
        const fn = new window.AsyncFunction(
          'Plugin',
          'config',
          'profile',
          `${cache.code}; return await ${fnName}(config, profile)`,
        )
        config = await fn(metadata, config, profile)
      } catch (error: any) {
        throw `${cache.plugin.name} : ` + (error.message || error)
      }

      if (!config) throw `${cache.plugin.name} : Wrong result`
    }

    return config
  }

  const onBeforeCoreStartTrigger = async (params: Recordable, profile: ProfileType) => {
    const { fnName, observers } = PluginsTriggerMap[PluginTrigger.OnBeforeCoreStart]
    if (observers.length === 0) return params

    profile = deepClone(profile)

    for (const observer of observers) {
      const cache = PluginsCache[observer]

      if (isPluginUnavailable(cache)) continue

      const metadata = getPluginMetadata(cache.plugin)
      try {
        const fn = new window.AsyncFunction(
          'Plugin',
          'config',
          'profile',
          `${cache.code}; return await ${fnName}(config, profile)`,
        )
        params = await fn(metadata, params, profile)
      } catch (error: any) {
        throw `${cache.plugin.name} : ` + (error.message || error)
      }

      if (!params) throw `${cache.plugin.name} : Wrong result`
    }

    return params
  }

  const manualTrigger = async (id: string, event: PluginTriggerEvent, ...args: any[]) => {
    const plugin = getPluginById(id)
    if (!plugin) throw id + ' Not Found'
    const cache = PluginsCache[plugin.id]
    if (!cache) throw `${plugin.name} is Missing source code`
    if (cache.plugin.disabled) throw `${plugin.name} is Disabled`
    const metadata = getPluginMetadata(plugin)
    args = deepClone(args)
    try {
      const fn = new window.AsyncFunction(
        'Plugin',
        '...args',
        `${cache.code}; return await ${event}(...args)`,
      )

      const exitCode = await fn(metadata, ...args)
      if (isNumber(exitCode) && exitCode !== plugin.status) {
        plugin.status = exitCode
        editPlugin(id, plugin)
      }
      return exitCode
    } catch (error: any) {
      throw `${cache.plugin.name} : ` + (error.message || error)
    }
  }

  const onTrayUpdateTrigger = async (tray: TrayContent, menus: MenuItem[]) => {
    const { fnName, observers } = PluginsTriggerMap[PluginTrigger.OnTrayUpdate]
    if (observers.length === 0) return [tray, menus] as const

    let finalTray = tray
    let finalMenus = menus
    for (const observer of observers) {
      const cache = PluginsCache[observer]

      if (isPluginUnavailable(cache)) continue

      const metadata = getPluginMetadata(cache.plugin)
      try {
        const fn = new window.AsyncFunction(
          'Plugin',
          'tray',
          'menus',
          `${cache.code}; return await ${fnName}(tray, menus)`,
        )
        const { tray, menus } = await fn(metadata, finalTray, finalMenus)
        finalTray = tray
        finalMenus = menus
      } catch (error: any) {
        throw `${cache.plugin.name} : ` + (error.message || error)
      }
    }

    return [finalTray, finalMenus] as const
  }

  const _watchDisabled = computed(() =>
    plugins.value
      .map((v) => v.disabled)
      .sort()
      .join(),
  )

  const _watchMenus = computed(() =>
    plugins.value
      .map((v) => Object.entries(v.menus).map((v) => v[0] + v[1]))
      .sort()
      .join(),
  )

  watch([_watchMenus, _watchDisabled], () => {
    if (appSettingsStore.app.addPluginToMenu) {
      updateTrayMenus()
    }
  })

  return {
    plugins,
    setupPlugins,
    savePlugins,
    addPlugin,
    editPlugin,
    deletePlugin,
    updatePlugin,
    updatePlugins,
    getPluginById,
    reloadPlugin,
    onTrayUpdateTrigger,
    onSubscribeTrigger,
    onGenerateTrigger,
    onStartupTrigger: () => noParamsTrigger(PluginTrigger.OnStartup),
    onShutdownTrigger: () => noParamsTrigger(PluginTrigger.OnShutdown, true),
    onReadyTrigger: () => noParamsTrigger(PluginTrigger.OnReady),
    onCoreStartedTrigger: () => noParamsTrigger(PluginTrigger.OnCoreStarted),
    onCoreStoppedTrigger: () => noParamsTrigger(PluginTrigger.OnCoreStopped),
    onBeforeCoreStopTrigger: () => noParamsTrigger(PluginTrigger.OnBeforeCoreStop, true),
    onBeforeCoreStartTrigger,
    manualTrigger,
    updatePluginTrigger,
    getPluginCodefromCache,
    getPluginMetadata,

    pluginHub,
    pluginHubLoading,
    updatePluginHub,
    hasNewPluginVersion,
    findPluginInHubById,
    isDeprecated,
  }
})
