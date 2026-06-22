// Ruptela IO value decoding, ported from the kaufmann-oracle backend
// (internal/ruptela/io_types.go). The device sends IO element values as raw bytes;
// the oracle serializes them as a hex string. Most values are unsigned big-endian
// integers, but a number of IO IDs are signed, ASCII strings, bitmaps, hex blobs, or
// Unix timestamps. Keep this map in sync with io_types.go if the backend list changes.

export type IoType =
    | 'unsigned'
    | 'signed'
    | 'string'
    | 'bitmap'
    | 'header'
    | 'hex'
    | 'timestamp';

// IDs that are NOT the default unsigned integer. Grouped to mirror io_types.go.
const SIGNED_IDS = [
    // 1-byte signed
    6, 32, 49, 50, 51, 56, 57, 58, 59, 60, 61, 62, 63, 64, 75, 76, 96, 97, 101, 103,
    115, 144, 145, 146, 147, 148, 149, 184, 185, 186, 187, 212, 419, 509, 510, 511,
    512, 513, 514, 584, 585, 586, 587, 594, 600, 601, 602, 603, 604, 611, 612, 613,
    639, 727, 733, 734, 755, 756, 757, 842, 843, 844, 1000, 1172, 1173, 1174, 1175, 1176,
    // 2-byte signed
    26, 33, 74, 78, 79, 80, 402, 403, 404, 520, 564, 732, 916, 917, 927,
];

const STRING_IDS = [
    34, 70, 71, 72, 73, 104, 105, 106, 123, 124, 125, 126, 127, 128, 129, 152, 153, 154,
    155, 156, 157, 158, 167, 168, 171, 172, 536, 575, 581, 582, 614, 615, 616, 617, 620,
    621, 622, 623, 624, 625, 633, 634, 635, 636, 646, 647, 648, 649, 760, 761, 823, 824,
    825, 939, 940, 941, 981, 982, 983, 984, 1144, 1145,
];

const BITMAP_IDS = [
    40, 93, 151, 138, 142, 352, 353, 354, 398, 399, 400, 401, 500, 501, 502, 503, 504,
    505, 506, 518, 523, 561, 562, 568, 569, 570, 573, 574, 588, 589, 590, 591, 592, 593,
    626, 650, 740, 741, 742, 743, 744, 745, 746, 747, 748, 749, 750, 751, 850, 870, 871,
    872, 876, 877, 878, 879, 880, 881, 882, 883, 884, 885, 931, 933, 951, 1153, 1186,
];

const HEADER_IDS = [7, 8, 9, 1177];

const HEX_IDS = [
    1201, 1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209, 1210, 1211, 1212, 1213, 1214,
    1215, 1216, 1217, 1218, 1219, 1220, 5011,
];

const TIMESTAMP_IDS = [715, 531, 532];

const IO_TYPE_MAP: Map<number, IoType> = (() => {
    const m = new Map<number, IoType>();
    const add = (ids: number[], t: IoType) => ids.forEach(id => m.set(id, t));
    add(SIGNED_IDS, 'signed');
    add(STRING_IDS, 'string');
    add(BITMAP_IDS, 'bitmap');
    add(HEADER_IDS, 'header');
    add(HEX_IDS, 'hex');
    add(TIMESTAMP_IDS, 'timestamp');
    return m;
})();

export function getIoType(id: number): IoType {
    return IO_TYPE_MAP.get(id) ?? 'unsigned';
}

function hexToBytes(hex: string): number[] {
    let h = hex.trim();
    if (h.startsWith('0x') || h.startsWith('0X')) h = h.slice(2);
    if (h.length % 2 !== 0) h = '0' + h;
    if (h.length === 0 || !/^[0-9a-fA-F]+$/.test(h)) return [];
    const bytes: number[] = [];
    for (let i = 0; i < h.length; i += 2) {
        bytes.push(parseInt(h.slice(i, i + 2), 16));
    }
    return bytes;
}

function toUpperHex(bytes: number[]): string {
    return bytes.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Big-endian unsigned. BigInt keeps 8-byte values exact.
function decodeUnsigned(bytes: number[]): bigint {
    let v = 0n;
    for (const b of bytes) v = (v << 8n) | BigInt(b);
    return v;
}

// Big-endian two's-complement signed, sized to the byte length.
function decodeSigned(bytes: number[]): bigint {
    const u = decodeUnsigned(bytes);
    const bits = BigInt(bytes.length * 8);
    const signBit = 1n << (bits - 1n);
    return u & signBit ? u - (1n << bits) : u;
}

// ASCII string, truncated at the first null byte (matches backend parseStringValue).
function decodeString(bytes: number[]): string {
    const out: number[] = [];
    for (const b of bytes) {
        if (b === 0) break;
        out.push(b);
    }
    return out.map(c => String.fromCharCode(c)).join('');
}

export interface DecodedIo {
    type: IoType;
    // Human-readable decoded value for display.
    display: string;
    // Uppercase hex of the raw bytes, always available for reference.
    hex: string;
}

// decodeIo interprets a hex-encoded IO value according to its IO id's type.
export function decodeIo(id: number, hexValue: string): DecodedIo {
    const bytes = hexToBytes(hexValue);
    const hex = toUpperHex(bytes);
    const type = getIoType(id);

    if (bytes.length === 0) {
        return { type, display: '—', hex };
    }

    switch (type) {
        case 'signed':
            return { type, display: decodeSigned(bytes).toString(), hex };
        case 'string': {
            const s = decodeString(bytes);
            return { type, display: s.length > 0 ? s : '—', hex };
        }
        case 'bitmap':
        case 'hex':
            return { type, display: `0x${hex}`, hex };
        case 'header':
            return { type, display: '—', hex };
        case 'timestamp': {
            const secs = Number(decodeUnsigned(bytes));
            const d = new Date(secs * 1000);
            const display = isNaN(d.getTime()) ? String(secs) : `${d.toLocaleString()} (${secs})`;
            return { type, display, hex };
        }
        case 'unsigned':
        default:
            return { type, display: decodeUnsigned(bytes).toString(), hex };
    }
}
