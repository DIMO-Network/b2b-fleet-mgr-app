import {LitElement} from 'lit';
import {msg} from '@lit/localize';
import { property, state} from "lit/decorators.js";
import {ApiService} from "@services/api-service.ts";
import {SigningService} from "@services/signing-service.ts";
import './session-timer';
import qs from 'qs';
import {range} from "lodash";
import {delay, Result} from "@utils/utils";

interface VinOnboardingStatus {
    vin: string;
    status: string;
    details: string;
}

interface VinsOnboardingResult {
    statuses: VinOnboardingStatus[];
}

interface VinMintData {
    vin: string;
    typedData: any;
    signature?: string;
}

interface VinsMintDataResult {
    vinMintingData: VinMintData[];
}

export interface VehicleWithDefinition {
    vin: string;
    definition: string;
}

export interface SacdInput {
    grantee: `0x${string}`;
    permissions: bigint;
    expiration: bigint;
    source: string
}

export interface VinUserOperationData {
    vin: string;
    imei: string;
    userOperation: object;
    hash: string;
    signature?: string;
}

export interface VinTransferResponse {
    jobId: string;
}

export interface VinsDisconnectDataResult {
    vinDisconnectData: VinUserOperationData[];
}

export interface VinsDeleteDataResult {
    vinDeleteData: VinUserOperationData[];
}

export interface VinStatus {
    vin: string;
    imei: string;
    status: string;
    details: string;
}

export interface VinsStatusResult {
    statuses: VinStatus[];
}

// TransferJobStatus is the response shape for GET /vehicle/transfer/status — a single river-job
// status, not the array shape VinsStatusResult returns. Success is signalled by `isSuccessful`,
// not by a "Success" string on a `status` field (the old shape this code used to assume).
export interface TransferJobStatus {
    attempt: number;
    errors: string[];
    isSuccessful: boolean;
    state: string;
}

export class BaseOnboardingElement extends LitElement {

    @property({attribute: false})
    protected processing: boolean;

    @property({attribute: false})
    protected processingMessage: string;

    @property({attribute: false})
    protected onboardResult: VinOnboardingStatus[];

    @state() sessionExpiresIn: number = 0;

    protected api: ApiService;
    protected signingService: SigningService;

    constructor() {
        super();
        this.processing = false;
        this.processingMessage = "";
        this.api = ApiService.getInstance();
        this.signingService = SigningService.getInstance();
        this.onboardResult = [];
    }


    // this method should be overridden by children
    displayFailure(_alertText: string) {
        this.processing = false;
        this.processingMessage = "";
    }

    protected dispatchStatusUpdate(status: string) {
        this.dispatchEvent(new CustomEvent('status-update', {
            detail: { status },
            bubbles: true,
            composed: true
        }));
    }

    updateResult(result : VinsOnboardingResult) {
        const statusesByVin: Record<string, VinOnboardingStatus> = {};
        for (const item of result.statuses) {
            statusesByVin[item.vin] = item;
        }

        const newResult: VinOnboardingStatus[] = [];

        for (const item of this.onboardResult) {
            newResult.push({
                vin: item.vin,
                status: statusesByVin[item.vin]?.status || "Unknown",
                details: statusesByVin[item.vin]?.details || "Unknown"
            });
        }

        this.onboardResult = newResult;
    }

    async verifyVehicles(vehicles: VehicleWithDefinition[]): Promise<[boolean, string | null]> {
        const payload = {
            vins: vehicles.map(v => ({vin: v.vin, countryCode: 'USA', definition: v.definition}))
        };

        const submitStatus = await this.api.callApi('POST', '/vehicle/verify', payload, true);
        if (!submitStatus.success) {
            return [false, submitStatus.error || 'Failed to submit vehicle verification'];
        }

        let success = true;
        const vinsList = vehicles.map(v => v.vin);
        for (const attempt of range(10)) {
            success = true;
            const query = qs.stringify({vins: vinsList.join(',')}, {arrayFormat: 'comma'});
            const status = await this.api.callApi<VinsOnboardingResult>('GET', `/vehicle/verify?${query}`, null, true);

            if (!status.success || !status.data) {
                return [false, status.error || 'Failed to check vehicle verification status'];
            }

            for (const s of status.data.statuses) {
                if (s.status !== 'Success') {
                    success = false;
                    break;
                }
            }

            this.updateResult(status.data);

            if (success) {
                break;
            }

            if (attempt < 9) {
                await delay(5000);
            }
        }

        if (!success) {
            return [false, 'Vehicle verification timed out'];
        }

        return [true, null];
    }

