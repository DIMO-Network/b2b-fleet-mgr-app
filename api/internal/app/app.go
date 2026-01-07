package app

import (
	"errors"
	"os"
	"strconv"

	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/config"
	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/controllers"
	"github.com/DIMO-Network/shared/middleware/metrics"
	jwtware "github.com/gofiber/contrib/jwt"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	fiberrecover "github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/rs/zerolog"
)

func App(settings *config.Settings, logger *zerolog.Logger) *fiber.App {
	// all the fiber logic here, routes, authorization
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			return ErrorHandler(c, err, logger)
		},
		DisableStartupMessage: true,
		ReadBufferSize:        16000,
		BodyLimit:             5 * 1024 * 1024,
	})
	app.Use(metrics.HTTPMetricsMiddleware)

	app.Use(fiberrecover.New(fiberrecover.Config{
		Next:              nil,
		EnableStackTrace:  true,
		StackTraceHandler: nil,
	}))

	app.Use(cors.New(cors.Config{
		AllowOrigins:     "https://localdev.dimo.org:3008", // localhost development
		AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS",
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization, Tenant-Id",
		AllowCredentials: true,
	}))

	// serve static content for production
	app.Get("/", loadStaticIndex)
	// btw we may need routes setup like we do in dimo-admin if we bring in a routing engine etc

	staticConfig := fiber.Static{
		Compress: true,
		MaxAge:   0,
		Index:    "index.html",
	}

	app.Static("/", "./dist", staticConfig)

	// application routes
	app.Get("/health", healthCheck)

	vehiclesCtrl := controllers.NewVehiclesController(settings, logger)
	identityCtrl := controllers.NewIdentityController(settings, logger)
	settingsCtrl := controllers.NewSettingsController(settings, logger)
	accountsCtrl := controllers.NewAccountsController(settings, logger)
	definitionsCtrl := controllers.NewDefinitionsController(settings, logger)
	genericProxyCtrl := controllers.NewGenericProxyController(settings, logger)

	jwtAuth := jwtware.New(jwtware.Config{
		JWKSetURLs: []string{settings.JwtKeySetURL.String()},
	})
	knownOracles := settings.GetOracles()

	// these are general to the app, not oracle specific
	app.Get("/public/settings", settingsCtrl.GetPublicSettings)
	app.Get("/public/oracles", settingsCtrl.GetOracles)
	app.Get("/identity/vehicle/:tokenID", identityCtrl.GetVehicleByTokenID)
	app.Get("/identity/definition/:id", identityCtrl.GetDefinitionByID)
	app.Post("/definitions/decodevin", jwtAuth, definitionsCtrl.DecodeVIN)

	// oracle group with route parameter.
	oracleApp := app.Group("/oracle/:oracleID", jwtAuth, oracleIDMiddleware(knownOracles))
	oracleApp.Get("/permissions", vehiclesCtrl.GetOraclePermissions)
	// pending vehicles
	oracleApp.Get("/pending-vehicles", vehiclesCtrl.GetPendingVehicles)
	oracleApp.Get("/pending-vehicle-telemetry/:imei", vehiclesCtrl.GetPendingVehicleTelemetry)
	oracleApp.Delete("/pending-vehicle-telemetry/:imei", vehiclesCtrl.ClearPendingVehicleTelemetry)
	oracleApp.Post("/pending-vehicle/command/:imei", vehiclesCtrl.SubmitCommand)

	oracleApp.Get("/vehicles", vehiclesCtrl.GetVehicles)
	oracleApp.Get("/vehicle/verify", vehiclesCtrl.GetVehiclesVerificationStatus)
	oracleApp.Post("/vehicle/verify", vehiclesCtrl.SubmitVehiclesVerification)

	oracleApp.Get("/definitions/top", definitionsCtrl.TopDefinitions)

	// Mint new vehicle
	oracleApp.Get("/vehicle/mint", vehiclesCtrl.GetVehiclesMintData)
	oracleApp.Get("/vehicle/mint/status", vehiclesCtrl.GetVehiclesMintStatus)
	oracleApp.Post("/vehicle/mint", vehiclesCtrl.SubmitVehiclesMintData)

	// Disconnect vehicle
	oracleApp.Get("/vehicle/disconnect", genericProxyCtrl.Proxy)
	oracleApp.Post("/vehicle/disconnect", vehiclesCtrl.SubmitDisconnectData)
	oracleApp.Get("/vehicle/disconnect/status", vehiclesCtrl.GetDisconnectStatus)

	// Transfer vehicle
	oracleApp.Get("/vehicle/transfer", vehiclesCtrl.GetTransferData)
	oracleApp.Post("/vehicle/transfer", vehiclesCtrl.SubmitTransferData)
	oracleApp.Get("/vehicle/transfer/status", vehiclesCtrl.GetTransferStatus)

	// Delete vehicle
	oracleApp.Get("/vehicle/delete", vehiclesCtrl.GetDeleteData)
	oracleApp.Post("/vehicle/delete", vehiclesCtrl.SubmitDeleteData)
	oracleApp.Get("/vehicle/delete/status", vehiclesCtrl.GetDeleteStatus)

	oracleApp.Get("/vehicle/:vin", vehiclesCtrl.GetVehicleFromOracle)
	oracleApp.Post("/vehicle/register", vehiclesCtrl.RegisterVehicle)

	// reset onboarding for deleted vehicles
	oracleApp.Delete("/vehicle/reset-onboarding/:imei", vehiclesCtrl.ResetOnboarding)
	oracleApp.Delete("/vehicle/force/:imei", genericProxyCtrl.Proxy)

	// accounts
	oracleApp.Get("/account", accountsCtrl.GetAccount)
	oracleApp.Post("/account", accountsCtrl.CreateAccount)
	oracleApp.Post("/auth/otp", accountsCtrl.InitOtpLogin)
	oracleApp.Put("/auth/otp", accountsCtrl.CompleteOtpLogin)

	// settings the app needs to operate, pulled from config / env vars
	oracleApp.Get("/settings", settingsCtrl.GetSettings) // todo some of these are oracle specific

	oracleApp.Get("/tenants", genericProxyCtrl.Proxy)
	oracleApp.Get("/tenant/settings", genericProxyCtrl.Proxy)
	oracleApp.Post("/tenant/settings", genericProxyCtrl.Proxy)

	return app
}

