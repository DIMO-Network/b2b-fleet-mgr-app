# DIMO Developer JWT Service

This service provides JWT authentication for DIMO Network APIs, ported from the TypeScript implementation in the [DIMO data-sdk](https://github.com/DIMO-Network/data-sdk/blob/master/src/api/functions/getDeveloperJwt.ts).

## Features

- **Automatic JWT Generation**: Creates ECDSA-signed JWTs for DIMO API authentication
- **Token Caching**: Automatically caches JWTs and refreshes them when needed
- **Public Key Registration**: Registers public keys with DIMO for JWT verification
- **Error Handling**: Comprehensive error handling and logging
- **HTTP Client Integration**: Uses the shared HTTP client wrapper for API calls

## Configuration

Add the following configuration to your `settings.yaml`:

```yaml
# DIMO JWT Configuration
DIMO_API_URL: "https://api.dimo.zone"
DIMO_CLIENT_ID: "your-dimo-client-id"
DIMO_CLIENT_SECRET: "your-dimo-client-secret"
```

## Usage

### Basic Usage

```go
package main

import (
    "time"
    "github.com/rs/zerolog"
    "your-project/internal/service"
)

func main() {
    logger := zerolog.New(zerolog.NewConsoleWriter()).With().Timestamp().Logger()
    
    config := service.DIMOJWTConfig{
        APIURL:       "https://api.dimo.zone",
        ClientID:     "your-client-id",
        ClientSecret: "your-client-secret",
        Timeout:      30 * time.Second,
    }
    
    jwtService := service.NewDIMOJWTService(logger, config)
    
    // Get a JWT token (will be cached and auto-refreshed)
    jwt, err := jwtService.GetDeveloperJWT()
    if err != nil {
        log.Fatal(err)
    }
    
    // Use the JWT for DIMO API calls
    fmt.Printf("JWT: %s\n", jwt)
}
```

### With HTTP Controller

```go
package controllers

import (
    "net/http"
    "your-project/internal/service"
)

func (c *DIMOController) GetDeveloperJWT(w http.ResponseWriter, r *http.Request) {
    jwt, err := c.jwtService.GetDeveloperJWT()
    if err != nil {
        http.Error(w, "Failed to get JWT", http.StatusInternalServerError)
        return
    }
    
    response := map[string]string{
        "access_token": jwt,
        "token_type":   "Bearer",
    }
    
    json.NewEncoder(w).Encode(response)
}
```

## API Endpoints

The service can be exposed through HTTP endpoints:

- `GET /dimo/developer-jwt` - Get a valid JWT token
- `POST /dimo/refresh-jwt` - Force refresh the JWT token

## JWT Structure

The generated JWT contains:

- **Header**: ES256 algorithm with compressed public key as `kid`
- **Payload**: 
  - `iss`: Client ID (issuer)
  - `sub`: Client ID (subject)
  - `aud`: DIMO API URL (audience)
  - `iat`: Issued at timestamp
  - `exp`: Expiration timestamp (1 hour)
  - `jti`: Unique JWT ID

## Security Features

- **ECDSA P-256 Signatures**: Uses elliptic curve cryptography for JWT signing
- **Key Rotation**: Generates new key pairs for each JWT
- **Public Key Registration**: Automatically registers public keys with DIMO
- **Token Expiration**: JWTs expire after 1 hour for security
- **Automatic Refresh**: Cached tokens are refreshed before expiration

## Error Handling

The service handles various error scenarios:

- Key generation failures
- JWT signing errors
- Public key registration failures
- HTTP request errors
- Token validation errors

All errors are logged with appropriate context for debugging.

## Dependencies

- `github.com/DIMO-Network/shared` - HTTP client wrapper
- `github.com/rs/zerolog` - Structured logging
- Standard Go crypto libraries for ECDSA operations

## Testing

The service can be tested by:

1. Setting up valid DIMO credentials
2. Calling `GetDeveloperJWT()` to verify token generation
3. Using the JWT with DIMO APIs to verify authentication
4. Testing token refresh functionality

## Migration from TypeScript

This Go implementation maintains compatibility with the TypeScript version:

- Same JWT structure and claims
- Same public key registration process
- Same error handling patterns
- Compatible with DIMO API authentication requirements

## Example Integration

See `api/examples/dimo_jwt_usage.go` for a complete example of how to integrate the DIMO JWT service into your application.
