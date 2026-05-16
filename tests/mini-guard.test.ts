import { describe, it, expect, beforeEach } from 'vitest';
import { MiniGuard } from '../src/index.js';
import type { FeatureMap } from '../src/index.js';
import { makeJwt, futureExp, pastExp } from './helpers.js';

const featureMap: FeatureMap = {
  dashboard: {
    'view:reports': ['admin', 'analyst'],
    'edit:reports': ['admin'],
    'delete:reports': ['superadmin'],
  },
  settings: {
    'manage:users': ['admin'],
    'view:settings': ['admin', 'analyst', 'user'],
  },
};

describe('MiniGuard — init and clear', () => {
  it('denies access before init()', () => {
    const guard = new MiniGuard(featureMap, 'dashboard');
    expect(guard.canAccess('view:reports')).toBe(false);
  });

  it('grants access after init() with a valid token', () => {
    const guard = new MiniGuard(featureMap, 'dashboard');
    guard.init(makeJwt({ roles: ['admin'], exp: futureExp() }));
    expect(guard.canAccess('view:reports')).toBe(true);
  });

  it('revokes access after clear()', () => {
    const guard = new MiniGuard(featureMap, 'dashboard');
    guard.init(makeJwt({ roles: ['admin'], exp: futureExp() }));
    guard.clear();
    expect(guard.canAccess('view:reports')).toBe(false);
  });

  it('denies access for an expired token', () => {
    const guard = new MiniGuard(featureMap, 'dashboard');
    guard.init(makeJwt({ roles: ['admin'], exp: pastExp() }));
    expect(guard.canAccess('view:reports')).toBe(false);
  });

  it('denies access for a malformed token', () => {
    const guard = new MiniGuard(featureMap, 'dashboard');
    guard.init('not.a.valid.jwt');
    expect(guard.canAccess('view:reports')).toBe(false);
  });

  it('accepts a token without exp (no expiry)', () => {
    const guard = new MiniGuard(featureMap, 'dashboard');
    guard.init(makeJwt({ roles: ['admin'] }));
    expect(guard.canAccess('view:reports')).toBe(true);
  });

  it('re-init replaces previous token state', () => {
    const guard = new MiniGuard(featureMap, 'dashboard');
    guard.init(makeJwt({ roles: ['analyst'], exp: futureExp() }));
    expect(guard.canAccess('edit:reports')).toBe(false);
    guard.init(makeJwt({ roles: ['admin'], exp: futureExp() }));
    expect(guard.canAccess('edit:reports')).toBe(true);
  });

  it('init() after clear() restores access', () => {
    const guard = new MiniGuard(featureMap, 'dashboard');
    guard.init(makeJwt({ roles: ['admin'], exp: futureExp() }));
    guard.clear();
    guard.init(makeJwt({ roles: ['admin'], exp: futureExp() }));
    expect(guard.canAccess('edit:reports')).toBe(true);
  });

  it('clear() before init() is a safe no-op', () => {
    const guard = new MiniGuard(featureMap, 'dashboard');
    expect(() => guard.clear()).not.toThrow();
    expect(guard.canAccess('view:reports')).toBe(false);
  });
});

describe('MiniGuard — canAccess with defaultModule', () => {
  let guard: MiniGuard;
  beforeEach(() => {
    guard = new MiniGuard(featureMap, 'dashboard');
    guard.init(makeJwt({ roles: ['analyst'], exp: futureExp() }));
  });

  it('uses defaultModule when module is omitted', () => {
    expect(guard.canAccess('view:reports')).toBe(true);
  });

  it('denies a role not in the allowed list', () => {
    expect(guard.canAccess('edit:reports')).toBe(false);
  });

  it('denies an unknown feature', () => {
    expect(guard.canAccess('nonexistent:feature')).toBe(false);
  });
});

