# V2Ray Console 测试用例

> **被测对象**：v2ray-console（基于 v2ray-core v5 的 Web 管理面板）
> **配置格式**：V2Ray v4 JSON 格式（与 `v2fly/v2fly-core` Docker 镜像兼容）
> **当前 config.json 概况**：双入站（SOCKS@1080 + HTTP@1087），三出站（VMess `proxy` + Freedom `direct` + VMess `proxy-xg`），路由含 `roundRobin` 负载均衡器与 3 条规则（私有 IP 直连、本地域名直连、UDP:53 直连）
> **测试版本**：v2ray-core v5.51.2 / Go 1.25.7

---

## 目录

- [0. 测试环境与前置准备](#0-测试环境与前置准备)
- [1. 构建与启动（CLI / main.go）](#1-构建与启动cli--maingo)
- [2. 引擎生命周期（core/engine.go）](#2-引擎生命周期coreenginego)
- [3. 配置读写（core/engine.go）](#3-配置读写coreenginego)
- [4. REST API — 状态接口](#4-rest-api--状态接口)
- [5. REST API — 配置接口](#5-rest-api--配置接口)
- [6. REST API — 控制接口（start/stop/restart）](#6-rest-api--控制接口startstoprestart)
- [7. HTTP 中间件（CORS / 日志 / 缓存）](#7-http-中间件cors--日志--缓存)
- [8. 静态资源与 Web UI](#8-静态资源与-web-ui)
- [9. V4 配置格式兼容性](#9-v4-配置格式兼容性)
- [10. 并发与竞态](#10-并发与竞态)
- [11. 端到端代理功能（集成）](#11-端到端代理功能集成)
- [12. 异常与边界](#12-异常与边界)
- [13. 安全性](#13-安全性)
- [14. 回归用例（已知代码细节）](#14-回归用例已知代码细节)
- [附录 A：验证 Checklist](#附录-a验证-checklist)
- [附录 B：缺陷与风险登记](#附录-b缺陷与风险登记)

---

## 0. 测试环境与前置准备

| 编号 | 项目 | 步骤 | 预期 |
|------|------|------|------|
| T-ENV-01 | Geo 数据文件存在性 | `ls geoip.dat geosite.dat` | 两文件均存在且非空（路由规则 `geoip:private` 依赖） |
| T-ENV-02 | Geo 文件有效性 | 启动后日志无 `failed to load geoip` / `geosite` 报错 | 加载成功 |
| T-ENV-03 | Go 版本 | `go version` | ≥ 1.21（README 要求），实测 go.mod 声明 1.25.7 |
| T-ENV-04 | 依赖完整性 | `go vet ./...` | 无错误（依赖已 vendor 至 `.gomod/`） |
| T-ENV-05 | 配置文件存在 | `ls config.json` | 存在；若不存在应使用 `config.example.json` 复制 |
| T-ENV-06 | 端口可用 | `lsof -i :8080 -i :1080 -i :1087` | 默认端口未被占用 |
| T-ENV-07 | 测试配置隔离 | 准备 `config.test.json`（已存在） | 不污染真实 `config.json` |
| T-ENV-08 | 服务器可达性（可选） | `nc -vz v2.tinyrun.cn 443` | 出站目标可达（否则代理类用例标记 Skipped） |

---

## 1. 构建与启动（CLI / main.go）

### T-CLI-01 默认参数启动
- **前置**：已 `go build -o v2ray-console .`
- **步骤**：`./v2ray-console`（无任何参数）
- **预期**：
  - 监听 `127.0.0.1:8080`
  - 日志输出 `=== V2Ray Console ===`、`管理面板: http://127.0.0.1:8080`、`配置文件: config.json`
  - 尝试自动启动引擎（见 T-CLI-06）

### T-CLI-02 自定义端口
- **步骤**：`./v2ray-console -port 9090`
- **预期**：HTTP 服务监听 9090；`curl http://127.0.0.1:9090/api/status` 返回 200

### T-CLI-03 自定义监听地址
- **步骤**：`./v2ray-console -host 0.0.0.0`
- **预期**：可从局域网访问；`netstat` 显示监听 `*:8080`

### T-CLI-04 自定义配置文件路径
- **步骤**：`./v2ray-console -config config.test.json`
- **预期**：日志 `配置文件: config.test.json`；`GET /api/config` 返回 test.json 内容

### T-CLI-05 不存在的配置文件路径
- **步骤**：`./v2ray-console -config /tmp/notexist.json`
- **预期**：HTTP 服务正常启动；自动启动失败日志 `自动启动失败: 读取配置文件失败...`；API 仍可用（可后续上传配置）

### T-CLI-06 自动启动行为（⚠ 关注点）
- **代码**：`main.go:27` `if engine.GetStatus(); true { ... Start() }`
- **观察**：该 `if` 条件恒为 `true`，`GetStatus()` 返回值被丢弃；等同于「每次启动都尝试 Start」
- **预期**：
  - config.json 有效 → 自动启动成功，`GET /api/status` 返回 `running:true`
  - config.json 无效 → 打印 `自动启动失败: ...` 但不退出，HTTP 服务继续提供
- **回归点**：确认这是设计意图，而非逻辑错误（详见附录 B 风险 R-01）

### T-CLI-07 SIGINT 优雅退出
- **步骤**：启动后 `kill -INT <pid>`
- **预期**：日志 `收到信号 interrupt，正在关闭...` → `v2ray-core 已停止` → 进程退出码 0

### T-CLI-08 SIGTERM 优雅退出
- **步骤**：`kill -TERM <pid>`
- **预期**：同 T-CLI-07，日志显示 `terminated`

### T-CLI-09 SIGHUP 不触发退出
- **步骤**：`kill -HUP <pid>`
- **预期**：进程**不**退出（`WaitForSignal` 仅注册 SIGINT/SIGTERM）

### T-CLI-10 端口冲突启动失败
- **前置**：占用 8080 端口
- **步骤**：启动 v2ray-console
- **预期**：日志 `HTTP 服务启动失败: listen tcp ...: bind: address already in use`，`log.Fatalf` 退出码 ≠ 0

### T-CLI-11 非法 flag
- **步骤**：`./v2ray-console -unknown`
- **预期**：Go flag 包打印用法到 stderr，退出码 2

### T-CLI-12 Makefile 构建
- **步骤**：`make build` / `make build-release` / `make build-linux` / `make build-windows`
- **预期**：各产物生成，`-s -w` 后体积约 36M（release）

---

## 2. 引擎生命周期（core/engine.go）

### T-ENG-01 NewEngine 不自动启动
- **步骤**：`e := core.NewEngine("config.json")`，立即查 `e.GetStatus()`
- **预期**：`running:false`，`version:"unknown"`，`started_at:0`

### T-ENG-02 Start 成功
- **前置**：config.json 有效 + geo 文件就位
- **步骤**：`e.Start()`
- **预期**：返回 nil；`running:true`；`version` 为 v2ray-core 版本字符串；`started_at` 为当前毫秒时间戳

### T-ENG-03 Start 重复调用
- **前置**：已 Start
- **步骤**：再次 `e.Start()`
- **预期**：返回 error `引擎已在运行中`；状态保持 running

### T-ENG-04 Start 无效 JSON
- **前置**：config.json 内容为 `{bad json`
- **步骤**：`e.Start()`
- **预期**：返回 `配置文件不是有效的 JSON: ...`；running 保持 false

### T-ENG-05 Start 配置文件不存在
- **步骤**：`NewEngine("/no/such.json").Start()`
- **预期**：返回 `读取配置文件失败: open ...: no such file or directory`

### T-ENG-06 Start V4 配置加载
- **前置**：当前 config.json（含 `network`/`wsSettings`/`tlsSettings`/`routing.settings`）
- **步骤**：`Start()`
- **预期**：`LoadConfig("json", ...)` 成功，**不**进入 `jsonv5` 回退分支（日志无 `尝试 JSONv5 格式`）

### T-ENG-07 Start V5 字段名回退尝试
- **前置**：构造含 `transport`/`transportSettings` 等 v5 字段的配置
- **步骤**：`Start()`
- **预期**：日志出现 `JSON 格式加载失败，尝试 JSONv5 格式`；最终大概率返回 `加载配置失败`（jsonv5 不兼容 v4 语义）

### T-ENG-08 Stop 成功
- **前置**：已 Start
- **步骤**：`e.Stop()`
- **预期**：返回 nil；`running:false`；`started_at:0`；`instance:nil`；日志 `v2ray-core 已停止`

### T-ENG-09 Stop 幂等（未运行时调用）
- **前置**：未 Start 或已 Stop
- **步骤**：`e.Stop()`
- **预期**：返回 nil（不报错）；状态不变

### T-ENG-10 Stop 多次调用
- **前置**：已 Stop
- **步骤**：连续 Stop 3 次
- **预期**：均返回 nil

### T-ENG-11 Restart 成功
- **前置**：已 Start
- **步骤**：`e.Restart()`
- **预期**：返回 nil；`running:true`；`started_at` 更新为新时间戳；version 不变

### T-ENG-12 Restart 未运行时
- **前置**：未 Start
- **步骤**：`e.Restart()`
- **预期**：Stop 返回 nil（幂等）→ Start 成功 → 最终 running:true（Restart 兼具「启动」语义）

### T-ENG-13 IsRunning 一致性
- **步骤**：Start/Stop 前后分别调 `IsRunning()`
- **预期**：与 `GetStatus().Running` 完全一致

### T-ENG-14 GetStatus version 字段
- **场景 A**：instance == nil → `version:"unknown"`
- **场景 B**：instance != nil → `version` 等于 `v2rayCore.Version()` 返回值

### T-ENG-15 Instance.Close 报错不影响状态
- **关注**：`engine.go:128` 仅 log 警告，仍把 instance 置 nil
- **步骤**：mock 一个 Close 返回 error 的实例（或构造异常关闭场景）
- **预期**：Stop 返回 nil；running:false；日志 `关闭 v2ray-core 实例时出错: ...`

### T-ENG-16 cancel context 释放
- **关注**：`engine.go:124` Stop 时调用 `e.cancel()`
- **预期**：原 instance 的后台 goroutine 收到 ctx 取消信号退出

### T-ENG-17 WaitForSignal 阻塞
- **步骤**：在 goroutine 中 `go e.WaitForSignal()`，主线程 sleep 1s
- **预期**：goroutine 一直阻塞，不发信号不返回；发送 SIGINT 后返回且已 Stop

---

## 3. 配置读写（core/engine.go）

### T-CFG-01 GetConfig 返回格式化 JSON
- **步骤**：`e.GetConfig()`
- **预期**：返回 2 空格缩进的 JSON；与磁盘内容语义等价；顶层 key 顺序可能重排（map 序列化）

### T-CFG-02 GetConfig 文件不存在
- **步骤**：`NewEngine("/no/such.json").GetConfig()`
- **预期**：返回 `("", err)`，err 为 `open ...: no such file`

### T-CFG-03 GetConfig 文件非 JSON
- **前置**：config.json 内容为纯文本 `hello`
- **步骤**：`GetConfig()`
- **预期**：`json.Indent` 失败 → 返回原始字符串 `hello`，err == nil（降级处理）

### T-CFG-04 UpdateConfig 有效 JSON
- **前置**：引擎未运行
- **步骤**：`e.UpdateConfig('{"inbounds":[...],"outbounds":[...]}')`
- **预期**：返回 nil；磁盘文件被覆盖为 2 空格缩进格式；不触发重启

### T-CFG-05 UpdateConfig 引擎运行中自动重启
- **前置**：引擎已 Start
- **步骤**：`UpdateConfig(新JSON)`
- **预期**：日志 `配置已更新，正在重启引擎...`；自动 Stop→Start；running:true 且 started_at 更新

### T-CFG-06 UpdateConfig 无效 JSON
- **步骤**：`UpdateConfig("{bad")`
- **预期**：返回 `无效的 JSON 格式: ...`；磁盘文件**不**被修改

### T-CFG-07 UpdateConfig 非 object JSON
- **关注**：`engine.go:164` 仅校验能否 unmarshal 到 `map[string]interface{}`
- **步骤**：`UpdateConfig("[1,2,3]")`
- **预期**：返回 `无效的 JSON 格式: json: cannot unmarshal array into Go value of type map[string]interface{}`；文件不变

### T-CFG-08 UpdateConfig 空对象
- **步骤**：`UpdateConfig("{}")`
- **预期**：写入成功（语义上 V2Ray 启动会失败，但 UpdateConfig 本身不校验语义）

### T-CFG-09 UpdateConfig JSON 字段顺序保持
- **步骤**：写入 `{"outbounds":[...],"inbounds":[...]}`（逆序）
- **预期**：磁盘文件中顶层 key 按字母序排列（Go map序列化）→ `inbounds` 在前。注意：原顺序不保留

### T-CFG-10 UpdateConfig 写盘权限
- **前置**：config.json 设为只读 `chmod 444 config.json`
- **步骤**：`UpdateConfig('{...}')`
- **预期**：返回 `写入配置文件失败: ... permission denied`

### T-CFG-11 UpdateConfig 文件模式
- **关注**：`engine.go:174` 使用 `0644`
- **步骤**：写入后 `stat -f "%Lp" config.json`
- **预期**：文件权限为 `644`（owner rw / group r / other r）

### T-CFG-12 UpdateConfig + Start 失败回退
- **关注**：⚠ UpdateConfig 自动 Restart 时若新配置无法 Start，会处于「已 Stop、未 Start」状态
- **步骤**：运行中 → UpdateConfig 写入无效 v2ray 配置（合法 JSON 但缺 outbounds）
- **预期**：Restart 返回 error；running:false；磁盘已是新配置；下次手动 Start 仍失败

---

## 4. REST API — 状态接口

### T-API-STATUS-01 GET /api/status 正常
- **前置**：服务运行
- **步骤**：`curl -s http://127.0.0.1:8080/api/status`
- **预期**：HTTP 200；`Content-Type: application/json`；body 结构 `{"running":bool,"version":string,"started_at":int}`

### T-API-STATUS-02 running=true 时字段
- **前置**：引擎已启动
- **预期**：`running:true`；`version` 非空非 `"unknown"`；`started_at` > 0

### T-API-STATUS-03 running=false 时字段
- **前置**：引擎已停止
- **预期**：`running:false`；`version:"unknown"`（instance==nil）；`started_at:0`

### T-API-STATUS-04 POST 方法拒绝
- **步骤**：`curl -X POST http://127.0.0.1:8080/api/status`
- **预期**：HTTP 405；body `{"error":"仅支持 GET 方法"}`

### T-API-STATUS-05 PUT/DELETE 方法拒绝
- **步骤**：`curl -X PUT/DELETE .../api/status`
- **预期**：HTTP 405（同上）

### T-API-STATUS-06 OPTIONS 预检
- **步骤**：`curl -X OPTIONS -i .../api/status`
- **预期**：HTTP 204 No Content（中间件统一处理 OPTIONS）

### T-API-STATUS-07 不存在的路径
- **步骤**：`curl -i .../api/foobar`
- **预期**：HTTP 404（mux 默认；注意 `/` 已注册 FileServer，可能 fallback 到 web 404）

### T-API-STATUS-08 started_at 单位
- **关注**：`engine.go:56` 使用 `UnixMilli()`
- **预期**：`started_at` 为 13 位毫秒级时间戳，对应引擎启动时刻

---

## 5. REST API — 配置接口

### T-API-CFG-01 GET /api/config 正常
- **步骤**：`curl -s .../api/config`
- **预期**：HTTP 200；body `{"config":"<格式化JSON字符串>"}`（注意 config 是字符串字段，非嵌套对象）

### T-API-CFG-02 GET 返回内容可被 JSON.parse 二次解析
- **步骤**：`curl -s .../api/config | jq -r .config | jq .`
- **预期**：得到合法 JSON 对象

### T-API-CFG-03 PUT /api/config 有效
- **步骤**：`curl -X PUT .../api/config -H 'Content-Type: application/json' -d '{"config":"{\"inbounds\":[],\"outbounds\":[]}"}'`
- **预期**：HTTP 200；body `{"message":"配置已更新"}`；磁盘文件被更新

### T-API-CFG-04 PUT 请求体非 JSON
- **步骤**：`curl -X PUT .../api/config -d 'plain text'`
- **预期**：HTTP 400；body `{"error":"请求格式错误: ..."}`

### T-API-CFG-05 PUT 缺少 config 字段
- **步骤**：`curl -X PUT .../api/config -d '{"foo":"bar"}'`
- **预期**：`req.Config` 为空字符串 → 进入 `UpdateConfig("")` → 返回 500 `更新配置失败: 无效的 JSON 格式: unexpected end of JSON input`

### T-API-CFG-06 PUT config 字段值非合法 JSON 字符串
- **步骤**：`-d '{"config":"{bad"}'`
- **预期**：HTTP 500；`更新配置失败: 无效的 JSON 格式: ...`

### T-API-CFG-07 PUT config 字段是 JSON 对象（而非字符串）
- **关注**：handler 期望 `Config string`，若客户端误传对象 `{"config":{}}` 会失败
- **步骤**：`-d '{"config":{}}'`
- **预期**：HTTP 400；`请求格式错误: json: cannot unmarshal object into Go struct field .config of type string`

### T-API-CFG-08 PUT config 空字符串
- **步骤**：`-d '{"config":""}'`
- **预期**：HTTP 500（UpdateConfig 校验空串失败）

### T-API-CFG-09 PUT 自动重启（运行中）
- **前置**：引擎 running
- **步骤**：PUT 一个新配置
- **预期**：HTTP 200；日志含 `配置已更新，正在重启引擎...`；GET status 的 started_at 变化

### T-API-CFG-10 PUT 不重启（已停止）
- **前置**：引擎 stopped
- **预期**：HTTP 200；日志无重启；status 保持 running:false

### T-API-CFG-11 PUT 写盘失败
- **前置**：config 路径不可写
- **预期**：HTTP 500；`更新配置失败: 写入配置文件失败: ...`

### T-API-CFG-12 POST 方法拒绝
- **步骤**：`curl -X POST .../api/config`
- **预期**：HTTP 405；`仅支持 GET/PUT`

### T-API-CFG-13 DELETE 方法拒绝
- **预期**：HTTP 405；同上消息

### T-API-CFG-14 Content-Type 宽容性
- **步骤**：PUT 时不带 `Content-Type` 头
- **预期**：只要 body 是合法 JSON 仍可成功（handler 用 `json.NewDecoder`，不强制校验 Content-Type）

### T-API-CFG-15 超大请求体
- **步骤**：PUT 一个 10MB 的 config 字符串
- **预期**：默认 Go HTTP server 无 body 限制，可处理（关注内存占用）；建议增加 `http.MaxBytesReader` 防护（见附录 B R-04）

### T-API-CFG-16 V4 字段保留
- **步骤**：写入含 `routing.settings.rules`、`wsSettings`、`tlsSettings`、`network` 的配置 → 再 GET
- **预期**：字段名原样保留，未被改成 v5 风格

---

## 6. REST API — 控制接口（start/stop/restart）

### T-API-START-01 POST /api/start 成功
- **前置**：引擎未运行
- **预期**：HTTP 200；`{"message":"已启动"}`；status 变 running:true

### T-API-START-02 重复 start
- **前置**：已运行
- **预期**：HTTP 500；`启动失败: 引擎已在运行中`

### T-API-START-03 start 时配置无效
- **预期**：HTTP 500；`启动失败: ...`

### T-API-START-04 GET 方法拒绝
- **预期**：HTTP 405；`仅支持 POST 方法`

### T-API-STOP-01 POST /api/stop 成功
- **前置**：引擎运行中
- **预期**：HTTP 200；`{"message":"已停止"}`

### T-API-STOP-02 stop 幂等
- **前置**：已停止
- **预期**：HTTP 200；`已停止`（Stop 不报错）

### T-API-STOP-03 GET 方法拒绝
- **预期**：HTTP 405

### T-API-RESTART-01 POST /api/restart 成功
- **前置**：运行中
- **预期**：HTTP 200；`{"message":"已重启"}`；started_at 更新

### T-API-RESTART-02 restart 从停止状态
- **预期**：HTTP 200；最终 running:true（Restart = Stop + Start，Start 兜底）

### T-API-RESTART-03 restart 中途失败
- **前置**：写坏配置后 restart
- **预期**：HTTP 500；`重启失败: 启动 v2ray-core 实例失败: ...`；最终 running:false

### T-API-RESTART-04 高频 restart
- **步骤**：连续 5 次 `POST /api/restart`
- **预期**：均 200；每次 started_at 递增；无 panic / 数据竞争（依赖 mutex）

### T-API-CTRL-05 并发 start+stop
- **步骤**：同时发 10 个 start 和 10 个 stop
- **预期**：无 panic；最终状态确定（running 或 stopped 二选一）；mutex 生效

---

## 7. HTTP 中间件（CORS / 日志 / 缓存）

### T-MW-01 CORS 头存在
- **步骤**：任意请求查看响应头
- **预期**：
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type`

### T-MW-02 OPTIONS 预检返回 204
- **步骤**：`curl -X OPTIONS -i .../api/status`
- **预期**：HTTP 204；无 body；带 CORS 头

### T-MW-03 CORS 通配符允许任意源
- **步骤**：带 `Origin: https://evil.com` 请求
- **预期**：仍返回 `Access-Control-Allow-Origin: *`（⚠ 不反射 Origin，安全性见 T-SEC-03）

### T-MW-04 禁缓存头
- **步骤**：GET 静态文件
- **预期**：响应头含
  - `Cache-Control: no-cache, no-store, must-revalidate`
  - `Pragma: no-cache`

### T-MW-05 访问日志
- **步骤**：发起任意请求
- **预期**：stdout 打印 `[METHOD] /path RemoteAddr`（`handlers.go:154`）

### T-MW-06 中间件覆盖所有路由
- **关注**：中间件包装在最外层 mux，**包括** `/`（FileServer）
- **预期**：静态文件请求也带 CORS 与禁缓存头

### T-MW-07 DELETE 在 CORS 允许列表但无路由
- **步骤**：`curl -X DELETE .../api/status`
- **预期**：业务层返回 405（CORS 头声明 DELETE 但 handler 不支持，属正常）

---

## 8. 静态资源与 Web UI

### T-WEB-01 首页可访问
- **步骤**：`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/`
- **预期**：200；返回 `web/index.html` 内容

### T-WEB-02 静态文件服务
- **步骤**：GET `/styles.css`、`/app.js`
- **预期**：均 200；Content-Type 正确（text/css、application/javascript）

### T-WEB-03 favicon 重定向
- **步骤**：`curl -i .../favicon.ico`
- **预期**：HTTP 301；`Location: /icons/favicon-32x32.png`

### T-WEB-04 favicon 目标存在
- **步骤**：跟随重定向
- **预期**：最终 200，返回 PNG 二进制；`web/icons/favicon-32x32.png` 存在

### T-WEB-05 不存在的静态文件
- **步骤**：GET `/nope.js`
- **预期**：404（FileServer 默认行为）

### T-WEB-06 目录穿越防护
- **步骤**：GET `/../config.json`
- **预期**：FileServer 已清洗路径，返回 404 或重定向，**不可**读取 config.json

### T-WEB-07 前端状态轮询
- **代码**：`app.js:2457` `setInterval(checkStatus, 5000)`
- **步骤**：浏览器打开面板，打开 DevTools Network
- **预期**：每 5 秒发起一次 `GET /api/status`；UI 正确显示 running/version

### T-WEB-08 前端配置编辑器（JSON 模式）
- **步骤**：切到「JSON」Tab → 编辑 → 保存
- **预期**：触发 PUT /api/config；toast 显示成功；JSON 重新加载

### T-WEB-09 前端表单模式（V4 字段）
- **步骤**：在「可视化」Tab 修改 ws 路径 / TLS serverName
- **预期**：表单 ↔ JSON 双向同步；保留 `wsSettings`、`tlsSettings`、`network` 等 v4 字段名（DEFAULTS 中 `outboundVmess.streamSettings` 即 v4 结构）

### T-WEB-10 前端 UUID 生成器
- **代码**：`app.js:422 generateUUID`
- **步骤**：点击用户项旁「生成 UUID」按钮
- **预期**：填入合法 v4 UUID（小写连字符格式）

### T-WEB-11 前端模板加载（共 4 个）
- **代码**：`app.js:1495 loadTemplate`
- **步骤**：依次点击 4 个模板卡片
- **预期**：
  - `socks-client` → SOCKS 入站 @10808 + VMess/ws/tls 出站
  - `http-client` → HTTP 入站 @10809 + VMess 出站
  - `vless-reality` → SOCKS 入站 + VLESS/reality 出站（含 `realitySettings`）
  - `shadowsocks` → Shadowsocks 出站（aes-256-gcm）
  - 均使用 v4 字段命名

### T-WEB-12 前端 ⌘S / Ctrl+S 保存快捷键
- **代码**：`app.js:2443`
- **步骤**：在编辑器中按 ⌘S（macOS）或 Ctrl+S（Win/Linux）
- **预期**：触发 saveConfig；阻止浏览器默认「另存网页」；toast 成功

### T-WEB-13 前端主题切换（浅色/深色）
- **代码**：`app.js:2407 toggleTheme`；持久化键 `localStorage['v2ray-theme']`
- **步骤**：点击右上角主题按钮；刷新页面
- **预期**：`documentElement` 的 `data-theme` 在 light/dark 间切换；刷新后保持；首次访问跟随系统 `prefers-color-scheme`

### T-WEB-14 前端未保存变更提示（dirty 状态）
- **代码**：`app.js:28 markDirty` / `app.js:42 beforeunload`
- **步骤**：编辑配置 → 标题前出现 `●` 前缀、保存按钮加 `dirty` 类 → 尝试关闭/刷新页面
- **预期**：浏览器弹出「未保存更改」确认框；保存后（markClean）前缀消失

### T-WEB-15 前端刷新配置带脏数据保护
- **代码**：`app.js:1418 refreshConfig`
- **步骤**：编辑未保存时点击 ↻ 刷新按钮
- **预期**：弹出 `confirm('当前有未保存的更改...')`；取消则不刷新

### T-WEB-16 前端运行时长与延迟显示
- **代码**：`app.js:99 startUptimeTimer` / `app.js:59 latency`
- **步骤**：引擎运行时观察状态栏
- **预期**：每秒更新 `Xh Ym Zs` 格式运行时长；显示本次 `/api/status` 往返延迟（`Xms`）；引擎停止后两项隐藏

### T-WEB-17 前端 api() 错误处理
- **代码**：`app.js:2 api`
- **步骤**：让后端返回非 2xx（例如重复 start）
- **预期**：`throw new Error(data.error)`；调用方 catch 后 toast 显示 `启动失败: 引擎已在运行中`

### T-WEB-18 前端 Toast 自动消失
- **代码**：`app.js:17` 3000ms
- **预期**：toast 显示 3 秒后自动隐藏

### T-WEB-19 前端复制/导出/导入配置
- **步骤**：点 ⧉ 复制 / ⬇ 导出 / ⬆ 导入
- **预期**：复制走 `navigator.clipboard`；导出下载 `.json` 文件；导入读取本地文件填充编辑器

### T-WEB-20 前端 overview 统计
- **步骤**：加载 config 后观察顶部 4 个统计卡
- **预期**：入站数 / 出站数 / 路由规则数 / 监听端口数 正确（当前 config：2 入站 / 3 出站 / 3 规则 / 2 端口）

### T-WEB-21 ⚠ 前端 JS 单测 _test_bypass.js（当前已知失败）
- **步骤**：`node web/_test_bypass.js`
- **实测结果**：**14 用例全部 FAIL**，并报 `LOAD ERR: location is not defined`
- **原因分析**：该测试 sandbox 未注入 `location` 全局，导致 app.js 加载阶段即抛错，后续断言全部落空
- **预期处理**：**修复测试**（在 sandbox 补 `location:{href:'http://localhost:8080/',origin:'http://localhost:8080',host:'localhost:8080',hostname:'localhost',port:'8080',pathname:'/',search:'',hash:''}`），或修复 app.js 对 `location` 的容错；修复后预期 14 用例 PASS

### T-WEB-22 前端 JS 单测 _test_flowviz.js（当前部分失败）
- **步骤**：`node web/_test_flowviz.js`
- **实测结果**：**8 PASS / 3 FAIL**
  - FAIL：`含 selector 1 服务器 us.example`、`含 selector 2 服务器 eu.example`、`direct 行有默认 badge`
- **预期处理**：核对 `buildFlowViz` 是否仍输出 selector 服务器地址与 direct 的 `flow-default-badge`；可能是渲染逻辑变更后未同步更新测试，或为真实回归

### T-WEB-23 前端 JS 单测 _test_arrow_parity.js（当前通过）
- **步骤**：`node web/_test_arrow_parity.js`
- **实测结果**：**10 PASS / 0 FAIL** ✅
- **回归点**：堆叠 balancer 的 s1/s2 箭头视觉等价；无 `.flow-arrow-r-bypass` 元素；均带 `WS / TLS` 标签

---

## 9. V4 配置格式兼容性

> 本项目坚持 v4 字段名（`network`/`wsSettings`/`tlsSettings`/`routing.settings.rules`），与 v5 JSONv5 不兼容。

### T-V4-01 当前 config.json 加载
- **步骤**：使用现有 config.json 启动
- **预期**：`LoadConfig("json", ...)` 成功，不进 jsonv5 回退

### T-V4-02 字段：`streamSettings.network`
- **预期**：使用 `network`（v4），**不**使用 v5 的 `transport`

### T-V4-03 字段：`wsSettings` / `tlsSettings` / `kcpSettings`
- **预期**：v4 命名；**不**使用 v5 的 `transportSettings` / `securitySettings`

### T-V4-04 字段：`routing.settings.rules`
- **预期**：路由规则位于 `routing.settings.rules`（v4）；**不**位于 `routing.rules`（v5 顶层）

### T-V4-05 字段：`routing` vs `router`
- **预期**：使用 `routing`；**不**使用 v5 的 `router`

### T-V4-06 字段：规则内 `ip` vs `geoip`
- **预期**：使用 `rules[].ip`（v4）；**不**使用 v5 的 `rules[].geoip`

### T-V4-07 v5 字段回退加载失败
- **前置**：把 config 全部改成 v5 字段（`transport`/`router` 等）
- **预期**：json 加载失败 → 日志 `JSON 格式加载失败，尝试 JSONv5 格式` → 最终大概率仍失败（语义不兼容）

### T-V4-08 geoip:private 规则
- **前置**：geoip.dat 在工作目录
- **预期**：当前 config 第 1 条规则 `geoip:private → direct` 加载成功

### T-V4-09 geosite 规则（如使用）
- **前置**：config 中含 `geosite:cn` 等
- **预期**：依赖 geosite.dat 存在，否则 LoadConfig 失败

### T-V4-10 缺失 geo 文件
- **前置**：移走 geoip.dat
- **预期**：Start 返回 `加载配置失败: ...`（rule 解析阶段失败）

### T-V4-11 balancer 配置
- **前置**：当前 config.json 含 `balancers:[{tag:"balancer", selector:["proxy","proxy-xg"], strategy:{type:"roundRobin"}}]`
- **预期**：加载成功；运行时按 roundRobin 在两出站间轮询

### T-V4-12 DNS 字段省略
- **前置**：config 无 `dns` 段（当前 config.json 即如此）
- **预期**：使用系统默认 DNS，加载正常

### T-V4-13 log.loglevel
- **当前值**：`info`
- **预期**：v2ray-core 日志级别为 info（包含 access/error 流）

### T-V4-14 mux 默认禁用
- **当前值**：所有 vmess outbound `mux.enabled:false`
- **预期**：禁用多路复用；改为 true 后单连接承载多请求

### T-V4-15 allowInsecure
- **当前值**：`tlsSettings.allowInsecure:true`（⚠ 注意：开发友好但存在中间人风险，生产建议 false）
- **预期**：跳过证书校验，可连非正规证书服务器

---

## 10. 并发与竞态

### T-CONC-01 Engine mutex 保护
- **关注**：`engine.go:22` 使用 `sync.RWMutex` 保护 instance/running/cancel/startedAt
- **步骤**：`go test -race` 风格——并发调用 Start/Stop/GetStatus/IsRunning
- **预期**：`go test -race` 无 DATA RACE 报告

### T-CONC-02 GetStatus 使用 RLock
- **关注**：`GetStatus`/`IsRunning` 用 RLock，允许并发读
- **预期**：多个并发 status 请求不互相阻塞

### T-CONC-03 Start 持写锁
- **关注**：Start/Stop 持写锁，期间 GetStatus 阻塞
- **预期**：Start 期间 status 请求等待（短时延迟可接受）

### T-CONC-04 UpdateConfig 未持锁
- **关注**：⚠ `UpdateConfig` 全程**不持 engine mutex**，仅 `IsRunning()` 短暂 RLock
- **场景**：UpdateConfig 检查 IsRunning==true 后，另一线程 Stop，则 Restart 内部 Stop 幂等 → Start 可能与其他 Start 竞争
- **预期**：Start/Stop 自身有锁，最终不会出现双 instance；但存在「UpdateConfig 检查与重启间」的 TOCTOU 窗口（见附录 B R-02）

### T-CONC-05 并发 UpdateConfig
- **步骤**：同时 2 个 PUT /api/config
- **预期**：最后写入获胜（无文件锁）；可能一次 Restart 触发期间另一次 UpdateConfig 把文件改掉

### T-CONC-06 HTTP server 并发
- **关注**：`http.Server` 默认每个请求独立 goroutine
- **预期**：高并发请求不崩；无共享状态污染

---

## 11. 端到端代理功能（集成）

> 前置：geo 文件就位、上游 v2.tinyrun.cn:443 可达、本地已 Start

### T-E2E-01 SOCKS5 入站可达
- **步骤**：`curl -x socks5://127.0.0.1:1080 https://www.google.com -I`
- **预期**：返回 HTTP/2 200（流量经 vmess → 上游出口）

### T-E2E-02 HTTP 入站可达
- **步骤**：`curl -x http://127.0.0.1:1087 https://www.google.com -I`
- **预期**：200

### T-E2E-03 直连规则生效（私有 IP）
- **步骤**：`curl -x socks5://127.0.0.1:1080 http://192.168.1.1`
- **预期**：命中 `geoip:private → direct`，走 freedom 出站

### T-E2E-04 直连规则生效（localhost 域名）
- **步骤**：`curl -x socks5://127.0.0.1:1080 http://localhost`
- **预期**：命中 `domain localhost/local → direct`

### T-E2E-05 UDP DNS 直连
- **步骤**：通过 SOCKS 发 UDP:53 查询
- **预期**：命中 `network:udp port:53 → direct`

### T-E2E-06 balancer 轮询
- **关注**：当前 config 用 `geosite:google → balancer`？实际 config 无此规则，balancer 未被任何 rule 引用
- **步骤**：临时加规则 `{"domain":["geosite:google"],"balancerTag":"balancer"}` 重启 → 多次访问 google
- **预期**：流量在 `proxy` 与 `proxy-xg` 之间轮询（看 v2ray 日志 outbound tag）

### T-E2E-07 切换出站（手动改 outboundTag）
- **步骤**：把默认 outbound 改为 `proxy-xg` 重启
- **预期**：流量走 xg.tinyrun.cn:8888

### T-E2E-08 Start 后入站端口监听
- **步骤**：`lsof -i :1080 -i :1087`
- **预期**：v2ray-console 进程持有这两个监听

### T-E2E-09 Stop 后入站端口释放
- **预期**：Stop 后 1080/1087 不再被持有

### T-E2E-10 Restart 后连接重建
- **步骤**：长连接代理下载中 → Restart
- **预期**：旧连接断开；新请求经新实例正常代理

---

## 12. 异常与边界

### T-EXC-01 空 config.json
- **步骤**：config.json 为 `{}`
- **预期**：Start 失败（v2ray 缺 inbounds/outbounds）

### T-EXC-02 只有 inbound 无 outbound
- **预期**：Start 失败

### T-EXC-03 inbound 端口冲突
- **前置**：两个 inbound 都用 1080
- **预期**：Start 失败（端口已被占用）

### T-EXC-04 outbound 引用了不存在的 balancerTag
- **预期**：Start 失败或运行时该规则无效

### T-EXC-05 UUID 格式非法
- **步骤**：vmess users.id 改为 `"not-a-uuid"`
- **预期**：Start 失败（v2ray 校验 UUID）

### T-EXC-06 入站 listen 不可绑定
- **步骤**：listen 改为 `0.0.0.0:1`（特权端口且非 root）
- **预期**：Start 失败（permission denied）

### T-EXC-07 TLS 证书路径无效（入站场景）
- **预期**：Start 失败

### T-EXC-08 大量 routing rules
- **步骤**：构造 1000 条规则
- **预期**：加载稍慢但成功；可考虑 `domainMatcher:mph` 优化

### T-EXC-09 JSON 含 BOM
- **步骤**：config.json 前加 UTF-8 BOM
- **预期**：`json.Unmarshal` 失败（Go 不剥离 BOM）

### T-EXC-10 JSON 含注释
- **步骤**：config.json 加 `// comment`
- **预期**：标准 JSON 解析失败（v2ray 可能用宽容解析，但 UpdateConfig 路径用 encoding/json 会失败）

### T-EXC-11 并发 Stop + WaitForSignal
- **预期**：Stop 幂等，WaitForSignal 仍能再 Stop 一次

### T-EXC-12 进程被 SIGKILL
- **预期**：不优雅退出；下次启动若上次 inbound 端口未被系统回收可能冲突（端口 TIME_WAIT）

---

## 13. 安全性

### T-SEC-01 API 无认证
- **观察**：handlers.go 无任何鉴权；任意能访问 8080 端口者可读取/修改 config、控制引擎
- **预期**（建议）：默认 `-host 127.0.0.1` 限制本机；局域网暴露需自加反代鉴权（见附录 B R-03）

### T-SEC-02 默认仅本机监听
- **步骤**：默认启动后从另一台机器访问
- **预期**：连接被拒绝（127.0.0.1 仅本机）

### T-SEC-03 CORS 通配 `*`
- **观察**：`Access-Control-Allow-Origin: *` 允许任意网站 JS 调用 API
- **风险**：若用户既打开管理面板又访问恶意网站，恶意 JS 可向 `127.0.0.1:8080` 发起请求（受 CORS 限制仅能简单请求；但 POST/PUT 含 Content-Type 触发预检，会被允许方法通过）
- **建议**：CORS 收紧为本机来源或移除（见附录 B R-05）

### T-SEC-04 config 中 allowInsecure:true
- **观察**：当前 config.json 两 vmess 出站均设 `allowInsecure:true`
- **风险**：跳过 TLS 证书校验，易受中间人攻击
- **建议**：生产改为 false（见附录 B R-06）

### T-SEC-05 配置中含敏感 UUID/地址
- **观察**：config.json 含真实 UUID（`d1fa9f4b-...`）与服务器地址（`v2.tinyrun.cn`）
- **预期**：config.json 已在 .gitignore；GET /api/config 暴露这些信息给任何 API 调用方

### T-SEC-06 无速率限制
- **步骤**：高频请求 API
- **预期**：无 429；可被 DoS

### T-SEC-07 无 HTTPS
- **观察**：管理面板明文 HTTP
- **建议**：本机使用可接受；远程管理应套 TLS 反代

### T-SEC-08 错误信息泄漏
- **观察**：handler 把 `err.Error()` 直接返回客户端
- **风险**：可能泄漏文件路径、内部细节
- **建议**：生产环境脱敏

### T-SEC-09 目录穿越
- **见** T-WEB-06，FileServer 已做路径清洗，但建议补充测试 `/web/../config.json` 等变种

### T-SEC-10 配置文件权限
- **见** T-CFG-11，0644 意味着同机其他用户可读（含 UUID）

---

## 14. 回归用例（已知代码细节）

> 这些用例锁定当前实现的具体行为，便于重构时发现回归。

### T-REG-01 main.go 自动启动恒为真
- **代码位置**：`main.go:27`
- **锁定行为**：`if engine.GetStatus(); true` ——无论状态都尝试 Start
- **回归点**：若未来改为 `if engine.GetStatus().Running == false`，本用例需更新

### T-REG-02 LoadConfig 回退顺序
- **代码位置**：`engine.go:82-86`
- **锁定行为**：先 `json` 失败后才 `jsonv5`

### T-REG-03 Stop 不返回 Close 错误
- **代码位置**：`engine.go:128-130`
- **锁定行为**：Close 报错仅 log，Stop 仍返回 nil

### T-REG-04 UpdateConfig 不持长锁
- **代码位置**：`engine.go:162-185`
- **锁定行为**：仅 IsRunning 短暂 RLock；写盘与 Restart 不持锁

### T-REG-05 GetConfig 非 JSON 时降级原文
- **代码位置**：`engine.go:154-158`
- **锁定行为**：Indent 失败返回原始 data 字符串

### T-REG-06 status handler 严格 GET
- **代码位置**：`handlers.go:52`
- **锁定行为**：HEAD 方法也返回 405（仅放行 GET）

### T-REG-07 config handler 严格 GET/PUT
- **锁定行为**：HEAD/POST/DELETE/PATCH 均 405

### T-REG-08 控制接口严格 POST
- **锁定行为**：start/stop/restart 仅放行 POST

### T-REG-09 错误响应统一格式
- **锁定行为**：所有错误返回 `{"error":"<msg>"}`，状态码 400/405/500

### T-REG-10 成功响应 message 字段
- **锁定行为**：start/stop/restart/PUT config 成功均返回 `{"message":"..."}`

### T-REG-11 favicon 仅 301
- **代码位置**：`handlers.go:37-39`
- **锁定行为**：301 MovedPermanently（永久缓存）

### T-REG-12 CORS 不反射 Origin
- **锁定行为**：始终 `*`，不随请求 Origin 变化

### T-REG-13 日志格式
- **锁定行为**：`[METHOD] path RemoteAddr`（中间件）+ `log.Lshortfile`（main.go 设置）

### T-REG-14 started_at 单位毫秒
- **锁定行为**：UnixMilli（13 位）

### T-REG-15 Stop 重置 startedAt 为零值
- **锁定行为**：`time.Time{}` → UnixMilli 为 `-62135596800000`（负数，但 GetStatus 仅在 running 时返回，零值场景 instance 为 nil）

---

## 附录 A：验证 Checklist

执行完整测试前，按顺序确认：

- [ ] `geoip.dat` / `geosite.dat` 已下载到工作目录
- [ ] `config.json` 存在且为当前 v4 配置（双入站 + 三出站 + balancer）
- [ ] 8080 / 1080 / 1087 端口空闲
- [ ] `go build -o v2ray-console .` 成功
- [ ] 上游 `v2.tinyrun.cn:443` 与 `xg.tinyrun.cn:8888` 可达（否则 E2E 标 Skipped）
- [ ] Node.js 可用（运行 web 下 3 个 JS 单测）
- [ ] `curl` / `jq` / `lsof` 可用
- [ ] 准备好 config.json 备份（测试可能改写）

### 测试用例统计

| 模块 | 用例数 |
|------|-------|
| 0. 环境 | 8 |
| 1. CLI | 12 |
| 2. 引擎 | 17 |
| 3. 配置 | 12 |
| 4. status API | 8 |
| 5. config API | 16 |
| 6. 控制 API | 10 |
| 7. 中间件 | 7 |
| 8. Web UI | 23 |
| 9. V4 兼容 | 15 |
| 10. 并发 | 6 |
| 11. E2E | 10 |
| 12. 异常 | 12 |
| 13. 安全 | 10 |
| 14. 回归 | 15 |
| **合计** | **181** |

### 优先级建议

- **P0（冒烟）**：T-ENV-01/05、T-CLI-01、T-ENG-02、T-API-STATUS-01、T-API-CFG-01/03、T-API-START-01、T-V4-01、T-E2E-01
- **P1（核心功能）**：T-ENG-*、T-API-*、T-V4-*、T-WEB-01..04
- **P2（边界/安全）**：T-EXC-*、T-SEC-*、T-CONC-*

---

## 附录 B：缺陷与风险登记

> 测试设计过程中识别的潜在问题与改进建议（供开发评估）。

| 编号 | 位置 | 类型 | 描述 | 建议 |
|------|------|------|------|------|
| R-01 | main.go:27 | 代码异味 | `if engine.GetStatus(); true` 恒真，GetStatus 返回值被丢弃，疑似笔误 | 改为 `if !engine.GetStatus().Running { ... }` 或直接 `engine.Start()`，明确意图 |
| R-02 | engine.go:162-185 | 并发缺陷 | UpdateConfig 检查 IsRunning 与 Restart 之间存在 TOCTOU；UpdateConfig 全程不持长锁 | 在 UpdateConfig 内对 Stop/Start 序列持锁；或加专门的「配置更新+重启」原子操作 |
| R-03 | handlers.go 全局 | 安全 | API 无鉴权，依赖网络层（127.0.0.1）防护 | 增加 token 鉴权或本地 unix socket 选项 |
| R-04 | handlers.go:73 | 健壮性 | PUT /api/config 无请求体大小限制，可能 OOM | 加 `http.MaxBytesReader(w, r.Body, 1<<20)` |
| R-05 | handlers.go:140 | 安全 | CORS `Access-Control-Allow-Origin: *` 允许任意网站调用本机 API | 默认不开 CORS，或仅允许配置的白名单 Origin |
| R-06 | config.json | 安全 | 两处 `tlsSettings.allowInsecure:true` 跳过证书校验 | 生产环境改为 false |
| R-07 | handlers.go:37 | 体验 | favicon 永久 301 缓存，更换图标后浏览器不会刷新 | 改为 302，或加版本化路径 |
| R-08 | engine.go:155 | 健壮性 | GetConfig 在文件非 JSON 时降级返回原文，可能掩盖配置损坏 | 加日志告警，或返回 error 让上层处理 |
| R-09 | main.go:46 | 可靠性 | HTTP server 无 Shutdown 调用，WaitForSignal→Stop 只停了 v2ray，没优雅停 HTTP | 增加 `server.Shutdown(ctx)` |
| R-10 | handlers.go:77 | 体验 | PUT /api/config 自动重启失败时返回 500，但配置已写盘；下次 Start 仍失败，用户可能困惑 | 区分「写盘成功」与「重启失败」两个错误，分别返回不同消息 |
| R-11 | 全局 | 可观测性 | 无健康检查端点（如 /healthz）；无指标暴露 | 加 `/healthz` 供 K8s/反代探活 |
| R-12 | engine.go:85 | 兼容性 | jsonv5 回退分支对纯 v5 配置兼容性有限（README 已自承认） | 文档强提示只用 v4；或在加载失败时返回更明确的格式错误 |
| R-13 | web/_test_bypass.js | 测试缺陷 | sandbox 缺 `location` 全局，app.js 加载即抛错 → 14 用例全 FAIL（实测） | 在 sandbox 补 `location:{...}` 或 app.js 对 location 缺失容错 |
| R-14 | web/_test_flowviz.js | 测试/代码漂移 | 实测 8 PASS / 3 FAIL（selector 服务器地址、direct default badge 未渲染出） | 核对 buildFlowViz 输出；要么修代码回归，要么同步更新测试断言 |
| R-15 | web/app.js:5 | 健壮性 | `api()` 在后端返回非 JSON（如 502 HTML）时 `res.json()` 抛错，不被业务 catch 友好提示 | 包裹 try/catch，统一显示「服务不可用」 |

---

*文档结束。如需新增/修订用例，请同步更新附录 A 用例计数与对应模块。*
