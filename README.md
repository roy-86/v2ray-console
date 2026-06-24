# V2Ray Console

基于 Web 的 [V2Ray](https://github.com/v2fly/v2ray-core)（v5）管理面板，提供可视化的配置编辑、启停控制和状态监控。

## 功能

- **Web 管理界面** — 浏览器中查看/编辑 V2Ray JSON 配置，支持可视化表单和 JSON 双模式
- **启停控制** — 一键启动、停止、重启 V2Ray 核心
- **配置模板** — 内置 SOCKS5 / HTTP 客户端模板，快速上手
- **UUID 生成器** — 表单内一键生成随机 UUID，方便 VMess 用户配置
- **REST API** — 支持远程管理，方便集成其他工具
- **实时状态** — 自动轮询显示运行状态和版本信息

## 快速开始

### 前置条件

- Go 1.21+
- `geoip.dat` 和 `geosite.dat`（路由规则需要）

```bash
# 下载 geo 数据文件（首次运行前必须）
curl -sL -o geoip.dat "https://github.com/v2fly/geoip/releases/latest/download/geoip.dat"
curl -sL -o geosite.dat "https://github.com/v2fly/domain-list-community/releases/latest/download/dlc.dat"
```

### 初始化配置

```bash
# 从示例配置文件创建实际配置（config.json 已 gitignore，需自行创建）
cp config.example.json config.json
```

然后用编辑器打开 `config.json`，将 `your-server.com`、`your-uuid-here` 等占位符替换为你的实际服务器信息。

### 编译运行

```bash
# 编译
go build -o v2ray-console .

# 启动（默认使用 config.json）
./v2ray-console -config config.json -port 8080
```

打开浏览器访问 `http://localhost:8080`。

### 命令行参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `-config` | `config.json` | V2Ray 配置文件路径 |
| `-port` | `8080` | 管理面板监听端口 |

## 配置指南

配置文件使用 **V2Ray v4 JSON 格式**（与 Docker 镜像 `v2fly/v2fly-core` 兼容）。下面是完整的配置能力参考。

### 配置结构总览

```json
{
  "log":           {},     // 日志配置（可选）
  "dns":           {},     // DNS 配置（可选）
  "inbounds":      [],     // 入站（至少 1 个）
  "outbounds":     [],     // 出站（至少 1 个）
  "routing":       {},     // 路由规则（可选）
  "policy":        {},     // 策略控制（可选）
  "transport":     {},     // 全局传输设置（可选）
  "stats":         {},     // 统计（可选）
  "api":           {},     // 远程 API（可选）
  "reverse":       {}      // 反向代理（可选）
}
```

**只要 `inbounds` 和 `outbounds` 是必须的，其余都可以省略** — 各子系统都有合理的默认值。

---

### 一、Log 日志

```json
{
  "log": {
    "loglevel": "warning",
    "access": "/var/log/v2ray/access.log",
    "error": "/var/log/v2ray/error.log"
  }
}
```

| 字段 | 可选值 | 默认值 | 说明 |
|------|--------|--------|------|
| `loglevel` | `debug` / `info` / `warning` / `error` / `none` | `warning` | 日志级别，`debug` 最详细 |
| `access` | 文件路径 | 不输出 | 访问日志路径 |
| `error` | 文件路径 | 不输出 | 错误日志路径 |

> 不设则日志只输出到容器/进程的标准流，级别为 `warning`。

---

### 二、DNS

```json
{
  "dns": {
    "hosts": {
      "domain:example.com": "1.2.3.4",
      "example.com": "1.2.3.4"
    },
    "servers": [
      {
        "address": "8.8.8.8",
        "port": 53,
        "clientIP": "1.2.3.4",
        "queryStrategy": "UseIP",
        "skipFallback": false,
        "domains": ["geosite:google"],
        "expectIPs": ["geoip:us"]
      },
      "1.1.1.1",
      "localhost"
    ],
    "queryStrategy": "UseIP",
    "disableCache": false,
    "disableFallback": false,
    "tag": "dns-out"
  }
}
```

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `hosts` | `{}` | 静态 DNS 记录，`domain:` 前缀表示精确域名匹配 |
| `servers` | `["localhost"]` | DNS 服务器列表，每条可设独立策略 |
| `servers[].queryStrategy` | `UseIP` | `UseIP` / `UseIPv4` / `UseIPv6` |
| `servers[].domains` | `[]` | 指定哪些域名使用该服务器 |
| `servers[].expectIPs` | `[]` | 只接受指定 IP 范围的响应 |
| `queryStrategy` | `UseIP` | 全局查询策略 |
| `tag` | 无 | DNS 出站标签，配合路由使用（让 DNS 走代理） |

> **完全省略**则使用系统 DNS（`localhost`），对大多数桌面客户端已足够。

---

### 三、Inbounds 入站

#### 3.1 通用入站字段

```json
{
  "inbounds": [
    {
      "port": 10808,
      "listen": "127.0.0.1",
      "protocol": "socks",
      "settings": {},
      "tag": "my-inbound",
      "allocate": {
        "strategy": "always",
        "refresh": 5,
        "concurrency": 3
      }
    }
  ]
}
```

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `port` | **必填** | 监听端口 |
| `listen` | `"0.0.0.0"` | 监听地址 |
| `protocol` | **必填** | 入站协议 |
| `tag` | 自动生成 | 标签，路由引用时必填 |
| `allocate.strategy` | `"always"` | 端口分配策略（`always` 或 `random`） |

#### 3.2 支持的协议

##### SOCKS (Socks 5)

```json
{
  "protocol": "socks",
  "settings": {
    "auth": "noauth",
    "udp": true,
    "accounts": [
      { "user": "username", "pass": "password" }
    ],
    "ip": "127.0.0.1",
    "userLevel": 0
  }
}
```

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `auth` | `"noauth"` | `"noauth"` 或 `"password"` |
| `udp` | `false` | 是否支持 UDP 转发 |
| `accounts` | `[]` | 密码认证时的用户列表 |
| `ip` | `"0.0.0.0"` | 出站 IP 绑定 |

##### HTTP

```json
{
  "protocol": "http",
  "settings": {
    "timeout": 360,
    "accounts": [
      { "user": "username", "pass": "password" }
    ],
    "allowTransparent": false,
    "userLevel": 0
  }
}
```

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `timeout` | `360` | 超时（秒） |
| `accounts` | `[]` | 基本认证用户 |
| `allowTransparent` | `false` | 是否允许透明代理 |

##### VMess (入站 — 服务端场景)

```json
{
  "protocol": "vmess",
  "settings": {
    "clients": [
      {
        "id": "uuid-here",
        "alterId": 0,
        "security": "auto",
        "level": 1
      }
    ],
    "disableInsecureEncryption": true
  }
}
```

> 服务端入站使用 `settings.clients`（数组），与客户端出站的 `settings.vnext[].users` 对应。

##### VLESS (入站)

```json
{
  "protocol": "vless",
  "settings": {
    "clients": [
      {
        "id": "uuid-here",
        "flow": "xtls-rprx-vision",
        "encryption": "none",
        "level": 1
      }
    ],
    "decryption": "none",
    "fallbacks": [
      {
        "dest": 80,
        "xver": 1
      }
    ]
  }
}
```

| 字段 | 说明 |
|------|------|
| `flow` | 流控模式：`xtls-rprx-vision` / `xtls-rprx-vision-udp443` |
| `fallbacks` | 回落配置，未匹配时转到其他服务（如 Nginx） |

##### Shadowsocks (入站)

```json
{
  "protocol": "shadowsocks",
  "settings": {
    "method": "aes-256-gcm",
    "password": "your-password",
    "network": "tcp,udp",
    "email": "user@example.com",
    "level": 1
  }
}
```

| 加密方法 | 说明 |
|----------|------|
| `aes-256-gcm` | AES GCM（推荐） |
| `aes-128-gcm` | 较快的 AES 加密 |
| `chacha20-poly1305` | 移动端友好 |
| `2022-blake3-aes-128gcm` | SS 2022 协议（需 `reality` 配合，服务端需 SHAKE256 密码） |

##### Trojan (入站)

```json
{
  "protocol": "trojan",
  "settings": {
    "clients": [
      { "password": "password1", "level": 1 }
    ],
    "fallbacks": [
      { "dest": 80 }
    ]
  }
}
```

##### Dokodemo-door (任意门 / 透明代理)

```json
{
  "protocol": "dokodemo-door",
  "settings": {
    "network": "tcp,udp",
    "followRedirect": true,
    "port": 53,
    "address": "8.8.8.8"
  },
  "sniffing": {
    "enabled": true,
    "destOverride": ["http", "tls"]
  }
}
```

| 字段 | 说明 |
|------|------|
| `followRedirect` | 跟随 iptables 重定向流量（透明代理） |
| `sniffing` | 流量嗅探，自动识别真实目标地址 |

---

### 四、Outbounds 出站

#### 4.1 通用出站字段

```json
{
  "outbounds": [
    {
      "protocol": "vmess",
      "settings": {},
      "tag": "proxy",
      "proxySettings": {
        "tag": "another-proxy"
      },
      "mux": {
        "enabled": false,
        "concurrency": 8
      }
    }
  ]
}
```

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `protocol` | **必填** | 出站协议 |
| `tag` | 自动 | 标签，路由引用 |
| `sendThrough` | `"0.0.0.0"` | 绑定出站 IP |
| `proxySettings.tag` | 无 | 链式代理（经另一个出站转发） |
| `mux.enabled` | `false` | 多路复用（一个 TCP 连接承载多个请求） |
| `mux.concurrency` | `8` | 最大并发复用连接数 |

#### 4.2 支持的协议

##### VMess (客户端出站)

```json
{
  "protocol": "vmess",
  "settings": {
    "vnext": [
      {
        "address": "your-server.com",
        "port": 443,
        "users": [
          {
            "id": "uuid-here",
            "alterId": 0,
            "security": "auto",
            "level": 1
          }
        ]
      }
    ]
  },
  "streamSettings": {
    "network": "ws",
    "security": "tls",
    "wsSettings": { "path": "/ws", "headers": { "host": "your-server.com" } },
    "tlsSettings": { "serverName": "your-server.com", "allowInsecure": false }
  },
  "mux": { "enabled": false, "concurrency": 8 }
}
```

| `security` 选项 | 说明 |
|-----------------|------|
| `auto` | 自动选择（推荐） |
| `aes-128-gcm` | AES 加密 |
| `chacha20-poly1305` | ChaCha20 加密 |
| `none` | 不加密 |
| `zero` | 无加密无认证（仅测试用） |

##### VLESS (出站)

```json
{
  "protocol": "vless",
  "settings": {
    "vnext": [
      {
        "address": "your-server.com",
        "port": 443,
        "users": [
          {
            "id": "uuid-here",
            "encryption": "none",
            "flow": "",
            "level": 1
          }
        ]
      }
    ]
  },
  "streamSettings": {
    "network": "tcp",
    "security": "reality",
    "realitySettings": {
      "serverName": "www.microsoft.com",
      "fingerprint": "chrome",
      "publicKey": "...",
      "shortId": "...",
      "spiderX": "/"
    }
  }
}
```

> **与 VMess 的对比**：VLESS 取消加密层，必须配合 TLS/Reality 传输层安全；VMess 自带加密。VLESS + Reality 是当前推荐的性能组合。

##### Trojan (出站)

```json
{
  "protocol": "trojan",
  "settings": {
    "servers": [
      {
        "address": "your-server.com",
        "port": 443,
        "password": "password1",
        "email": "user@example.com",
        "level": 1
      }
    ]
  },
  "streamSettings": {
    "network": "tcp",
    "security": "tls",
    "tlsSettings": { "serverName": "your-server.com" }
  }
}
```

##### Shadowsocks (出站)

```json
{
  "protocol": "shadowsocks",
  "settings": {
    "servers": [
      {
        "address": "your-server.com",
        "port": 443,
        "method": "aes-256-gcm",
        "password": "your-password",
        "email": "user@example.com",
        "level": 1
      }
    ]
  }
}
```

##### Freedom (直连 — ⚡ 几乎必配的出站)

```json
{
  "protocol": "freedom",
  "settings": {
    "domainStrategy": "UseIP",
    "redirect": "",
    "userLevel": 0
  },
  "tag": "direct"
}
```

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `domainStrategy` | `"AsIs"` | `UseIP` / `AsIs` / `UseIPv4` / `UseIPv6` |
| `redirect` | `""` | 将所有流量重定向到指定地址 `127.0.0.1:1234` |

##### Blackhole (黑洞 / 丢弃)

```json
{
  "protocol": "blackhole",
  "settings": {
    "response": {
      "type": "http"
    }
  },
  "tag": "block"
}
```

| `type` | 说明 |
|--------|------|
| `"none"` | 直接断开连接 |
| `"http"` | 返回 404 页面 |

##### DNS (专用 DNS 出站)

```json
{
  "protocol": "dns",
  "tag": "dns-out"
}
```

> 配合路由使用：将 DNS 查询送入该出站，经由代理转发 DNS 请求，避免 DNS 污染。

##### Loopback (回环)

```json
{
  "protocol": "loopback",
  "tag": "loopback-out",
  "settings": {
    "inboundTag": "intercept-in"
  }
}
```

> 将流量重新送回另一个入站，适用于透明代理的二次处理。

---

### 五、Stream Settings 传输设置

每个出站都可以配置 `streamSettings`，决定数据用哪种协议传输。

```json
"streamSettings": {
  "network": "tcp",       // 传输协议
  "security": "none",     // 传输层安全
  "sockopt": {
    "mark": 0,
    "tcpFastOpen": false,
    "tproxy": "redirect"
  }
}
```

#### 5.1 支持的传输协议

| `network` | 说明 | 适合场景 |
|-----------|------|---------|
| `tcp` | 原始 TCP | 基本直连、HTTP 伪装 |
| `kcp` | mKCP (基于 UDP) | 弱网环境、移动端 |
| `ws` | WebSocket | 最广泛的伪装，CDN 友好 |
| `h2` | HTTP/2 | 需要 HTTP/2 多路复用 |
| `quic` | QUIC (基于 UDP) | 低延迟、多路复用 |
| `grpc` | gRPC | 高并发，CDN 友好 |

#### 5.2 TCP

```json
"streamSettings": {
  "network": "tcp",
  "tcpSettings": {
    "header": {
      "type": "http",
      "response": {
        "version": "1.1",
        "status": "200",
        "reason": "OK",
        "headers": {
          "Content-Type": ["application/octet-stream"]
        }
      }
    }
  }
}
```

| `header.type` | 说明 |
|---------------|------|
| `"none"` | 无伪装（默认） |
| `"http"` | HTTP 伪装，流量看起来像 HTTP 响应 |

#### 5.3 WebSocket (WS)

```json
"streamSettings": {
  "network": "ws",
  "wsSettings": {
    "path": "/ws",
    "headers": {
      "host": "your-server.com"
    }
  }
}
```

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `path` | `"/"` | WebSocket 路径 |
| `headers.host` | 无 | HTTP Host 头（CDN 场景必设） |

> WS 是 CDN 友好的首选方案，配合 TLS 使用不易被墙检测。

#### 5.4 mKCP (KCP over UDP)

```json
"streamSettings": {
  "network": "kcp",
  "kcpSettings": {
    "mtu": 1350,
    "tti": 20,
    "uplinkCapacity": 5,
    "downlinkCapacity": 20,
    "congestion": false,
    "readBuffer": 2,
    "writeBuffer": 2,
    "header": {
      "type": "wechat-video"
    },
    "seed": "my-password"
  }
}
```

| `header.type` | 说明 |
|---------------|------|
| `"none"` | 默认 |
| `"wechat-video"` | 伪装为微信视频通话 |
| `"utp"` | 伪装为 uTP |
| `"dtls"` | 伪装为 DTLS 1.2 |
| `"wireguard"` | 伪装为 WireGuard |

| mKCP 参数 | 默认值 | 说明 |
|-----------|--------|------|
| `mtu` | `1350` | 最大传输单元（建议 1350+，越大越浪费） |
| `tti` | `20` | 时间间隔（ms，越小响应越快） |
| `uplinkCapacity` | `5` | 上行带宽 MBps |
| `downlinkCapacity` | `20` | 下行带宽 MBps |
| `congestion` | `false` | 是否启用拥塞控制 |
| `seed` | `""` | 混淆种子（防墙识别） |

#### 5.5 QUIC

```json
"streamSettings": {
  "network": "quic",
  "quicSettings": {
    "security": "aes-128-gcm",
    "key": "your-key",
    "header": {
      "type": "srtp"
    }
  }
}
```

| `header.type` | 伪装说明 |
|---------------|---------|
| `"none"` | 默认 |
| `"srtp"` | 伪装为 SRTP 视频流 |
| `"utp"` | 伪装为 uTP |
| `"wechat-video"` | 伪装为微信视频 |
| `"dtls"` | 伪装为 DTLS |
| `"wireguard"` | 伪装为 WireGuard |

#### 5.6 gRPC

```json
"streamSettings": {
  "network": "grpc",
  "grpcSettings": {
    "serviceName": "your-service",
    "multiMode": false,
    "idle_timeout": 60,
    "health_check_timeout": 20,
    "permit_without_stream": false,
    "initial_windows_size": 0
  }
}
```

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `serviceName` | **必填** | gRPC 服务名 |
| `multiMode` | `false` | 多路复用模式 |

#### 5.7 HTTP/2 (h2)

```json
"streamSettings": {
  "network": "h2",
  "httpSettings": {
    "host": ["your-server.com"],
    "path": "/"
  }
}
```

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `host` | `["127.0.0.1"]` | 主机名数组 |
| `path` | `"/"` | 路径 |

---

### 六、Security 传输层安全

#### 6.1 TLS

```json
"streamSettings": {
  "security": "tls",
  "tlsSettings": {
    "serverName": "your-server.com",
    "allowInsecure": false,
    "alpn": ["h2", "http/1.1"],
    "minVersion": "1.2",
    "maxVersion": "1.3",
    "cipherSuites": "",
    "certFile": "/path/to/cert.pem",
    "keyFile": "/path/to/key.pem",
    "pinSHA256": ["cert-sha256-hash"]
  }
}
```

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `serverName` | 空 | SNI，CDN/反代场景**建议填写**，不填则不发 SNI |
| `allowInsecure` | `false` | 是否允许不安全证书（客户端开发可开） |
| `alpn` | 空 | ALPN 协商，如 `["h2", "http/1.1"]` |
| `minVersion` | `"1.2"` | 最低 TLS 版本 |
| `maxVersion` | `"1.3"` | 最高 TLS 版本 |
| `certFile` | 空 | 服务端证书路径（入站场景） |
| `keyFile` | 空 | 服务端私钥路径（入站场景） |

> **常见误区**：`serverName` 在客户端留空不会导致 TLS 握手失败，但很多 CDN（如 Cloudflare）靠 SNI 路由，所以建议填上。

#### 6.2 Reality

Reality 是 VLESS 的专属安全传输，无需 TLS 证书即可实现 TLS 级别的加密和域名伪装。

```json
"streamSettings": {
  "network": "tcp",
  "security": "reality",
  "realitySettings": {
    "serverName": "www.microsoft.com",
    "fingerprint": "chrome",
    "show": false,
    "publicKey": "...",         // 客户端：服务端公钥
    "privateKey": "...",        // 服务端：私钥
    "shortId": "0123456789ab",  // 短 ID（8 位十六进制）
    "spiderX": "/",             // 爬虫路径
    "dest": "www.microsoft.com:443",  // 服务端：回落目标
    "serverNames": [            // 服务端：可接受 SNI 列表
      "www.microsoft.com"
    ]
  }
}
```

| 字段 | 说明 |
|------|------|
| `fingerprint` | TLS 指纹：`chrome` / `firefox` / `safari` / `random` / `randomized` |
| `serverName` | 客户端：伪装成访问该域名 |
| `publicKey` | 客户端：服务端公钥（由服务端的私钥生成） |
| `privateKey` | 服务端：用 `xray x25519` 生成 |
| `shortId` | 服务端：作为连接标识，匹配不上则回落 |

> Reality 当前需要服务端配合 `xray` 或 `v2ray-core v5+` 使用。**Reality 是无证书的 TLS 替代方案**，被视为目前最安全的传输方式。

---

### 七、Mux 多路复用

```json
"outbounds": [{
  "mux": {
    "enabled": true,
    "concurrency": 8
  }
}]
```

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `enabled` | `false` | 是否启用多路复用 |
| `concurrency` | `8` | 单个 TCP 连接上最大并发复用数（建议 4~16） |

> Mux 用一条 TCP 连接承载多个虚拟连接，减少握手开销。但在高延迟网络下可能降低吞吐。建议**先关着**，只有遇到大量短连接场景（如浏览器上网）才考虑开启。

---

### 八、Routing 路由

路由是整个配置中最核心的流量控制子系统。

```json
{
  "routing": {
    "domainStrategy": "AsIs",
    "domainMatcher": "linear",
    "balancers": [],
    "rules": [],
    "settings": {
      "domainStrategy": "AsIs",
      "domainMatcher": "linear",
      "rules": []
    }
  }
}
```

> **注意**：v4 格式中路由配置在 `routing.settings.rules` 下。`routing.rules`（顶层）是 v5 格式。当前项目使用 v4 格式，请使用 `routing.settings.rules`。

#### 8.1 域名策略

| `domainStrategy` | 说明 |
|------------------|------|
| `"AsIs"` | 不解析，直接匹配域名原文（最快） |
| `"IPIfNonMatch"` | 如果域名规则未匹配，则解析为 IP 再匹配 IP 规则 |
| `"IPOnDemand"` | 所有域名先解析 IP，再匹配 IP 规则 |

> 推荐 `"AsIs"`。如果大量使用 `geoip:` 规则才考虑 `"IPIfNonMatch"`。

#### 8.2 域名匹配器

| `domainMatcher` | 说明 |
|-----------------|------|
| `"linear"` | 线性匹配，简单稳定（默认） |
| `"mph"` | 最小完美哈希，大量域名规则时内存更优 |

#### 8.3 路由规则

每条规则按**从上到下**顺序匹配，匹配后停止。

```json
"rules": [
  {
    "type": "field",
    "domain": ["geosite:cn", "domain:baidu.com"],
    "ip": ["geoip:private", "geoip:cn"],
    "port": "0-100",
    "network": "tcp",
    "source": ["10.0.0.0/8"],
    "protocol": ["http", "bittorrent"],
    "inboundTag": ["socks-in"],
    "attrs": "...",
    "outboundTag": "direct",
    "balancerTag": ""
  }
]
```

| 匹配字段 | 格式 | 说明 |
|---------|------|------|
| `domain` | 数组 | 域名规则（支持 `domain:` / `geosite:` / `regexp:` 前缀） |
| `ip` | 数组 | IP 规则（支持 `geoip:` 前缀） |
| `port` | 字符串 | 端口或端口范围 `"0-1024"` / `"80,443"` |
| `network` | 字符串 | `"tcp"` / `"udp"` |
| `source` | 数组 | 源 IP 段 |
| `protocol` | 数组 | `"http"` / `"tls"` / `"bittorrent"` |
| `inboundTag` | 数组 | 按入站标签匹配 |
| `outboundTag` | 字符串 | 匹配后使用的出站 |
| `balancerTag` | 字符串 | 匹配后使用的负载均衡器 |

##### 域名规则前缀

| 前缀 | 示例 | 说明 |
|------|------|------|
| `domain:` | `domain:google.com` | 精确匹配 `google.com` 及其子域名 |
| `geosite:` | `geosite:cn` | 从 `geosite.dat` 读取域名列表 |
| `regexp:` | `regexp:.*\.googlevideo\.com` | 正则匹配 |
| 无前缀 | `baidu.com` | 等同 `domain:` 精确匹配 |
| 纯文本子串 | `"sina.com"` | 匹配包含该子串的域名 |

#### 8.4 负载均衡 (Balancers)

```json
{
  "routing": {
    "settings": {
      "balancers": [
        {
          "tag": "balancer1",
          "selector": ["proxy-usa-01", "proxy-eu-01"],
          "strategy": {
            "type": "roundRobin"
          }
        }
      ]
    }
  }
}
```

| 策略 | 说明 |
|------|------|
| `"roundRobin"` | 轮询 |
| `"leastPing"` | 选延迟最低的出站 |

---

### 九、Policy 策略

```json
{
  "policy": {
    "levels": {
      "0": {
        "handshake": 4,
        "connIdle": 300,
        "uplinkOnly": 2,
        "downlinkOnly": 5,
        "statsUserUplink": false,
        "statsUserDownlink": false,
        "bufferSize": 10240
      }
    },
    "system": {
      "statsInboundUplink": false,
      "statsInboundDownlink": false,
      "statsOutboundUplink": false,
      "statsOutboundDownlink": false
    }
  }
}
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `handshake` | `4` (秒) | 连接建立超时 |
| `connIdle` | `300` (秒) | 连接空闲超时 |
| `uplinkOnly` | `2` (秒) | 等待上行关闭的超时 |
| `downlinkOnly` | `5` (秒) | 等待下行关闭的超时 |
| `statsUserUplink` | `false` | 是否统计用户上行流量（配合 API） |
| `statsUserDownlink` | `false` | 是否统计用户下行流量（配合 API） |

---

### 十、Stats & API 统计与远程管理

```json
{
  "stats": {},

  "api": {
    "tag": "api",
    "services": ["HandlerService", "LoggerService", "StatsService"]
  },

  "policy": {
    "system": {
      "statsInboundUplink": true,
      "statsInboundDownlink": true
    }
  },

  "inbounds": [
    {
      "listen": "127.0.0.1",
      "port": 62789,
      "protocol": "dokodemo-door",
      "settings": { "address": "127.0.0.1" },
      "tag": "api"
    }
  ]
}
```

> 启用后可通过 gRPC API 获取流量统计数据，适合需要流量计费的场景。

---

### 十一、常见配置模式

#### 模式 A：SOCKS5 客户端（最简单的代理上网）

```json
{
  "inbounds": [{
    "port": 10808,
    "listen": "127.0.0.1",
    "protocol": "socks",
    "settings": { "udp": true },
    "tag": "socks-in"
  }],
  "outbounds": [
    {
      "protocol": "vmess",
      "settings": {
        "vnext": [{
          "address": "your-server.com",
          "port": 443,
          "users": [{ "id": "your-uuid", "security": "auto" }]
        }]
      },
      "streamSettings": { "network": "ws", "security": "tls", "wsSettings": { "path": "/ws" } },
      "tag": "proxy"
    },
    {
      "protocol": "freedom",
      "tag": "direct"
    }
  ]
}
```

> 所有流量都走代理（Freedom 未分到规则），适合只需要"开箱即用"的场景。

#### 模式 B：分流代理（国内直连 + 国外代理）

```json
{
  "inbounds": [{
    "port": 10808, "listen": "127.0.0.1", "protocol": "socks", "settings": { "udp": true }, "tag": "socks-in"
  }],
  "outbounds": [
    {
      "protocol": "vmess",
      "settings": {
        "vnext": [{
          "address": "your-server.com", "port": 443,
          "users": [{ "id": "your-uuid", "security": "auto" }]
        }]
      },
      "streamSettings": { "network": "ws", "security": "tls", "wsSettings": { "path": "/ws" } },
      "tag": "proxy"
    },
    { "protocol": "freedom", "tag": "direct" }
  ],
  "routing": {
    "settings": {
      "domainStrategy": "AsIs",
      "rules": [
        { "ip": ["geoip:private"], "outboundTag": "direct", "type": "field" },
        { "domain": ["geosite:cn"], "outboundTag": "direct", "type": "field" },
        { "ip": ["geoip:cn"], "outboundTag": "direct", "type": "field" }
      ]
    }
  }
}
```

> 国内域名/IP 走直连，其余走代理。需要 `geoip.dat` 和 `geosite.dat`。

#### 模式 C：VLESS + Reality（现代推荐方案）

```json
{
  "inbounds": [{
    "port": 10808, "listen": "127.0.0.1", "protocol": "socks", "settings": { "udp": true }, "tag": "socks-in"
  }],
  "outbounds": [
    {
      "protocol": "vless",
      "settings": {
        "vnext": [{
          "address": "your-server.com",
          "port": 443,
          "users": [{ "id": "your-uuid", "encryption": "none", "flow": "xtls-rprx-vision" }]
        }]
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "serverName": "www.microsoft.com",
          "fingerprint": "chrome",
          "publicKey": "server-public-key",
          "shortId": "0123456789ab",
          "spiderX": "/"
        }
      },
      "tag": "proxy"
    },
    { "protocol": "freedom", "tag": "direct" }
  ]
}
```

#### 模式 D：透明代理（配合 iptables）

```json
{
  "inbounds": [
    {
      "port": 12345,
      "listen": "0.0.0.0",
      "protocol": "dokodemo-door",
      "settings": { "network": "tcp,udp", "followRedirect": true },
      "sniffing": { "enabled": true, "destOverride": ["http", "tls"] },
      "tag": "tproxy-in"
    }
  ],
  "outbounds": [
    {
      "protocol": "vmess",
      "settings": {
        "vnext": [{
          "address": "your-server.com", "port": 443,
          "users": [{ "id": "your-uuid", "security": "auto" }]
        }]
      },
      "streamSettings": { "network": "ws", "security": "tls", "wsSettings": { "path": "/ws" } },
      "tag": "proxy"
    },
    { "protocol": "freedom", "tag": "direct" }
  ],
  "routing": {
    "settings": {
      "rules": [
        { "type": "field", "inboundTag": ["tproxy-in"], "domain": ["geosite:cn"], "outboundTag": "direct" },
        { "type": "field", "inboundTag": ["tproxy-in"], "outboundTag": "proxy" }
      ]
    }
  }
}
```

> 配合 iptables TPROXY 规则实现透明代理，设备不需单独配置。

---

### 十二、字段名兼容性对照

本项目使用 **v4 JSON 格式**，与 `v2fly/v2fly-core` Docker 镜像一致。以下是 v4 与 v5 JSONv5 的字段对应关系：

| v4 (本项目) | v5 JSONv5 (不兼容) |
|------------|-------------------|
| `"inbounds"` | `"inbounds"` |
| `"outbounds"` | `"outbounds"` |
| `"routing"` | `"router"` |
| `"routing.settings"` | `"router"` (顶层) |
| `"streamSettings.network"` | `"transport"` (位于各 outbound 下) |
| `"streamSettings.security"` | `"securitySettings"` |
| `"wsSettings"` | `"transportSettings"` |
| `"tlsSettings"` | `"securitySettings"` |
| `"kcpSettings"` | System 下移 |
| `"routing.settings.rules[].ip"` | `"rules[].geoip"` |

> **注意**：如果不小心写了 v5 字段名，引擎会尝试回退加载 `jsonv5` 解析器，但兼容性有限，建议始终使用 v4 格式。

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/status` | 获取运行状态和版本 |
| `GET` | `/api/config` | 读取当前配置 |
| `PUT` | `/api/config` | 更新配置（自动重启） |
| `POST` | `/api/start` | 启动 V2Ray |
| `POST` | `/api/stop` | 停止 V2Ray |
| `POST` | `/api/restart` | 重启 V2Ray |

