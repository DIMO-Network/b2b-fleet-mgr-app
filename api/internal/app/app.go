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
			return ErrorHandler(c, err, logger, settings.IsProduction())
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
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
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
	settingsCtrl := controllers.NewSettingsController(settings, logger)

	jwtAuth := jwtware.New(jwtware.Config{
		JWKSetURLs: []string{settings.JwtKeySetURL},
	})

	// just using regular auth, which works with the LIWD JWT
	// ideally this thing would be moved to the oracle
	app.Post("/v1/vehicles", jwtAuth, vehiclesCtrl.AddVehicles) // todo future: check that your wallet address has access to compass etc
	// devices-api proxy calls
	app.Get("/v1/user/devices/me", jwtAuth, vehiclesCtrl.GetDevicesAPIMe)
	app.Get("/v1/compass/device-by-vin/:vin", jwtAuth, vehiclesCtrl.GetDevicesAPICompassVINLookup)
	// minting via devices-api, vehicle NFT
	app.Get("/v1/user/devices/:userDeviceId/commands/mint", jwtAuth, vehiclesCtrl.GetDevicesAPIMint)
	app.Post("/v1/user/devices/:userDeviceId/commands/mint", jwtAuth, vehiclesCtrl.PostDevicesAPIMint)
	// synthetic device NFT minting, devices-api
	app.Get("/v1/user/devices/:userDeviceId/integrations/:integrationId/commands/mint", jwtAuth, vehiclesCtrl.GetDevicesAPISyntheticMint)
	app.Post("/v1/user/devices/:userDeviceId/integrations/:integrationId/commands/mint", jwtAuth, vehiclesCtrl.PostDevicesAPISyntheticMint)
	// this just creates the user_device in the table in devices-api
	app.Post("/v1/user/devices/fromvin", jwtAuth, vehiclesCtrl.PostDevicesAPIFromVin)
	app.Post("/v1/user/devices/:userDeviceId/integrations/:integrationId", jwtAuth, vehiclesCtrl.PostDevicesAPIRegisterIntegration)
	// settings the app needs to operate, pulled from config / env vars
	app.Get("/v1/settings", jwtAuth, settingsCtrl.GetSettings)
	app.Get("/v1/public/settings", settingsCtrl.GetPublicSettings)

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
func ErrorHandler(c *fiber.Ctx, err error, logger *zerolog.Logger, isProduction bool) error {
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
