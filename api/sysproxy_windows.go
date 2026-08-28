//go:build windows

package api

import (
	"fmt"
	"strconv"
	"strings"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

// Windows 实现要点：
//  1. WinINET（HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings）
//     是**每用户**设置；服务以 LocalSystem 运行，写 CURRENT_USER 等于写 SYSTEM 的 HKCU，
//     对登录用户毫无影响。所以这里枚举 HKEY_USERS 下所有交互用户的 SID，给每个用户的 HKCU
//     都写上，才能在用户的 Settings → 代理对话框里看到开、并影响其浏览器 / 系统代理。
//  2. WinHTTP（HKLM\...\WinHttpSettings）由 netsh winhttp 写入，对所有用户机器范围生效，
//     覆盖 Chrome / Edge / 现代 WinHTTP 应用；需要管理员令牌。
//  3. 注册表写入后必须调 wininet.dll 的 InternetSetOption 广播，否则运行中的应用感知不到
//     （WinINET 广播会跨 Session 传播，Session0 的服务也能让交互会话收到）。

const winProxySubPath = `Software\Microsoft\Windows\CurrentVersion\Internet Settings`

// wininet.h: INTERNET_OPTION_SETTINGS_CHANGED / INTERNET_OPTION_REFRESH
const (
	winInternetOptionSettingsChanged = 39
	winInternetOptionRefresh         = 37
)

var (
	wininetDLL             = windows.NewLazySystemDLL("wininet.dll")
	procInternetSetOptionW = wininetDLL.NewProc("InternetSetOptionW")
)

// winRefreshProxySettings 广播代理设置已变化，让所有会话中的应用立即生效
func winRefreshProxySettings() error {
	if r1, _, err := procInternetSetOptionW.Call(0, winInternetOptionSettingsChanged, 0, 0); r1 == 0 {
		return fmt.Errorf("InternetSetOption(SETTINGS_CHANGED) 失败: %w", err)
	}
	if r1, _, err := procInternetSetOptionW.Call(0, winInternetOptionRefresh, 0, 0); r1 == 0 {
		return fmt.Errorf("InternetSetOption(REFRESH) 失败: %w", err)
	}
	return nil
}

// winProxyOverride 生成本机/内网绕过列表（Windows 用 ; 分隔 + <local> 表示裸主机名）
func winProxyOverride() string {
	parts := []string{
		"localhost", "127.*", "10.*",
		"172.16.*", "172.17.*", "172.18.*", "172.19.*", "172.20.*",
		"172.21.*", "172.22.*", "172.23.*", "172.24.*", "172.25.*",
		"172.26.*", "172.27.*", "172.28.*", "172.29.*", "172.30.*", "172.31.*",
		"192.168.*", "169.254.*", "<local>",
	}
	return strings.Join(parts, ";")
}

// enumerateInteractiveUserProxyPaths 返回所有非系统用户 HKU 下 Internet Settings 注册表路径。
// 服务为 LocalSystem 时也需要写到这里，普通用户双击运行时也会枚举到自己的 SID，重复但无副作用。
func enumerateInteractiveUserProxyPaths() []string {
	users, err := registry.OpenKey(registry.USERS, "", registry.ENUMERATE_SUB_KEYS)
	if err != nil {
		return nil
	}
	defer users.Close()
	names, _ := users.ReadSubKeyNames(-1)
	var paths []string
	for _, n := range names {
		// 排除：合并视图 _Classes、SYSTEM/LocalService/NetworkService
		if n == "_Classes" || strings.HasPrefix(n, "S-1-5-18") ||
			strings.HasPrefix(n, "S-1-5-19") || strings.HasPrefix(n, "S-1-5-20") {
			continue
		}
		paths = append(paths, n+"\\"+winProxySubPath)
	}
	return paths
}

// winWriteUserProxy 把 WinINET 设置写到 HKEY_USERS\<SID>。enable=false 时只清 ProxyEnable，
// 保留 ProxyServer/ProxyOverride 便于排查。
func winWriteUserProxy(path, server, bypass string, enable bool) error {
	k, err := registry.OpenKey(registry.USERS, path, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()
	if enable {
		if err := k.SetStringValue("ProxyServer", server); err != nil {
			return err
		}
		if err := k.SetStringValue("ProxyOverride", bypass); err != nil {
			return err
		}
		if err := k.SetDWordValue("ProxyEnable", 1); err != nil {
			return err
		}
	} else {
		if err := k.SetDWordValue("ProxyEnable", 0); err != nil {
			return err
		}
	}
	return nil
}

func windowsSysProxyEnable(t sysProxyTarget) error {
	// 1) 准备参数：有 HTTP 入站走 "host:port"；只有 SOCKS 时用 socks= 前缀
	var server string
	if t.httpPort > 0 {
		server = fmt.Sprintf("%s:%d", t.addr, t.httpPort)
	} else {
		server = fmt.Sprintf("socks=%s:%d", t.addr, t.socksPort)
	}
	bypass := winProxyOverride()

	// 2) WinINET：写入所有交互用户的 HKCU（关键——HKCU 是每用户设置）
	var firstErr error
	written := 0
	for _, p := range enumerateInteractiveUserProxyPaths() {
		if err := winWriteUserProxy(p, server, bypass, true); err == nil {
			written++
		} else if firstErr == nil {
			firstErr = err
		}
	}
	if written == 0 {
		return fmt.Errorf("未找到任何用户 HKCU，写入失败: %w", firstErr)
	}

	// 3) 广播：WinINET 跨 Session 传播，让交互会话里的浏览器立即感知
	if err := winRefreshProxySettings(); err != nil {
		return fmt.Errorf("WinINET 广播失败: %w", err)
	}

	// 4) WinHTTP（netsh winhttp set proxy）：HKLM，机器范围，覆盖 Chrome/Edge/现代 WinHTTP应用
	if err := winSetWinHTTPProxy(server, bypass); err != nil {
		return fmt.Errorf("WinINET 已设置（%d 个用户），但 WinHTTP 代理失败（控制 Chrome/Edge 等现代应用需以管理员身份运行 v2ray-console）: %w", written, err)
	}
	return nil
}

func windowsSysProxyDisable() error {
	// 1) 清空所有交互用户 HKCU 的 ProxyEnable
	var firstErr error
	cleared := 0
	for _, p := range enumerateInteractiveUserProxyPaths() {
		// 关时只清开关，保留 server/override 让用户能在设置里看到上次值
		k, err := registry.OpenKey(registry.USERS, p, registry.SET_VALUE)
		if err != nil {
			continue
		}
		if err := k.SetDWordValue("ProxyEnable", 0); err == nil {
			cleared++
		} else if firstErr == nil {
			firstErr = err
		}
		k.Close()
	}
	if cleared == 0 && firstErr != nil {
		return fmt.Errorf("未清空任何用户 HKCU: %w", firstErr)
	}

	// 2) 广播
	if err := winRefreshProxySettings(); err != nil {
		return fmt.Errorf("WinINET 广播失败: %w", err)
	}

	// 3) 重置 WinHTTP
	if err := winResetWinHTTPProxy(); err != nil {
		return fmt.Errorf("WinINET 已关闭，但 WinHTTP 代理清除失败（需管理员身份运行 v2ray-console）: %w", err)
	}
	return nil
}

// winSetWinHTTPProxy 通过 netsh 设置 WinHTTP 代理（写 HKLM，需管理员）
func winSetWinHTTPProxy(server, bypassList string) error {
	_, err := runCmd(sysCmdTimeout, "netsh", "winhttp", "set", "proxy",
		"proxy-server="+server, "bypass-list="+bypassList)
	return err
}

func winResetWinHTTPProxy() error {
	_, err := runCmd(sysCmdTimeout, "netsh", "winhttp", "reset", "proxy")
	return err
}

func windowsSysProxyStatus() SysProxyStatus {
	st := SysProxyStatus{Supported: true}
	// 任一交互用户 HKCU 开了 ProxyEnable 即视为开启
	for _, p := range enumerateInteractiveUserProxyPaths() {
		k, err := registry.OpenKey(registry.USERS, p, registry.QUERY_VALUE)
		if err != nil {
			continue
		}
		if v, _, err := k.GetIntegerValue("ProxyEnable"); err == nil && v == 1 {
			st.Enabled = true
			if server, _, err := k.GetStringValue("ProxyServer"); err == nil {
				st.Server = server
				for _, seg := range strings.Split(server, ";") {
					isSocks := strings.HasPrefix(seg, "socks=")
					if isSocks || strings.HasPrefix(seg, "http=") || strings.HasPrefix(seg, "https=") {
						if i := strings.Index(seg, "="); i >= 0 {
							seg = seg[i+1:]
						}
					}
					if i := strings.LastIndex(seg, ":"); i > 0 {
						if port, err := strconv.Atoi(seg[i+1:]); err == nil {
							if isSocks {
								if st.SOCKSPort == 0 {
									st.SOCKSPort = port
								}
							} else if st.HTTPPort == 0 {
								st.HTTPPort = port
							}
						}
					}
				}
			}
			k.Close()
			break
		}
		k.Close()
	}
	return st
}
