// Shared token utilities

/**
 * Returns true if the JWT is missing or expired (or invalid), false otherwise.
 */
export function isTokenExpired(token: string | null | undefined): boolean {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]));
    const exp = typeof payload?.exp === 'number' ? payload.exp : 0;
    const now = Math.floor(Date.now() / 1000);
    return exp < now;
  } catch {
    return true;
  }
}
