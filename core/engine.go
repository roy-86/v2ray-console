package core

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	v2rayCore "github.com/v2fly/v2ray-core/v5"

	// 注册所有代理协议（必须）
	_ "github.com/v2fly/v2ray-core/v5/main/distro/all"
)

// Engine 管理 v2ray-core 实例的生命周期
type Engine struct {
	mu         sync.RWMutex
	instance   *v2rayCore.Instance
	cancel     context.CancelFunc
	running    bool
	startedAt  time.Time
	configPath string
}

// NewEngine 创建引擎管理器
func NewEngine(configPath string) *Engine {
	return &Engine{
		configPath: configPath,
	}
}

// Status 返回当前运行状态
type Status struct {
	Running   bool   `json:"running"`
	Version   string `json:"version"`
	StartedAt int64  `json:"started_at"`
}

// GetStatus 获取引擎状态
func (e *Engine) GetStatus() Status {
	e.mu.RLock()
	defer e.mu.RUnlock()
	version := "unknown"
	if e.instance != nil {
		version = v2rayCore.Version()
	}
	return Status{
		Running:   e.running,
		Version:   version,
		StartedAt: e.startedAt.UnixMilli(),
	}
}

// Start 启动 v2ray-core 实例
func (e *Engine) Start() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.running {
		return fmt.Errorf("引擎已在运行中")
	}

	// 读取配置文件
	data, err := os.ReadFile(e.configPath)
	if err != nil {
		return fmt.Errorf("读取配置文件失败: %w", err)
	}

	// 校验 JSON 格式
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return fmt.Errorf("配置文件不是有效的 JSON: %w", err)
	}

	// 加载配置 — 依次尝试 json 和 jsonv5 格式
	config, err := v2rayCore.LoadConfig("json", data)
	if err != nil {
		log.Printf("JSON 格式加载失败，尝试 JSONv5 格式: %v", err)
		config, err = v2rayCore.LoadConfig("jsonv5", data)
	}
	if err != nil {
		return fmt.Errorf("加载配置失败: %w", err)
	}

	// 创建实例
	ctx, cancel := context.WithCancel(context.Background())
	e.cancel = cancel

	instance, err := v2rayCore.NewWithContext(ctx, config)
	if err != nil {
		cancel()
		return fmt.Errorf("创建 v2ray-core 实例失败: %w", err)
	}

	// 启动
	if err := instance.Start(); err != nil {
		cancel()
		return fmt.Errorf("启动 v2ray-core 实例失败: %w", err)
	}

	e.instance = instance
	e.running = true
	e.startedAt = time.Now()

	log.Printf("v2ray-core 已启动 (版本: %s)", v2rayCore.Version())
	return nil
}

// Stop 停止 v2ray-core 实例
func (e *Engine) Stop() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if !e.running || e.instance == nil {
		return nil
	}

	if e.cancel != nil {
		e.cancel()
	}

	if err := e.instance.Close(); err != nil {
		log.Printf("关闭 v2ray-core 实例时出错: %v", err)
	}

	e.instance = nil
	e.running = false
	e.startedAt = time.Time{}

	log.Println("v2ray-core 已停止")
	return nil
}

// Restart 重启 v2ray-core 实例
func (e *Engine) Restart() error {
	if err := e.Stop(); err != nil {
		return fmt.Errorf("停止失败: %w", err)
	}
	return e.Start()
}

// GetConfig 读取当前配置文件内容（格式化后）
func (e *Engine) GetConfig() (string, error) {
	data, err := os.ReadFile(e.configPath)
	if err != nil {
		return "", err
	}
	var prettyJSON bytes.Buffer
	if err := json.Indent(&prettyJSON, data, "", "  "); err != nil {
		return string(data), nil
	}
	return prettyJSON.String(), nil
}

// UpdateConfig 更新配置文件（如果正在运行则自动重启）
func (e *Engine) UpdateConfig(configJSON string) error {
	// 校验 JSON
	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(configJSON), &raw); err != nil {
		return fmt.Errorf("无效的 JSON 格式: %w", err)
	}

	// 写入文件
	formatted, err := json.MarshalIndent(raw, "", "  ")
	if err != nil {
		return fmt.Errorf("格式化 JSON 失败: %w", err)
	}
	if err := os.WriteFile(e.configPath, formatted, 0644); err != nil {
		return fmt.Errorf("写入配置文件失败: %w", err)
	}

	// 如果正在运行则自动重启
	if e.IsRunning() {
		log.Println("配置已更新，正在重启引擎...")
		return e.Restart()
	}

	return nil
}

// IsRunning 检查引擎是否在运行
func (e *Engine) IsRunning() bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.running
}

// WaitForSignal 等待系统退出信号（用于主程序阻塞）
func (e *Engine) WaitForSignal() {
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigCh
	log.Printf("收到信号 %v，正在关闭...", sig)
	e.Stop()
}
