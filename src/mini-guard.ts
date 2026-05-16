import type { FeatureMap, MiniGuardOptions } from './types.js';
import { decodeJwt, isExpired } from './jwt.js';

function buildRoleExtractor(template: string): (role: string) => string {
  // Infer the separator from chars between placeholders, e.g. '_' from '{appid}_{env}_{role}'
  const sep = template.match(/\}([^{]+)\{/)?.[1] ?? '_';
  const pattern = new RegExp(
    '^' +
      template
        .replace(/[.*+?^$()|[\]\\]/g, '\\$&')
        .replace(/\{role\}/g, '(.+)')
        .replace(/\{[^}]+\}/g, `[^${sep}]+`) +
      '$',
  );
  return (role: string) => role.match(pattern)?.[1] ?? role;
}

export class MiniGuard {
  private readonly _map: FeatureMap;
  private readonly _defaultModule: string | undefined;
  private readonly _rolesClaim: string;
  private readonly _roleNormalize: ((role: string) => string) | undefined;
  private readonly _strategy: 'any' | 'all';
  private readonly _debug: boolean;
  private _roles: string[] = [];

  constructor(featureMap: FeatureMap, optionsOrModule?: MiniGuardOptions | string) {
    this._map = featureMap;
    if (typeof optionsOrModule === 'string') {
      this._defaultModule = optionsOrModule;
      this._rolesClaim = 'roles';
      this._strategy = 'any';
      this._debug = false;
    } else {
      this._defaultModule = optionsOrModule?.defaultModule;
      this._rolesClaim = optionsOrModule?.rolesClaim ?? 'roles';
      this._strategy = optionsOrModule?.strategy ?? 'any';
      this._debug = optionsOrModule?.debug ?? false;
      // roleTransform takes precedence; roleTemplate is compiled once at construction time
      this._roleNormalize =
        optionsOrModule?.roleTransform ??
        (optionsOrModule?.roleTemplate ? buildRoleExtractor(optionsOrModule.roleTemplate) : undefined);
    }
  }

  private _log(...args: unknown[]): void {
    const env = (globalThis as { process?: { env?: Record<string, string> } }).process?.env;
    if (this._debug || env?.MINI_GUARD_DEBUG)
      console.debug('[MiniGuard]', ...args);
  }

  init(token: string): void {
    const payload = decodeJwt(token);
    if (!payload) {
      this._log('init: invalid token');
      this._roles = [];
      return;
    }
    if (isExpired(payload)) {
      this._log('init: token expired');
      this._roles = [];
      return;
    }
    const raw = this._getByPath(payload, this._rolesClaim);
    let roles: string[];
    if (Array.isArray(raw)) roles = raw.filter((v): v is string => typeof v === 'string');
    else if (typeof raw === 'string') roles = [raw];
    else roles = [];
    this._roles = this._roleNormalize ? roles.map(this._roleNormalize) : roles;
    this._log('init: roles =', this._roles);
  }

  clear(): void {
    this._log('clear');
    this._roles = [];
  }

  canAccess(feature: string, module?: string): boolean {
    if (this._roles.length === 0) {
      this._log(`canAccess(${feature}): no roles`);
      return false;
    }
    const mod = module ?? this._defaultModule;
    if (!mod) {
      this._log(`canAccess(${feature}): no module`);
      return false;
    }
    const allowed = this._map[mod]?.[feature];
    if (!allowed) {
      this._log(`canAccess(${feature}, ${mod}): feature not in map`);
      return false;
    }
    const check = this._strategy === 'all' ? 'every' : 'some';
    const result = this._roles[check]((r) => allowed.includes(r));
    this._log(`canAccess(${feature}, ${mod}): ${result}`);
    return result;
  }

  private _getByPath(obj: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((cur, key) => {
      if (cur !== null && typeof cur === 'object') return (cur as Record<string, unknown>)[key];
      return undefined;
    }, obj);
  }
}
