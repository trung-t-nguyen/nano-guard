export type FeatureRoles = Record<string, string[]>;

// Top-level keys are module identifiers (e.g. 'dashboard', 'settings', 'reporting')
export type FeatureMap = Record<string, FeatureRoles>;

export interface MiniGuardOptions {
  defaultModule?: string;
  rolesClaim?: string;
  roleTemplate?: string;
  roleTransform?: (role: string) => string;
  strategy?: 'any' | 'all';
  debug?: boolean;
}

export interface JwtPayload {
  exp?: number;
  [key: string]: unknown;
}
