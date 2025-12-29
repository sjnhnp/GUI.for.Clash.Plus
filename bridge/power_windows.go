//go:build windows

package bridge

import (
	"log"
	"syscall"
	"unsafe"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/sys/windows"
)

var (
	user32                  = windows.NewLazySystemDLL("user32.dll")
	procRegisterClassExW    = user32.NewProc("RegisterClassExW")
	procCreateWindowExW     = user32.NewProc("CreateWindowExW")
	procDefWindowProcW      = user32.NewProc("DefWindowProcW")
	procGetMessageW         = user32.NewProc("GetMessageW")
	procTranslateMessage    = user32.NewProc("TranslateMessage")
	procDispatchMessageW    = user32.NewProc("DispatchMessageW")
)

const (
	WM_POWERBROADCAST       = 0x0218
	PBT_APMRESUMEAUTOMATIC  = 0x0012
	PBT_APMRESUMESUSPEND    = 0x0007
	PBT_APMSUSPEND          = 0x0004
)

type WNDCLASSEXW struct {
	CbSize        uint32
	Style         uint32
	LpfnWndProc   uintptr
	CbClsExtra    int32
	CbWndExtra    int32
	HInstance     windows.Handle
	HIcon         windows.Handle
	HCursor       windows.Handle
	HbrBackground windows.Handle
	LpszMenuName  *uint16
	LpszClassName *uint16
	HIconSm       windows.Handle
}

type MSG struct {
	Hwnd    windows.HWND
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      struct{ X, Y int32 }
}

var powerMonitorApp *App

// wndProc is the window procedure that handles power management messages
func wndProc(hwnd windows.HWND, msg uint32, wParam, lParam uintptr) uintptr {
	if msg == WM_POWERBROADCAST {
		switch wParam {
		case PBT_APMRESUMESUSPEND:
			// System resumed from suspend (user triggered wake)
			log.Println("Power event: Resume from suspend (user triggered)")
			if powerMonitorApp != nil && powerMonitorApp.Ctx != nil {
				runtime.EventsEmit(powerMonitorApp.Ctx, "onSystemResume", "suspend")
			}
		case PBT_APMRESUMEAUTOMATIC:
			// System resumed automatically (e.g., scheduled task)
			log.Println("Power event: Resume automatic")
			if powerMonitorApp != nil && powerMonitorApp.Ctx != nil {
				runtime.EventsEmit(powerMonitorApp.Ctx, "onSystemResume", "automatic")
			}
		case PBT_APMSUSPEND:
			// System is about to suspend
			log.Println("Power event: System suspending")
			if powerMonitorApp != nil && powerMonitorApp.Ctx != nil {
				runtime.EventsEmit(powerMonitorApp.Ctx, "onSystemSuspend")
			}
		}
	}

	ret, _, _ := procDefWindowProcW.Call(uintptr(hwnd), uintptr(msg), wParam, lParam)
	return ret
}

// StartPowerMonitor starts monitoring Windows power events
// This creates a hidden message-only window to receive power broadcast messages
func (a *App) StartPowerMonitor() {
	powerMonitorApp = a

	go func() {
		className, _ := syscall.UTF16PtrFromString("GFCPowerMonitor")

		wc := WNDCLASSEXW{
			CbSize:        uint32(unsafe.Sizeof(WNDCLASSEXW{})),
			LpfnWndProc:   syscall.NewCallback(wndProc),
			LpszClassName: className,
		}

		atom, _, err := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
		if atom == 0 {
			log.Printf("Failed to register power monitor window class: %v", err)
			return
		}

		windowName, _ := syscall.UTF16PtrFromString("GFC Power Monitor Window")

		// Create a message-only window (HWND_MESSAGE parent)
		hwnd, _, err := procCreateWindowExW.Call(
			0,
			uintptr(unsafe.Pointer(className)),
			uintptr(unsafe.Pointer(windowName)),
			0,
			0, 0, 0, 0,
			uintptr(0xFFFFFFFFFFFFFFFD), // HWND_MESSAGE (-3) for message-only window
			0, 0, 0,
		)
		if hwnd == 0 {
			log.Printf("Failed to create power monitor window: %v", err)
			return
		}

		log.Println("Power monitor started successfully")

		// Message loop
		var msg MSG
		for {
			ret, _, _ := procGetMessageW.Call(
				uintptr(unsafe.Pointer(&msg)),
				0, 0, 0,
			)
			if ret == 0 || ret == ^uintptr(0) { // 0 = WM_QUIT, -1 = error
				break
			}
			procTranslateMessage.Call(uintptr(unsafe.Pointer(&msg)))
			procDispatchMessageW.Call(uintptr(unsafe.Pointer(&msg)))
		}
	}()
}
