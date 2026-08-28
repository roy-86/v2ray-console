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

# Windows 产物（amd64）
build-windows:
	GOOS=windows GOARCH=amd64 go build $(BUILD_FLAGS) -o v2ray-console-windows-amd64.exe .

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
