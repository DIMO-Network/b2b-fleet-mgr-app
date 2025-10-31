package controllers

import (
	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/config"
	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/service"
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
)

type IdentityController struct {
	settings    *config.Settings
	logger      *zerolog.Logger
	identityAPI service.IdentityAPI
}

func NewIdentityController(settings *config.Settings, logger *zerolog.Logger) *IdentityController {
	return &IdentityController{
		settings:    settings,
		logger:      logger,
		identityAPI: service.NewIdentityAPIService(*logger, settings.IdentityAPIURL.String()),
	}
}

// GetVehicleByTokenID
// @Summary Get vehicle information by token ID
// @Description Retrieves vehicle details from the identity API using the token ID
// @Tags Identity
// @Produce json
// @Param tokenID path string true "Vehicle Token ID"
// @Success 200
// @Router /identity/vehicle/{tokenID} [get]
func (i *IdentityController) GetVehicleByTokenID(c *fiber.Ctx) error {
	tokenID := c.Params("tokenID")

	if tokenID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "tokenID is required")
	}

	data, err := i.identityAPI.GetVehicleByTokenID(tokenID)
	if err != nil {
		i.logger.Err(err).Str("tokenID", tokenID).Msg("Failed to get vehicle by token ID")
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get vehicle information")
	}

	c.Set("Content-Type", "application/json")
	return c.Send(data)
}
