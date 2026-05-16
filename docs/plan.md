# mini-guard Implementation Plan

## Context
`mini-guard` is an ultra-lightweight (<1KB gzipped), zero-dependency, ESM-only NPM package for frontend RBAC. It decodes JWTs in the browser via native `atob()`, extracts user roles, and evaluates access against a centralized feature-to-role config map with optional multi-module and multi-environment support.

**Multi-environment problem:** In real deployments, backends prefix/suffix role names with the environment (e.g. `admin` → `dev_admin`, `app1_dev_admin`). The feature map always uses canonical role names (`admin`, `analyst`), and mini-guard normalizes JWT roles at `init()` time via a compiled template or a custom function.

---

## File Structure

```
mini-guard/
├── src/
│   ├── index.ts              # barrel export
│   ├── mini-guard.ts         # MiniGuard class
│   ├── jwt.ts                # decodeJwt + isExpired
│   └── types.ts              # TypeScript types
├── tests/
│   ├── helpers.ts            # makeJwt, futureExp, pastExp
│   ├── jwt.test.ts
│   └── mini-guard.test.ts
├── docs/
│   └── plan.md
├── eslint.config.js          # ESLint flat config (typescript-eslint)
├── package.json
├── tsconfig.json             # build config (excludes tests/)
├── tsconfig.eslint.json      # lint config (includes src/ + tests/)
├── tsup.config.ts
└── vitest.config.ts
```

---

## Scaffolding

**`package.json`**
```json
{
  "name": "mini-guard",
  "version": "0.1.0",
  "description": "Ultra-lightweight (<1KB) zero-dependency frontend RBAC with JWT support",
  "type": "module",
  "files": ["dist", "README.md", "LICENSE"],
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "sideEffects": false,
  "scripts": {
    "build": "tsup",
    "build:check": "tsc --noEmit",
    "lint": "eslint src tests",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "size:gz": "tsup && gzip -c dist/index.js | wc -c",
    "prepublishOnly": "npm run build:check && npm run lint && npm run build && npm test"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "^1.6.0",
    "eslint": "^10.4.0",
    "jsdom": "^29.1.1",
    "tsup": "^8.0.0",
    "typescript": "^5.4.0",
    "typescript-eslint": "^8.59.3",
    "vitest": "^1.6.0"
  }
}
```

**`tsconfig.json`** — used by `tsc` and `tsup` (excludes `tests/` so they are not compiled into the bundle)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],
    "outDir": "./dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "isolatedModules": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```
Note: `"lib": ["ES2022", "DOM"]` is required so TypeScript knows about `atob`.

**`tsconfig.eslint.json`** — used by ESLint only; extends the build config but overrides `exclude` to include `tests/`
```json
{
  "extends": "./tsconfig.json",
  "include": ["src", "tests", "eslint.config.js"],
  "exclude": ["node_modules", "dist"]
}
```
Note: `exclude` must be overridden — inherited `exclude` from the base config would otherwise still omit `tests/`.

**`tsup.config.ts`**
```typescript
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2022',
  dts: true,
  sourcemap: false,
  clean: true,
  minify: true,
  treeshake: true,
  splitting: false,
  outDir: 'dist',
});
```

**`vitest.config.ts`**
```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
    },
  },
});
```
Note: `environment: 'jsdom'` provides `atob`/`btoa` browser globals in the test environment.

**`eslint.config.js`** — ESLint 9 flat config using `typescript-eslint`'s type-aware ruleset
```javascript
// @ts-check
import tseslint from 'typescript-eslint';

export default tseslint.config({
  extends: tseslint.configs.recommendedTypeChecked,
  ignores: ['dist/**', 'coverage/**'],
  languageOptions: {
    parserOptions: {
      project: './tsconfig.eslint.json',
    },
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
});
```

---

## Types (`src/types.ts`)

```typescript
export type FeatureRoles = Record<string, string[]>;

// Top-level keys are module identifiers (e.g. 'dashboard', 'settings', 'reporting')
export type FeatureMap = Record<string, FeatureRoles>;

export interface MiniGuardOptions {
  defaultModule?: string;
  rolesClaim?: string;
  roleTemplate?: string;
  roleTransform?: (role: string) => string;
  strategy?: 'any' | 'all';
}

export interface JwtPayload {
  exp?: number;
  [key: string]: unknown;
}
```

Naming rationale:
- `defaultModule` — "appId" clashes with OAuth `client_id`, Firebase App ID, Apple bundle ID; "module" is precise for multi-module frontend RBAC
- `rolesClaim` — JWT spec (RFC 7519) calls payload entries "claims"; more precise than "key"
- `roleTemplate` — template pattern is widely understood; consistent with `roleTransform` naming
- `strategy` — controls whether `canAccess` requires any or all roles to match the allowed list

---

## JWT Utilities (`src/jwt.ts`)

Pure functions, no state.

