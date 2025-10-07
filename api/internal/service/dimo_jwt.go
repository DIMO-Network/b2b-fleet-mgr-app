package service

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/DIMO-Network/shared"
	"github.com/rs/zerolog"
)

// DIMOJWTService handles DIMO developer JWT authentication
type DIMOJWTService interface {
	GetDeveloperJWT() (string, error)
	RefreshJWT() (string, error)
}

type dimoJWTService struct {
	apiURL       string
	clientID     string
	clientSecret string
	httpClient   shared.HTTPClientWrapper
	logger       zerolog.Logger
	cachedJWT    string
	jwtExpiry    time.Time
}

// DIMOJWTConfig holds configuration for DIMO JWT service
type DIMOJWTConfig struct {
	APIURL       string
	ClientID     string
	ClientSecret string
	Timeout      time.Duration
}

// NewDIMOJWTService creates a new DIMO JWT service
func NewDIMOJWTService(logger zerolog.Logger, config DIMOJWTConfig) DIMOJWTService {
	headers := map[string]string{
		"Content-Type": "application/json",
		"Accept":       "application/json",
	}

	timeout := config.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}

	httpClient, _ := shared.NewHTTPClientWrapper("", "", timeout, headers, false, shared.WithRetry(3))

	return &dimoJWTService{
		apiURL:       config.APIURL,
		clientID:     config.ClientID,
		clientSecret: config.ClientSecret,
		httpClient:   httpClient,
		logger:       logger,
	}
}

// GetDeveloperJWT retrieves a valid JWT token, refreshing if necessary
func (d *dimoJWTService) GetDeveloperJWT() (string, error) {
	// Check if we have a valid cached JWT
	if d.cachedJWT != "" && time.Now().Before(d.jwtExpiry) {
		return d.cachedJWT, nil
	}

	// Generate new JWT
	return d.RefreshJWT()
}

// RefreshJWT generates a new JWT token
func (d *dimoJWTService) RefreshJWT() (string, error) {
	d.logger.Info().Msg("Generating new DIMO developer JWT")

	// Generate ECDSA key pair
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		d.logger.Err(err).Msg("Failed to generate ECDSA key pair")
		return "", fmt.Errorf("failed to generate key pair: %w", err)
	}

	// Get public key in compressed format
	publicKeyBytes := elliptic.MarshalCompressed(elliptic.P256(), privateKey.X, privateKey.Y)
	publicKeyHex := hex.EncodeToString(publicKeyBytes)

	// Create JWT payload
	now := time.Now()
	payload := map[string]interface{}{
		"iss": d.clientID,
		"sub": d.clientID,
		"aud": d.apiURL,
		"iat": now.Unix(),
		"exp": now.Add(1 * time.Hour).Unix(), // 1 hour expiry
		"jti": generateJTI(),
	}

	// Create JWT header
	header := map[string]interface{}{
		"alg": "ES256",
		"typ": "JWT",
		"kid": publicKeyHex,
	}

	// Encode header and payload
	headerBytes, _ := json.Marshal(header)
	payloadBytes, _ := json.Marshal(payload)

	headerB64 := base64.RawURLEncoding.EncodeToString(headerBytes)
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadBytes)

	// Create signing input
	signingInput := headerB64 + "." + payloadB64

	// Sign the JWT
	signature, err := d.signJWT(signingInput, privateKey)
	if err != nil {
		d.logger.Err(err).Msg("Failed to sign JWT")
		return "", fmt.Errorf("failed to sign JWT: %w", err)
	}

	signatureB64 := base64.RawURLEncoding.EncodeToString(signature)
	jwt := signingInput + "." + signatureB64

	// Register the public key with DIMO
	if err := d.registerPublicKey(publicKeyHex); err != nil {
		d.logger.Err(err).Msg("Failed to register public key with DIMO")
		return "", fmt.Errorf("failed to register public key: %w", err)
	}

	// Cache the JWT
	d.cachedJWT = jwt
	d.jwtExpiry = now.Add(55 * time.Minute) // Cache for 55 minutes (5 min buffer)

	d.logger.Info().Msg("Successfully generated and cached DIMO developer JWT")
	return jwt, nil
}

// signJWT signs the JWT using ECDSA
func (d *dimoJWTService) signJWT(signingInput string, privateKey *ecdsa.PrivateKey) ([]byte, error) {
	hash := sha256.Sum256([]byte(signingInput))

	r, s, err := ecdsa.Sign(rand.Reader, privateKey, hash[:])
	if err != nil {
		return nil, err
	}

	// Convert to DER format
	signature := make([]byte, 64)
	rBytes := r.Bytes()
	sBytes := s.Bytes()

	copy(signature[32-len(rBytes):32], rBytes)
	copy(signature[64-len(sBytes):64], sBytes)

	return signature, nil
}

// registerPublicKey registers the public key with DIMO
func (d *dimoJWTService) registerPublicKey(publicKeyHex string) error {
	registrationURL := d.apiURL + "/developer/register-key"

	payload := map[string]string{
		"client_id":  d.clientID,
		"public_key": publicKeyHex,
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal registration payload: %w", err)
	}

	resp, err := d.httpClient.ExecuteRequest(registrationURL, "POST", payloadBytes)
	if err != nil {
		return fmt.Errorf("failed to execute registration request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("registration failed with status %d: %s", resp.StatusCode, string(body))
	}

	d.logger.Info().Msg("Successfully registered public key with DIMO")
	return nil
}

// generateJTI generates a unique JWT ID
func generateJTI() string {
	// Generate a random 16-byte JTI
	bytes := make([]byte, 16)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// DIMOJWTResponse represents the response from DIMO JWT endpoints
type DIMOJWTResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
	Scope       string `json:"scope,omitempty"`
}

// DIMOErrorResponse represents error responses from DIMO API
type DIMOErrorResponse struct {
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description,omitempty"`
	ErrorURI         string `json:"error_uri,omitempty"`
}
