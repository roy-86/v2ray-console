.PHONY: build run clean

# GOCMD = GONOSUMCHECK=* GONOSUMDB=* GOINSECURE=* GOMODCACHE=$(CURDIR)/.gomod /usr/local/go/bin/go

build:
# 	$(GOCMD) build -o v2ray-console .
	go build -o v2ray-console .

run: build
	./v2ray-console -config config.json -port 8080

clean:
	rm -f v2ray-console
	rm -rf .gomod
