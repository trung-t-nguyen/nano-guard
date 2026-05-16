# mini-angular — Agent notes

## Stack
- Angular 19, standalone components, Signals (`signal`, `computed`)
- Tailwind CSS v4 via `@tailwindcss/postcss` (no `tailwind.config.js` needed)
- `mini-guard` loaded from npm

## Key files
- `src/app/guard-demo/guard-demo.component.ts` — all demo logic
- `src/app/guard-demo/guard-demo.component.html` — template using `@for` / `@if` control flow
- `src/app/app.ts` — root component, just renders `<app-guard-demo />`
- `src/styles.css` — `@import "tailwindcss";`
- `postcss.config.mjs` — `@tailwindcss/postcss` plugin

## Angular conventions used
- Standalone components (no NgModule)
- `@for` / `@if` built-in control flow (Angular 17+)
- `signal()` for reactive state — no RxJS needed
- `[class]` binding for conditional Tailwind classes