所有 API 均返回 JSON，支持 CORS 跨域。

### 示例

```bash
# 查看状态
curl http://localhost:8080/api/status

# 更新配置
curl -X PUT http://localhost:8080/api/config \
  -H 'Content-Type: application/json' \
  -d '{"config": "{...}"}'

# 重启
curl -X POST http://localhost:8080/api/restart
```

## 项目结构

```
.
├── main.go              # 入口，解析参数、启动 HTTP 服务
├── core/
│   └── engine.go        # V2Ray 核心生命周期管理
├── api/
│   └── handlers.go      # REST API 路由和处理器
├── web/
│   ├── index.html       # Web 管理界面（HTML 结构）
│   ├── styles.css       # UI 样式（含浅色/深色主题）
│   └── app.js           # 前端交互逻辑
├── icons/
│   ├── favicon-16x16.png
│   ├── favicon-32x32.png
│   └── favicon-48x48.png  # 网页 favicon 多尺寸图标
├── config.example.json  # 脱敏后的示例配置文件
├── config.json          # 实际配置文件（gitignore 不提交）
├── geoip.dat            # IP 地理位置数据库（需自行下载）
├── geosite.dat          # 域名分类数据库（需自行下载）
└── go.mod               # Go 模块定义
```

## 常见问题

### 配置加载失败：`unknown field`

配置文件使用了 V2Ray v5 JSONv5 格式的字段名（如 `transport`、`transportSettings`、`router`）。请使用 V2Ray v4 JSON 格式（`network`、`wsSettings`、`routing`），与官方 Docker 镜像保持一致。

### 找不到 geoip.dat

如果配置中使用了 `geoip:private` 等路由规则，必须下载 `geoip.dat` 到与可执行文件相同的目录。参考[快速开始](#快速开始)中的下载命令。

### 端口被占用

默认 SOCKS 入站使用 1080 端口。如果端口冲突，在 Web 界面中修改配置文件的 `inbounds[].port` 即可。

## 技术栈

- **后端**: Go + [v2ray-core v5](https://github.com/v2fly/v2ray-core)
- **前端**: 纯 HTML/CSS/JS（零依赖）
- **协议支持**: VMess、VLESS、Trojan、Shadowsocks 等（由 v2ray-core 提供）

## License

MIT
