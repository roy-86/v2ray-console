//go:build !windows

package api

import "fmt"

// 非 Windows 平台的占位实现：实际调用前会被 sysProxySupported() 拦截，不会走到这里
func windowsSysProxyEnable(t sysProxyTarget) error {
	return fmt.Errorf("仅支持 Windows")
}

func windowsSysProxyDisable() error {
	return fmt.Errorf("仅支持 Windows")
}

func windowsSysProxyStatus() SysProxyStatus {
	return SysProxyStatus{Supported: false}
}
