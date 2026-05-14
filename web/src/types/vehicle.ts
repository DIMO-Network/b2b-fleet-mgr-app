export interface DeviceDefinition {
    id: string;
    make: string;
    model: string;
    year: number;
}

export interface SyntheticDevice {
    id: string;
    tokenId: number;
    mintedAt: string;
}

export interface Vehicle {
    vin: string;
    id: string;
    imei: string;
    tokenId: number;
    mintedAt: string;
    owner: `0x${string}`
    definition: DeviceDefinition;
    syntheticDevice: SyntheticDevice;
    connectionStatus: string;       // status of connection to the vendor
    disconnectionStatus: string;    // status of disconnection from vendor
    isCurrentUserOwner: boolean;
    // True when the on-chain owner is a shared kernel account that authorised the current
    // tenant's signer (via providedSignerAddress at account creation). Lets the tenant drive
    // transfers on its behalf even though isCurrentUserOwner is false.
    isSharedAccountSigner?: boolean;
}
