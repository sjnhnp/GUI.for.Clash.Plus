import { onUnmounted } from 'vue'

import { EventsOn, WindowHide } from '@/bridge'
import * as Stores from '@/stores'
import { exitApp, message, sampleID, sleep } from '@/utils'

export const useAppLifecycle = () => {
  const appStore = Stores.useAppStore()
  const appSettings = Stores.useAppSettingsStore()
  const subscribesStore = Stores.useSubscribesStore()
  const kernelApiStore = Stores.useKernelApiStore()

  const offLaunchApp = EventsOn('onLaunchApp', async ([arg]: string[]) => {
    if (!arg) return

    let _url
    let _name = sampleID()

    const url = new URL(arg)
    if (url.pathname === '//install-config/') {
      _url = url.searchParams.get('url')
      _name = url.searchParams.get('name') || sampleID()
    } else if (url.pathname.startsWith('//import-remote-profile')) {
      _url = url.searchParams.get('url')
      _name = decodeURIComponent(url.hash).slice(1) || sampleID()
    }

    if (!_url) {
      message.error('URL missing')
      return
    }

    try {
      await subscribesStore.importSubscribe(_name, _url)
      message.success('common.success')
    } catch (error) {
      message.error(error)
    }
  })

  const offBeforeExitApp = EventsOn('onBeforeExitApp', async () => {
    if (appSettings.app.exitOnClose) {
      exitApp()
      return
    }

    WindowHide()
  })

  const offExitApp = EventsOn('onExitApp', () => exitApp())

  const offSystemResume = EventsOn('onSystemResume', async (resumeType: string) => {
    console.log('System resumed from:', resumeType)

    if (appSettings.app.restartKernelAfterResume && kernelApiStore.running) {
      console.log('Auto-restarting kernel after system resume...')
      await sleep(2000)
      try {
        await kernelApiStore.restartCore()
        message.success('settings.restartKernelAfterResume.restarted')
      } catch (e: any) {
        console.error('Failed to restart kernel after resume:', e)
        message.error(e.message || e)
      }
    }
  })

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return

    const closeFn = appStore.modalStack.at(-1)
    closeFn?.()
  }

  window.addEventListener('keydown', handleKeydown)

  onUnmounted(() => {
    offLaunchApp()
    offBeforeExitApp()
    offExitApp()
    offSystemResume()
    window.removeEventListener('keydown', handleKeydown)
  })
}
