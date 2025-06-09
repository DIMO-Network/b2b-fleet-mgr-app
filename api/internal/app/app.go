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
		JWKSetURLs: []string{settings.JwtKeySetURL.String()},
	})

	// just using regular auth, which works with the LIWD JWT

	// oracle group with route parameter.
	// todo way to expose the oracleID to all underlying calls
	// todo do we keep the /v1 , thinking doesn't make sense in the context since this is a tightly coupled bff
	oracleApp := app.Group("/oracle/:oracleID", jwtAuth)
	oracleApp.Get("/v1/vehicles", jwtAuth, vehiclesCtrl.GetVehicles)

	oracleApp.Get("/v1/vehicle/verify", jwtAuth, vehiclesCtrl.GetVehiclesVerificationStatus)
	oracleApp.Post("/v1/vehicle/verify", jwtAuth, vehiclesCtrl.SubmitVehiclesVerification)

	oracleApp.Get("/v1/vehicle/mint", jwtAuth, vehiclesCtrl.GetVehiclesMintData)
	oracleApp.Get("/v1/vehicle/mint/status", jwtAuth, vehiclesCtrl.GetVehiclesMintStatus)
	oracleApp.Post("/v1/vehicle/mint", jwtAuth, vehiclesCtrl.SubmitVehiclesMintData)

	oracleApp.Get("/v1/vehicle/disconnect", jwtAuth, vehiclesCtrl.GetDisconnectData)
	oracleApp.Post("/v1/vehicle/disconnect", jwtAuth, vehiclesCtrl.SubmitDisconnectData)
	oracleApp.Get("/v1/vehicle/disconnect/status", jwtAuth, vehiclesCtrl.GetDisconnectStatus)

	oracleApp.Get("/v1/vehicle/:vin", jwtAuth, vehiclesCtrl.GetVehicleFromOracle)
	oracleApp.Post("/v1/vehicle/register", jwtAuth, vehiclesCtrl.RegisterVehicle)

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
