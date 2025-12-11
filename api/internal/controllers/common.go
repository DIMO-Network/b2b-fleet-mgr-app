package controllers

import (
    "net/url"
    "regexp"
    "strings"

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

// stripOraclePrefix removes a leading "oracle/{name}" segment from a path.
// Examples:
//  - "oracle/foo/tenant" => "/tenant"
//  - "/oracle/foo/tenant" => "/tenant"
//  - "/bob" => "/bob"
//  - "bob" => "/bob"
//  - "/oracle/foo" => "/"
func stripOraclePrefix(p string) string {
    // Normalize nil/empty
    if p == "" {
        return "/"
    }

    // Remove a single leading slash for easier matching
    if strings.HasPrefix(p, "/") {
        p = p[1:]
    }

    // Match a leading oracle/{name} where {name} has no slash
    re := regexp.MustCompile(`^oracle/[^/]+`)
    if re.MatchString(p) {
        p = re.ReplaceAllString(p, "")
    }

    // Ensure leading slash and collapse to root if nothing left
    if p == "" {
        return "/"
    }
    if !strings.HasPrefix(p, "/") {
        p = "/" + p
    }
    return p
}
