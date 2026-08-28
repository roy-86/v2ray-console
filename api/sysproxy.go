package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ─── 系统全局代理（一键开关） ──────────────────────────────────────────────
// macOS: networksetup（对所有已启用的网络服务生效）
// Windows: 注册表 Internet Settings（需要重新打开部分应用才生效）
// Linux: gsettings（仅 GNOME 桌面）

const sysCmdTimeout = 15 * time.Second

// 并发保护：避免连续点击按钮导致 networksetup 交错执行
var sysProxyMu sync.Mutex

// SysProxyStatus 系统代理当前状态
type SysProxyStatus struct {
	Supported bool   `json:"supported"`
	Enabled   bool   `json:"enabled"`
	Server    string `json:"server,omitempty"`
	HTTPPort  int    `json:"http_port,omitempty"`
	SOCKSPort int    `json:"socks_port,omitempty"`
}

// sysProxyTarget 从 V2Ray 配置解析出的本地代理入口
type sysProxyTarget struct {
	addr      string // 代理服务器地址（通常是 127.0.0.1）
	httpPort  int    // HTTP 入站端口，0 表示没有
	socksPort int    // SOCKS 入站端口，0 表示没有
}

func (t sysProxyTarget) describe() string {
	var parts []string
	if t.httpPort > 0 {
		parts = append(parts, "HTTP "+strconv.Itoa(t.httpPort))
	}
	if t.socksPort > 0 {
		parts = append(parts, "SOCKS "+strconv.Itoa(t.socksPort))
	}
	return fmt.Sprintf("%s（%s）", t.addr, strings.Join(parts, " / "))
}

// ─── 通用命令执行 ──────────────────────────────────────────────────────────

func runCmd(timeout time.Duration, name string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, name, args...).CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return string(out), fmt.Errorf("%s 执行超时", name)
	}
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return string(out), fmt.Errorf("%s", msg)
	}
	return string(out), nil
}

// ─── 平台分发 ──────────────────────────────────────────────────────────────

func sysProxySupported() bool {
	switch runtime.GOOS {
	case "darwin", "windows", "linux":
		return true
	default:
		return false
	}
}

func sysProxyEnable(t sysProxyTarget) error {
	sysProxyMu.Lock()
	defer sysProxyMu.Unlock()
	switch runtime.GOOS {
	case "darwin":
		return darwinSysProxyEnable(t)
	case "windows":
		return windowsSysProxyEnable(t)
	case "linux":
		return linuxSysProxyEnable(t)
	default:
		return fmt.Errorf("当前操作系统 (%s) 暂不支持自动设置系统代理", runtime.GOOS)
	}
}

func sysProxyDisable() error {
	sysProxyMu.Lock()
	defer sysProxyMu.Unlock()
	switch runtime.GOOS {
	case "darwin":
		return darwinSysProxyDisable()
	case "windows":
		return windowsSysProxyDisable()
	case "linux":
		return linuxSysProxyDisable()
	default:
		return fmt.Errorf("当前操作系统 (%s) 暂不支持自动设置系统代理", runtime.GOOS)
	}
}

func getSysProxyStatus() SysProxyStatus {
	switch runtime.GOOS {
	case "darwin":
		return darwinSysProxyStatus()
	case "windows":
		return windowsSysProxyStatus()
	case "linux":
		return linuxSysProxyStatus()
	default:
		return SysProxyStatus{Supported: false}
	}
}

// ─── macOS（networksetup） ─────────────────────────────────────────────────

// 默认绕过代理的地址（本机 + 内网），与常见代理客户端行为一致
var sysProxyBypass = []string{
	"127.0.0.1", "localhost",
	"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16",
	"*.local", "*.lan",
}

func darwinNetworkServices() ([]string, error) {
	out, err := runCmd(sysCmdTimeout, "networksetup", "-listallnetworkservices")
	if err != nil {
		return nil, fmt.Errorf("执行 networksetup 失败: %v", err)
	}
	var services []string
	for i, line := range strings.Split(out, "\n") {
		if i == 0 {
			continue // 首行是说明文字 "An asterisk (*) denotes ..."
		}
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "*") {
			continue // 带 * 的是已禁用的服务
		}
		services = append(services, line)
	}
	if len(services) == 0 {
		return nil, fmt.Errorf("未找到可用的网络服务")
	}
	return services, nil
}

