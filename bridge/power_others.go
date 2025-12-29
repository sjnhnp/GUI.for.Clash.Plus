//go:build !windows

package bridge

// StartPowerMonitor is a no-op on non-Windows platforms
// Windows implementation is in power_windows.go
func (a *App) StartPowerMonitor() {
	// Power monitoring is only supported on Windows
	// On other platforms, this is a no-op
}
