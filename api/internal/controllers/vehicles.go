package controllers

import (
	"bytes"
	"fmt"
	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/config"
	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/fleets"
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
	"github.com/tidwall/sjson"
	"io"
	"net/http"
	"strings"
)

type VehiclesController struct {
	settings *config.Settings
	logger   *zerolog.Logger
}

func NewVehiclesController(settings *config.Settings, logger *zerolog.Logger) *VehiclesController {
	return &VehiclesController{
		settings: settings,
		logger:   logger,
	}
}

func (v *VehiclesController) PostDevicesAPIFromVin(c *fiber.Ctx) error {
	targetURL := v.settings.DevicesAPIURL + "/v1/user/devices/fromvin"
	setBytes, err := sjson.SetBytes(c.Body(), "preApprovedPSK", v.settings.CompassPreSharedKey)
	if err != nil {
		return err
	}
	return v.proxyRequest(c, targetURL, setBytes)
}

func (v *VehiclesController) PostDevicesAPIMint(c *fiber.Ctx) error {
	udID := c.Params("userDeviceId", "")
	targetURL := fmt.Sprintf("%s/v1/user/devices/%s/commands/mint", v.settings.DevicesAPIURL, udID)

	return v.proxyRequest(c, targetURL, c.Body())
}

func (v *VehiclesController) GetDevicesAPIMint(c *fiber.Ctx) error {
	udID := c.Params("userDeviceId", "")
	targetURL := fmt.Sprintf("%s/v1/user/devices/%s/commands/mint", v.settings.DevicesAPIURL, udID)

	return v.proxyRequest(c, targetURL, nil)
}

func (v *VehiclesController) proxyRequest(c *fiber.Ctx, targetURL string, requestBody []byte) error {
	// Perform GET request to the target URL
	req, err := http.NewRequest("GET", targetURL, nil)
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
		req, err = http.NewRequest("POST", targetURL, bytes.NewBuffer(requestBody))
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

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to read response",
		})
	}
	v.logger.Info().Str("response", string(body)).Msgf("Proxied request to %s", targetURL)

	// Set headers to match the original response
	for k, val := range resp.Header {
		if len(val) > 0 {
			c.Set(k, val[0])
		}
	}
	c.Status(resp.StatusCode)

	// Send the exact same JSON response
	return c.Send(body)
}

// AddVehicles
// @Summary Add vehicle(s) by VIN
// @Description Adds a vehicle by VIN - adds to fleet data vendor, decodes, mints, sacd, synthetic
// @Tags Vehicles
// @Accept json
// @Produce json
// @Param  tokenId path int true "token Id of the vehicle NFT"
// @Success 200
// @Security     BearerAuth
// @Router /v1/vehicles [post]
func (v *VehiclesController) AddVehicles(c *fiber.Ctx) error {
	const workingVIN = "1C4SJSBP8RS133747"

	payload := AddVehicleRequest{}
	err := c.BodyParser(&payload)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).SendString("Invalid request body")
	}
	// temporary:
	// if vin is the known one, just skip and return success
	if strings.TrimSpace(payload.VINs[0]) == workingVIN {
		v.logger.Info().Msgf("Using workingvin, skipping adding vehicle %s", payload.VINs[0])
		return c.SendStatus(fiber.StatusOK)
	}

	// validation
	for _, vin := range payload.VINs {
		if len(vin) != 17 {
			return c.Status(fiber.StatusBadRequest).SendString("Invalid VIN")
		}
	}

	compassSvc, err := fleets.NewCompassSvc(v.settings, v.logger)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).SendString("Failed to connect with Compass")
	}
	// eventually this needs to be in a worker to process adding vehicles in background

	// 1. call compass
	ctx, err := compassSvc.AuthenticateCompass(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).SendString("Failed to authenticate with Compass")
	}
	statuses, err := compassSvc.AddVINs(ctx, payload.VINs, payload.Email)
	for _, status := range statuses {
		if status.Status == "APPROVED" { // status come from nativeconnect.pb.go enum
			v.logger.Info().Msgf("Vehicle %s added to Compass", status.VIN)
			// decode vin
			// mint + sacd
			// synthetic device
		} else {
			v.logger.Warn().Msgf("Vehicle %s failed to add to Compass: %s", status.VIN, status.Status)
		}
	}

	return c.SendStatus(fiber.StatusOK) // we could return the status per vin
}

type AddVehicleRequest struct {
	VINs  []string `json:"vins"`
	Email string   `json:"email"`
}
