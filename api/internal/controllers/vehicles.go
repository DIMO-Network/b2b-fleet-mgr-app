package controllers

import (
	"fmt"

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
	u := GetOracleURL(c, v.settings)
	targetURL := u.JoinPath("/v1/access")
	return ProxyRequest(c, targetURL, nil, v.logger)
}

// GetPendingVehicles calls oracle to get vehicles that have been seen but not onboarded, eg. pending onboard
func (v *VehiclesController) GetPendingVehicles(c *fiber.Ctx) error {
	u := GetOracleURL(c, v.settings)
	targetURL := u.JoinPath("/v1/pending-vehicles")

	// Add the query string from the original request
	targetURL.RawQuery = string(c.Request().URI().QueryString())

	return ProxyRequest(c, targetURL, nil, v.logger)
}

func (v *VehiclesController) GetVehicleFromOracle(c *fiber.Ctx) error {
	vin := c.Params("vin", "")
	u := GetOracleURL(c, v.settings)
	targetURL := u.JoinPath(fmt.Sprintf("/v1/vehicle/%s", vin))

	return ProxyRequest(c, targetURL, nil, v.logger)
}

// GetVehicles is used to list all onboarded vehicles from oracle
func (v *VehiclesController) GetVehicles(c *fiber.Ctx) error {
	u := GetOracleURL(c, v.settings)
	targetURL := u.JoinPath("/v1/vehicles")

	return ProxyRequest(c, targetURL, nil, v.logger)
}

func (v *VehiclesController) RegisterVehicle(c *fiber.Ctx) error {
	u := GetOracleURL(c, v.settings)
	targetURL := u.JoinPath("/v1/vehicle/register")
	b := c.Body()
	return ProxyRequest(c, targetURL, b, v.logger)
}

func (v *VehiclesController) GetVehiclesVerificationStatus(c *fiber.Ctx) error {
	vins := c.Query("vins", "")
	u := GetOracleURL(c, v.settings)

	targetURL := u.JoinPath("/v1/vehicle/verify")
	targetURL.RawQuery = fmt.Sprintf("vins=%s", vins)
	return ProxyRequest(c, targetURL, nil, v.logger)
}

func (v *VehiclesController) SubmitVehiclesVerification(c *fiber.Ctx) error {
	u := GetOracleURL(c, v.settings)

	targetURL := u.JoinPath("/v1/vehicle/verify")
	return ProxyRequest(c, targetURL, c.Body(), v.logger)
}

func (v *VehiclesController) GetVehiclesMintData(c *fiber.Ctx) error {
	vins := c.Query("vins", "")
	ownerAddress := c.Query("owner_address", "")
	u := GetOracleURL(c, v.settings)

	targetURL := u.JoinPath("/v1/vehicle/mint")
	targetURL.RawQuery = fmt.Sprintf("vins=%s&owner_address=%s", vins, ownerAddress)
	return ProxyRequest(c, targetURL, nil, v.logger)
}

func (v *VehiclesController) GetVehiclesMintStatus(c *fiber.Ctx) error {
	vins := c.Query("vins", "")
	u := GetOracleURL(c, v.settings)

	targetURL := u.JoinPath("/v1/vehicle/mint/status")
	targetURL.RawQuery = fmt.Sprintf("vins=%s", vins)
	return ProxyRequest(c, targetURL, nil, v.logger)
}

func (v *VehiclesController) SubmitVehiclesMintData(c *fiber.Ctx) error {
	u := GetOracleURL(c, v.settings)

	targetURL := u.JoinPath("/v1/vehicle/mint")
	return ProxyRequest(c, targetURL, c.Body(), v.logger)
}

func (v *VehiclesController) GetDisconnectData(c *fiber.Ctx) error {
	vins := c.Query("vins", "")
	u := GetOracleURL(c, v.settings)

	targetURL := u.JoinPath("/v1/vehicle/disconnect")
	targetURL.RawQuery = fmt.Sprintf("vins=%s", vins)
	return ProxyRequest(c, targetURL, nil, v.logger)
}

func (v *VehiclesController) SubmitDisconnectData(c *fiber.Ctx) error {
	u := GetOracleURL(c, v.settings)

	targetURL := u.JoinPath("/v1/vehicle/disconnect")
	return ProxyRequest(c, targetURL, c.Body(), v.logger)
}

