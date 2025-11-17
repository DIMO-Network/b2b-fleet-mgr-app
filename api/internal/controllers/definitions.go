package controllers

import (
	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/config"
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
)

type DefinitionsController struct {
	settings *config.Settings
	logger   *zerolog.Logger
}

func NewDefinitionsController(settings *config.Settings, logger *zerolog.Logger) *DefinitionsController {
	return &DefinitionsController{
		settings: settings,
		logger:   logger,
	}
}

func (v *DefinitionsController) DecodeVIN(c *fiber.Ctx) error {
	targetURL := v.settings.DefinitionAPIURL.JoinPath("/device-definitions/decode-vin")

	return ProxyRequest(c, targetURL, c.Body(), v.logger)
}

func (v *DefinitionsController) TopDefinitions(c *fiber.Ctx) error {
	u := GetOracleURL(c, v.settings)
	targetURL := u.JoinPath("/v1/device-definitions/top")

	return ProxyRequest(c, targetURL, nil, v.logger)
}
