package config

type Settings struct {
	Environment    string `yaml:"ENVIRONMENT"`
	CompassAPIKey  string `yaml:"COMPASS_API_KEY"`
	APIPort        int    `yaml:"API_PORT"`
	MonitoringPort int    `yaml:"MONITORING_PORT"`
	DevicesAPIURL  string `yaml:"DEVICES_API_URL"`
	PaymasterURL   string `yaml:"PAYMASTER_URL"`
	RPCURL         string `yaml:"RPC_URL"`
	BundlerURL     string `yaml:"BUNDLER_URL"`
}

func (s *Settings) IsProduction() bool {
	return s.Environment == "prod" // this string is set in the helm chart values-prod.yaml
}
