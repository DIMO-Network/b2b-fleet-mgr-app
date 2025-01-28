package controllers

import (
	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/config"
	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/fleets"
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
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
		return c.Status(fiber.StatusBadRequest).SendString("Invalid request body")
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

	return c.SendStatus(fiber.StatusOK)
}

type AddVehicleRequest struct {
	VINs  []string `json:"vins"`
	Email string   `json:"email"`
}