func darwinSysProxyEnable(t sysProxyTarget) error {
	services, err := darwinNetworkServices()
	if err != nil {
		return err
	}
	var failures []string
	for _, svc := range services {
		if t.httpPort > 0 {
			if _, err := runCmd(sysCmdTimeout, "networksetup", "-setwebproxy", svc, t.addr, strconv.Itoa(t.httpPort)); err != nil {
				failures = append(failures, svc+" HTTP: "+err.Error())
			}
			if _, err := runCmd(sysCmdTimeout, "networksetup", "-setsecurewebproxy", svc, t.addr, strconv.Itoa(t.httpPort)); err != nil {
				failures = append(failures, svc+" HTTPS: "+err.Error())
			}
		}
		if t.socksPort > 0 {
			if _, err := runCmd(sysCmdTimeout, "networksetup", "-setsocksfirewallproxy", svc, t.addr, strconv.Itoa(t.socksPort)); err != nil {
				failures = append(failures, svc+" SOCKS: "+err.Error())
			}
		}
		bypassArgs := append([]string{"-setproxybypassdomains", svc}, sysProxyBypass...)
		if _, err := runCmd(sysCmdTimeout, "networksetup", bypassArgs...); err != nil {
			failures = append(failures, svc+" 绕过列表: "+err.Error())
		}
	}
	if len(failures) > 0 {
		return fmt.Errorf("%d 项设置失败: %s", len(failures), strings.Join(failures, "；"))
	}
	return nil
}

func darwinSysProxyDisable() error {
	services, err := darwinNetworkServices()
	if err != nil {
		return err
	}
	var failures []string
	for _, svc := range services {
		for _, args := range [][]string{
			{"-setwebproxystate", svc, "off"},
			{"-setsecurewebproxystate", svc, "off"},
			{"-setsocksfirewallproxystate", svc, "off"},
		} {
			if _, err := runCmd(sysCmdTimeout, "networksetup", args...); err != nil {
				failures = append(failures, svc+": "+err.Error())
			}
		}
	}
	if len(failures) > 0 {
		return fmt.Errorf("%d 项设置失败: %s", len(failures), strings.Join(failures, "；"))
	}
	return nil
}

func darwinSysProxyStatus() SysProxyStatus {
	services, err := darwinNetworkServices()
	if err != nil {
		return SysProxyStatus{Supported: false}
	}
	st := SysProxyStatus{Supported: true}
	for _, svc := range services {
		if out, err := runCmd(sysCmdTimeout, "networksetup", "-getwebproxy", svc); err == nil {
			if enabled, server, port := parseDarwinProxyOut(out); enabled {
				st.Enabled = true
				if st.HTTPPort == 0 {
					st.HTTPPort, st.Server = port, server
				}
			}
		}
		if out, err := runCmd(sysCmdTimeout, "networksetup", "-getsocksfirewallproxy", svc); err == nil {
			if enabled, _, port := parseDarwinProxyOut(out); enabled {
				st.Enabled = true
				if st.SOCKSPort == 0 {
					st.SOCKSPort = port
				}
			}
		}
	}
	return st
}

// parseDarwinProxyOut 解析 networksetup -getwebproxy/-getsocksfirewallproxy 输出：
//
//	Enabled: Yes
//	Server: 127.0.0.1
//	Port: 10809
func parseDarwinProxyOut(out string) (enabled bool, server string, port int) {
	for _, line := range strings.Split(out, "\n") {
		k, v, ok := strings.Cut(strings.TrimSpace(line), ":")
		if !ok {
			continue
		}
		k = strings.ToLower(strings.TrimSpace(k))
		v = strings.TrimSpace(v)
		switch k {
		case "enabled":
			enabled = strings.EqualFold(v, "yes")
		case "server":
			server = v
		case "port":
			port, _ = strconv.Atoi(v)
		}
	}
	return enabled, server, port
}

// ─── Windows（注册表） ─────────────────────────────────────────────────────

const winProxyRegPath = `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings`

// 通知系统代理设置已变化（best-effort，失败不影响设置结果）
const winProxyRefreshPS = `Add-Type -MemberDefinition '[DllImport("wininet.dll")] public static extern bool InternetSetOption(IntPtr h, int o, IntPtr b, int l);' -Name WinINET -Namespace P; [P.WinINET]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null; [P.WinINET]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null`

