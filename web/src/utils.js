/**
 * checks if running under localhost or our local dev hostname
 * @returns {boolean}
 */
export function isLocalhost() {
    return window.location.hostname === "localhost" ||
        window.location.hostname === "localdev.dimo.org" ||
        window.location.hostname === "";
}

