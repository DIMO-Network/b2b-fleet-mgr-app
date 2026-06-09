# b2b-fleet-mgr-app
Web App for managing onboarding and removing vehicles, and their status. Meant for B2B customers.

## notes
This uses Login with DIMO, using the redirect flow (no react component). Users sign in with their Passkey.

We use the transactions-sdk for signing payloads. 

B2B fleet users can use this to onboard their vehicles. Currently this is targeted mostly at fleets with Stellantis vehicles using the Motorq Oracle.

Can also serve as an example for developers wanting to build onboarding flows on DIMO, eg. Oracle onboarding vehicles flow. 

## Running locally

### Quick start

```
make dev
```

This is the one-command path: it checks `localdev.dimo.org` is in your hosts
file, ensures `api/settings.yaml` exists with `USE_DEV_CERTS: true`, installs web
deps if needed, then brings up the frontend (Vite + mkcert) and the Go backend
together. Ctrl-C tears both down. Run `make help` to see all targets
(`make web` / `make api` run either half alone).

First run still needs the prerequisites below — a hosts-file entry and the
mkcert root CA trusted (Vite installs the CA on first run, a one-time sudo
prompt). For features that need signing you'll also need the zerodev/RPC URLs
and keys in `api/settings.yaml`.

### Manual steps

1. Modify your hosts file to add a 127.0.0.1 entry for localdev.dimo.org . This should exist in the equivalent app configured in dimo dev console. 

2. Start the web app in the `web` folder. Install dependencies `$ npm i`, then start the vite server `$ npm run dev`.
   To mimmic prod deployment, run `$ npm run buld`, and then you can copy `dist` folder to the `api` folder and serve everything from Go server as in prod.
   You must run the dev server first because this is what will generate the certificates in the .mkcert folder. We develop locally with https for passkeys & stuff to work.

3. Start the backend in `api` folder. You'll need some settings.yaml, there is a sample. 
   For certain features you'll need the zerodev etc url's and key. `$ go run ./cmd/fleet-onboard-app`
   Backend will pull the https tls certs from the web folder /mkcert

4. Make sure `USE_DEV_CERTS: true` if you're running locally using the certificates (on the api side)

### Signing
For signing with a users Wallet to work, the Passkey needs to be brought up in this same web app, which means it will depend on the Relying Party ID to match the users
DIMO saved passkey with login with dimo. This means you need any subdomain of dimo.org. Locally you could mimic by modifying hosts file with 
something.dimo.org pointing to localhost and using the app from that url in your browser. Or just deploy and test from cloud. 
If you're a 3rd party building on DIMO and need to sign, there is an option to redirect to the DIMO login to handle signing payloads. 


## Helpful stuff along the way
https://www.w3.org/TR/webauthn-2/#rp-id
the rpid must be dimo.org basically

https://stackoverflow.com/questions/73617833/webauthn-the-relying-party-id-is-not-a-registrable-domain-suffix-of-nor-equal-t

to get components to build for transactions-sdk
https://www.npmjs.com/package/vite-plugin-node-polyfills





