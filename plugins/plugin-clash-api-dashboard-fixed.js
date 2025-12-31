window[Plugin.id] = window[Plugin.id] || {}

const Dashboard = {
    Yacd: {
        Link: 'http://yacd.metacubex.one',
        Icon: 'https://raw.githubusercontent.com/haishanh/yacd/refs/heads/master/assets/yacd.ico'
    },
    Zashboard: {
        Link: 'http://board.zash.run.place/#/setup',
        Icon: 'https://raw.githubusercontent.com/Zephyruso/zashboard/refs/heads/main/public/icon.svg'
    },
    MetaCubeXD: {
        Link: 'http://metacubex.github.io/metacubexd/#/setup',
        Icon: 'https://raw.githubusercontent.com/MetaCubeX/metacubexd/refs/heads/main/public/favicon.svg'
    }
}

/* 创建仪表板链接 */
const generateDashboardUrl = (dashboardName) => {
    const { port, secret } = getClashApiConfig()
    const dashboardLink = Dashboard[dashboardName]?.Link
    return `${dashboardLink}?hostname=127.0.0.1&port=${port}${secret ? `&secret=${secret}` : ''}&http=1`
}

/* 获取 Clash API 配置 */
const getClashApiConfig = () => {
    const appSettingsStore = Plugins.useAppSettingsStore()
    const profilesStore = Plugins.useProfilesStore()
    const profile = profilesStore.getProfileById(appSettingsStore.app.kernel.profile)
    let port = 20123
    let secret = ''
    if (Plugins.APP_TITLE.includes('SingBox')) {
        const controller = profile.experimental.clash_api.external_controller || '127.0.0.1:20123'
        port = controller.split(':')[1]
        secret = profile.experimental.clash_api.secret || ''
    } else {
        const controller = profile.advancedConfig['external-controller'] || '127.0.0.1:20113'
        port = controller.split(':')[1]
        secret = profile.advancedConfig.secret || ''
    }
    return { port, secret }
}

/* 加载 WebUI 组件 */
const loadWebUIComponent = (dashboardName) => {
    window[Plugin.id].removeWebUI?.()
    const appStore = Plugins.useAppStore()
    window[Plugin.id].removeWebUI = appStore.addCustomActions('core_state', {
        component: 'div',
        componentSlots: {
            default: ({ h }) => {
                return h(
                    'Button',
                    {
                        type: 'link',
                        size: 'small',
                        onClick: () => openWebUI(dashboardName)
                    },
                    () => [
                        h('img', {
                            src: Dashboard[dashboardName]?.Icon,
                            width: '16px',
                            height: '16px',
                            style: {
                                borderRadius: '4px',
                                marginRight: '4px'
                            }
                        }),
                        dashboardName
                    ]
                )
            }
        }
    })
}

/* 获取 Clash 模式 */
const getClashModeList = () => {
    const { config } = Plugins.useKernelApiStore()
    return { currentMode: config.mode, modeList: config['mode-list'] }
}

const capitalizeFirstLetter = (string) => {
    if (!string) return ''
    return string.charAt(0).toUpperCase() + string.slice(1)
}

/* 加载 Clash Mode 组件 */
const loadClashModeComponent = () => {
    window[Plugin.id].removeClashMode?.()
    const appStore = Plugins.useAppStore()

    window[Plugin.id].removeClashMode = appStore.addCustomActions('core_state', [
        {
            component: 'Dropdown',
            componentProps: {
                trigger: ['hover']
            },
            componentSlots: {
                default: ({ h }) => {
                    return h(
                        'Button',
                        {
                            type: 'link',
                            icon: 'more',
                            size: 'small'
                        },
                        () => capitalizeFirstLetter(getClashModeList().currentMode)
                    )
                },
                overlay: ({ h }) => {
                    return h(
                        'div',
                        { class: 'flex flex-col gap-4 min-w-64 p-4' },
                        getClashModeList().modeList.map((mode) =>
                            h(
                                'Button',
                                {
                                    type: 'link',
                                    size: 'small',
                                    onClick: () => Plugins.handleChangeMode(mode)
                                },
                                () => capitalizeFirstLetter(mode)
                            )
                        )
                    )
                }
            }
        }
    ])
}