    async getMintingData(vehicles: VehicleWithDefinition[]): Promise<[VinMintData[], string | null]> {
        const vinsList = vehicles.map(v => v.vin);
        const query = qs.stringify({ vins: vinsList.join(',')});
        const mintData = await this.api.callApi<VinsMintDataResult>('GET', `/vehicle/mint?${query}`, null, true);
        if (!mintData.success || !mintData.data) {
            return [[], mintData.error || 'Failed to fetch minting data'];
        }

        return [mintData.data.vinMintingData, null];
    }

    // signMintingData adds the signature from frontend signer to the mintingData objects. If enableOracleOwner is true, does not add signature
    async signMintingData(mintingData: VinMintData[]) {
        const result: VinMintData[] = [];
        for (const d of mintingData) {
            if (d.typedData) {
                const signature = await this.signingService.signTypedData(d.typedData);
                if (!signature.success || !signature.signature) {
                    console.error(`Signature failed: ${signature.error} ${d.typedData}`);
                    continue;
                }
                result.push({
                    ...d,
                    signature: signature.signature
                });
            } else {
                result.push(d);
            }
        }

        return result;
    }

    async submitMintingData(mintingData: VinMintData[], sacd: SacdInput[] | null): Promise<[boolean, string | null]> {
        const payload: {vinMintingData: VinMintData[], sacd?: SacdInput[]} = {
            vinMintingData: mintingData
        };
        if (sacd !== null && sacd.length > 0) {
            payload.sacd = sacd;
        }

        const mintResponse = await this.api.callApi('POST', '/vehicle/mint', payload, true);
        if (!mintResponse.success || !mintResponse.data) {
            return [false, mintResponse.error || 'Failed to submit minting data'];
        }

        let success = true;
        for (const attempt of range(30)) {
            success = true;
            const query = qs.stringify({vins: mintingData.map(m => m.vin).join(',')}, {arrayFormat: 'comma'});
            const status = await this.api.callApi<VinsOnboardingResult>('GET', `/vehicle/mint/status?${query}`, null, true);

            if (!status.success || !status.data) {
                return [false, status.error || 'Failed to check minting status'];
            }

            for (const s of status.data.statuses) {
                if (s.status !== 'Success') {
                    success = false;
                    break;
                }
            }

            this.updateResult(status.data);

            if (success) {
                break;
            }

            if (attempt < 19) {
                await delay(5000);
            }
        }

        if (!success) {
            return [false, 'Minting operation timed out'];
        }

        return [true, null];
    }

    async onboardVINs(vehicles: VehicleWithDefinition[], sacd: SacdInput[] | null): Promise<boolean> {
        let allVinsValid = true;
        for (const vehicle of vehicles) {
            const validVin = vehicle.vin?.length === 17;
            allVinsValid = allVinsValid && validVin;
            this.onboardResult.push({
                vin: vehicle.vin,
                status: "Unknown",
                details: validVin ? "Valid VIN" : "Invalid VIN"
            });
        }

        if (!allVinsValid) {
            this.displayFailure(msg("Some of the VINs are not valid"));
            return false;
        }

        const [verified, verifyError] = await this.verifyVehicles(vehicles);
        if (!verified) {
            this.displayFailure(this.withApiError(msg("Failed to verify at least one VIN"), verifyError));
            return false;
        }

        const [mintData, mintDataError] = await this.getMintingData(vehicles);
        if (mintData.length === 0) {
            this.displayFailure(this.withApiError(msg("Failed to fetch minting data"), mintDataError));
            return false;
        }

        const signedMintData = await this.signMintingData(mintData);
        const [minted, mintError] = await this.submitMintingData(signedMintData, sacd);

        if (!minted) {
            this.displayFailure(this.withApiError(msg("Failed to onboard at least one VIN"), mintError));
            return false;
        }

        return true;
    }

    private withApiError(baseMessage: string, apiError: string | null): string {
        return apiError ? `${baseMessage}: ${apiError}` : baseMessage;
    }
    
    async getTransferData(imei: string, targetWallet: string): Promise<Result<VinUserOperationData, string>> {
        const query = qs.stringify({imei: imei, targetWalletAddress: targetWallet});
        const transferData = await this.api.callApi<VinUserOperationData>('GET', `/vehicle/transfer?${query}`, null, true);

        if (!transferData.success || !transferData.data) {
            return {
                success: false,
                error: transferData.error || "Failed to fetch transfer data"
            };
        }

        return {
            success: true,
            data: transferData.data
        };
    }