func winRegAdd(name, typ, value string) error {
	_, err := runCmd(sysCmdTimeout, "reg", "add", winProxyRegPath, "/v", name, "/t", typ, "/d", value, "/f")
	return err
}

func windowsSysProxyEnable(t sysProxyTarget) error {
	// 有 HTTP 入站时统一走 "host:port"；只有 SOCKS 时用 socks= 前缀强制 SOCKS
	var server string
	if t.httpPort > 0 {
		server = fmt.Sprintf("%s:%d", t.addr, t.httpPort)
	} else {
		server = fmt.Sprintf("socks=%s:%d", t.addr, t.socksPort)
	}
	if err := winRegAdd("ProxyServer", "REG_SZ", server); err != nil {
		return err
	}
	if err := winRegAdd("ProxyEnable", "REG_DWORD", "1"); err != nil {
		return err
	}
	_, _ = runCmd(sysCmdTimeout, "powershell", "-NoProfile", "-Command", winProxyRefreshPS)
	return nil
}

func windowsSysProxyDisable() error {
	if err := winRegAdd("ProxyEnable", "REG_DWORD", "0"); err != nil {
		return err
	}
	_, _ = runCmd(sysCmdTimeout, "powershell", "-NoProfile", "-Command", winProxyRefreshPS)
	return nil
}

func windowsSysProxyStatus() SysProxyStatus {
	st := SysProxyStatus{Supported: true}
	out, err := runCmd(sysCmdTimeout, "reg", "query", winProxyRegPath, "/v", "ProxyEnable")
	if err != nil {
		return st
	}
	st.Enabled = strings.Contains(out, "0x1")
	if st.Enabled {
		if out, err := runCmd(sysCmdTimeout, "reg", "query", winProxyRegPath, "/v", "ProxyServer"); err == nil {
			for _, line := range strings.Split(out, "\n") {
				if i := strings.Index(line, "REG_SZ"); i >= 0 {
					st.Server = strings.TrimSpace(line[i+len("REG_SZ"):])
					break
				}
			}
		}
	}
	return st
}

// ─── Linux（gsettings / GNOME） ────────────────────────────────────────────

func linuxCheckGSettings() error {
	if _, err := exec.LookPath("gsettings"); err != nil {
		return fmt.Errorf("未找到 gsettings，无法自动设置系统代理（仅支持 GNOME 桌面）")
	}
	return nil
}

func linuxGSet(schema, key, value string) error {
	_, err := runCmd(sysCmdTimeout, "gsettings", "set", schema, key, value)
	return err
}

func linuxSysProxyEnable(t sysProxyTarget) error {
	if err := linuxCheckGSettings(); err != nil {
		return err
	}
	if t.httpPort > 0 {
		port := strconv.Itoa(t.httpPort)
		if err := linuxGSet("org.gnome.system.proxy.http", "host", fmt.Sprintf("'%s'", t.addr)); err != nil {
			return err
		}
		if err := linuxGSet("org.gnome.system.proxy.http", "port", port); err != nil {
			return err
		}
		if err := linuxGSet("org.gnome.system.proxy.https", "host", fmt.Sprintf("'%s'", t.addr)); err != nil {
			return err
		}
		if err := linuxGSet("org.gnome.system.proxy.https", "port", port); err != nil {
			return err
		}
	}
	if t.socksPort > 0 {
		if err := linuxGSet("org.gnome.system.proxy.socks", "host", fmt.Sprintf("'%s'", t.addr)); err != nil {
			return err
		}
		if err := linuxGSet("org.gnome.system.proxy.socks", "port", strconv.Itoa(t.socksPort)); err != nil {
			return err
		}
	}
	quotedBypass := make([]string, len(sysProxyBypass))
	for i, b := range sysProxyBypass {
		quotedBypass[i] = "'" + b + "'"
	}
	if err := linuxGSet("org.gnome.system.proxy", "ignore-hosts", "["+strings.Join(quotedBypass, ", ")+"]"); err != nil {
		return err
	}
	return linuxGSet("org.gnome.system.proxy", "mode", "'manual'")
}

func linuxSysProxyDisable() error {
	if err := linuxCheckGSettings(); err != nil {
		return err
	}
	return linuxGSet("org.gnome.system.proxy", "mode", "'none'")
}