```typescript
import type { JwtPayload } from './types.js';

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // Base64url → Base64: replace URL-safe chars and let atob handle missing padding
    const base64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64)) as JwtPayload;
  } catch {
    return null;
  }
}

export function isExpired(payload: JwtPayload): boolean {
  if (payload.exp === undefined) return false;
  return payload.exp < Math.floor(Date.now() / 1000);
}
```

---

## Core Class (`src/mini-guard.ts`)

Constructor accepts either a `string` (shorthand for `defaultModule`) or `MiniGuardOptions` for full config.

**Template-to-regex conversion** (internal helper `buildRoleExtractor`):
```typescript
function buildRoleExtractor(template: string): (role: string) => string {
  // Infer separator from chars between placeholders, e.g. '_' from '{appid}_{env}_{role}'
  const sep = template.match(/\}([^{]+)\{/)?.[1] ?? '_';
  const pattern = new RegExp(
    '^' +
    template
      .replace(/[.*+?^$()|[\]\\]/g, '\\$&') // escape regex special chars (not {})
      .replace(/\{role\}/g, '(.+)')           // {role} → capture group
      .replace(/\{[^}]+\}/g, `[^${sep}]+`)   // other {x} → wildcard segment
    + '$'
  );
  return (role: string) => role.match(pattern)?.[1] ?? role; // fallback: return unchanged
}
```

**Full class:**
```typescript
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
      this._roleNormalize = optionsOrModule?.roleTransform
        ?? (optionsOrModule?.roleTemplate
          ? buildRoleExtractor(optionsOrModule.roleTemplate)
          : undefined);
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
    return this._roles[check](r => allowed.includes(r));
  }

  private _getByPath(obj: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((cur, key) => {
      if (cur !== null && typeof cur === 'object')
        return (cur as Record<string, unknown>)[key];
      return undefined;
    }, obj);
  }
}
```

---

## Barrel (`src/index.ts`)

```typescript
export { MiniGuard } from './mini-guard.js';
export type { FeatureMap, FeatureRoles, MiniGuardOptions } from './types.js';
```

Note: `.js` extensions on internal imports are required by NodeNext module resolution.

---

## Tests

**`tests/helpers.ts`** — fake JWT factory (unsigned, for unit testing only):
```typescript
export function makeJwt(payload: Record<string, unknown>): string {
  const toB64url = (s: string) =>
    s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const header = toB64url(btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = toB64url(btoa(JSON.stringify(payload)));
  return `${header}.${body}.fakesig`;
}
export const futureExp = (): number => Math.floor(Date.now() / 1000) + 3600;
export const pastExp = (): number => Math.floor(Date.now() / 1000) - 3600;
```

**`tests/jwt.test.ts`** (10 tests) — covers:
- Decodes a valid JWT payload
- Returns `null` for a string without exactly 3 segments (fewer or more)
- Returns `null` for invalid base64 in the payload segment
- Returns `null` for valid base64 that is not JSON
- Handles base64url encoding (`-` and `_` characters)
- `isExpired`: future exp → `false`
- `isExpired`: past exp → `true`
- `isExpired`: absent exp → `false`
- `isExpired`: exp = 0 → `true`
- `isExpired`: exp exactly equals current second → `false` (strict `<` boundary)

**`tests/mini-guard.test.ts`** (39 tests) — describe blocks:
- **init and clear** — no access before init, valid token grants access, clear revokes, expired token denied, malformed token denied, token without `exp` accepted, re-init replaces state, init-after-clear restores access, clear-before-init is a no-op
- **canAccess with defaultModule** — uses defaultModule, denies wrong role, denies unknown feature
- **canAccess with explicit module** — explicit module, unknown module denied, no defaultModule + no module denied, empty options object uses defaults, empty allowed-roles list denies
- **role normalization** — single-string role claim, non-string values in array ignored, missing roles claim denied, non-string non-array roles claim denied
- **rolesClaim dot-notation** — extracts from nested path, missing nested path denied, null mid-path safe, primitive mid-path safe
- **roleTemplate multi-env** — `{env}_{role}`, `{appid}_{env}_{role}`, `{role}_{env}`, role not matching template passes through, mixed array (some match, some don't)
- **roleTransform escape hatch** — custom normalizer applied, `roleTransform` takes precedence over `roleTemplate`
- **multi-module access** — admin spans modules, user has limited cross-module access
- **strategy** — `'any'` grants on at least one match, `'any'` denies when no match, `'all'` grants when every role in allowed list, `'all'` denies when any role absent, string shorthand defaults to `'any'`

---

## Verification

```bash
npm install           # install devDependencies
npm run build:check   # TypeScript type check (no emit)
npm run lint          # ESLint (typescript-eslint recommendedTypeChecked)
npm test              # 49 tests pass
npm run build         # produces dist/index.js + dist/index.d.ts
npm run size:gz       # must print ≤ 1024 (actual: ~731 bytes)
```

---

## Future Design Space

- **onTokenExpired callback**: add `onExpired?: () => void` to options; call it in `init()` when token is expired
- **React/Vue integrations**: separate packages (`mini-guard-react`, `mini-guard-vue`) with peer dependency on `mini-guard` core