    async signTransferData(transferData: VinUserOperationData): Promise<Result<VinUserOperationData, string>> {
        const signature = await this.signingService.signUserOperation(transferData.userOperation);
        if (!signature.success) {
            return {
                success: false,
                error: signature.error || "Failed to sign transfer data"
            };
        }

        return {
            success: true,
            data: {
                ...transferData,
                signature: signature.signature
            }
        };
    }

    async submitTransferData(transferData: VinUserOperationData): Promise<Result<void, string>> {
        const mintResponse = await this.api.callApi<VinTransferResponse>('POST', '/vehicle/transfer', transferData, true);
        if (!mintResponse.success || !mintResponse.data) {
            return {
                success: false,
                error: mintResponse.error || "Failed to submit transfer data"
            };
        }

        // todo could probably refactor this pattern with two other functions
        let success = false;
        for (const attempt of range(30)) {
            const query = qs.stringify({jobId: mintResponse.data.jobId});
            const status = await this.api.callApi<TransferJobStatus>('GET', `/vehicle/transfer/status?${query}`, null, true);
            this.dispatchStatusUpdate("Checking transfer status... " + attempt);

            if (!status.success || !status.data) {
                return {
                    success: false,
                    error: status.error || "Failed to check transfer status"
                };
            }

            if (status.data.isSuccessful) {
                success = true;
                break;
            }

            if (attempt < 29) {
                await delay(4000);
            }
        }

        if (!success) {
            return {
                success: false,
                error: "Transfer operation timed out"
            };
        }

        return {
            success: true,
            data: undefined
        };
    }

    // transferSharedAccountVehicle is the server-signed transfer flow used when the vehicle's
    // on-chain owner is a shared kernel account that registered our tenant's signer. The
    // backend (POST /v1/vehicle/transfer/shared) validates and submits the on-chain
    // safeTransferFrom itself, so no passkey signature is required from the connected wallet.
    async transferSharedAccountVehicle(tokenId: number, targetWallet: string): Promise<Result<void, string>> {
        this.dispatchStatusUpdate(msg("Submitting shared-account transfer..."));
        const submitResp = await this.api.callApi<VinTransferResponse>(
            'POST',
            '/vehicle/transfer/shared',
            { tokenId, targetWalletAddress: targetWallet },
            true,
        );
        if (!submitResp.success || !submitResp.data) {
            return { success: false, error: submitResp.error || "Failed to submit shared-account transfer" };
        }

        // Same status-poll pattern as submitTransferData — backend flips isSuccessful=true on the
        // job once the safeTransferFrom UserOp lands on chain.
        let success = false;
        for (const attempt of range(30)) {
            const query = qs.stringify({ jobId: submitResp.data.jobId });
            const status = await this.api.callApi<TransferJobStatus>('GET', `/vehicle/transfer/status?${query}`, null, true);
            this.dispatchStatusUpdate(msg("Checking transfer status... ") + attempt);
            if (!status.success || !status.data) {
                return { success: false, error: status.error || "Failed to check transfer status" };
            }
            if (status.data.isSuccessful) {
                success = true;
                break;
            }
            if (attempt < 29) {
                await delay(4000);
            }
        }

        if (!success) {
            return { success: false, error: "Transfer operation timed out" };
        }

        this.dispatchStatusUpdate(msg("Transfer completed successfully"));
        return { success: true, data: undefined };
    }

    // transferVehicle coordinates all of the necessary calls to get the data to sign, signing it and submitting the trx to transfer a vehicle
    async transferVehicle(imei: string, targetWallet: string) : Promise<Result<void, string>> {
        this.dispatchStatusUpdate(msg("Fetching transfer data..."));
        const transferData = await this.getTransferData(imei, targetWallet);
        if (!transferData.success) {
            return {
                success: false,
                error: transferData.error
            };
        }

        this.dispatchStatusUpdate(msg("Signing transfer data..."));
        const signedDisconnectData = await this.signTransferData(transferData.data);
        if (!signedDisconnectData.success) {
            return {
                success: false,
                error: signedDisconnectData.error
            };
        }

        this.dispatchStatusUpdate(msg("Submitting transfer to blockchain..."));
        const submitResponse = await this.submitTransferData(signedDisconnectData.data);
        if (!submitResponse.success) {
            return {
                success:false,
                error: submitResponse.error
            };
        }

        this.dispatchStatusUpdate(msg("Transfer completed successfully"));
        return {
            success: true,
            data: undefined
        };
    }

