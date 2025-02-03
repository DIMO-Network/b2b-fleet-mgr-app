package controllers

import (
	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/config"
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
)

type SettingsController struct {
	settings *config.Settings
	logger   *zerolog.Logger
}

func NewSettingsController(settings *config.Settings, logger *zerolog.Logger) *SettingsController {
	return &SettingsController{
		settings: settings,
		logger:   logger,
	}
}

// GetSettings
// @Summary Get configuration parameters
// @Description Get config params for frontend app
// @Tags Settings
// @Produce json
// @Success 200
// @Security     BearerAuth
// @Router /v1/settings [get]
func (v *SettingsController) GetSettings(c *fiber.Ctx) error {

	payload := SettingsResponse{
		DevicesAPIURL: v.settings.DevicesAPIURL,
		PaymasterURL:  v.settings.PaymasterURL,
		RPCURL:        v.settings.RPCURL,
		BundlerURL:    v.settings.BundlerURL,
	}

	return c.JSON(payload)
}

type SettingsResponse struct {
	DevicesAPIURL string `json:"devicesApiUrl"`
	PaymasterURL  string `json:"paymasterUrl"`
	RPCURL        string `json:"rpcUrl"`
	BundlerURL    string `json:"bundlerUrl"`
}
