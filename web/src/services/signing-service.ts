import {SettingsService} from "@services/settings-service";
import {createAccount} from "@turnkey/viem";
import {createPublicClient, http} from "viem";
import {polygon, polygonAmoy} from "viem/chains";
import {signerToEcdsaValidator} from "@zerodev/ecdsa-validator";
import {getEntryPoint, KERNEL_V3_1} from "@zerodev/sdk/constants";
import {createKernelAccount} from "@zerodev/sdk";
import {ApiKeyStamper, Turnkey} from "@turnkey/sdk-browser";
import {decryptCredentialBundle, generateP256KeyPair, getPublicKey} from "@turnkey/crypto";
import {isEmpty} from "lodash";
import {TurnkeyClient} from "@turnkey/http";
import {uint8ArrayFromHexString, uint8ArrayToHexString} from "@turnkey/encoding";

const SIGNING_SERVICE_KEY = "signingServiceKey";
const SIGNING_SERVICE_SESSION_KEY = "signingServiceSession";
const SIGNING_SERVICE_WALLET_KEY = "signingServiceWallet";
const SESSION_TIME_S = 30 * 60;

// Nothing in the Turnkey/ZeroDev chain below imposes a deadline of its own: the passkey
// prompt (createReadWriteSession) is a WebAuthn call that can sit unresolved indefinitely,
// and the Turnkey and RPC fetches have no timeout either. An unbounded await here never
// settles the caller's promise, which leaves the calling modal spinning with no error and no
// network request — the failure mode is invisible in both the UI and the server logs.
const PASSKEY_TIMEOUT_MS = 120_000;
const NETWORK_TIMEOUT_MS = 30_000;

