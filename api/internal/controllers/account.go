package controllers

import (
	"fmt"

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
	u := a.settings.AccountsAPIURL
	targetURL := u.JoinPath(fmt.Sprintf("/api/account/%s", c.Params("emailOrWallet", "")))

	// get developer jwt token

	return ProxyRequest(c, targetURL, nil, a.logger)
}

func (a *AccountsController) CreateAccount(c *fiber.Ctx) error {
	u := a.settings.AccountsAPIURL
	targetURL := u.JoinPath("/api/account")

	return ProxyRequest(c, targetURL, c.Body(), a.logger)
}
