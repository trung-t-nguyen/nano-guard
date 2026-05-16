# mini-angular

Angular 19 demo app showcasing [mini-guard](https://www.npmjs.com/package/mini-guard) — ultra-lightweight RBAC with JWT support.

## Development

```bash
npm run start   # dev server at http://localhost:4200
npm run build   # production build
```

## What this demo shows

- `MiniGuard` instance created with a feature-map (dashboard / settings / billing modules)
- Preset users (Admin, Analyst, Viewer, Billing Mgr, Guest) generate unsigned demo JWTs
- `guard.init(token)` decodes the JWT and loads roles
- `guard.canAccess(feature, module)` is called live in the access matrix
- `guard.clear()` wipes session on logout
- Custom JWT paste panel lets you try any real token

## Tech stack

- **Angular 19** — standalone components, Signals
- **Tailwind CSS v4** — via `@tailwindcss/postcss`
- **mini-guard** — zero-dependency RBAC library
