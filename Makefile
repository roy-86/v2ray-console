.PHONY: build build-release build-upx run clean

# GOCMD = GONOSUMCHECK=* GONOSUMDB=* GOINSECURE=* GOMODCACHE=$(CURDIR)/.gomod /usr/local/go/bin/go

build:
# 	$(GOCMD) build -o v2ray-console .
	go build -o v2ray-console .

# 优化构建：去除调试信息，缩减体积（52M → 36M）
build-release:
	go build -ldflags="-s -w" -trimpath -o v2ray-console .

# 进一步用 UPX 压缩（需先安装 upx: brew install upx）
build-upx: build-release
	upx --best -o v2ray-console-upx v2ray-console && mv v2ray-console-upx v2ray-console

run: build
	./v2ray-console -config config.json -port 8080

clean:
	rm -f v2ray-console
	rm -f v2ray-console-upx
	#rm -rf .gomod