describe('MiniGuard — canAccess with explicit module', () => {
  let guard: MiniGuard;
  beforeEach(() => {
    guard = new MiniGuard(featureMap, 'dashboard');
    guard.init(makeJwt({ roles: ['admin'], exp: futureExp() }));
  });

  it('accesses a feature in an explicit module', () => {
    expect(guard.canAccess('manage:users', 'settings')).toBe(true);
  });

  it('denies access for an unknown module', () => {
    expect(guard.canAccess('view:reports', 'unknownModule')).toBe(false);
  });

  it('denies when no defaultModule and no module passed', () => {
    const g = new MiniGuard(featureMap);
    g.init(makeJwt({ roles: ['admin'], exp: futureExp() }));
    expect(g.canAccess('view:reports')).toBe(false);
  });

  it('constructor with empty options object uses all defaults', () => {
    const g = new MiniGuard(featureMap, {});
    g.init(makeJwt({ roles: ['admin'], exp: futureExp() }));
    // no defaultModule set — explicit module required
    expect(g.canAccess('view:reports', 'dashboard')).toBe(true);
    expect(g.canAccess('view:reports')).toBe(false);
  });

  it('denies when feature exists but allowed roles list is empty', () => {
    const map: FeatureMap = { portal: { 'view:home': [] } };
    const g = new MiniGuard(map, 'portal');
    g.init(makeJwt({ roles: ['admin'], exp: futureExp() }));
    expect(g.canAccess('view:home')).toBe(false);
  });
});

describe('MiniGuard — role normalization', () => {
  it('handles a single string role claim (not an array)', () => {
    const guard = new MiniGuard(featureMap, 'dashboard');
    guard.init(makeJwt({ roles: 'admin', exp: futureExp() }));
    expect(guard.canAccess('edit:reports')).toBe(true);
  });

  it('ignores non-string values in the roles array', () => {
    const guard = new MiniGuard(featureMap, 'dashboard');
    guard.init(makeJwt({ roles: ['admin', 42, null, 'analyst'], exp: futureExp() }));
    expect(guard.canAccess('view:reports')).toBe(true);
    expect(guard.canAccess('edit:reports')).toBe(true);
  });

  it('denies when roles claim is missing', () => {
    const guard = new MiniGuard(featureMap, 'dashboard');
    guard.init(makeJwt({ sub: '123', exp: futureExp() }));
    expect(guard.canAccess('view:reports')).toBe(false);
  });

  it('denies when roles claim is a non-string, non-array type', () => {
    const guard = new MiniGuard(featureMap, 'dashboard');
    guard.init(makeJwt({ roles: { nested: 'admin' }, exp: futureExp() }));
    expect(guard.canAccess('view:reports')).toBe(false);
  });
});

describe('MiniGuard — rolesClaim (dot-notation path)', () => {
  let guard: MiniGuard;
  beforeEach(() => {
    guard = new MiniGuard(featureMap, {
      defaultModule: 'dashboard',
      rolesClaim: 'user.auth.roles',
    });
  });

  it('extracts roles from a nested JWT path', () => {
    guard.init(makeJwt({ user: { auth: { roles: ['analyst'] } }, exp: futureExp() }));
    expect(guard.canAccess('view:reports')).toBe(true);
    expect(guard.canAccess('edit:reports')).toBe(false);
  });

  it('denies when the nested path does not exist', () => {
    guard.init(makeJwt({ roles: ['admin'], exp: futureExp() }));
    expect(guard.canAccess('view:reports')).toBe(false);
  });

  it('safely handles a null value mid-path', () => {
    guard.init(makeJwt({ user: null, exp: futureExp() }));
    expect(guard.canAccess('view:reports')).toBe(false);
  });

  it('safely handles a primitive value mid-path', () => {
    guard.init(makeJwt({ user: 42, exp: futureExp() }));
    expect(guard.canAccess('view:reports')).toBe(false);
  });
});

describe('MiniGuard — roleTemplate (multi-env)', () => {
  it('extracts role from env prefix: {env}_{role}', () => {
    const guard = new MiniGuard(featureMap, {
      defaultModule: 'dashboard',
      roleTemplate: '{env}_{role}',
    });
    guard.init(makeJwt({ roles: ['dev_admin', 'dev_analyst'], exp: futureExp() }));
    expect(guard.canAccess('view:reports')).toBe(true);
    expect(guard.canAccess('edit:reports')).toBe(true);
  });

  it('extracts role from app+env prefix: {appid}_{env}_{role}', () => {
    const guard = new MiniGuard(featureMap, {
      defaultModule: 'dashboard',
      roleTemplate: '{appid}_{env}_{role}',
    });
    guard.init(makeJwt({ roles: ['app1_dev_admin', 'app1_dev_analyst'], exp: futureExp() }));
    expect(guard.canAccess('view:reports')).toBe(true);
    expect(guard.canAccess('edit:reports')).toBe(true);
    expect(guard.canAccess('delete:reports')).toBe(false);
  });

  it('extracts role from env suffix: {role}_{env}', () => {
    const guard = new MiniGuard(featureMap, {
      defaultModule: 'dashboard',
      roleTemplate: '{role}_{env}',
    });
    guard.init(makeJwt({ roles: ['admin_prod'], exp: futureExp() }));
    expect(guard.canAccess('edit:reports')).toBe(true);
  });

  it('passes through a role unchanged when it does not match the template', () => {
    const guard = new MiniGuard(featureMap, {
      defaultModule: 'dashboard',
      roleTemplate: '{env}_{role}',
    });
    guard.init(makeJwt({ roles: ['admin'], exp: futureExp() }));
    expect(guard.canAccess('edit:reports')).toBe(true);
  });

  it('handles a mixed array where some roles match the template and some do not', () => {
    const guard = new MiniGuard(featureMap, {
      defaultModule: 'dashboard',
      roleTemplate: '{env}_{role}',
    });
    guard.init(makeJwt({ roles: ['dev_admin', 'analyst'], exp: futureExp() }));
    expect(guard.canAccess('edit:reports')).toBe(true);
    expect(guard.canAccess('view:reports')).toBe(true);
  });
});

