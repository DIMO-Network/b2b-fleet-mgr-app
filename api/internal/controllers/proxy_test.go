package controllers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
)

func TestProxyRequest_HTTPMethods(t *testing.T) {
	// Create a test logger
	logger := zerolog.Nop()

	tests := []struct {
		name        string
		method      string
		requestBody []byte
		wantMethod  string
	}{
		{
			name:        "GET without body",
			method:      http.MethodGet,
			requestBody: nil,
			wantMethod:  http.MethodGet,
		},
		{
			name:        "POST with body",
			method:      http.MethodPost,
			requestBody: []byte(`{"key":"value"}`),
			wantMethod:  http.MethodPost,
		},
		{
			name:        "PUT with body",
			method:      http.MethodPut,
			requestBody: []byte(`{"key":"updated"}`),
			wantMethod:  http.MethodPut,
		},
		{
			name:        "PATCH with body",
			method:      http.MethodPatch,
			requestBody: []byte(`{"key":"patched"}`),
			wantMethod:  http.MethodPatch,
		},
		{
			name:        "DELETE without body",
			method:      http.MethodDelete,
			requestBody: nil,
			wantMethod:  http.MethodDelete,
		},
		{
			name:        "DELETE with body",
			method:      http.MethodDelete,
			requestBody: []byte(`{"id":"123"}`),
			wantMethod:  http.MethodDelete,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Track what the target server received
			var receivedMethod string
			var receivedContentType string
			var receivedAccept string

			// Create a mock target server
			targetServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				receivedMethod = r.Method
				receivedContentType = r.Header.Get("Content-Type")
				receivedAccept = r.Header.Get("Accept")

				// Send a mock response
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusOK)
				json.NewEncoder(w).Encode(map[string]string{"status": "success"})
			}))
			defer targetServer.Close()

			// Parse target URL
			targetURL, err := url.Parse(targetServer.URL)
			if err != nil {
				t.Fatalf("Failed to parse target URL: %v", err)
			}

			// Create a Fiber app and set up the proxy route
			app := fiber.New()
			app.All("/test", func(c *fiber.Ctx) error {
				return ProxyRequest(c, targetURL, tt.requestBody, &logger)
			})

			// Create a test request with the appropriate method and body
			var reqBody io.Reader
			if len(tt.requestBody) > 0 {
				reqBody = strings.NewReader(string(tt.requestBody))
			}
			req := httptest.NewRequest(tt.method, "/test", reqBody)
			req.Header.Set("Content-Type", "application/json")

			// Execute the request
			resp, err := app.Test(req, -1)
			if err != nil {
				t.Fatalf("Test request failed: %v", err)
			}
			defer resp.Body.Close()

			// Verify the method was forwarded correctly
			if receivedMethod != tt.wantMethod {
				t.Errorf("Expected method %s, got %s", tt.wantMethod, receivedMethod)
			}

			// Verify Content-Type header is set when there's a body
			if len(tt.requestBody) > 0 {
				if receivedContentType != "application/json" {
					t.Errorf("Expected Content-Type: application/json, got %s", receivedContentType)
				}
			}

			// Verify Accept header is set
			if receivedAccept != "application/json" {
				t.Errorf("Expected Accept: application/json, got %s", receivedAccept)
			}

			// Verify response status
			if resp.StatusCode != http.StatusOK {
				t.Errorf("Expected status 200, got %d", resp.StatusCode)
			}
		})
	}
}

func TestProxyRequest_HeaderForwarding(t *testing.T) {
	logger := zerolog.Nop()

	// Track what headers the target server received
	var receivedTenantID string
	var receivedCustomHeader string

	// Create a mock target server that checks for custom headers
	targetServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedTenantID = r.Header.Get("Tenant-Id")
		receivedCustomHeader = r.Header.Get("X-Custom-Header")

		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	}))
	defer targetServer.Close()

	// Parse target URL
	targetURL, err := url.Parse(targetServer.URL)
	if err != nil {
		t.Fatalf("Failed to parse target URL: %v", err)
	}

	// Create a Fiber app and set up the proxy route
	app := fiber.New()
	app.Get("/test", func(c *fiber.Ctx) error {
		return ProxyRequest(c, targetURL, nil, &logger)
	})

	// Create a test request with custom headers
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Tenant-Id", "test-tenant")
	req.Header.Set("X-Custom-Header", "custom-value")

	// Execute the request
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("Test request failed: %v", err)
	}
	defer resp.Body.Close()

	// Check if custom headers were forwarded
	if receivedTenantID != "test-tenant" {
		t.Errorf("Expected Tenant-Id: test-tenant, got %s", receivedTenantID)
	}
	if receivedCustomHeader != "custom-value" {
		t.Errorf("Expected X-Custom-Header: custom-value, got %s", receivedCustomHeader)
	}

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}
}

func TestProxyRequest_AuthHeader(t *testing.T) {
	logger := zerolog.Nop()

	// Track what auth header the target server received
	var receivedAuth string

	// Create a mock target server that checks for auth header
	targetServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")

		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	}))
	defer targetServer.Close()

	// Parse target URL
	targetURL, err := url.Parse(targetServer.URL)
	if err != nil {
		t.Fatalf("Failed to parse target URL: %v", err)
	}

	// Create a Fiber app and set up the proxy route
	app := fiber.New()
	app.Get("/test", func(c *fiber.Ctx) error {
		return ProxyRequest(c, targetURL, nil, &logger, "Bearer test-token")
	})

	// Create a test request
	req := httptest.NewRequest(http.MethodGet, "/test", nil)

	// Execute the request
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("Test request failed: %v", err)
	}
	defer resp.Body.Close()

	// Check if auth header was set
	if receivedAuth != "Bearer test-token" {
		t.Errorf("Expected Authorization: Bearer test-token, got %s", receivedAuth)
	}

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}
}
