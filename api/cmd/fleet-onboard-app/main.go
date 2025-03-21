package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"strconv"

	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/app"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/adaptor"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"golang.org/x/sync/errgroup"

	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/config"
	"github.com/DIMO-Network/shared"
	"github.com/rs/zerolog"
)

func main() {
	logger := zerolog.New(os.Stdout).With().Timestamp().Str("app", "b2b-fleet-mgr-api").Logger()
	settings, err := shared.LoadConfig[config.Settings]("settings.yaml")
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to load settings")
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()

	monApp := createMonitoringServer()
	group, gCtx := errgroup.WithContext(ctx)
	webAPI := app.App(&settings, &logger)

	logger.Info().Str("port", strconv.Itoa(settings.MonitoringPort)).Msgf("Starting monitoring server %d", settings.MonitoringPort)
	runFiber(gCtx, monApp, ":"+strconv.Itoa(settings.MonitoringPort), group, false)

	logger.Info().Str("port", strconv.Itoa(settings.APIPort)).Msgf("Starting web server %d", settings.APIPort)
	runFiber(gCtx, webAPI, ":"+strconv.Itoa(settings.APIPort), group, settings.UseDevCerts)

	if err := group.Wait(); err != nil {
		logger.Fatal().Err(err).Msg("Server failed.")
	}
	logger.Info().Msg("Server stopped.")
}

func runFiber(ctx context.Context, fiberApp *fiber.App, addr string, group *errgroup.Group, useTLS bool) {
	group.Go(func() error {
		if useTLS {
			if err := fiberApp.ListenTLS("localdev.dimo.org"+addr, "../web/.mkcert/cert.pem", "../web/.mkcert/dev.pem"); err != nil {
				return fmt.Errorf("failed to start server: %w", err)
			}
		} else {
			if err := fiberApp.Listen(addr); err != nil {
				return fmt.Errorf("failed to start server: %w", err)
			}
		}
		return nil
	})
	group.Go(func() error {
		<-ctx.Done()
		if err := fiberApp.Shutdown(); err != nil {
			return fmt.Errorf("failed to shutdown server: %w", err)
		}
		return nil
	})
}

func createMonitoringServer() *fiber.App {
	monApp := fiber.New(fiber.Config{DisableStartupMessage: true})

	monApp.Get("/", func(*fiber.Ctx) error { return nil })
	monApp.Get("/metrics", adaptor.HTTPHandler(promhttp.Handler()))

	return monApp
}
