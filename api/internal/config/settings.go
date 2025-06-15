package config

import "net/url"

type Settings struct {
	Environment        string  `yaml:"ENVIRONMENT"`
	UseDevCerts        bool    `yaml:"USE_DEV_CERTS"`
	APIPort            int     `yaml:"API_PORT"`
	MonitoringPort     int     `yaml:"MONITORING_PORT"`
	MotorqOracleAPIURL url.URL `yaml:"MOTORQ_ORACLE_API_URL"`
	StaexOracleAPIURL  url.URL `yaml:"STAEX_ORACLE_API_URL"`
	IdentityAPIURL     url.URL `yaml:"IDENTITY_API_URL"`

	PaymasterURL  url.URL `yaml:"PAYMASTER_URL"`
	RPCURL        url.URL `yaml:"RPC_URL"`
	BundlerURL    url.URL `yaml:"BUNDLER_URL"`
	TurnkeyOrgID  string  `yaml:"TURNKEY_ORG_ID"`
	TurnkeyAPIURL url.URL `yaml:"TURNKEY_API_URL"`
	TurnkeyRPID   string  `yaml:"TURNKEY_RP_ID"`

	JwtKeySetURL   url.URL `yaml:"JWT_KEY_SET_URL"`
	ClientID       string  `yaml:"CLIENT_ID"`
	LoginURL       url.URL `yaml:"LOGIN_URL"`
	AccountsAPIURL url.URL `yaml:"ACCOUNTS_API_URL"`
}

func (s *Settings) IsProduction() bool {
	return s.Environment == "prod" // this string is set in the helm chart values-prod.yaml
}

func (s *Settings) GetOracles() []Oracle {
	return []Oracle{
		{
			Name:     "MotorQ",
			OracleID: "motorq",
			URL:      s.MotorqOracleAPIURL,
		},
		{
			Name:     "Staex",
			OracleID: "staex",
			URL:      s.StaexOracleAPIURL,
		},
	}
}

type Oracle struct {
	Name     string  `json:"name"`
	OracleID string  `json:"oracleId"`
	URL      url.URL `json:"-"`
}
