package controllers

import (
	"net/url"

	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/config"
	"github.com/gofiber/fiber/v2"
)

func GetOracleURL(c *fiber.Ctx, s *config.Settings) *url.URL {
	oracleID := c.Locals("oracleID").(string)
	o := s.GetOracles()
	for _, oracle := range o {
		if oracle.OracleID == oracleID {
			return &oracle.URL
		}
	}
	return nil
}
