.PHONY: all deps docker docker-cgo clean docs test test-race fmt lint install deploy-docs

TAGS =

INSTALL_DIR        = $(GOPATH)/bin
DEST_DIR           = ./target
PATHINSTBIN        = $(DEST_DIR)/bin
PATHINSTDOCKER     = $(DEST_DIR)/docker

VERSION   := $(shell git describe --tags || echo "v0.0.0")
VER_CUT   := $(shell echo $(VERSION) | cut -c2-)
VER_MAJOR := $(shell echo $(VER_CUT) | cut -f1 -d.)
VER_MINOR := $(shell echo $(VER_CUT) | cut -f2 -d.)
VER_PATCH := $(shell echo $(VER_CUT) | cut -f3 -d.)
VER_RC    := $(shell echo $(VER_PATCH) | cut -f2 -d-)
DATE      := $(shell date +"%Y-%m-%dT%H:%M:%SZ")

LD_FLAGS   =
GO_FLAGS   =
DOCS_FLAGS =

APPS = fleet-onboard-app
all: $(APPS)

install: $(APPS)
	@mkdir -p bin
	@cp $(PATHINSTBIN)/fleet-onboard-app ./bin/ #name here may need to be b2b-fleet-mgr-app

deps:
	@go mod tidy
	@go mod vendor

SOURCE_FILES = $(shell find lib internal -type f -name "*.go")


$(PATHINSTBIN)/%: $(SOURCE_FILES)
	@go build $(GO_FLAGS) -tags "$(TAGS)" -ldflags "$(LD_FLAGS) " -o $@ ./cmd/$*

$(APPS): %: $(PATHINSTBIN)/%

docker-tags:
	@echo "latest,$(VER_CUT),$(VER_MAJOR).$(VER_MINOR),$(VER_MAJOR)" > .tags

docker-rc-tags:
	@echo "latest,$(VER_CUT),$(VER_MAJOR)-$(VER_RC)" > .tags

docker-cgo-tags:
	@echo "latest-cgo,$(VER_CUT)-cgo,$(VER_MAJOR).$(VER_MINOR)-cgo,$(VER_MAJOR)-cgo" > .tags

docker: deps
	@docker build -f ./Dockerfile . -t dimozone/fleet-onboard-app:$(VER_CUT)
	@docker tag dimozone/fleet-onboard-app:$(VER_CUT) dimozone/fleet-onboard-app:latest

fmt:
	@go list -f {{.Dir}} ./... | xargs -I{} gofmt -w -s {}
	@go mod tidy

lint:
	@golangci-lint run

test: $(APPS)
	@go test $(GO_FLAGS) -timeout 3m -race ./...
	@$(PATHINSTBIN)/fleet-onboard-app test ./config/test/...

clean:
	rm -rf $(PATHINSTBIN)
	rm -rf $(DEST_DIR)/dist
	rm -rf $(PATHINSTDOCKER)