    async getDisconnectData(vins: string[]): Promise<Result<VinUserOperationData[], string>> {
        const query = qs.stringify({vins: vins.join(',')}, {arrayFormat: 'comma'});
        const disconnectData = await this.api.callApi<VinsDisconnectDataResult>('GET', `/vehicle/disconnect?${query}`, null, true);
        if (!disconnectData.success || !disconnectData.data) {
            return {
                success: false,
                error: disconnectData.error || 'Failed to fetch disconnect data'
            };
        }

        return {
            success: true,
            data: disconnectData.data.vinDisconnectData
        };
    }

    async signDisconnectData(disconnectData: VinUserOperationData[]): Promise<Result<VinUserOperationData[], string>> {
        const result: VinUserOperationData[] = [];
        for (const d of disconnectData) {
            const signature = await this.signingService.signUserOperation(d.userOperation);

            if (!signature.success || !signature.signature) {
                return {
                    success: false,
                    error: 'Failed to sign user operation for VIN ' + d.vin
                };
            }

            result.push({
                ...d,
                signature: signature.signature
            });
        }

        return {
            success: true,
            data: result
        };
    }

    async submitDisconnectData(disconnectData: VinUserOperationData[]): Promise<Result<void, string>> {
        const payload: {vinDisconnectData: VinUserOperationData[]} = {
            vinDisconnectData: disconnectData,
        };

        const mintResponse = await this.api.callApi('POST', '/vehicle/disconnect', payload, true);
        if (!mintResponse.success || !mintResponse.data) {
            return {
                success: false,
                error: mintResponse.error || 'Failed to submit disconnect data'
            };
        }

        let success = true;
        for (const attempt of range(30)) {
            success = true;
            const query = qs.stringify({vins: disconnectData.map(m => m.vin).join(',')}, {arrayFormat: 'comma'});
            const status = await this.api.callApi<VinsStatusResult>('GET', `/vehicle/disconnect/status?${query}`, null, true);

            if (!status.success || !status.data) {
                return {
                    success: false,
                    error: status.error || 'Failed to check disconnect status'
                };
            }

            for (const s of status.data.statuses) {
                if (s.status !== 'Success') {
                    success = false;
                    break;
                }
            }

            if (success) {
                break;
            }

            if (attempt < 19) {
                await delay(5000);
            }
        }

        if (!success) {
            return {
                success: false,
                error: 'Disconnect operation timed out'
            };
        }

        return { success: true, data: undefined };
    }

    async disconnectVins(vins: string[]): Promise<Result<void, string>> {
        const disconnectData = await this.getDisconnectData(vins);
        if (!disconnectData.success) {
            return { success: false, error: disconnectData.error };
        }

        const signedDisconnectData = await this.signDisconnectData(disconnectData.data);
        if (!signedDisconnectData.success) {
            return { success: false, error: signedDisconnectData.error };
        }

        const disconnectStatus = await this.submitDisconnectData(signedDisconnectData.data);
        if (!disconnectStatus.success) {
            return { success: false, error: disconnectStatus.error };
        }

        return { success: true, data: undefined };
    }

    async getDeleteData(vins: string[]): Promise<Result<VinUserOperationData[], string>> {
        const query = qs.stringify({vins: vins.join(',')}, {arrayFormat: 'comma'});
        const deleteData = await this.api.callApi<VinsDeleteDataResult>('GET', `/vehicle/delete?${query}`, null, true);
        if (!deleteData.success || !deleteData.data) {
            return {
                success: false,
                error: deleteData.error || 'Failed to fetch delete data'
            };
        }

        return {
            success: true,
            data: deleteData.data.vinDeleteData
        };
    }

    async signDeleteData(deleteData: VinUserOperationData[]): Promise<Result<VinUserOperationData[], string>> {
        const result: VinUserOperationData[] = [];
        for (const d of deleteData) {
            const signature = await this.signingService.signUserOperation(d.userOperation);

            if (!signature.success || !signature.signature) {
                return {
                    success: false,
                    error: 'Failed to sign user operation for VIN ' + d.vin
                };
            }

            result.push({
                ...d,
                signature: signature.signature
            });
        }

        return {
            success: true,
            data: result
        };
    }