func healthCheck(c *fiber.Ctx) error {
	res := map[string]interface{}{
		"data": "Server is up and running",
	}

	err := c.JSON(res)

	if err != nil {
		return err
	}

	return nil
}

func loadStaticIndex(ctx *fiber.Ctx) error {
	dat, err := os.ReadFile("dist/index.html")
	if err != nil {
		return err
	}
	ctx.Set("Content-Type", "text/html; charset=utf-8")
	return ctx.Status(fiber.StatusOK).Send(dat)
}

// ErrorHandler custom handler to log recovered errors using our logger and return json instead of string
func ErrorHandler(c *fiber.Ctx, err error, logger *zerolog.Logger) error {
	code := fiber.StatusInternalServerError // Default 500 statuscode

	var e *fiber.Error
	isFiberErr := errors.As(err, &e)
	if isFiberErr {
		// Override status code if fiber.Error type
		code = e.Code
	}
	c.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
	codeStr := strconv.Itoa(code)

	if code != fiber.StatusNotFound {
		logger.Err(err).Str("httpStatusCode", codeStr).
			Str("httpMethod", c.Method()).
			Str("httpPath", c.Path()).
			Msg("caught an error from http request")
	}
	// return an opaque error if we're in a higher level environment and we haven't specified an fiber type err.
	//if !isFiberErr && isProduction {
	//	err = fiber.NewError(fiber.StatusInternalServerError, "Internal error")
	//}

	return c.Status(code).JSON(ErrorRes{
		Code:    code,
		Message: err.Error(),
	})
}

type ErrorRes struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Create a middleware to capture the oracleID parameter
func oracleIDMiddleware(oracles []config.Oracle) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Get the oracleID from the params
		oracleID := c.Params("oracleID")
		found := false
		for _, oracle := range oracles {
			if oracle.OracleID == oracleID {
				found = true
				break
			}
		}
		if !found {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid oracleID" + oracleID,
			})
		}
		// Store it in the locals for use in subsequent handlers
		c.Locals("oracleID", oracleID)

		// Continue to the next middleware/handler
		return c.Next()
	}
}
