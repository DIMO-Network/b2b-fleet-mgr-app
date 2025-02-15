package fleets

import (
	"context"
	"fmt"
	"strings"

	"google.golang.org/protobuf/types/known/emptypb"

	"buf.build/gen/go/nativeconnect/api/grpc/go/nativeconnect/api/v1/apiv1grpc"
	v1 "buf.build/gen/go/nativeconnect/api/protocolbuffers/go/nativeconnect/api/v1"
	"github.com/DIMO-Network/b2b-fleet-mgr-app/internal/config"
	"github.com/friendsofgo/errors"
	"github.com/rs/zerolog"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/metadata"
)

// todo token caching

type CompassSvc interface {
	AuthenticateCompass(ctx context.Context) (context.Context, error)
	AddVINs(ctx context.Context, vins []string, email string) ([]CompassAddVINStatus, error)
	CloseConnection() error
}
type compassSvc struct {
	settings   *config.Settings
	client     apiv1grpc.ServiceClient
	logger     *zerolog.Logger
	connection *grpc.ClientConn
}

// NewCompassSvc instantiates new session with connection to compass. Transient lifeclye mgmt, not singleton. Close the connection when done.
func NewCompassSvc(settings *config.Settings, logger *zerolog.Logger) (CompassSvc, error) {
	creds := credentials.NewClientTLSFromCert(nil, "") // Load the system's root CA pool

	conn, err := grpc.NewClient("dns:///nativeconnect.cloud:443", grpc.WithTransportCredentials(creds))
	if err != nil {
		return nil, errors.Wrap(err, "failed to connect to nativeconnect")
	}

	client := apiv1grpc.NewServiceClient(conn)
	return &compassSvc{
		settings:   settings,
		client:     client,
		logger:     logger,
		connection: conn,
	}, nil
}

func (cs *compassSvc) CloseConnection() error {
	return cs.connection.Close()
}

func (cs *compassSvc) AuthenticateCompass(ctx context.Context) (context.Context, error) {
	if cs.settings.CompassAPIKey == "" {
		return ctx, fmt.Errorf("no api key found")
	}
	authenticate, err := cs.client.Authenticate(ctx, &v1.AuthenticateRequest{Token: cs.settings.CompassAPIKey})
	if err != nil {
		return nil, errors.Wrap(err, "failed to authenticate with compass")
	}
	md := metadata.New(map[string]string{
		"authorization": "Bearer " + authenticate.AccessToken,
	})
	ctx = metadata.NewOutgoingContext(ctx, md)

	return ctx, nil
}

func (cs *compassSvc) GetVehicles(ctx context.Context) ([]CompassVehicle, error) {
	vehicles, err := cs.client.GetVehicles(ctx, &emptypb.Empty{})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get vehicles from compass")
	}
	if vehicles.ProviderGet != nil {
		items := make([]CompassVehicle, len(vehicles.ProviderGet))
		for i, request := range vehicles.ProviderGet {

			car := request.GetChrysler()
			items[i] = CompassVehicle{
				VIN:  car.GetVin(),
				Make: car.String(),
			}
		}
		return items, nil
	}
	return nil, errors.New("no vehicles found")
}

type CompassVehicle struct {
	VIN  string `json:"vin"`
	Make string `json:"make"`
}

func (cs *compassSvc) AddVINs(ctx context.Context, vins []string, email string) ([]CompassAddVINStatus, error) {
	consents := make([]*v1.Consent, len(vins))
	for i, vin := range vins {
		consents[i] = &v1.Consent{
			ProviderAuth: &v1.AuthRequest{Provider: &v1.AuthRequest_Vin{Vin: &v1.VinAuth{Vin: vin}}},
			Scopes:       make([]v1.Scope, v1.Scope_SCOPE_READ, v1.Scope_SCOPE_COMMAND),
			Region:       2, // North America
		}
	}
	vehicleSignUp, err := cs.client.BatchVehicleSignUp(ctx, &v1.BatchVehicleSignUpRequest{
		ConsentEmail: email,
		Consent:      consents,
	})

	joinedVins := strings.Join(vins, ", ")
	if err != nil {
		return nil, errors.Wrapf(err, "failed to add vehicle to compass: %s", joinedVins)
	}
	cs.logger.Info().Msgf("added vehicle to compass response: %s", vehicleSignUp)

	s := make([]CompassAddVINStatus, len(vehicleSignUp.VinWithStatuses))
	for i, status := range vehicleSignUp.VinWithStatuses {
		s[i].VIN = status.Vin
		s[i].Status = status.AddConsentStatus.Enum().String()
	}
	return s, nil
}

type CompassAddVINStatus struct {
	VIN    string `json:"vin"`
	Status string `json:"status"`
}
