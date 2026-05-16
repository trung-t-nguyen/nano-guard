import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MiniGuard } from 'mini-guard';

// ── Feature map ──────────────────────────────────────────────────────────────
const featureMap = {
  dashboard: {
    'view:reports': ['admin', 'analyst'],
    'edit:reports': ['admin'],
    'export:data': ['admin', 'analyst'],
  },
  settings: {
    'manage:users': ['admin'],
    'view:logs': ['admin', 'analyst'],
    'edit:profile': ['admin', 'analyst', 'viewer'],
  },
  billing: {
    'view:invoices': ['admin', 'billing'],
    'manage:subscriptions': ['admin'],
    'view:billing': ['admin', 'billing', 'analyst'],
  },
};

// ── Demo token builder (unsigned — for demo only) ────────────────────────────
function b64url(obj: object): string {
  return btoa(JSON.stringify(obj))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function mockToken(payload: object): string {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.demo_sig`;
}

function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1] ?? '';
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

const FAR_FUTURE = 9_999_999_999; // year ~2286

// ── Preset users ─────────────────────────────────────────────────────────────
const PRESET_USERS = [
  {
    label: 'Admin',
    bg: 'bg-violet-600',
    badge: 'bg-violet-100 text-violet-800',
    description: 'Full access to everything',
    roles: ['admin'],
    token: mockToken({ sub: '1', name: 'Admin User', roles: ['admin'], exp: FAR_FUTURE }),
  },
  {
    label: 'Analyst',
    bg: 'bg-blue-600',
    badge: 'bg-blue-100 text-blue-800',
    description: 'Can view & export reports',
    roles: ['analyst'],
    token: mockToken({ sub: '2', name: 'Analyst User', roles: ['analyst'], exp: FAR_FUTURE }),
  },
  {
    label: 'Viewer',
    bg: 'bg-emerald-600',
    badge: 'bg-emerald-100 text-emerald-800',
    description: 'Can only edit own profile',
    roles: ['viewer'],
    token: mockToken({ sub: '3', name: 'Viewer User', roles: ['viewer'], exp: FAR_FUTURE }),
  },
  {
    label: 'Billing Mgr',
    bg: 'bg-amber-600',
    badge: 'bg-amber-100 text-amber-800',
    description: 'Access to billing module',
    roles: ['billing'],
    token: mockToken({ sub: '4', name: 'Billing Manager', roles: ['billing'], exp: FAR_FUTURE }),
  },
  {
    label: 'Guest',
    bg: 'bg-slate-500',
    badge: 'bg-slate-100 text-slate-800',
    description: 'No token — zero access',
    roles: [],
    token: null,
  },
] as const;

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  settings: 'Settings',
  billing: 'Billing',
};

export interface FeatureRow {
  feat: string;
  allowedRoles: string[];
  mod: string;
}

export interface ModuleGroup {
  mod: string;
  label: string;
  features: FeatureRow[];
}

@Component({
  selector: 'app-guard-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './guard-demo.component.html',
})
export class GuardDemoComponent {
  private guard = new MiniGuard(featureMap, { defaultModule: 'dashboard' });

  presetUsers = PRESET_USERS;
  activeLabel = signal<string | null>(null);
  roles = signal<string[]>([]);
  tokenPreview = signal<string | null>(null);
  customInput = signal('');
  customOpen = signal(false);
  tick = signal(0); // drives re-evaluation of canAccess

  moduleGroups: ModuleGroup[] = Object.entries(featureMap).map(([mod, features]) => ({
    mod,
    label: MODULE_LABELS[mod] ?? mod,
    features: Object.entries(features).map(([feat, allowedRoles]) => ({
      feat,
      allowedRoles: allowedRoles as string[],
      mod,
    })),
  }));

  canAccess(feat: string, mod: string): boolean {
    void this.tick(); // reactive dependency
    return this.guard.canAccess(feat, mod);
  }

  applyToken(token: string | null) {
    if (token) {
      this.guard.init(token);
      const payload = decodePayload(token);
      const raw = payload?.['roles'];
      this.roles.set(Array.isArray(raw) ? raw.filter((r): r is string => typeof r === 'string') : []);
      this.tokenPreview.set(token);
    } else {
      this.guard.clear();
      this.roles.set([]);
      this.tokenPreview.set(null);
    }
    this.tick.update((t) => t + 1);
  }

  loginAs(user: (typeof PRESET_USERS)[number]) {
    this.applyToken(user.token as string | null);
    this.activeLabel.set(user.label);
    this.customOpen.set(false);
  }

  loginCustom() {
    const t = this.customInput().trim();
    if (!t) return;
    this.applyToken(t);
    this.activeLabel.set('Custom');
    this.customOpen.set(false);
  }

  logout() {
    this.guard.clear();
    this.roles.set([]);
    this.tokenPreview.set(null);
    this.activeLabel.set(null);
    this.tick.update((t) => t + 1);
  }

  toggleCustomOpen() {
    this.customOpen.update((o) => !o);
  }

  onCustomInputChange(value: string) {
    this.customInput.set(value);
  }

  truncateToken(token: string): string {
    return token.length > 120 ? token.slice(0, 120) + '…' : token;
  }

  codeSnippet(): string {
    return `import { MiniGuard } from 'mini-guard';

const guard = new MiniGuard(featureMap, {
  defaultModule: 'dashboard',
});

guard.init(rawJwtToken);       // after login
guard.canAccess('view:reports');          // → ${this.guard.canAccess('view:reports', 'dashboard')}
guard.canAccess('edit:reports');          // → ${this.guard.canAccess('edit:reports', 'dashboard')}
guard.canAccess('manage:users', 'settings'); // → ${this.guard.canAccess('manage:users', 'settings')}
guard.clear();                 // on logout`;
  }
}
