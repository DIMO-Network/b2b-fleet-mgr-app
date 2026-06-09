# b2b-fleet-mgr-app — root Makefile for local development.
#
# `make dev` is the one-command path for a new developer: it checks the dev
# host is in /etc/hosts, ensures api/settings.yaml exists with USE_DEV_CERTS
# enabled, installs web deps, then brings up the frontend (Vite + mkcert) and
# the backend (Go) together. Ctrl-C tears both down.
#
# Unlike fleet-lite-app there is no local database — this app proxies to remote
# DIMO dev APIs, so there are no `db`/`migrate` targets.
#
# See README.md for the manual, step-by-step equivalent.

SHELL    := /bin/bash
DEV_HOST := localdev.dimo.org
WEB_PORT := 3008
API_PORT := 3007

.DEFAULT_GOAL := help
.PHONY: dev help check-host settings web-install web api

## dev: bring up frontend + backend together (one-command local dev)
dev: check-host settings web-install
	@scripts/dev-up.sh

## check-host: verify $(DEV_HOST) resolves to localhost via /etc/hosts
# NB: we deliberately do NOT use nslookup here — on macOS it queries DNS only
# and ignores /etc/hosts, so it returns NXDOMAIN even when the entry is present.
# dscacheutil (macOS) / getent (Linux) both consult /etc/hosts.
check-host:
	@ip="$$(getent ahostsv4 $(DEV_HOST) 2>/dev/null | awk 'NR==1{print $$1}')"; \
	if [ -z "$$ip" ]; then \
	  ip="$$(dscacheutil -q host -a name $(DEV_HOST) 2>/dev/null | awk '/^ip_address:/{print $$2; exit}')"; \
	fi; \
	if [ "$$ip" = "127.0.0.1" ] || [ "$$ip" = "::1" ]; then \
	  echo "✓ $(DEV_HOST) → $$ip"; \
	else \
	  echo "✗ $(DEV_HOST) does not resolve to localhost (got: $${ip:-nothing})."; \
	  echo "  Add it to /etc/hosts, then flush the DNS cache:"; \
	  echo "    echo '127.0.0.1 $(DEV_HOST)' | sudo tee -a /etc/hosts"; \
	  echo "    sudo killall -HUP mDNSResponder"; \
	  exit 1; \
	fi

## settings: ensure api/settings.yaml exists and uses dev TLS certs
# Local dev needs USE_DEV_CERTS: true so the Go backend serves HTTPS with the
# mkcert certs (the frontend calls https://$(DEV_HOST):$(API_PORT)). The sample
# ships with it false, so we create-from-sample if missing and flip it on.
settings:
	@if [ ! -f api/settings.yaml ]; then \
	  cp api/settings.sample.yaml api/settings.yaml; \
	  echo "✓ created api/settings.yaml from sample"; \
	else \
	  echo "✓ api/settings.yaml present"; \
	fi
	@if grep -qi '^USE_DEV_CERTS: *false' api/settings.yaml; then \
	  sed -i.bak 's/^USE_DEV_CERTS: *false/USE_DEV_CERTS: true/I' api/settings.yaml && rm -f api/settings.yaml.bak; \
	  echo "✓ set USE_DEV_CERTS: true (required for local HTTPS)"; \
	fi

## web-install: install frontend dependencies if missing
web-install:
	@if [ ! -d web/node_modules ]; then \
	  echo "▶ installing web deps…"; cd web && npm install; \
	else \
	  echo "✓ web deps present (run 'cd web && npm install' to refresh)"; \
	fi

## web: run only the frontend (Vite dev server, generates mkcert certs)
web: check-host web-install
	@cd web && npm run dev

## api: run only the backend (requires certs from a running/previous 'make web')
api: settings
	@cd api && go run ./cmd/fleet-onboard-app

## help: list targets
help:
	@echo "b2b-fleet-mgr-app — local dev"
	@echo ""
	@echo "  make dev          bring up frontend + backend together (start here)"
	@echo "  make check-host   verify $(DEV_HOST) is in /etc/hosts"
	@echo "  make settings     ensure api/settings.yaml exists with USE_DEV_CERTS: true"
	@echo "  make web          run only the frontend  (https://$(DEV_HOST):$(WEB_PORT))"
	@echo "  make api          run only the backend   (https://$(DEV_HOST):$(API_PORT))"
	@echo ""
	@echo "No local database — this app proxies to remote DIMO dev APIs."
	@echo "First run also needs the mkcert root CA trusted — Vite installs it on"
	@echo "first 'npm run dev' (one-time sudo prompt)."
