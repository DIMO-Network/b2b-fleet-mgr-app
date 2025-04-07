package controllers

import (
	"bytes"
	"fmt"
	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/config"
	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/fleets"
	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/service"
	"github.com/friendsofgo/errors"
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
	"github.com/tidwall/sjson"
	"io"
	"net/http"
	"net/url"
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

func (v *VehiclesController) PostDevicesAPIFromVin(c *fiber.Ctx) error {
	targetURL := v.settings.DevicesAPIURL.JoinPath("/v1/user/devices/fromvin")
	setBytes, err := sjson.SetBytes(c.Body(), "preApprovedPSK", v.settings.CompassPreSharedKey)
	if err != nil {
		return err
	}
	return v.proxyRequest(c, targetURL, setBytes, false)
}

func (v *VehiclesController) PostDevicesAPIMint(c *fiber.Ctx) error {
	udID := c.Params("userDeviceId", "")
	targetURL := v.settings.DevicesAPIURL.JoinPath(fmt.Sprintf("/v1/user/devices/%s/commands/mint", udID))
	b := c.Body()
	return v.proxyRequest(c, targetURL, b, false)
}

func (v *VehiclesController) PostDevicesAPISyntheticMint(c *fiber.Ctx) error {
	udID := c.Params("userDeviceId", "")
	integrationID := c.Params("integrationId", "")
	targetURL := v.settings.DevicesAPIURL.JoinPath(fmt.Sprintf("/v1/user/devices/%s/integrations/%s/commands/mint", udID, integrationID))
	b := c.Body()
	return v.proxyRequest(c, targetURL, b, false)
}

func (v *VehiclesController) GetDevicesAPISyntheticMint(c *fiber.Ctx) error {
	udID := c.Params("userDeviceId", "")
	integrationID := c.Params("integrationId", "")
	targetURL := v.settings.DevicesAPIURL.JoinPath(fmt.Sprintf("/v1/user/devices/%s/integrations/%s/commands/mint", udID, integrationID))

	return v.proxyRequest(c, targetURL, nil, false)
}

func (v *VehiclesController) GetDevicesAPIMint(c *fiber.Ctx) error {
	udID := c.Params("userDeviceId", "")
	targetURL := v.settings.DevicesAPIURL.JoinPath(fmt.Sprintf("/v1/user/devices/%s/commands/mint", udID))

	return v.proxyRequest(c, targetURL, nil, false)
}

func (v *VehiclesController) GetDevicesAPICompassVINLookup(c *fiber.Ctx) error {
	vin := c.Params("vin", "")
	targetURL := v.settings.DevicesAPIURL.JoinPath(fmt.Sprintf("/v1/compass/device-by-vin/%s", vin))

	return v.proxyRequest(c, targetURL, nil, true)
}

func (v *VehiclesController) PostDevicesAPIRegisterIntegration(c *fiber.Ctx) error {
	udID := c.Params("userDeviceId", "")
	integrationID := c.Params("integrationId", "")
	targetURL := v.settings.DevicesAPIURL.JoinPath(fmt.Sprintf("/v1/user/devices/%s/integrations/%s", udID, integrationID))
	b := c.Body()
	return v.proxyRequest(c, targetURL, b, false)
}

func (v *VehiclesController) GetVehicleFromOracle(c *fiber.Ctx) error {
	vin := c.Params("vin", "")
	targetURL := v.settings.OracleAPIURL.JoinPath(fmt.Sprintf("/v1/vehicle/%s", vin))

	return v.proxyRequest(c, targetURL, nil, false)
}

func (v *VehiclesController) GetVehicles(c *fiber.Ctx) error {
	targetURL := v.settings.OracleAPIURL.JoinPath("/v1/vehicles")

	return v.proxyRequest(c, targetURL, nil, false)
}

func (v *VehiclesController) RegisterVehicle(c *fiber.Ctx) error {
	targetURL := v.settings.OracleAPIURL.JoinPath("/v1/vehicle/register")
	b := c.Body()
	return v.proxyRequest(c, targetURL, b, false)
}

func (v *VehiclesController) proxyRequest(c *fiber.Ctx, targetURL *url.URL, requestBody []byte, useCompassPSK bool) error {
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
	if useCompassPSK {
		req.Header.Set("Authorization", fmt.Sprintf("PSK %s", v.settings.CompassPreSharedKey))
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
	payload := AddVehicleRequest{}
	err := c.BodyParser(&payload)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, errors.Wrap(err, "Invalid request body").Error())
	}

	// validation
	for _, vin := range payload.VINs {
		if len(vin) != 17 {
			return fiber.NewError(fiber.StatusBadRequest, "Invalid vin")
		}
	}

	compassSvc, err := fleets.NewCompassSvc(v.settings, v.logger)
	if err != nil {
		return errors.Wrap(err, "Failed to connect with compass service")
	}
	defer compassSvc.CloseConnection() //nolint

	// 1. call compass
	ctx, err := compassSvc.AuthenticateCompass(c.Context())
	if err != nil {
		return errors.Wrap(err, "Failed to authenticate with compass service")
	}
	statuses, err := compassSvc.AddVINs(ctx, payload.VINs, payload.Email)
	if err != nil {
		return errors.Wrap(err, "Failed to add vehicles to compass service")
	}
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

	return c.JSON(statuses)
}

func (v *VehiclesController) DecodeVIN(c *fiber.Ctx) error {
	payload := DecodeVINRequest{}
	err := c.BodyParser(&payload)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, errors.Wrap(err, "Invalid request body").Error())
	}
	targetURL := v.settings.DeviceDefinitionsAPIURL.JoinPath("/device-definitions/decode-vin")
	b := []byte(`{"vin": "` + payload.VIN + `", "countryCode": "USA"}`)

	return v.proxyRequest(c, targetURL, b, false)
}

func (v *VehiclesController) GetDefinitionById(c *fiber.Ctx) error {
	definitionID := c.Params("id", "")

	definition, err := v.identityAPI.GetDefinitionByID(definitionID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, errors.Wrap(err, "Failed to get definition").Error())
	}

	c.Status(fiber.StatusOK)
	c.Set("Content-Type", "application/json")
	// return the exact same JSON response
	return c.Send(definition)

}

type AddVehicleRequest struct {
	VINs  []string `json:"vins"`
	Email string   `json:"email"`
}

type DecodeVINRequest struct {
	VIN string `json:"vin"`
}
