.PHONY: build build-release build-upx build-linux build-windows build-darwin build-all build-release-all build-upx-all run clean

LDFLAGS := -s -w
BUILD_FLAGS := -ldflags="$(LDFLAGS)" -trimpath

# GOCMD = GONOSUMCHECK=* GONOSUMDB=* GOINSECURE=* GOMODCACHE=$(CURDIR)/.gomod /usr/local/go/bin/go

build:
# 	$(GOCMD) build -o v2ray-console .
	go build -o v2ray-console .

# 优化构建：去除调试信息，缩减体积（52M → 36M）
build-release:
	go build $(BUILD_FLAGS) -o v2ray-console .

# 进一步用 UPX 压缩（需先安装 upx: brew install upx）
# 注：UPX 4+ 已移除 macOS Mach-O 支持，本 target 在 macOS 上会失败，仅适用于 linux/windows 产物
build-upx: build-release
	upx --best -o v2ray-console-upx v2ray-console && mv v2ray-console-upx v2ray-console

# Linux 产物（amd64 / arm64）
build-linux:
	GOOS=linux GOARCH=amd64 go build $(BUILD_FLAGS) -o v2ray-console-linux-amd64 .
	GOOS=linux GOARCH=arm64 go build $(BUILD_FLAGS) -o v2ray-console-linux-arm64 .

# Windows 产物（amd64 / arm64）
# 前置：需安装 go-winres（一次性：go install github.com/tc-hib/go-winres@latest）
# Windows 清单请求 requireAdministrator：netsh winhttp 写 HKLM 需要管理员令牌，
# 启动时会弹一次 UAC（仅一次）。
WINDOWS_SYSO_AMD64 := rsrc_windows_amd64.syso
WINDOWS_SYSO_ARM64 := rsrc_windows_arm64.syso
WINDOWS_SYSO := $(WINDOWS_SYSO_AMD64) $(WINDOWS_SYSO_ARM64)

build-windows: $(WINDOWS_SYSO)
	GOOS=windows GOARCH=amd64 go build $(BUILD_FLAGS) -o v2ray-console-windows-amd64.exe .
	GOOS=windows GOARCH=arm64 go build $(BUILD_FLAGS) -o v2ray-console-windows-arm64.exe .

$(WINDOWS_SYSO):
	@export PATH="$$(go env GOPATH 2>/dev/null)/bin:$$PATH"; \
	command -v go-winres >/dev/null 2>&1 || { \
		echo "错误：缺少 go-winres。请先执行：go install github.com/tc-hib/go-winres@latest"; \
		exit 1; }; \
	go-winres simply --arch "amd64,arm64" --admin --manifest gui \
		--file-description "V2Ray Console Management Panel" \
		--product-name "v2ray-console" --out rsrc

# macOS 产物（amd64 / arm64）
build-darwin:
	GOOS=darwin GOARCH=amd64 go build $(BUILD_FLAGS) -o v2ray-console-darwin-amd64 .
	GOOS=darwin GOARCH=arm64 go build $(BUILD_FLAGS) -o v2ray-console-darwin-arm64 .

# 全平台构建（本机 + Linux + Windows）
build-all: build-release build-linux build-windows

# 全平台 release 产物（macOS / Linux / Windows 全架构，共 6 个二进制）
build-release-all: build-release build-darwin build-linux build-windows

# 全平台产物再经 UPX 压缩（需 upx: brew install upx）
# UPX 4+ 不支持 macOS Mach-O，darwin 产物不压缩（约 39MB → 13MB）
# 先删除旧产物再构建：go build 对已存在的输出文件可能跳过重写，避免残留已压缩文件触发 AlreadyPacked
build-upx-all:
	rm -f v2ray-console-linux-amd64 v2ray-console-linux-arm64 v2ray-console-windows-amd64.exe
	rm -f v2ray-console-*-upx
	$(MAKE) build-release-all
	for f in v2ray-console-linux-amd64 v2ray-console-linux-arm64 v2ray-console-windows-amd64.exe; do \
		upx --best -o "$$f-upx" "$$f" && mv "$$f-upx" "$$f" || exit 1; \
	done
	@echo "darwin 产物未压缩：UPX 4+ 已移除 macOS Mach-O 支持"

run: build
	./v2ray-console -config config.json -port 8080

clean:
	rm -f v2ray-console
	rm -f v2ray-console-upx
	rm -f v2ray-console-*-upx
	rm -f v2ray-console-darwin-*
	rm -f v2ray-console-linux-*
	rm -f v2ray-console-windows-*
	rm -f rsrc_windows_amd64.syso rsrc_windows_arm64.syso