describe('MiniGuard — roleTransform escape hatch', () => {
  it('applies a custom normalizer function', () => {
    const guard = new MiniGuard(featureMap, {
      defaultModule: 'dashboard',
      roleTransform: (role) => role.replace(/^(dev|stg|prod)_/, ''),
    });
    guard.init(makeJwt({ roles: ['dev_admin', 'stg_analyst'], exp: futureExp() }));
    expect(guard.canAccess('edit:reports')).toBe(true);
    expect(guard.canAccess('view:reports')).toBe(true);
  });

  it('roleTransform takes precedence over roleTemplate', () => {
    const guard = new MiniGuard(featureMap, {
      defaultModule: 'dashboard',
      roleTemplate: '{env}_{role}',
      roleTransform: () => 'analyst',
    });
    guard.init(makeJwt({ roles: ['anything'], exp: futureExp() }));
    expect(guard.canAccess('view:reports')).toBe(true);
    expect(guard.canAccess('edit:reports')).toBe(false);
  });
});

describe('MiniGuard — multi-module access', () => {
  it('admin can access features across multiple modules', () => {
    const guard = new MiniGuard(featureMap, 'dashboard');
    guard.init(makeJwt({ roles: ['admin'], exp: futureExp() }));
    expect(guard.canAccess('view:reports', 'dashboard')).toBe(true);
    expect(guard.canAccess('manage:users', 'settings')).toBe(true);
    expect(guard.canAccess('view:settings', 'settings')).toBe(true);
  });

  it('user role has limited cross-module access', () => {
    const guard = new MiniGuard(featureMap, 'dashboard');
    guard.init(makeJwt({ roles: ['user'], exp: futureExp() }));
    expect(guard.canAccess('view:reports', 'dashboard')).toBe(false);
    expect(guard.canAccess('view:settings', 'settings')).toBe(true);
  });
});

describe('MiniGuard — strategy', () => {
  it('strategy "any" (default) grants when at least one role matches', () => {
    const guard = new MiniGuard(featureMap, { defaultModule: 'dashboard', strategy: 'any' });
    guard.init(makeJwt({ roles: ['analyst', 'user'], exp: futureExp() }));
    expect(guard.canAccess('view:reports')).toBe(true);
  });

  it('strategy "any" denies when no role matches', () => {
    const guard = new MiniGuard(featureMap, { defaultModule: 'dashboard', strategy: 'any' });
    guard.init(makeJwt({ roles: ['user'], exp: futureExp() }));
    expect(guard.canAccess('view:reports')).toBe(false);
  });

  it('strategy "all" grants when every role is in the allowed list', () => {
    const guard = new MiniGuard(featureMap, { defaultModule: 'dashboard', strategy: 'all' });
    guard.init(makeJwt({ roles: ['admin', 'analyst'], exp: futureExp() }));
    expect(guard.canAccess('view:reports')).toBe(true);
  });

  it('strategy "all" denies when any role is not in the allowed list', () => {
    const guard = new MiniGuard(featureMap, { defaultModule: 'dashboard', strategy: 'all' });
    guard.init(makeJwt({ roles: ['admin', 'user'], exp: futureExp() }));
    expect(guard.canAccess('view:reports')).toBe(false);
  });

  it('string shorthand constructor defaults to strategy "any"', () => {
    const guard = new MiniGuard(featureMap, 'dashboard');
    guard.init(makeJwt({ roles: ['analyst'], exp: futureExp() }));
    expect(guard.canAccess('view:reports')).toBe(true);
  });
});
