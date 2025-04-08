package service

import (
	"encoding/json"
	"errors"
	"io"
	"time"

	"github.com/DIMO-Network/shared"
	"github.com/rs/zerolog"
)

var ErrBadRequest = errors.New("bad request")

type IdentityAPI interface {
	GetDefinitionByID(id string) ([]byte, error)
}

type identityAPIService struct {
	apiURL     string
	httpClient shared.HTTPClientWrapper
	logger     zerolog.Logger
}

func NewIdentityAPIService(logger zerolog.Logger, identityAPIURL string) IdentityAPI {
	h := map[string]string{}
	h["Content-Type"] = "application/json"
	hcw, _ := shared.NewHTTPClientWrapper("", "", 10*time.Second, h, false, shared.WithRetry(3))

	// Initialize cache with a default expiration time of 10 minutes and cleanup interval of 15 minutes

	return &identityAPIService{
		httpClient: hcw,
		apiURL:     identityAPIURL,
		logger:     logger,
	}
}

func (i *identityAPIService) GetDefinitionByID(id string) ([]byte, error) {
	// GraphQL query
	graphqlQuery := `{
	deviceDefinition(by: {id: "` + id + `"}) {
		model,
    	year,
    	manufacturer {
      		name
    	}
  	}
}`

	body, err := i.Query(graphqlQuery)
	if err != nil {
		return nil, err
	}

	return body, nil
}

func (i *identityAPIService) Query(graphqlQuery string) ([]byte, error) {
	requestPayload := GraphQLRequest{Query: graphqlQuery}
	payloadBytes, err := json.Marshal(requestPayload)
	if err != nil {
		return nil, err
	}

	resp, err := i.httpClient.ExecuteRequest(i.apiURL, "POST", payloadBytes)
	if err != nil {
		i.logger.Err(err).Msg("Failed to send POST request")
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 400 {
		return nil, ErrBadRequest
	}

	// Read the response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		i.logger.Err(err).Msgf("Failed to read response body")
		return nil, err
	}

	return body, nil
}

type GraphQLRequest struct {
	Query string `json:"query"`
}