    async submitDeleteData(deleteData: VinUserOperationData[]): Promise<Result<void, string>> {
        const payload: {vinDeleteData: VinUserOperationData[]} = {
            vinDeleteData: deleteData,
        };

        const deleteResponse = await this.api.callApi('POST', '/vehicle/delete', payload, true);
        if (!deleteResponse.success || !deleteResponse.data) {
            return {
                success: false,
                error: deleteResponse.error || 'Failed to submit delete data'
            };
        }

        let success = true;
        for (const attempt of range(30)) {
            success = true;
            const query = qs.stringify({vins: deleteData.map(m => m.vin).join(',')}, {arrayFormat: 'comma'});
            const status = await this.api.callApi<VinsStatusResult>('GET', `/vehicle/delete/status?${query}`, null, true);

            if (!status.success || !status.data) {
                return {
                    success: false,
                    error: status.error || 'Failed to check delete status'
                };
            }

            for (const s of status.data.statuses) {
                if (s.status !== 'Success') {
                    success = false;
                    break;
                }
            }

            if (success) {
                break;
            }

            if (attempt < 19) {
                await delay(5000);
            }
        }

        if (!success) {
            return {
                success: false,
                error: 'Delete operation timed out'
            };
        }

        return { success: true, data: undefined };
    }

    async deleteVins(vins: string[]): Promise<Result<void, string>> {
        const deleteData = await this.getDeleteData(vins);
        if (!deleteData.success) {
            return { success: false, error: deleteData.error };
        }

        const signedDeleteData = await this.signDeleteData(deleteData.data);
        if (!signedDeleteData.success) {
            return { success: false, error: signedDeleteData.error };
        }

        const deleteStatus = await this.submitDeleteData(signedDeleteData.data);
        if (!deleteStatus.success) {
            return { success: false, error: deleteStatus.error };
        }

        return { success: true, data: undefined };
    }

    // disconnectSharedAccountVehicle is the server-signed disconnect flow used when the vehicle's
    // on-chain owner is a shared kernel account that registered our tenant signer. The backend
    // (POST /vehicle/disconnect/shared) burns the synthetic device itself, so no passkey signature
    // is required — there is no GET-prepare/sign step. We poll the same per-VIN disconnect status
    // endpoint the passkey flow uses, since the shared worker lands on the same onboarding status.
    async disconnectSharedAccountVehicle(tokenId: number, vin: string): Promise<Result<void, string>> {
        this.dispatchStatusUpdate(msg("Submitting shared-account disconnect..."));
        const submitResp = await this.api.callApi<VinTransferResponse>(
            'POST',
            '/vehicle/disconnect/shared',
            { tokenId },
            true,
        );
        if (!submitResp.success || !submitResp.data) {
            return { success: false, error: submitResp.error || "Failed to submit shared-account disconnect" };
        }

        return this.pollSharedAccountStatus(vin, '/vehicle/disconnect/status', 'Disconnect');
    }

    // deleteSharedAccountVehicle is the server-signed delete flow for a shared kernel account.
    // The backend (POST /vehicle/delete/shared) auto-chains the disconnect (burns the synthetic
    // device first if still live, then the vehicle NFT), so it can be called regardless of the
    // connection state. No passkey signature is required.
    async deleteSharedAccountVehicle(tokenId: number, vin: string): Promise<Result<void, string>> {
        this.dispatchStatusUpdate(msg("Submitting shared-account delete..."));
        const submitResp = await this.api.callApi<VinTransferResponse>(
            'POST',
            '/vehicle/delete/shared',
            { tokenId },
            true,
        );
        if (!submitResp.success || !submitResp.data) {
            return { success: false, error: submitResp.error || "Failed to submit shared-account delete" };
        }

        return this.pollSharedAccountStatus(vin, '/vehicle/delete/status', 'Delete');
    }

    // pollSharedAccountStatus polls a per-VIN status endpoint until every status reads 'Success'
    // or the operation times out. Shared disconnect/delete reuse the same status endpoints as the
    // passkey flow because the shared workers update the same onboarding status.
    private async pollSharedAccountStatus(vin: string, statusEndpoint: string, label: string): Promise<Result<void, string>> {
        let success = false;
        for (const attempt of range(30)) {
            success = true;
            const query = qs.stringify({ vins: vin }, { arrayFormat: 'comma' });
            const status = await this.api.callApi<VinsStatusResult>('GET', `${statusEndpoint}?${query}`, null, true);
            this.dispatchStatusUpdate(`Checking ${label.toLowerCase()} status... ` + attempt);

            if (!status.success || !status.data) {
                return { success: false, error: status.error || `Failed to check ${label.toLowerCase()} status` };
            }

            for (const s of status.data.statuses) {
                if (s.status !== 'Success') {
                    success = false;
                    break;
                }
            }

            if (success) {
                break;
            }

            if (attempt < 29) {
                await delay(5000);
            }
        }

        if (!success) {
            return { success: false, error: `${label} operation timed out` };
        }

        return { success: true, data: undefined };
    }
}
