package config

type Settings struct {
	Environment    string `yaml:"ENVIRONMENT"`
	UseDevCerts    bool   `yaml:"USE_DEV_CERTS"`
	CompassAPIKey  string `yaml:"COMPASS_API_KEY"`
	APIPort        int    `yaml:"API_PORT"`
	MonitoringPort int    `yaml:"MONITORING_PORT"`
	DevicesAPIURL  string `yaml:"DEVICES_API_URL"`
	PaymasterURL   string `yaml:"PAYMASTER_URL"`
	RPCURL         string `yaml:"RPC_URL"`
	BundlerURL     string `yaml:"BUNDLER_URL"`
	// used to mark the VIN as pre-approved / confirmed, in future could be used to create the vin in data provider storage side
	CompassPreSharedKey string `yaml:"COMPASS_PRE_SHARED_KEY"`
	JwtKeySetURL        string `yaml:"JWT_KEY_SET_URL"`
	ClientID            string `yaml:"CLIENT_ID"`
	LoginURL            string `yaml:"LOGIN_URL"`
	AccountsAPIURL      string `yaml:"ACCOUNTS_API_URL"`
}

func (s *Settings) IsProduction() bool {
	return s.Environment == "prod" // this string is set in the helm chart values-prod.yaml
}
