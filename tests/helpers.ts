export function makeJwt(payload: Record<string, unknown>): string {
  const toB64url = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const header = toB64url(btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = toB64url(btoa(JSON.stringify(payload)));
  return `${header}.${body}.fakesig`;
}

export const futureExp = (): number => Math.floor(Date.now() / 1000) + 3600;
export const pastExp = (): number => Math.floor(Date.now() / 1000) - 3600;