/* 添加到概览页 */
const addToCoreStatePanel = () => {
    loadWebUIComponent(Plugin.DashboardName)
    if (Plugin.ClashModeAction) {
        loadClashModeComponent()
    }
}

/* 从概览页移除 */
const removeFromCoreStatePanel = () => {
    window[Plugin.id].removeWebUI?.()
    window[Plugin.id].removeClashMode?.()
}

const openWebUI = (dashboardName) => {
    const src = generateDashboardUrl(dashboardName)
    const modal = Plugins.modal(
        {
            title: dashboardName,
            width: '90',
            height: '90',
            footer: false,
            maskClosable: true,
            afterClose() {
                modal.destroy()
            }
        },
        {
            toolbar: () => [
                Vue.h(
                    Vue.resolveComponent('Button'),
                    {
                        type: 'text',
                        onClick: () => {
                            Plugins.BrowserOpenURL(src)
                        }
                    },
                    () => '浏览器中打开'
                ),
                Vue.h(Vue.resolveComponent('Button'), {
                    type: 'text',
                    icon: 'close',
                    onClick: () => modal.destroy()
                })
            ],
            default: () =>
                Vue.h('iframe', {
                    src: src,
                    class: 'w-full h-full border-0',
                    style: {
                        height: 'calc(100% - 6px)'
                    }
                })
        }
    )
    modal.open()
}

/* 触发器 手动触发 */
const onRun = () => {
    const kernelApiStore = Plugins.useKernelApiStore()
    if (!kernelApiStore.running) {
        throw '请先启动内核'
    }
    openWebUI(Plugin.DashboardName)
}

/* 初始化状态监听器 */
const initWatcher = () => {
    // 总是重建 Watcher 以捕获最新的 Plugin 对象闭包(包含最新配置)
    if (window[Plugin.id].unsub) {
        window[Plugin.id].unsub()
    }

    const kernelApiStore = Plugins.useKernelApiStore()

    // 监听 running 状态变化
    window[Plugin.id].unsub = kernelApiStore.$subscribe((mutation, state) => {
        if (state.running) {
            addToCoreStatePanel()
        } else {
            removeFromCoreStatePanel()
        }
    })

    return kernelApiStore
}

/* 触发器 Configure */
const onConfigure = (config, old) => {
    // 重建 watcher 以更新闭包上下文
    const kernelApiStore = initWatcher()

    // 强制刷新 UI (配置已变更，无论 running 状态是否变化都需要刷新)
    if (kernelApiStore.running) {
        removeFromCoreStatePanel()
        // 延迟执行以确保 Vue 更新组件
        setTimeout(() => {
            loadWebUIComponent(config.DashboardName)
            if (config.ClashModeAction) {
                loadClashModeComponent()
            }
        }, 100)
    }
}

/* 触发器 Startup */
const onStartup = () => {
    const kernelApiStore = initWatcher()
    // 初始状态检查
    if (kernelApiStore.running) {
        addToCoreStatePanel()
    }
}

/* 触发器 Ready */
const onReady = () => {
    const kernelApiStore = initWatcher()
    if (kernelApiStore.running) {
        addToCoreStatePanel()
    }
}

/* 触发器 Install */
const onInstall = () => {
    const kernelApiStore = initWatcher()
    if (kernelApiStore.running) {
        addToCoreStatePanel()
    }
}

/* 触发器 Uninstall */
const onUninstall = () => {
    if (window[Plugin.id].unsub) {
        window[Plugin.id].unsub()
        delete window[Plugin.id].unsub
    }
    removeFromCoreStatePanel()
    delete window[Plugin.id]
}

/* 兼容旧触发器 (主要逻辑已由 Watcher 接管) */
const onCoreStarted = () => {
    // 状态已由 Watcher 监听，此处无需操作，或作为备用
    initWatcher()
}

const onCoreStopped = () => {
    // 状态已由 Watcher 监听
}

