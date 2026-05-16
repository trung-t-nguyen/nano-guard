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
  private _roles: string[] = [];

  constructor(featureMap: FeatureMap, optionsOrModule?: MiniGuardOptions | string) {
    this._map = featureMap;
    if (typeof optionsOrModule === 'string') {
      this._defaultModule = optionsOrModule;
      this._rolesClaim = 'roles';
      this._strategy = 'any';
    } else {
      this._defaultModule = optionsOrModule?.defaultModule;
      this._rolesClaim = optionsOrModule?.rolesClaim ?? 'roles';
      this._strategy = optionsOrModule?.strategy ?? 'any';
      // roleTransform takes precedence; roleTemplate is compiled once at construction time
      this._roleNormalize =
        optionsOrModule?.roleTransform ??
        (optionsOrModule?.roleTemplate ? buildRoleExtractor(optionsOrModule.roleTemplate) : undefined);
    }
  }

  init(token: string): void {
    const payload = decodeJwt(token);
    if (!payload || isExpired(payload)) {
      this._roles = [];
      return;
    }
    const raw = this._getByPath(payload, this._rolesClaim);
    let roles: string[];
    if (Array.isArray(raw)) roles = raw.filter((v): v is string => typeof v === 'string');
    else if (typeof raw === 'string') roles = [raw];
    else roles = [];
    this._roles = this._roleNormalize ? roles.map(this._roleNormalize) : roles;
  }

  clear(): void {
    this._roles = [];
  }

  canAccess(feature: string, module?: string): boolean {
    if (this._roles.length === 0) return false;
    const mod = module ?? this._defaultModule;
    if (!mod) return false;
    const allowed = this._map[mod]?.[feature];
    if (!allowed) return false;
    const check = this._strategy === 'all' ? 'every' : 'some';
    return this._roles[check]((r) => allowed.includes(r));
  }

  private _getByPath(obj: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((cur, key) => {
      if (cur !== null && typeof cur === 'object') return (cur as Record<string, unknown>)[key];
      return undefined;
    }, obj);
  }
}
