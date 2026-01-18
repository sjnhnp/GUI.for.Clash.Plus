<script lang="ts" setup>
import { ref } from 'vue'

import { WriteFile, RemoveFile, AbsolutePath, ExitApp } from '@/bridge'
import { WebviewGpuPolicyOptions, WindowStateOptions } from '@/constant/app'
import { useAppSettingsStore, useEnvStore } from '@/stores'
import {
  APP_TITLE,
  getTaskSchXmlString,
  getLaunchAgentPlistString,
  getDesktopAutostartString,
  confirm,
  message,
  QuerySchTask,
  CreateSchTask,
  DeleteSchTask,
  QueryLaunchAgent,
  CreateLaunchAgent,
  DeleteLaunchAgent,
  QueryDesktopAutostart,
  CreateDesktopAutostart,
  DeleteDesktopAutostart,
  CheckPermissions,
  SwitchPermissions,
  RunWithPowerShell,
} from '@/utils'

const appSettings = useAppSettingsStore()
const envStore = useEnvStore()

const isAdmin = ref(false)
const isAutoStartEnabled = ref(false)

const restartApp = async (admin = false) => {
  if (admin) {
    await RunWithPowerShell(envStore.env.appPath, [], { admin, wait: false })
  } else {
    await RunWithPowerShell('explorer', [envStore.env.appPath], { wait: false })
  }
  await ExitApp()
}

const onPermChange = async (v: boolean) => {
  try {
    await SwitchPermissions(v)
    if (v !== envStore.env.isPrivileged) {
      const ok = await confirm('Notice', 'Restart the application now?').catch(() => 0)
      ok && (await restartApp(v))
    }
  } catch (error: any) {
    message.error(error)
    console.log(error)
  }
}

// Windows: Task Scheduler
const onTaskSchChange = async (v: boolean) => {
  isAutoStartEnabled.value = !v
  try {
    if (v) {
      await createSchTask(appSettings.app.startupDelay)
    } else {
      await DeleteSchTask(APP_TITLE)
    }
    isAutoStartEnabled.value = v
  } catch (error: any) {
    console.error(error)
    message.error(error)
  }
}

// macOS: LaunchAgent
const onLaunchAgentChange = async (v: boolean) => {
  isAutoStartEnabled.value = !v
  try {
    if (v) {
      await createLaunchAgent(appSettings.app.startupDelay)
    } else {
      await DeleteLaunchAgent(APP_TITLE)
    }
    isAutoStartEnabled.value = v
  } catch (error: any) {
    console.error(error)
    message.error(error)
  }
}

// Linux: XDG Autostart
const onDesktopAutostartChange = async (v: boolean) => {
  isAutoStartEnabled.value = !v
  try {
    if (v) {
      await createDesktopAutostart(appSettings.app.startupDelay)
    } else {
      await DeleteDesktopAutostart(APP_TITLE)
    }
    isAutoStartEnabled.value = v
  } catch (error: any) {
    console.error(error)
    message.error(error)
  }
}

const onStartupDelayChange = async (delay: number) => {
  if (appSettings.app.startupDelay !== delay) {
    try {
      if (envStore.env.os === 'windows') {
        await createSchTask(delay)
      } else if (envStore.env.os === 'darwin') {
        await createLaunchAgent(delay)
      } else if (envStore.env.os === 'linux') {
        await createDesktopAutostart(delay)
      }
      appSettings.app.startupDelay = delay
    } catch (error: any) {
      console.error(error)
      message.error(error)
    }
  }
}

// Windows: Check and create task
const checkSchtask = async () => {
  try {
    await QuerySchTask(APP_TITLE)
    isAutoStartEnabled.value = true
  } catch {
    isAutoStartEnabled.value = false
  }
}

