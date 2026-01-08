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

// GetDefinitionByID
// @Summary Get definition by def id
// @Description Retrieves definition from the identity API using the mmy id make_model_year
// @Tags Identity
// @Produce json
// @Param id "make_model_year"
// @Success 200
// @Router /identity/definition/{id} [get]
func (i *IdentityController) GetDefinitionByID(c *fiber.Ctx) error {
	id := c.Params("id")

	if id == "" {
		return fiber.NewError(fiber.StatusBadRequest, "mmy id is required")
	}

	data, err := i.identityAPI.GetDefinitionByID(id)
	if err != nil {
		i.logger.Err(err).Str("definition_id", id).Msg("Failed to get definition ID")
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get definition information")
	}

	c.Set("Content-Type", "application/json")
	return c.Send(data)
}

// GetOwnerBy0x
// @Summary Get owner information by wallet 0x
// @Description Retrieves owner details from the identity API using the wallet 0x
// @Tags Identity
// @Produce json
// @Param owner path string true "Owner Wallet 0x"
// @Success 200
// @Router /identity/owner/{owner} [get]

func (i *IdentityController) GetOwnerBy0x(c *fiber.Ctx) error {
	owner := c.Params("owner")

	i.logger.Info().
		Str("owner", owner).
		Msg("GetOwnerBy0x called")

	if owner == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Wallet 0x is required")
	}

	after := c.Query("after")
	first := c.QueryInt("first", 25)

	data, err := i.identityAPI.GetOwnerBy0x(owner, first, after)
	if err != nil {
		i.logger.Err(err).Str("owner_0x", owner).Msg("Failed to get owner by 0x")
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get owner information")
	}

	c.Set("Content-Type", "application/json")
	return c.Send(data)
}
