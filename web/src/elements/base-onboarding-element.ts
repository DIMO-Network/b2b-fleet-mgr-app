import {LitElement} from 'lit';
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

    async verifyVehicles(vehicles: VehicleWithDefinition[]) {
        const payload = {
            vins: vehicles.map(v => ({vin: v.vin, countryCode: 'USA', definition: v.definition}))
        };

        const submitStatus = await this.api.callApi('POST', '/vehicle/verify', payload, true);
        if (!submitStatus.success) {
            return false;
        }

        let success = true;
        const vinsList = vehicles.map(v => v.vin);
        for (const attempt of range(10)) {
            success = true;
            const query = qs.stringify({vins: vinsList.join(',')}, {arrayFormat: 'comma'});
            const status = await this.api.callApi<VinsOnboardingResult>('GET', `/vehicle/verify?${query}`, null, true);

            if (!status.success || !status.data) {
                return false;
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

        return success;
    }

    async getMintingData(vehicles: VehicleWithDefinition[]) {
        const vinsList = vehicles.map(v => v.vin);
        const query = qs.stringify({ vins: vinsList.join(',')});
        const mintData = await this.api.callApi<VinsMintDataResult>('GET', `/vehicle/mint?${query}`, null, true);
        if (!mintData.success || !mintData.data) {
            return [];
        }

        return mintData.data.vinMintingData;
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

    async submitMintingData(mintingData: VinMintData[], sacd: SacdInput[] | null) {
        const payload: {vinMintingData: VinMintData[], sacd?: SacdInput[]} = {
            vinMintingData: mintingData
        };
        if (sacd !== null && sacd.length > 0) {
            payload.sacd = sacd;
        }

        const mintResponse = await this.api.callApi('POST', '/vehicle/mint', payload, true);
        if (!mintResponse.success || !mintResponse.data) {
            return false;
        }

        let success = true;
        for (const attempt of range(30)) {
            success = true;
            const query = qs.stringify({vins: mintingData.map(m => m.vin).join(',')}, {arrayFormat: 'comma'});
            const status = await this.api.callApi<VinsOnboardingResult>('GET', `/vehicle/mint/status?${query}`, null, true);

            if (!status.success || !status.data) {
                return false;
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

        return success;
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
            this.displayFailure("Some of the VINs are not valid");
            return false;
        }

        const verified = await this.verifyVehicles(vehicles);
        if (!verified) {
            this.displayFailure("Failed to verify at least one VIN");
            return false;
        }

        const mintData = await this.getMintingData(vehicles);
        if (mintData.length === 0) {
            this.displayFailure("Failed to fetch minting data");
            return false;
        }

        const signedMintData = await this.signMintingData(mintData);
        const minted = await this.submitMintingData(signedMintData, sacd);

        if (!minted) {
            this.displayFailure("Failed to onboard at least one VIN");
            return false;
        }

        return true;
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
        let success = true;
        for (const attempt of range(30)) {
            success = true;
            const query = qs.stringify({jobId: mintResponse.data.jobId});
            const status = await this.api.callApi<VinStatus>('GET', `/vehicle/transfer/status?${query}`, null, true);
            this.dispatchStatusUpdate("Checking transfer status... " + attempt);

            if (!status.success || !status.data) {
                return {
                    success: false,
                    error: status.error || "Failed to check transfer status"
                };
            }

            if (status.data.status !== 'Success') {
                success = false;
            }

            if (success) {
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

    // transferVehicle coordinates all of the necessary calls to get the data to sign, signing it and submitting the trx to transfer a vehicle
    async transferVehicle(imei: string, targetWallet: string) : Promise<Result<void, string>> {
        this.dispatchStatusUpdate("Fetching transfer data...");
        const transferData = await this.getTransferData(imei, targetWallet);
        if (!transferData.success) {
            return {
                success: false,
                error: transferData.error
            };
        }

        this.dispatchStatusUpdate("Signing transfer data...");
        const signedDisconnectData = await this.signTransferData(transferData.data);
        if (!signedDisconnectData.success) {
            return {
                success: false,
                error: signedDisconnectData.error
            };
        }

        this.dispatchStatusUpdate("Submitting transfer to blockchain...");
        const submitResponse = await this.submitTransferData(signedDisconnectData.data);
        if (!submitResponse.success) {
            return {
                success:false,
                error: submitResponse.error
            };
        }

        this.dispatchStatusUpdate("Transfer completed successfully");
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
}
