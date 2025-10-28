package controllers

import (
	"bytes"
	"crypto/tls"
	"io"
	"net/http"
	"net/url"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
)

// ProxyRequest forwards a request to the target URL and returns the response. uses the method from the original request
// It handles both GET and POST requests based on whether requestBody is provided
// If authHeader is not empty, it will be added as an Authorization header to the request
func ProxyRequest(c *fiber.Ctx, targetURL *url.URL, requestBody []byte, logger *zerolog.Logger, authHeader ...string) error {
	// Perform GET request to the target URL
	req, err := http.NewRequest(c.Method(), targetURL.String(), nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create request",
		})
	}
	req.Header.Set("Accept", "application/json")
	//req.Header.Set("Accept-Encoding", "utf-8")
	//i think issue is because content is being returned compress and then browser doesn't know to decompress it

	if len(requestBody) > 0 {
		// Create a new POST request
		req, err = http.NewRequest("POST", targetURL.String(), bytes.NewBuffer(requestBody))
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to create request",
			})
		}
		req.Header.Set("Content-Type", "application/json")
	}

	// Add authorization header if provided
	if len(authHeader) > 0 && authHeader[0] != "" {
		req.Header.Set("Authorization", authHeader[0])
	}

	// copy any request headers
	for key, values := range c.GetReqHeaders() {
		// Skip Authorization header if we've explicitly set one
		if key == "Authorization" && len(authHeader) > 0 && authHeader[0] != "" {
			continue
		}

		for _, value := range values {
			req.Header.Add(key, value)
		}
	}

	// Perform the request
	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true, // WARNING: disables cert verification
			},
		},
	}
	resp, err := client.Do(req)
	if err != nil {
		logger.Err(err).Msg("Failed to send request to: " + targetURL.String())
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "Failed to send request",
		})
	}
	defer resp.Body.Close()
	defer client.CloseIdleConnections() // not sure if this was causing random issues

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to read response",
		})
	}
	logger.Info().Msgf("%s Proxied request to %s", c.Method(), targetURL)

	// Set headers to match the original response
	for k, val := range resp.Header {
		if len(val) > 0 {
			c.Set(k, val[0])
		}
	}
	c.Status(resp.StatusCode)

	// return the exact same JSON response
	return c.Send(body)
}
