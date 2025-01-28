package main

import (
	"context"
	"fmt"
	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/app"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/adaptor"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"golang.org/x/sync/errgroup"
	"os"
	"os/signal"
	"strconv"

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

	monApp := createMonitoringServer(strconv.Itoa(settings.MonitoringPort))
	group, gCtx := errgroup.WithContext(ctx)
	// todo need something where we define the fiber app server
	webAPI := app.App()

	logger.Info().Str("port", strconv.Itoa(settings.MonitoringPort)).Msgf("Starting monitoring server")
	runFiber(gCtx, monApp, ":"+strconv.Itoa(settings.MonitoringPort), group)
	logger.Info().Str("port", strconv.Itoa(settings.APIPort)).Msgf("Starting web server")
	runFiber(gCtx, webAPI, ":"+strconv.Itoa(settings.APIPort), group)

	if err := group.Wait(); err != nil {
		logger.Fatal().Err(err).Msg("Server failed.")
	}
	logger.Info().Msg("Server stopped.")
}

func runFiber(ctx context.Context, fiberApp *fiber.App, addr string, group *errgroup.Group) {
	group.Go(func() error {
		if err := fiberApp.Listen(addr); err != nil {
			return fmt.Errorf("failed to start server: %w", err)
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

func createMonitoringServer(port string) *fiber.App {
	monApp := fiber.New(fiber.Config{DisableStartupMessage: true})

	monApp.Get("/", func(*fiber.Ctx) error { return nil })
	monApp.Get("/metrics", adaptor.HTTPHandler(promhttp.Handler()))

	return monApp
}
