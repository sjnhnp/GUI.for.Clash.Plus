package bridge

import (
	"os/exec"
	"strconv"
	"strings"
)

// MacOSVersionInfo holds the parsed macOS version
type MacOSVersionInfo struct {
	Major int
	Minor int
	Patch int
}

// GetMacOSVersion returns the macOS version, or nil if not on macOS or parsing fails
func GetMacOSVersion() *MacOSVersionInfo {
	if Env.OS != "darwin" {
		return nil
	}

	// Run sw_vers to get macOS version
	cmd := exec.Command("sw_vers", "-productVersion")
	output, err := cmd.Output()
	if err != nil {
		return nil
	}

	version := strings.TrimSpace(string(output))
	parts := strings.Split(version, ".")

	if len(parts) < 2 {
		return nil
	}

	major, err := strconv.Atoi(parts[0])
	if err != nil {
		return nil
	}

	minor, err := strconv.Atoi(parts[1])
	if err != nil {
		return nil
	}

	patch := 0
	if len(parts) >= 3 {
		patch, _ = strconv.Atoi(parts[2])
	}

	return &MacOSVersionInfo{
		Major: major,
		Minor: minor,
		Patch: patch,
	}
}

// SupportsMacOSTransparency returns true if the macOS version supports
// transparent/translucent windows reliably.
// macOS 12 (Monterey) and later have better WebKit support for transparency.
func SupportsMacOSTransparency() bool {
	version := GetMacOSVersion()
	if version == nil {
		// Not on macOS, or couldn't detect version - default to disabled
		return false
	}

	// macOS 12.0+ (Monterey and later) supports transparency well
	return version.Major >= 12
}

// ShouldDisableMacOSGPU returns true if WebView GPU acceleration should be disabled.
// On older macOS versions (11 and earlier) with older Intel GPUs (like MacBook 2015),
// WebKit GPU rendering can cause blank screen issues.
func ShouldDisableMacOSGPU() bool {
	version := GetMacOSVersion()
	if version == nil {
		// Not on macOS
		return false
	}

	// Disable GPU on macOS 11 and earlier
	// These older versions may have WebKit rendering issues with certain Intel GPUs
	return version.Major <= 11
}
