.PHONY: build build-release build-upx build-linux build-windows build-all run clean

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
build-upx: build-release
	upx --best -o v2ray-console-upx v2ray-console && mv v2ray-console-upx v2ray-console

# Linux 产物（amd64 / arm64）
build-linux:
	GOOS=linux GOARCH=amd64 go build $(BUILD_FLAGS) -o v2ray-console-linux-amd64 .
	GOOS=linux GOARCH=arm64 go build $(BUILD_FLAGS) -o v2ray-console-linux-arm64 .

# Windows 产物（amd64）
build-windows:
	GOOS=windows GOARCH=amd64 go build $(BUILD_FLAGS) -o v2ray-console-windows-amd64.exe .

# 全平台构建
build-all: build-release build-linux build-windows

run: build
	./v2ray-console -config config.json -port 8080

clean:
	rm -f v2ray-console
	rm -f v2ray-console-upx
	rm -f v2ray-console-linux-*
	rm -f v2ray-console-windows-*
	#rm -rf .gomod
