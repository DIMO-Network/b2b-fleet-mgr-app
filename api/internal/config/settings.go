package config

import "net/url"

type Settings struct {
	Environment             string  `yaml:"ENVIRONMENT"`
	UseDevCerts             bool    `yaml:"USE_DEV_CERTS"`
	CompassAPIKey           string  `yaml:"COMPASS_API_KEY"`
	APIPort                 int     `yaml:"API_PORT"`
	MonitoringPort          int     `yaml:"MONITORING_PORT"`
	DevicesAPIURL           url.URL `yaml:"DEVICES_API_URL"`
	DeviceDefinitionsAPIURL url.URL `yaml:"DEVICE_DEFINITIONS_API_URL"`
	OracleAPIURL            url.URL `yaml:"ORACLE_API_URL"`
	IdentityAPIURL          url.URL `yaml:"IDENTITY_API_URL"`

	PaymasterURL  url.URL `yaml:"PAYMASTER_URL"`
	RPCURL        url.URL `yaml:"RPC_URL"`
	BundlerURL    url.URL `yaml:"BUNDLER_URL"`
	TurnkeyOrgID  string  `yaml:"TURNKEY_ORG_ID"`
	TurnkeyAPIURL url.URL `yaml:"TURNKEY_API_URL"`
	TurnkeyRPID   string  `yaml:"TURNKEY_RP_ID"`

	// used to mark the VIN as pre-approved / confirmed, in future could be used to create the vin in data provider storage side
	CompassPreSharedKey string  `yaml:"COMPASS_PRE_SHARED_KEY"`
	JwtKeySetURL        url.URL `yaml:"JWT_KEY_SET_URL"`
	ClientID            string  `yaml:"CLIENT_ID"`
	LoginURL            url.URL `yaml:"LOGIN_URL"`
	AccountsAPIURL      url.URL `yaml:"ACCOUNTS_API_URL"`
}

func (s *Settings) IsProduction() bool {
	return s.Environment == "prod" // this string is set in the helm chart values-prod.yaml
}