const createSchTask = async (delay = 30) => {
  const xmlPath = 'data/.cache/tasksch.xml'
  const xmlContent = await getTaskSchXmlString(delay)
  await WriteFile(xmlPath, xmlContent)
  await CreateSchTask(APP_TITLE, await AbsolutePath(xmlPath))
  await RemoveFile(xmlPath)
}

// macOS: Check and create LaunchAgent
const checkLaunchAgent = async () => {
  try {
    await QueryLaunchAgent(APP_TITLE)
    isAutoStartEnabled.value = true
  } catch {
    isAutoStartEnabled.value = false
  }
}

const createLaunchAgent = async (delay = 30) => {
  const plistContent = await getLaunchAgentPlistString(delay)
  await CreateLaunchAgent(APP_TITLE, plistContent)
}

// Linux: Check and create XDG Autostart
const checkDesktopAutostart = async () => {
  try {
    await QueryDesktopAutostart(APP_TITLE)
    isAutoStartEnabled.value = true
  } catch {
    isAutoStartEnabled.value = false
  }
}

const createDesktopAutostart = async (delay = 30) => {
  const desktopContent = await getDesktopAutostartString(delay)
  await CreateDesktopAutostart(APP_TITLE, desktopContent)
}

// Initialize based on OS
if (envStore.env.os === 'windows') {
  checkSchtask()
  CheckPermissions().then((admin) => {
    isAdmin.value = admin
  })
} else if (envStore.env.os === 'darwin') {
  checkLaunchAgent()
} else if (envStore.env.os === 'linux') {
  checkDesktopAutostart()
}
</script>

