package controllers

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/config"
	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/service"
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
)

type VehiclesController struct {
	settings    *config.Settings
	logger      *zerolog.Logger
	identityAPI service.IdentityAPI
}

func NewVehiclesController(settings *config.Settings, logger *zerolog.Logger) *VehiclesController {
	return &VehiclesController{
		settings:    settings,
		logger:      logger,
		identityAPI: service.NewIdentityAPIService(*logger, settings.IdentityAPIURL.String()),
	}
}

func (v *VehiclesController) GetOraclePermissions(c *fiber.Ctx) error {
	u, err := GetOracleURL(c, v.settings)
	if err != nil {
		return err
	}
	targetURL := u.JoinPath("/v1/permissions")
	return v.proxyRequest(c, targetURL, nil)
}

func (v *VehiclesController) GetVehicleFromOracle(c *fiber.Ctx) error {
	vin := c.Params("vin", "")
	u, err := GetOracleURL(c, v.settings)
	if err != nil {
		return err
	}
	targetURL := u.JoinPath(fmt.Sprintf("/v1/vehicle/%s", vin))

	return v.proxyRequest(c, targetURL, nil)
}

func (v *VehiclesController) GetVehicles(c *fiber.Ctx) error {
	u, err := GetOracleURL(c, v.settings)
	if err != nil {
		return err
	}
	targetURL := u.JoinPath("/v1/vehicles")

	return v.proxyRequest(c, targetURL, nil)
}

func (v *VehiclesController) RegisterVehicle(c *fiber.Ctx) error {
	u, err := GetOracleURL(c, v.settings)
	if err != nil {
		return err
	}
	targetURL := u.JoinPath("/v1/vehicle/register")
	b := c.Body()
	return v.proxyRequest(c, targetURL, b)
}

func (v *VehiclesController) GetVehiclesVerificationStatus(c *fiber.Ctx) error {
	vins := c.Query("vins", "")
	u, err := GetOracleURL(c, v.settings)
	if err != nil {
		return err
	}
	targetURL := u.JoinPath("/v1/vehicle/verify")
	targetURL.RawQuery = fmt.Sprintf("vins=%s", vins)
	return v.proxyRequest(c, targetURL, nil)
}

func (v *VehiclesController) SubmitVehiclesVerification(c *fiber.Ctx) error {
	u, err := GetOracleURL(c, v.settings)
	if err != nil {
		return err
	}
	targetURL := u.JoinPath("/v1/vehicle/verify")
	return v.proxyRequest(c, targetURL, c.Body())
}

func (v *VehiclesController) GetVehiclesMintData(c *fiber.Ctx) error {
	vins := c.Query("vins", "")
	u, err := GetOracleURL(c, v.settings)
	if err != nil {
		return err
	}
	targetURL := u.JoinPath("/v1/vehicle/mint")
	targetURL.RawQuery = fmt.Sprintf("vins=%s", vins)
	return v.proxyRequest(c, targetURL, nil)
}

func (v *VehiclesController) GetVehiclesMintStatus(c *fiber.Ctx) error {
	vins := c.Query("vins", "")
	u, err := GetOracleURL(c, v.settings)
	if err != nil {
		return err
	}
	targetURL := u.JoinPath("/v1/vehicle/mint/status")
	targetURL.RawQuery = fmt.Sprintf("vins=%s", vins)
	return v.proxyRequest(c, targetURL, nil)
}

func (v *VehiclesController) SubmitVehiclesMintData(c *fiber.Ctx) error {
	u, err := GetOracleURL(c, v.settings)
	if err != nil {
		return err
	}
	targetURL := u.JoinPath("/v1/vehicle/mint")
	return v.proxyRequest(c, targetURL, c.Body())
}

func (v *VehiclesController) GetDisconnectData(c *fiber.Ctx) error {
	vins := c.Query("vins", "")
	u, err := GetOracleURL(c, v.settings)
	if err != nil {
		return err
	}
	targetURL := u.JoinPath("/v1/vehicle/disconnect")
	targetURL.RawQuery = fmt.Sprintf("vins=%s", vins)
	return v.proxyRequest(c, targetURL, nil)
}

func (v *VehiclesController) SubmitDisconnectData(c *fiber.Ctx) error {
	u, err := GetOracleURL(c, v.settings)
	if err != nil {
		return err
	}
	targetURL := u.JoinPath("/v1/vehicle/disconnect")
	return v.proxyRequest(c, targetURL, c.Body())
}

func (v *VehiclesController) GetDisconnectStatus(c *fiber.Ctx) error {
	vins := c.Query("vins", "")
	u, err := GetOracleURL(c, v.settings)
	if err != nil {
		return err
	}
	targetURL := u.JoinPath("/v1/vehicle/disconnect/status")
	targetURL.RawQuery = fmt.Sprintf("vins=%s", vins)
	return v.proxyRequest(c, targetURL, nil)
}

func (v *VehiclesController) proxyRequest(c *fiber.Ctx, targetURL *url.URL, requestBody []byte) error {
	// Perform GET request to the target URL
	req, err := http.NewRequest("GET", targetURL.String(), nil)
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

	// copy any request headers
	for key, values := range c.GetReqHeaders() {
		for _, value := range values {
			req.Header.Add(key, value)
		}
	}

	// Perform the request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
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
	v.logger.Info().Msgf("Proxied request to %s", targetURL)

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