// withTimeout rejects if the operation has not settled in time. The underlying work is not
// cancellable (WebAuthn and fetch both keep running), so this bounds what the *caller* waits
// for rather than aborting the operation itself.
function withTimeout<T>(operation: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s. Please try again.`)),
            ms,
        );
        operation.then(
            value => {
                clearTimeout(timer);
                resolve(value);
            },
            error => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}

// SigningResult keeps `signature` and `error` on one non-discriminated shape, which is how
// every caller reads it (`if (!res.success || !res.signature) { ...res.error }`).
interface SigningResult {
    success: boolean;
    signature?: any;
    error?: string;
}

interface SigningServiceSession {
    organizationId: {
        organizationId: string;
        subOrganizationId: string;
    },
    session: {
        token: string;
        expiresAt: number;
    }
}

export class SigningService {
    private static instance = new SigningService();

    private settings: SettingsService;

    private constructor() {
        this.settings = SettingsService.getInstance();
    }

    public static getInstance(): SigningService {
        return SigningService.instance;
    }

    // The return type is stated explicitly so that callers can keep reading `.signature` and
    // `.error` off a single value; buildKernelAccount's discriminated union stays internal.
    public async signUserOperation(payload: any): Promise<SigningResult> {
        const settings = this.settings.privateSettings;
        const accountInfo = this.settings.accountInfo;

        if (!settings || !accountInfo) {
            return {
                success: false,
                error: "Signing service not configured"
            };
        }

        try {
            const kernelAccount = await this.buildKernelAccount(settings, accountInfo);
            if (!kernelAccount.success) {
                return kernelAccount;
            }

            const signature = await withTimeout(
                kernelAccount.account.signUserOperation(payload),
                PASSKEY_TIMEOUT_MS,
                "Signing the transaction",
            );
            return {
                success: true,
                signature: signature,
            };
        } catch (error: any) {
            console.error("Error message:", error.message);
            console.error("Stack trace:", error.stack);

            return {
                success: false,
                error: error.message || "An unexpected error occurred",
            };
        }
    }

    public async signTypedData(payload: any): Promise<SigningResult> {
        const settings = this.settings.privateSettings;
        const accountInfo = this.settings.accountInfo;

        if (!settings || !accountInfo) {
            return {
                success: false,
                error: "Signing service not configured"
            };
        }

        try {
            const kernelAccount = await this.buildKernelAccount(settings, accountInfo);
            if (!kernelAccount.success) {
                return kernelAccount;
            }

            const signature = await withTimeout(
                kernelAccount.account.signTypedData(payload),
                PASSKEY_TIMEOUT_MS,
                "Signing the transaction",
            );
            return {
                success: true,
                signature: signature,
            };
        } catch (error: any) {
            console.error("Error message:", error.message);
            console.error("Stack trace:", error.stack);

            return {
                success: false,
                error: error.message || "An unexpected error occurred",
            };
        }
    }

    // buildKernelAccount resolves the passkey session, wallet and ZeroDev kernel account that
    // both signing methods need. It is called from inside their try blocks: the passkey and
    // wallet steps can reject (a dismissed WebAuthn dialog rejects) and previously ran outside
    // any handler, so the rejection escaped to the click handler as an unhandled rejection and
    // the caller never saw a result at all.
    private async buildKernelAccount(
        settings: NonNullable<SettingsService["privateSettings"]>,
        accountInfo: NonNullable<SettingsService["accountInfo"]>,
    ): Promise<{success: true; account: any} | {success: false; error: string}> {
        const {turnkeyApiUrl, turnkeyOrgId, turnkeyRpId} = settings;
        const {subOrganizationId} = accountInfo;

        const turnkeyClient = await withTimeout(
            this.getTurnkeyClient(turnkeyApiUrl, turnkeyRpId, turnkeyOrgId, subOrganizationId),
            PASSKEY_TIMEOUT_MS,
            "Passkey authorization",
        );

        if (!turnkeyClient) {
            return {
                success: false,
                error: "Failed to get turnkey client"
            };
        }

        const wallet = await withTimeout(
            this.getTurnkeyWallet(turnkeyClient, subOrganizationId),
            NETWORK_TIMEOUT_MS,
            "Wallet lookup",
        );

        const turnkeyAccount = await createAccount({
            client: turnkeyClient,
            organizationId: accountInfo.subOrganizationId,
            signWith: wallet,
        });

        const publicClient = createPublicClient({
            transport: http(settings.rpcUrl),
            chain: settings.environment === 'prod' ? polygon : polygonAmoy,
        });

        const ecdsaValidator = await withTimeout(
            signerToEcdsaValidator(publicClient, {
                signer: turnkeyAccount,
                entryPoint: getEntryPoint("0.7"),
                kernelVersion: KERNEL_V3_1
            }),
            NETWORK_TIMEOUT_MS,
            "Validator setup",
        );

        const account = await withTimeout(
            createKernelAccount(publicClient, {
                plugins: {
                    sudo: ecdsaValidator,
                },
                entryPoint: getEntryPoint("0.7"),
                kernelVersion: KERNEL_V3_1,
            }),
            NETWORK_TIMEOUT_MS,
            "Account setup",
        );

        if (!account) {
            return {
                success: false,
                error: "Failed to build signing account",
            };
        }

        return {success: true, account};
    }

    public saveSession({ credentialBundle, privateKey }:{ credentialBundle: string; privateKey: string; }) {
        const nowInSeconds = Math.ceil(Date.now() / 1000);
        const settings = this.settings.privateSettings;
        const accountInfo = this.settings.accountInfo;

        if (!settings || !accountInfo) {
            return {
                success: false,
                error: "Signing service not configured"
            };
        }

        const { turnkeyOrgId } = settings;
        const {subOrganizationId} = accountInfo;

        this.storeKey(privateKey);

        const turnkeySession: SigningServiceSession = {
            organizationId: {
                organizationId: turnkeyOrgId,
                subOrganizationId: subOrganizationId,
            },
            session: {
                token: credentialBundle,
                expiresAt: (nowInSeconds + SESSION_TIME_S) * 1000,
            }
        };
        console.debug("Turnkey session:", turnkeySession);
        this.storeSession(turnkeySession);
    }

    private async getTurnkeyClient(apiUrl: string, rpId: string, orgId: string, subOrgId: string) {
        const session = this.getSessionIfValid();
        const sessionKey = this.getKey();

        if (session && sessionKey) {
            console.debug("Found valid session, using it");
            return await this.getTurnkeyClientFromSession(apiUrl, session, sessionKey);
        }

        console.debug("No valid session found, creating new session");
        this.logout(); // clear everything turnkey-related in local storage, we're building from scratch

        const turnkeyClient = new Turnkey({
            apiBaseUrl: apiUrl,
            defaultOrganizationId: orgId,
        });

        const passkeyClient = turnkeyClient.passkeyClient({
            rpId: rpId
        });

        const key = generateP256KeyPair();
        const targetPubHex = key.publicKeyUncompressed;
        const nowInSeconds = Math.ceil(Date.now() / 1000);

        const {credentialBundle} = await passkeyClient.createReadWriteSession({
            organizationId: subOrgId,
            targetPublicKey: targetPubHex,
            expirationSeconds: (nowInSeconds + SESSION_TIME_S).toString(),
        });

        if (isEmpty(credentialBundle)) {
            console.error("No credential bundle found");
            return;
        }

        this.storeKey(key.privateKey);

        const turnkeySession: SigningServiceSession = {
            organizationId: {
                organizationId: orgId,
                subOrganizationId: subOrgId,
            },
            session: {
                token: credentialBundle,
                expiresAt: (nowInSeconds + SESSION_TIME_S) * 1000,
            }
        };
        console.debug("Turnkey session:", turnkeySession);
        this.storeSession(turnkeySession);

        return await this.getTurnkeyClientFromSession(apiUrl, turnkeySession, key.privateKey);
    }


    private async getTurnkeyClientFromSession(apiUrl: string, session: SigningServiceSession, key: string) {
        const privateKey = decryptCredentialBundle(session.session.token, key);
        const publicKey = uint8ArrayToHexString(
            getPublicKey(uint8ArrayFromHexString(privateKey), true),
        );

        return new TurnkeyClient(
            {
                baseUrl: apiUrl,
            },
            new ApiKeyStamper({
                apiPublicKey: publicKey,
                apiPrivateKey: privateKey,
            }),
        );
    }

    private async getTurnkeyWallet(turnkeyClient: TurnkeyClient, subOrgId: string) {
        const wallet = this.getWallet();
        if (wallet) {
            return wallet;
        }

        const wallets = await turnkeyClient.getWallets({organizationId: subOrgId});
        wallets.wallets.forEach(wallet => {
            console.debug("Sub-Organization Wallet:", wallet);
        });

        const account = await turnkeyClient.getWalletAccounts({
            organizationId: subOrgId,
            walletId: wallets.wallets[0].walletId,
        });

        const userWallet = account.accounts[0].address;
        this.storeWallet(userWallet);
        console.debug("User wallet:", userWallet);
        return userWallet;
    }

    private logout() {
        this.clearSession();
        this.clearKey();
        this.clearWallet();
    }

    private getSessionIfValid(): SigningServiceSession | null {
        const session = this.getSession();
        if (!session) {
            return null;
        }
        if (session.session.expiresAt && session.session.expiresAt < Date.now()) {
            this.clearSession();
            return null;
        }
        return session;
    }

    private storeSession(session: SigningServiceSession) {
        localStorage.setItem(SIGNING_SERVICE_SESSION_KEY, JSON.stringify(session));
    }

    public getSession(): SigningServiceSession | null {
        const session = localStorage.getItem(SIGNING_SERVICE_SESSION_KEY);
        if (!session) {
            return null;
        }
        return JSON.parse(session);
    }

    private clearSession() {
        localStorage.removeItem(SIGNING_SERVICE_SESSION_KEY);
    }

    private storeKey(key: string) {
        localStorage.setItem(SIGNING_SERVICE_KEY, key);
    }

    private getKey(): string | null {
        return localStorage.getItem(SIGNING_SERVICE_KEY);
    }

    private clearKey() {
        localStorage.removeItem(SIGNING_SERVICE_KEY);
    }

    private storeWallet(wallet: string) {
        localStorage.setItem(SIGNING_SERVICE_WALLET_KEY, wallet);
    }

    private getWallet(): string | null {
        return localStorage.getItem(SIGNING_SERVICE_WALLET_KEY);
    }
    private clearWallet() {
        localStorage.removeItem(SIGNING_SERVICE_WALLET_KEY);
    }
}
