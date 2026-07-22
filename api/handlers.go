package api

import (
	"encoding/json"
	"log"
	"net/http"

	core "v2ray-console/core"
)

// Handler 包含所有 API 处理器的依赖
type Handler struct {
	engine *core.Engine
}

// NewHandler 创建 API 处理器
func NewHandler(engine *core.Engine) *Handler {
	return &Handler{engine: engine}
}

// RegisterRoutes 注册所有 API 路由
func (h *Handler) RegisterRoutes() http.Handler {
	mux := http.NewServeMux()

	// 状态相关
	mux.HandleFunc("/api/status", h.handleStatus)

	// 配置相关
	mux.HandleFunc("/api/config", h.handleConfig)

	// 控制相关
	mux.HandleFunc("/api/start", h.handleStart)
	mux.HandleFunc("/api/stop", h.handleStop)
	mux.HandleFunc("/api/restart", h.handleRestart)

	// favicon 重定向（浏览器默认请求 /favicon.ico）
	mux.HandleFunc("/favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/icons/favicon-32x32.png", http.StatusMovedPermanently)
	})

	// 前端静态文件
	fs := http.FileServer(http.Dir("web"))
	mux.Handle("/", fs)

	// 包装为带 CORS 和日志的中间件
	return withMiddleware(mux)
}

// --- Handlers ---

func (h *Handler) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "仅支持 GET 方法")
		return
	}
	writeJSON(w, http.StatusOK, h.engine.GetStatus())
}

func (h *Handler) handleConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		config, err := h.engine.GetConfig()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "读取配置失败: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"config": config})

	case http.MethodPut:
		var req struct {
			Config string `json:"config"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "请求格式错误: "+err.Error())
			return
		}
		if err := h.engine.UpdateConfig(req.Config); err != nil {
			writeError(w, http.StatusInternalServerError, "更新配置失败: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"message": "配置已更新"})

	default:
		writeError(w, http.StatusMethodNotAllowed, "仅支持 GET/PUT")
	}
}

func (h *Handler) handleStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "仅支持 POST 方法")
		return
	}
	if err := h.engine.Start(); err != nil {
		writeError(w, http.StatusInternalServerError, "启动失败: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "已启动"})
}

func (h *Handler) handleStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "仅支持 POST 方法")
		return
	}
	if err := h.engine.Stop(); err != nil {
		writeError(w, http.StatusInternalServerError, "停止失败: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "已停止"})
}

func (h *Handler) handleRestart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "仅支持 POST 方法")
		return
	}
	if err := h.engine.Restart(); err != nil {
		writeError(w, http.StatusInternalServerError, "重启失败: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "已重启"})
}

// --- 工具函数 ---

func writeJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, statusCode int, message string) {
	writeJSON(w, statusCode, map[string]string{"error": message})
}

// withMiddleware 包装 CORS 和日志中间件
func withMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// CORS
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// 禁止缓存静态文件（确保前端修改即时生效）
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")

		// 日志
		log.Printf("[%s] %s %s", r.Method, r.URL.Path, r.RemoteAddr)

		next.ServeHTTP(w, r)
	})
}
