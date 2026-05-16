import type { JwtPayload } from './types.js';

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // Base64url → Base64: replace URL-safe chars and let atob handle missing padding
    const encoded = parts[1] ?? '';
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64)) as JwtPayload;
  } catch {
    return null;
  }
}

export function isExpired(payload: JwtPayload): boolean {
  if (payload.exp === undefined) return false;
  return payload.exp < Math.floor(Date.now() / 1000);
}
