import { ApiService } from '@services/api-service.ts';

// Mirrors fetch-api.dimo.zone's CloudEventHeader.
export interface AttestationHeader {
    id?: string;
    type?: string;
    source?: string;
    subject?: string;
    dataversion?: string;
    time?: string;
    producer?: string;
    datacontenttype?: string;
    tags?: string[];
    filehash?: string;
}

// An attestation row as presented in the UI. Built from a parsed cloud event
// (type starts with `dimo.document.`). `dataUrl` is the presigned S3 URL when
// the parsed CE itself carries the file bytes (small docs); for larger ones
// the URL lives on the paired raw CE and is resolved via the filehash map.
export interface AttestationEntry {
    id?: string;
    type?: string;
    source?: string;
    time?: string;
    filehash?: string;
    datacontenttype?: string;
    data?: unknown;
    dataUrl?: string;
}

export interface AttestationsResult {
    // Parsed-doc entries to render in tables. Ordered newest-first.
    entries: AttestationEntry[];
    // filehash -> presigned dataUrl built from the paired raw CEs. Used as a
    // fallback when a parsed entry's own `dataUrl` is empty.
    rawByFilehash: Record<string, string>;
}

// extractAttestationsForVehicle pulls every dimo.document.* and dimo.raw.* cloud
// event for the vehicle, returning the parsed entries (for display) and an
// index of raw dataUrls keyed by filehash (for the download fallback).
//
// Why two passes (types then events): the cloudEvents resolver requires a type
// filter, so we first ask which document types exist for this vehicle, then
// fan out one query per type.
export async function fetchVehicleAttestations(tokenDID: string): Promise<AttestationsResult> {
    const api = ApiService.getInstance();
    if (!tokenDID) return { entries: [], rawByFilehash: {} };

    // Step 1: discover all CE types attached to the vehicle. Filter to documents
    // (parsed + raw variants); other types like telemetry are unrelated.
    const typesQuery = `{ availableCloudEventTypes(did: "${tokenDID}") { type } }`;
    const typesResp = await api.callApi<{ availableCloudEventTypes?: Array<{ type: string }> }>(
        'POST',
        `/fleet/vehicles/fetch?did=${encodeURIComponent(tokenDID)}`,
        typesQuery,
        true,
        true
    );

    if (!typesResp.success || !typesResp.data?.availableCloudEventTypes) {
        return { entries: [], rawByFilehash: {} };
    }

    const allTypes = typesResp.data.availableCloudEventTypes.map(t => t.type);
    const parsedTypes = allTypes.filter(t => t.startsWith('dimo.document.'));
    const rawTypes = allTypes.filter(t => t.startsWith('dimo.raw.'));

    if (parsedTypes.length === 0 && rawTypes.length === 0) {
        return { entries: [], rawByFilehash: {} };
    }

    // Step 2: fetch cloud events per type, in parallel. The dataUrl field is a
    // presigned S3 URL for large binary payloads; we request it on both parsed
    // and raw queries so we can use whichever is populated.
    const fetchByType = (type: string) => api.callApi<{
        cloudEvents?: Array<{
            header?: AttestationHeader;
            data?: unknown;
            dataUrl?: string;
        }>;
    }>(
        'POST',
        `/fleet/vehicles/fetch?did=${encodeURIComponent(tokenDID)}`,
        `{
            cloudEvents(did: "${tokenDID}", limit: 40, filter: { type: "${type}" }) {
                header {
                    id
                    type
                    source
                    subject
                    dataversion
                    time
                    producer
                    datacontenttype
                    tags
                    filehash
                }
                data
                dataUrl
            }
        }`,
        true,
        true
    );

    const [parsedResults, rawResults] = await Promise.all([
        Promise.all(parsedTypes.map(fetchByType)),
        Promise.all(rawTypes.map(fetchByType)),
    ]);

    const entries: AttestationEntry[] = [];
    for (const resp of parsedResults) {
        if (!resp.success || !resp.data?.cloudEvents) continue;
        for (const event of resp.data.cloudEvents) {
            entries.push({
                id: event.header?.id,
                type: event.header?.type,
                source: event.header?.source,
                time: event.header?.time,
                filehash: event.header?.filehash,
                datacontenttype: event.header?.datacontenttype,
                data: event.data,
                dataUrl: event.dataUrl,
            });
        }
    }

    const rawByFilehash: Record<string, string> = {};
    for (const resp of rawResults) {
        if (!resp.success || !resp.data?.cloudEvents) continue;
        for (const event of resp.data.cloudEvents) {
            const fh = event.header?.filehash;
            if (fh && event.dataUrl) {
                rawByFilehash[fh] = event.dataUrl;
            }
        }
    }

    entries.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
    return { entries, rawByFilehash };
}

// resolveDownloadUrl picks the best URL to download an attestation's bytes from.
// Parsed CEs may have dataUrl populated directly (case 1); otherwise we look up
// the paired raw CE by filehash (case 2). Returns null when neither is available.
export function resolveDownloadUrl(entry: AttestationEntry, rawByFilehash: Record<string, string>): string | null {
    if (entry.dataUrl) return entry.dataUrl;
    if (entry.filehash && rawByFilehash[entry.filehash]) return rawByFilehash[entry.filehash];
    return null;
}

// buildDownloadFilename matches the rental-fleets-app convention: last segment
// of the CE type, the CE date stamp, and a MIME-derived extension. Falls back
// to a short filehash suffix when type is missing.
export function buildDownloadFilename(entry: AttestationEntry): string {
    let base = 'document';
    if (entry.type) {
        const parts = entry.type.split('.');
        const last = parts[parts.length - 1];
        if (last) base = sanitizeFilenameSegment(last) || base;
    } else if (entry.filehash && entry.filehash.length >= 8) {
        base = 'document-' + entry.filehash.slice(0, 8);
    }

    let stamp = '';
    if (entry.time) {
        const t = new Date(entry.time);
        if (!Number.isNaN(t.getTime())) {
            stamp = t.toISOString().slice(0, 10);
        }
    }
    if (!stamp) stamp = new Date().toISOString().slice(0, 10);

    const ext = extensionForMime(entry.datacontenttype || '');
    return ext ? `${base}-${stamp}.${ext}` : `${base}-${stamp}`;
}

function extensionForMime(mime: string): string {
    const primary = mime.split(';')[0].trim().toLowerCase();
    switch (primary) {
        case 'application/pdf': return 'pdf';
        case 'image/jpeg': return 'jpg';
        case 'image/png': return 'png';
        case 'image/heic': return 'heic';
        case 'image/heif': return 'heif';
        case 'image/webp': return 'webp';
        default: return '';
    }
}

function sanitizeFilenameSegment(s: string): string {
    return s.replace(/[\\/:*?"<>|]/g, '_').replace(/\.\.+/g, '_').trim();
}