func linuxSysProxyStatus() SysProxyStatus {
	st := SysProxyStatus{Supported: true}
	if linuxCheckGSettings() != nil {
		st.Supported = false
		return st
	}
	out, err := runCmd(sysCmdTimeout, "gsettings", "get", "org.gnome.system.proxy", "mode")
	if err != nil {
		return st
	}
	st.Enabled = strings.TrimSpace(out) == "'manual'"
	return st
}

// ─── 配置解析：从 V2Ray 配置中找出本地 socks/http 入站 ────────────────────

// resolveLocalProxy 解析当前配置，返回可用的本地代理入口
func (h *Handler) resolveLocalProxy() (sysProxyTarget, error) {
	raw, err := h.engine.GetConfig()
	if err != nil {
		return sysProxyTarget{}, fmt.Errorf("读取配置失败: %w", err)
	}
	var doc struct {
		Inbounds []struct {
			Port     interface{} `json:"port"`
			Listen   string      `json:"listen"`
			Protocol string      `json:"protocol"`
		} `json:"inbounds"`
	}
	if err := json.Unmarshal([]byte(raw), &doc); err != nil {
		return sysProxyTarget{}, fmt.Errorf("解析配置失败: %w", err)
	}

	t := sysProxyTarget{addr: "127.0.0.1"}
	for _, ib := range doc.Inbounds {
		port := parseInboundPort(ib.Port)
		if port <= 0 {
			continue
		}
		// 入站监听在明确的非回环地址时，系统代理指向该地址
		listen := strings.TrimSpace(ib.Listen)
		switch listen {
		case "", "0.0.0.0", "::", "[::]", "127.0.0.1", "localhost", "::1":
			// 保持 127.0.0.1
		default:
			t.addr = listen
		}
		switch ib.Protocol {
		case "http":
			if t.httpPort == 0 {
				t.httpPort = port
			}
		case "socks":
			if t.socksPort == 0 {
				t.socksPort = port
			}
		}
	}
	if t.httpPort == 0 && t.socksPort == 0 {
		return sysProxyTarget{}, fmt.Errorf("配置中没有本地 socks/http 入站，请先在配置中添加 HTTP 或 SOCKS5 入站")
	}
	return t, nil
}

// parseInboundPort 兼容数字端口和字符串端口（端口段 "1080-1090" 无法作为系统代理端口，跳过）
func parseInboundPort(v interface{}) int {
	switch p := v.(type) {
	case float64:
		return int(p)
	case string:
		n, err := strconv.Atoi(strings.TrimSpace(p))
		if err != nil {
			return 0
		}
		return n
	default:
		return 0
	}
}

// ─── HTTP Handlers ─────────────────────────────────────────────────────────

// handleSysProxyStatus GET /api/sysproxy — 查询系统代理状态
func (h *Handler) handleSysProxyStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "仅支持 GET 方法")
		return
	}
	writeJSON(w, http.StatusOK, getSysProxyStatus())
}

// handleSysProxyEnable POST /api/sysproxy/enable — 一键开启系统全局代理
func (h *Handler) handleSysProxyEnable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "仅支持 POST 方法")
		return
	}
	if !sysProxySupported() {
		writeError(w, http.StatusBadRequest, "当前操作系统暂不支持自动设置系统代理")
		return
	}
	// V2Ray 未运行时开系统代理会断网，先拦截
	if !h.engine.IsRunning() {
		writeError(w, http.StatusBadRequest, "V2Ray 未运行，请先启动 V2Ray 再开启系统代理")
		return
	}
	target, err := h.resolveLocalProxy()
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := sysProxyEnable(target); err != nil {
		writeError(w, http.StatusInternalServerError, "设置系统代理失败: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "系统代理已开启: " + target.describe()})
}

// handleSysProxyDisable POST /api/sysproxy/disable — 关闭系统全局代理
func (h *Handler) handleSysProxyDisable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "仅支持 POST 方法")
		return
	}
	if !sysProxySupported() {
		writeError(w, http.StatusBadRequest, "当前操作系统暂不支持自动设置系统代理")
		return
	}
	if err := sysProxyDisable(); err != nil {
		writeError(w, http.StatusInternalServerError, "关闭系统代理失败: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "系统代理已关闭"})
}
