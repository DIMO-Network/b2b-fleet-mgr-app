import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient } from '@zerodev/sdk';
import { getEntryPoint, KERNEL_V3_1 } from '@zerodev/sdk/constants';
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator';
import { createPublicClient, http, zeroAddress, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { polygon, polygonAmoy } from 'viem/chains';
import { ApiService } from '@services/api-service.ts';
import { SettingsService } from '@services/settings-service.ts';
import { ApiResponse } from '@datatypes/api-response.ts';

/**
 * The tenancy service's readback for the tenant's AA fleet wallet: the
 * EFFECTIVE wallet the tenant resolves to, never any key material.
 * credentialTenantId names the holder so the card can tell "configured here"
 * from "inherited from the licence-holding tenant".
 */
export interface AAWalletStatus {
    configured: boolean;
    walletAddress?: string;
    credentialTenantId?: string;
}

/** What the generate flow hands back — held in memory only, submitted, dropped. */
export interface GeneratedWallet {
    walletAddress: string;
    privateKey: string;
}

/**
 * AAWalletService talks to the tenancy service (through the oracle proxy)
 * about the tenant's AA fleet wallet, and can generate a fresh one in the
 * browser.
 *
 * The write path is deliberately shaped so the private key exists in exactly
 * two places, briefly: this page's memory, and the PUT body on its way to the
 * tenancy service — which validates the wallet on chain, stores the key
 * encrypted, and never returns it. Nothing here persists the key: not
 * localStorage, not the console, not an error message.
 */
export class AAWalletService {
    static instance = new AAWalletService();

    private api = ApiService.getInstance();
    private settings = SettingsService.getInstance();

    static getInstance() {
        return AAWalletService.instance;
    }

    async fetchStatus(): Promise<ApiResponse<AAWalletStatus>> {
        return this.api.callApi<AAWalletStatus>('GET', '/tenant/aa-wallet', null, true);
    }

    async set(walletAddress: string, privateKey: string): Promise<ApiResponse<AAWalletStatus>> {
        return this.api.callApi<AAWalletStatus>('PUT', '/tenant/aa-wallet', { walletAddress, privateKey }, true);
    }

    async clear(): Promise<ApiResponse<void>> {
        return this.api.callApi<void>('DELETE', '/tenant/aa-wallet', null, true);
    }

    /**
     * Generates a fresh fleet wallet: a new root key, its Kernel v3.1
     * counterfactual account, and a sponsored no-op UserOperation that deploys
     * it — the same flow as DIMO's wallet-creator, on this app's configured
     * RPC/bundler/paymaster. Deployment matters: the tenancy service refuses
     * an undeployed kernel, because its signer cannot deploy one later.
     *
     * The caller gets the address and the key, PUTs them, and must drop the
     * key — it is the wallet's sudo validator and there is no recovering it.
     */
    async generate(onProgress?: (step: string) => void): Promise<GeneratedWallet> {
        const step = (s: string) => onProgress?.(s);

        const settings = this.settings.privateSettings ?? (await this.settings.fetchPrivateSettings());
        if (!settings?.rpcUrl || !settings?.bundlerUrl || !settings?.paymasterUrl) {
            throw new Error('App settings are missing the RPC/bundler/paymaster URLs');
        }
        const chain = settings.environment === 'prod' ? polygon : polygonAmoy;

        step('Generating key');
        const privateKey = generatePrivateKey();
        const signer = privateKeyToAccount(privateKey);

        step('Deriving the smart account');
        const publicClient = createPublicClient({ transport: http(settings.rpcUrl), chain });
        const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
            signer,
            entryPoint: getEntryPoint('0.7'),
            kernelVersion: KERNEL_V3_1,
        });
        const account = await createKernelAccount(publicClient, {
            plugins: { sudo: ecdsaValidator },
            entryPoint: getEntryPoint('0.7'),
            kernelVersion: KERNEL_V3_1,
        });

        const paymaster = createZeroDevPaymasterClient({ chain, transport: http(settings.paymasterUrl) });
        const kernelClient = createKernelAccountClient({
            account,
            chain,
            bundlerTransport: http(settings.bundlerUrl),
            client: publicClient,
            paymaster: {
                getPaymasterData(userOperation) {
                    return paymaster.sponsorUserOperation({ userOperation });
                },
            },
        });

        step('Deploying (sponsored — no gas from you)');
        const userOpHash = await kernelClient.sendUserOperation({
            callData: await account.encodeCalls([{ to: zeroAddress, value: BigInt(0), data: '0x' as Hex }]),
        });

        step('Waiting for the deployment to land');
        await kernelClient.waitForUserOperationReceipt({ hash: userOpHash, timeout: 60_000 });

        return { walletAddress: account.address, privateKey };
    }
}
