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
    tokenId: number;
    mintedAt: string;
    owner: `0x${string}`
    definition: DeviceDefinition;
    syntheticDevice: SyntheticDevice;
    connectionStatus: string;
    disconnectionStatus: string;
}