func (v *VehiclesController) GetDisconnectStatus(c *fiber.Ctx) error {
	vins := c.Query("vins", "")
	u := GetOracleURL(c, v.settings)

	targetURL := u.JoinPath("/v1/vehicle/disconnect/status")
	targetURL.RawQuery = fmt.Sprintf("vins=%s", vins)
	return ProxyRequest(c, targetURL, nil, v.logger)
}

func (v *VehiclesController) GetDeleteData(c *fiber.Ctx) error {
	vins := c.Query("vins", "")
	u := GetOracleURL(c, v.settings)

	targetURL := u.JoinPath("/v1/vehicle/delete")
	targetURL.RawQuery = fmt.Sprintf("vins=%s", vins)
	return ProxyRequest(c, targetURL, nil, v.logger)
}

func (v *VehiclesController) SubmitDeleteData(c *fiber.Ctx) error {
	u := GetOracleURL(c, v.settings)

	targetURL := u.JoinPath("/v1/vehicle/delete")
	return ProxyRequest(c, targetURL, c.Body(), v.logger)
}

func (v *VehiclesController) GetDeleteStatus(c *fiber.Ctx) error {
	vins := c.Query("vins", "")
	u := GetOracleURL(c, v.settings)

	targetURL := u.JoinPath("/v1/vehicle/delete/status")
	targetURL.RawQuery = fmt.Sprintf("vins=%s", vins)
	return ProxyRequest(c, targetURL, nil, v.logger)
}

func (v *VehiclesController) GetPendingVehicleTelemetry(c *fiber.Ctx) error {
	imei := c.Params("imei", "")
	u := GetOracleURL(c, v.settings)
	targetURL := u.JoinPath(fmt.Sprintf("/v1/pending-vehicle-telemetry/%s", imei))
	return ProxyRequest(c, targetURL, nil, v.logger)
}

func (v *VehiclesController) ClearPendingVehicleTelemetry(c *fiber.Ctx) error {
	imei := c.Params("imei", "")
	u := GetOracleURL(c, v.settings)
	targetURL := u.JoinPath(fmt.Sprintf("/v1/pending-vehicle-telemetry/%s", imei))
	return ProxyRequest(c, targetURL, nil, v.logger)
}

func (v *VehiclesController) ResetOnboarding(c *fiber.Ctx) error {
	imei := c.Params("imei", "")
	u := GetOracleURL(c, v.settings)
	targetURL := u.JoinPath(fmt.Sprintf("/v1/vehicle/reset-onboarding/%s", imei))
	return ProxyRequest(c, targetURL, nil, v.logger)
}

func (v *VehiclesController) GetTransferData(c *fiber.Ctx) error {
	imei := c.Query("imei", "")
	targetWallet := c.Query("targetWalletAddress", "")
	u := GetOracleURL(c, v.settings)

	targetURL := u.JoinPath("/v1/vehicle/transfer")
	targetURL.RawQuery = fmt.Sprintf("imei=%s&targetWalletAddress=%s", imei, targetWallet)
	return ProxyRequest(c, targetURL, nil, v.logger)
}

func (v *VehiclesController) SubmitTransferData(c *fiber.Ctx) error {
	u := GetOracleURL(c, v.settings)

	targetURL := u.JoinPath("/v1/vehicle/transfer")
	return ProxyRequest(c, targetURL, c.Body(), v.logger)
}

func (v *VehiclesController) GetTransferStatus(c *fiber.Ctx) error {
	jobID := c.Query("jobId", "")
	u := GetOracleURL(c, v.settings)

	targetURL := u.JoinPath("/v1/vehicle/transfer/status")
	targetURL.RawQuery = fmt.Sprintf("jobId=%s", jobID)
	return ProxyRequest(c, targetURL, nil, v.logger)
}

func (v *VehiclesController) SubmitCommand(c *fiber.Ctx) error {
	imei := c.Params("imei", "")

	u := GetOracleURL(c, v.settings)
	targetURL := u.JoinPath(fmt.Sprintf("/v1/pending-vehicle/command/%s", imei))
	return ProxyRequest(c, targetURL, nil, v.logger)
}
