package main

import (
	"flag"
	"log"
	"net/http"

	api "v2ray-console/api"
	core "v2ray-console/core"
)

func main() {
	port := flag.String("port", "8080", "管理面板监听端口")
	configPath := flag.String("config", "config.json", "V2Ray 配置文件路径")
	flag.Parse()

	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)
	log.Println("=== V2Ray Console ===")
	log.Printf("管理面板: http://localhost:%s", *port)
	log.Printf("配置文件: %s", *configPath)

	// 初始化引擎
	engine := core.NewEngine(*configPath)

	// 尝试自动启动（如果有配置文件）
	if engine.GetStatus(); true {
		err := engine.Start()
		if err != nil {
			log.Printf("自动启动失败: %v（请通过 Web 面板上传配置后手动启动）", err)
		}
	}

	// 注册 API 路由
	handler := api.NewHandler(engine)
	mux := handler.RegisterRoutes()

	// 启动 HTTP 服务
	server := &http.Server{
		Addr:    ":" + *port,
		Handler: mux,
	}

	go func() {
		log.Printf("HTTP 服务已启动，监听 :%s", *port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP 服务启动失败: %v", err)
		}
	}()

	// 等待退出信号
	engine.WaitForSignal()
}
