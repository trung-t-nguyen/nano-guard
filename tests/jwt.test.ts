import { describe, it, expect } from 'vitest';
import { decodeJwt, isExpired } from '../src/jwt.js';
import { makeJwt, futureExp, pastExp } from './helpers.js';

describe('decodeJwt', () => {
  it('decodes a valid JWT payload', () => {
    const token = makeJwt({ sub: '123', roles: ['admin'] });
    const payload = decodeJwt(token);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('123');
    expect(payload?.roles).toEqual(['admin']);
  });

  it('returns null for a string that does not have exactly 3 segments', () => {
    expect(decodeJwt('only.two')).toBeNull();
    expect(decodeJwt('one')).toBeNull();
    expect(decodeJwt('')).toBeNull();
    expect(decodeJwt('a.b.c.d')).toBeNull();
  });

  it('returns null for invalid base64 in the payload segment', () => {
    expect(decodeJwt('header.!!!.sig')).toBeNull();
  });

  it('returns null for a payload that is not valid JSON', () => {
    const notJson = btoa('not-json').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    expect(decodeJwt(`header.${notJson}.sig`)).toBeNull();
  });

  it('handles base64url encoding (- and _ characters)', () => {
    const token = makeJwt({ note: 'hello+world/test', roles: ['user'] });
    const payload = decodeJwt(token);
    expect(payload).not.toBeNull();
    expect(payload?.roles).toEqual(['user']);
  });
});

describe('isExpired', () => {
  it('returns false when exp is in the future', () => {
    expect(isExpired({ exp: futureExp() })).toBe(false);
  });

  it('returns true when exp is in the past', () => {
    expect(isExpired({ exp: pastExp() })).toBe(true);
  });

  it('returns false when exp is absent', () => {
    expect(isExpired({})).toBe(false);
  });

  it('returns true for exp = 0 (Unix epoch, far in the past)', () => {
    expect(isExpired({ exp: 0 })).toBe(true);
  });

  it('returns false when exp exactly equals the current second (boundary)', () => {
    // exp < now is the check — equal means not yet expired
    const now = Math.floor(Date.now() / 1000);
    expect(isExpired({ exp: now })).toBe(false);
  });
});
