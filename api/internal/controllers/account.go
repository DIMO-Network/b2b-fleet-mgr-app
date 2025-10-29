package controllers

import (
	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/config"
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
)

type AccountsController struct {
	settings *config.Settings
	logger   *zerolog.Logger
}

func NewAccountsController(settings *config.Settings, logger *zerolog.Logger) *AccountsController {
	return &AccountsController{
		settings: settings,
		logger:   logger,
	}
}

// GetAccount can get by email or 0x
func (a *AccountsController) GetAccount(c *fiber.Ctx) error {
	u := GetOracleURL(c, a.settings)
	targetURL := u.JoinPath("/v1/account")

	// Add the query string from the original request
	targetURL.RawQuery = string(c.Request().URI().QueryString())

	return ProxyRequest(c, targetURL, nil, a.logger)
}

func (a *AccountsController) CreateAccount(c *fiber.Ctx) error {
	u := GetOracleURL(c, a.settings)
	targetURL := u.JoinPath("/v1/account")

	return ProxyRequest(c, targetURL, c.Body(), a.logger)
}

func (a *AccountsController) InitOtpLogin(c *fiber.Ctx) error {
	u := a.settings.AccountsAPIURL
	targetURL := u.JoinPath("/api/auth/otp")
	return ProxyRequest(c, targetURL, c.Body(), a.logger)
}

func (a *AccountsController) CompleteOtpLogin(c *fiber.Ctx) error {
	u := a.settings.AccountsAPIURL
	targetURL := u.JoinPath("api/auth/otp")
	return ProxyRequest(c, targetURL, c.Body(), a.logger)
}
