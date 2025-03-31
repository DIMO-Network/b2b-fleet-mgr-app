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
		DevicesAPIURL:  v.settings.DevicesAPIURL.String(),
		AccountsAPIURL: v.settings.AccountsAPIURL.String(),
		PaymasterURL:   v.settings.PaymasterURL.String(),
		RPCURL:         v.settings.RPCURL.String(),
		BundlerURL:     v.settings.BundlerURL.String(),
		Environment:    v.settings.Environment,
		TurnkeyOrgID:   v.settings.TurnkeyOrgID,
		TurnkeyAPIURL:  v.settings.TurnkeyAPIURL.String(),
		TurnkeyRPID:    v.settings.TurnkeyRPID,
	}

	return c.JSON(payload)
}

func (v *SettingsController) GetPublicSettings(c *fiber.Ctx) error {
	payload := PublicSettingsResponse{
		ClientID: v.settings.ClientID,
		LoginURL: v.settings.LoginURL.String(),
	}
	return c.JSON(payload)
}

type SettingsResponse struct {
	DevicesAPIURL  string `json:"devicesApiUrl"`
	AccountsAPIURL string `json:"accountsApiUrl"`
	PaymasterURL   string `json:"paymasterUrl"`
	RPCURL         string `json:"rpcUrl"`
	BundlerURL     string `json:"bundlerUrl"`
	Environment    string `json:"environment"`
	TurnkeyOrgID   string `json:"turnkeyOrgId"`
	TurnkeyAPIURL  string `json:"turnkeyApiUrl"`
	TurnkeyRPID    string `json:"turnkeyRpId"`
}

type PublicSettingsResponse struct {
	ClientID string `json:"clientId"`
	LoginURL string `json:"loginUrl"`
}
