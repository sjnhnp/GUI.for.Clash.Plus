package main

import (
	"context"
	"embed"
	"guiforcores/bridge"
	"time"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/logger"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed frontend/dist/favicon.ico
var icon []byte

func main() {
	app := bridge.CreateApp(assets)

	trayStart, _ := bridge.CreateTray(app, icon)

	// Create application with options
	err := wails.Run(&options.App{
		MinWidth:         600,
		MinHeight:        400,
		DisableResize:    false,
		Menu:             app.AppMenu,
		Title:            bridge.Env.AppName,
		Frameless:        bridge.Env.OS != "darwin",
		Width:            bridge.Config.Width,
		Height:           bridge.Config.Height,
		StartHidden:      bridge.Config.StartHidden,
		WindowStartState: options.WindowStartState(bridge.Config.WindowStartState),
		BackgroundColour: &options.RGBA{R: 30, G: 30, B: 30, A: 255},
		Windows: &windows.Options{
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
			BackdropType:         windows.Acrylic,
			WebviewBrowserPath:   bridge.Env.WebviewPath,
		},
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHiddenInset(),
			Appearance:           mac.DefaultAppearance,
			WebviewIsTransparent: bridge.SupportsMacOSTransparency(),
			WindowIsTranslucent:  bridge.SupportsMacOSTransparency(),
			About: &mac.AboutInfo{
				Title:   bridge.Env.AppName,
				Message: "© 2025 GUI.for.Cores",
				Icon:    icon,
			},
		},
		Linux: &linux.Options{
			Icon:                icon,
			WindowIsTranslucent: false,
			ProgramName:         bridge.Env.AppName,
			WebviewGpuPolicy:    linux.WebviewGpuPolicy(bridge.Config.WebviewGpuPolicy),
		},
		AssetServer: &assetserver.Options{
			Assets:     assets,
			Middleware: bridge.RollingRelease,
		},
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId: func() string {
				if bridge.Config.MultipleInstance {
					return time.Now().String()
				}
				return bridge.Env.AppName
			}(),
			OnSecondInstanceLaunch: func(data options.SecondInstanceData) {
				runtime.Show(app.Ctx)
				runtime.EventsEmit(app.Ctx, "onLaunchApp", data.Args)
			},
		},
		OnStartup: func(ctx context.Context) {
			app.Ctx = ctx
			trayStart()
			app.StartPowerMonitor() // Start monitoring power events (Windows only)
		},
		OnDomReady: func(ctx context.Context) {
			// Workaround for macOS 11 (Big Sur) black screen/rendering issues
			// on older Intel GPUs. We force a window resize to trigger a WebKit repaint.
			if bridge.ShouldDisableMacOSGPU() {
				// Inject a CSS class for frontend compatibility (disabling animations/blur)
				runtime.WindowExecJS(ctx, `document.body.classList.add("platform-macos-old");`)

				go func() {
					// Wait longer for WebView to fully initialize
					time.Sleep(1 * time.Second)

					// Force show multiple times to fight against visibility state changes
					runtime.WindowShow(ctx)

					// The "Kick": Resize window slightly to force GPU context update
					width, height := runtime.WindowGetSize(ctx)
					runtime.WindowSetSize(ctx, width+1, height)

					time.Sleep(100 * time.Millisecond)
					runtime.WindowSetSize(ctx, width, height)

					// Show again after resize
					time.Sleep(100 * time.Millisecond)
					runtime.WindowShow(ctx)

					// Another kick after a longer delay
					time.Sleep(500 * time.Millisecond)
					runtime.WindowShow(ctx)
				}()
			}
		},
		OnBeforeClose: func(ctx context.Context) (prevent bool) {
			runtime.EventsEmit(ctx, "onBeforeExitApp")
			return true
		},
		Bind: []any{
			app,
		},
		LogLevel: logger.INFO,
		Debug: options.Debug{
			OpenInspectorOnStartup: true,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
