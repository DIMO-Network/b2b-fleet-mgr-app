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

    public async signUserOperation(payload: any) {
        const settings = this.settings.privateSettings;
        const accountInfo = this.settings.accountInfo;

        if (!settings || !accountInfo) {
            return {
                success: false,
                error: "Signing service not configured"
            }
        }

        const {turnkeyApiUrl, turnkeyOrgId, turnkeyRpId} = settings;
        const {subOrganizationId} = accountInfo;

        const turnkeyClient = await this.getTurnkeyClient(turnkeyApiUrl, turnkeyRpId, turnkeyOrgId, subOrganizationId);

        if (!turnkeyClient) {
            return {
                success: false,
                error: "Failed to get turnkey client"
            }
        }

        const wallet = await this.getTurnkeyWallet(turnkeyClient, subOrganizationId);

        try {
            const turnkeyAccount = await createAccount({
                client: turnkeyClient,
                organizationId: accountInfo.subOrganizationId,
                signWith: wallet,
            });

            const publicClient = createPublicClient({
                transport: http(settings.rpcUrl),
                chain: settings.environment === 'prod' ? polygon : polygonAmoy,
            });

            const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
                signer: turnkeyAccount,
                entryPoint: getEntryPoint("0.7"),
                kernelVersion: KERNEL_V3_1
            });

            const kernelAccount = await createKernelAccount(publicClient, {
                plugins: {
                    sudo: ecdsaValidator,
                },
                entryPoint: getEntryPoint("0.7"),
                kernelVersion: KERNEL_V3_1,
            });
            const signature = await kernelAccount?.signUserOperation(payload);
            return {
                success: true,
                signature: signature,
            }
        } catch (error: any) {
            console.error("Error message:", error.message);
            console.error("Stack trace:", error.stack);

            return {
                success: false,
                error: error.message || "An unexpected error occurred",
            }
        }
    }


    public async signTypedData(payload: any) {
        const settings = this.settings.privateSettings;
        const accountInfo = this.settings.accountInfo;

        if (!settings || !accountInfo) {
            return {
                success: false,
                error: "Signing service not configured"
            }
        }

        const {turnkeyApiUrl, turnkeyOrgId, turnkeyRpId} = settings;
        const {subOrganizationId} = accountInfo;

        const turnkeyClient = await this.getTurnkeyClient(turnkeyApiUrl, turnkeyRpId, turnkeyOrgId, subOrganizationId);

        if (!turnkeyClient) {
            return {
                success: false,
                error: "Failed to get turnkey client"
            }
        }

        const wallet = await this.getTurnkeyWallet(turnkeyClient, subOrganizationId);

        try {
            const turnkeyAccount = await createAccount({
                client: turnkeyClient,
                organizationId: accountInfo.subOrganizationId,
                signWith: wallet,
            });

            const publicClient = createPublicClient({
                transport: http(settings.rpcUrl),
                chain: settings.environment === 'prod' ? polygon : polygonAmoy,
            });

            const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
                signer: turnkeyAccount,
                entryPoint: getEntryPoint("0.7"),
                kernelVersion: KERNEL_V3_1
            });

            const kernelAccount = await createKernelAccount(publicClient, {
                plugins: {
                    sudo: ecdsaValidator,
                },
                entryPoint: getEntryPoint("0.7"),
                kernelVersion: KERNEL_V3_1,
            });
            const signature = await kernelAccount?.signTypedData(payload);
            return {
                success: true,
                signature: signature,
            }
        } catch (error: any) {
            console.error("Error message:", error.message);
            console.error("Stack trace:", error.stack);

            return {
                success: false,
                error: error.message || "An unexpected error occurred",
            }
        }
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
        }
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

        const wallets = await turnkeyClient.getWallets({organizationId: subOrgId})
        wallets.wallets.forEach(wallet => {
            console.debug("Sub-Organization Wallet:", wallet);
        })

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