<template>
  <div class="px-8 py-12 text-18 font-bold">{{ $t('settings.behavior') }}</div>

  <Card>
    <div v-platform="['windows']" class="px-8 py-12 flex items-center justify-between">
      <div class="text-16 font-bold">
        {{ $t('settings.admin') }}
        <span class="font-normal text-12">({{ $t('settings.needRestart') }})</span>
      </div>
      <div class="flex items-center gap-4">
        <Button
          v-if="envStore.env.isPrivileged !== isAdmin"
          v-tips="'titlebar.restart'"
          type="primary"
          icon="refresh"
          size="small"
          @click="() => restartApp(isAdmin)"
        />
        <Switch v-model="isAdmin" @change="onPermChange" />
      </div>
    </div>
    <div v-platform="['windows']" class="px-8 py-12 flex items-center justify-between">
      <div class="text-16 font-bold">
        {{ $t('settings.startup.name') }}
        <span class="font-normal text-12">({{ $t('settings.needAdmin') }})</span>
      </div>
      <div class="flex items-center">
        <Radio
          v-if="isAutoStartEnabled"
          v-model="appSettings.app.windowStartState"
          :options="WindowStateOptions"
          type="number"
        />
        <Switch v-model="isAutoStartEnabled" class="ml-16" @change="onTaskSchChange" />
      </div>
    </div>
    <div
      v-if="isAutoStartEnabled"
      v-platform="['windows']"
      class="px-8 py-12 flex items-center justify-between"
    >
      <div class="text-16 font-bold">
        {{ $t('settings.startup.startupDelay') }}
        <span class="font-normal text-12">({{ $t('settings.needAdmin') }})</span>
      </div>
      <Input
        :model-value="appSettings.app.startupDelay"
        :min="10"
        :max="180"
        editable
        type="number"
        @submit="onStartupDelayChange"
      >
        <template #suffix="{ showInput }">
          <span class="ml-4" @click="showInput">{{ $t('settings.startup.delay') }}</span>
        </template>
      </Input>
    </div>
    <!-- macOS Auto-Startup -->
    <div v-platform="['darwin']" class="px-8 py-12 flex items-center justify-between">
      <div class="text-16 font-bold">
        {{ $t('settings.startup.name') }}
      </div>
      <div class="flex items-center">
        <Radio
          v-if="isAutoStartEnabled"
          v-model="appSettings.app.windowStartState"
          :options="WindowStateOptions"
          type="number"
        />
        <Switch v-model="isAutoStartEnabled" @change="onLaunchAgentChange" class="ml-16" />
      </div>
    </div>
    <div
      v-if="isAutoStartEnabled"
      v-platform="['darwin']"
      class="px-8 py-12 flex items-center justify-between"
    >
      <div class="text-16 font-bold">
        {{ $t('settings.startup.startupDelay') }}
      </div>
      <Input
        :model-value="appSettings.app.startupDelay"
        @submit="onStartupDelayChange"
        :min="10"
        :max="180"
        editable
        type="number"
      >
        <template #suffix="{ showInput }">
          <span @click="showInput" class="ml-4">{{ $t('settings.startup.delay') }}</span>
        </template>
      </Input>
    </div>
    <!-- Linux Auto-Startup -->
    <div v-platform="['linux']" class="px-8 py-12 flex items-center justify-between">
      <div class="text-16 font-bold">
        {{ $t('settings.startup.name') }}
      </div>
      <div class="flex items-center">
        <Radio
          v-if="isAutoStartEnabled"
          v-model="appSettings.app.windowStartState"
          :options="WindowStateOptions"
          type="number"
        />
        <Switch v-model="isAutoStartEnabled" @change="onDesktopAutostartChange" class="ml-16" />
      </div>
    </div>
    <div
      v-if="isAutoStartEnabled"
      v-platform="['linux']"
      class="px-8 py-12 flex items-center justify-between"
    >
      <div class="text-16 font-bold">
        {{ $t('settings.startup.startupDelay') }}
      </div>
      <Input
        :model-value="appSettings.app.startupDelay"
        @submit="onStartupDelayChange"
        :min="10"
        :max="180"
        editable
        type="number"
      >
        <template #suffix="{ showInput }">
          <span @click="showInput" class="ml-4">{{ $t('settings.startup.delay') }}</span>
        </template>
      </Input>
    </div>
    <div class="px-8 py-12 flex items-center justify-between">
      <div class="text-16 font-bold">{{ $t('settings.exitOnClose') }}</div>
      <Switch v-model="appSettings.app.exitOnClose" />
    </div>
    <div class="px-8 py-12 flex items-center justify-between">
      <div class="text-16 font-bold">{{ $t('settings.autoStartKernel') }}</div>
      <Switch v-model="appSettings.app.autoStartKernel" />
    </div>
    <div class="px-8 py-12 flex items-center justify-between">
      <div class="text-16 font-bold">{{ $t('settings.closeKernelOnExit') }}</div>
      <Switch v-model="appSettings.app.closeKernelOnExit" />
    </div>
    <div v-platform="['windows']" class="px-8 py-12 flex items-center justify-between">
      <div class="text-16 font-bold">
        {{ $t('settings.restartKernelAfterResume.name') }}
        <span class="font-normal text-12">({{ $t('settings.restartKernelAfterResume.tips') }})</span>
      </div>
      <Switch v-model="appSettings.app.restartKernelAfterResume" />
    </div>
    <div v-platform="['linux']" class="px-8 py-12 flex items-center justify-between">
      <div class="text-16 font-bold">
        {{ $t('settings.webviewGpuPolicy.name') }}
        <span class="font-normal text-12">({{ $t('settings.needRestart') }})</span>
      </div>
      <Radio v-model="appSettings.app.webviewGpuPolicy" :options="WebviewGpuPolicyOptions" />
    </div>
    <div class="px-8 py-12 flex items-center justify-between">
      <div class="text-16 font-bold">{{ $t('settings.addPluginToMenu') }}</div>
      <Switch v-model="appSettings.app.addPluginToMenu" />
    </div>
    <div class="px-8 py-12 flex items-center justify-between">
      <div class="text-16 font-bold">{{ $t('settings.addGroupToMenu') }}</div>
      <Switch v-model="appSettings.app.addGroupToMenu" />
    </div>
  </Card>
</template>
