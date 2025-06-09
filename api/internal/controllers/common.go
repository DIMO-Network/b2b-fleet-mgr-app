package controllers

import (
	"fmt"
	"net/url"

	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/config"
	"github.com/gofiber/fiber/v2"
)

func GetOracleURL(c *fiber.Ctx, s *config.Settings) (*url.URL, error) {
	oracleID := c.Locals("oracleID").(string)
	switch oracleID {
	case "motorq":
		return &s.MotorqOracleAPIURL, nil
	case "staex":
		return &s.StaexOracleAPIURL, nil
	}
	return nil, fmt.Errorf("unknown oracle id in path")
}
