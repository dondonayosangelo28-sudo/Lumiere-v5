# LUMIÈRE frontend implementation skill

## Purpose and authority

Read this document before any frontend or UI/UX work in this repository. This is
an audit of the **restored, current source**, not a redesign proposal, generated
component kit, or specification for features from earlier chat history.

Companion references:

- [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md): colors, cascade, typography, layout,
  component styling, motion, responsive behavior, and known inconsistencies.
- [COMPONENT_REFERENCE.md](./COMPONENT_REFERENCE.md): actual exports, properties,
  usage, and page-local boundaries.

Repository instructions in `AGENTS.md` and `CLAUDE.md` still apply. These documents
supplement rather than replace those instructions.

### Audit evidence and limits

- **Verified:** all 12 `src/pages/*.tsx` files; every component under
  `src/components/`, including `StatCards/`; `src/index.css`; entrypoint,
  navigation definitions, role access rules, calendar helpers, shared password
  policy/time formatting, public asset inventory, package/configuration files,
  and existing documentation. Shared auth/store exports were inspected for
  frontend integration, not exhaustively audited for security.
- **Verified:** audit baseline is the restore commit
  `45ea0e0` (`[restore] Use fixed Executive dashboard heading`).
  `EventAssets.tsx` is absent. Executive Event Asset Details currently resolves
  to `ModulePlaceholder` through `RoleModulePage` in `src/pages/RoleViews.tsx`.
  Do not document or assume the earlier asset viewer exists in this version.
- **Limited:** attempts to read `src/App.tsx` were redacted by the workspace
  tools (`vault unavailable`). App-level theme persistence, public URL switching,
  and route lifecycle details are therefore not independently verified in this
  audit. Inspect that file when accessible before changing app-level wiring.
- **Not performed:** browser screenshots, computed-style measurements, or
  viewport/keyboard interaction tests. Values here are source-derived, not
  claims of successful visual regression testing.
- **Inferred conventions** and **recommended future checks** are labeled as such.
  Numeric conversions from Tailwind units assume the verified 16px root font.

## MANDATORY INSTRUCTIONS FOR FUTURE AI FRONTEND DEVELOPMENT

1. **Read `docs/SKILL.md` before starting any frontend or UI/UX task.**
   Read the relevant sections of its two companion files and repository
   instructions as well.
2. **Treat the existing frontend as the visual source of truth.** Inspect the
   actual implementation, not old screenshots, previous conversations, or an
   imagined generic dashboard. Where this audit and live source diverge, verify
   the source and update documentation only within the authorized task.
3. **Reuse existing components, styles, and design tokens.** Start with
   `src/components/ui.tsx`, `AdminKit.tsx`, `Dropdown.tsx`, `DatePicker.tsx`,
   `Modal.tsx`, `Drawer.tsx`, and the nearest existing page.
4. **Match the exact established colors, typography, spacing, sizing, and
   component styling.** Inter Variable, neutral surfaces, pill actions,
   compact controls, restrained status color, and the actual token cascade are
   not optional. Do not replace OKLCH source values with approximate HEX values.
5. **Maintain consistency across every page and feature.** Match the relevant
   page family, including scoped dark styles. Do not globally flatten deliberate
   differences between dashboard cards, admin tables, and authentication.
6. **Follow existing responsive and interaction patterns.** Preserve the
   1024px shell breakpoint, mobile sidebar behavior, scrolling table wrappers,
   overlay focus management, keyboard interactions, and reduced-motion handling.
7. **Inspect existing implementations before creating new components.**
   Distinguish reusable exports from private helpers. Do not introduce a second
   button, select, dialog, navigation, or table framework without demonstrated
   need and explicit scope.
8. **Never introduce a different design language without explicit authorization.**
   No beige/brown theme, serif headings, new brand palette, new font family, or
   unsolicited marketing-style layout.
9. **Avoid unnecessary redesigns and modifications to unrelated components.**
   Do not “correct” the inconsistencies listed in the design reference as part
   of unrelated feature work. Request authorization for cross-app normalization.
10. **Verify visual consistency after every implementation.** Check light/dark
    themes, narrow/wide layouts, long content, focus, overlays, and relevant
    states. Run appropriate repository checks. Report exactly what ran and any
    unverified behavior; a successful build is not visual or functional proof.
11. Preserve role-based navigation and `canAccess` behavior. Hiding a navigation
    item is not a security boundary. The current authentication/logging system
    is a browser prototype, not a backend.
12. Preserve the current shell, header, logo, footer, breadcrumb behavior, and
    scoped CSS hooks unless the task explicitly authorizes changing them.

## Frontend architecture

### Verified stack

`package.json` declares React/React DOM `^19.0.0`, Vite `^8.0.5`, TypeScript
`^5.7.0`, Tailwind `^4.0.0`, `@tailwindcss/vite`, `@vitejs/plugin-react`,
`@base-ui/react`, `lucide-react`, `@fontsource-variable/inter`, `tw-animate-css`,
`shadcn`, `cn`, `class-variance-authority`, and `html-to-image`.

- This is **Vite + React**, not Next.js. No React Router dependency is declared.
- `src/main.tsx` mounts `App` and `SignInBanner` inside `React.StrictMode`, imports
  `src/index.css`, and targets `#root`.
- The observed navigation API is `Route` plus `go(route)` and
  `NavigationContext`; use those boundaries rather than adding router links.
- `vite.config.ts` supplies React/Tailwind/Figma plugins and the `@` → `src`
  alias. TypeScript matches the alias, enables `strict`, uses bundler resolution,
  `react-jsx`, and `noEmit`.
- Tailwind v4 is CSS-first. There is no need to add a Tailwind JS or PostCSS
  configuration. Preserve CSS import order.
- `components.json` is shadcn `base-mira`, neutral base, Lucide, CSS variables,
  `rsc: false`; the real UI is a custom `ui.tsx` module, **not** a generated
  `components/ui/` directory. Installed packages do not imply every API is used.
- `.mise.toml`: Node 22 and pnpm 10.34.3.

### Source map

| Path | Responsibility |
| --- | --- |
| `src/App.tsx` | Application orchestration; inspect directly before wiring changes (audit access limited) |
| `src/index.css` | Font imports, both token families, scoped overrides, animation utilities |
| `src/components/Shell.tsx` | `Route`, role navigation, logo, top bar, sidebar, shell context |
| `src/components/NavigationContext.ts` | Current route/go context and breadcrumb map |
| `src/components/adminNavigation.ts` | Typed admin navigation/filter intents |
| `src/components/ui.tsx` | Core presentation primitives and `cx` |
| `src/components/AdminKit.tsx` | Admin field styles, filters, paging, skeleton/empty rows, feedback |
| `src/components/AuthShell.tsx` | Public auth frame, fields, password UI, notices, auth buttons |
| `src/components/OverlayLayer.tsx` | Shared portal stack, inert background, scroll lock, focus/Escape |
| `src/components/StatCards/` | Reorderable summary groups and `StatCardData` |
| `src/pages/` | Page components and their private/domain-local helpers |
| `src/auth/` | Browser prototype store, sessions, mock service, policies, metric selectors, demo fixtures |
| `src/data.ts` | Project fixtures, quick-task fixtures, legacy sample role data |
| `src/lib/utils.ts` | Re-export of `cn` from the installed package |
| `public/lumiere-logo.png` | Existing wordmark; rendered with `dark:invert` |
| `scripts/verify-*.mjs` | Standalone data/auth/metric regression scripts |
| `docs/` | Existing prototype logging, history, and snapshot notes |

### Naming and implementation conventions

Verified source uses PascalCase `.tsx` component/page files, camelCase helpers and
props, inline typed props, `import type`, controlled inputs, hooks, and
composition via `children`. Most styling is utility classes in JSX; global
variants and tokens live in `index.css`. `cx` joins truthy strings; it does not
resolve conflicting Tailwind classes. A separate `cn` re-export exists but is
not interchangeable by assumption.

Repository instructions say to default-export components. Existing shared
modules (`ui.tsx`, `AdminKit.tsx`, `AuthShell.tsx`, `RoleViews.tsx`, dashboard
helpers) also have named exports. **Do not rewrite those existing exports.**
Use default exports for new standalone components, preserving established named
exports for shared helper modules. Existing files predominantly use single
quotes and omit semicolons; use double quotes for apostrophe-containing strings
as required by `AGENTS.md`.

### State and data boundaries

- Pages use local `useState`, `useMemo`, and `useEffect`; admin account/logging
  views subscribe with `useSyncExternalStore(subscribeAccounts, accountsVersion)`.
- Browser demo state is documented in `docs/prototype-logging.md`.
  Reuse the existing mock service for relevant authorized workflows instead of
  bypassing its state rules.
- Role names and lifecycle/status types come from `src/auth/store.ts`.
  `src/data.ts` contains a separate legacy role fixture: do not use it as the
  access-control source.
- Use `auth/passwordPolicy.ts` for password constraints and
  `auth/manilaTime.ts` for security/audit timestamps. Some other pages use local
  date formatting; this inconsistency is documented, not silently normalized.
- `StatCards` persists user/group-specific card ordering in localStorage.
  Other local UI state is not necessarily persisted.
- Do not introduce infrastructure or dependencies just to reproduce these
  visual patterns.

## Existing screens and correct references

| Page family | Actual source | What to inspect before related work |
| --- | --- | --- |
| Admin dashboard | `pages/Overview.tsx`, `AdminDashboardCards.tsx` | Scoped dark cards, hero, summaries, SVG charts, range controls |
| Executive/role dashboards | `pages/RoleViews.tsx` | Executive hero and fixed heading; reorderable role module cards |
| Accounts / Deleted Users | `pages/Accounts.tsx` | Filters, wide table, status badges, compact details modal, create/edit drawers |
| Security | `pages/Security.tsx` | Compact CSS tabs, semantic panels, filters, tables, confirmations |
| Audit Logs | `pages/AuditLogs.tsx` | Explicit filter submission, date validation, read-only detail drawer |
| Projects / Deleted Projects | `pages/Projects.tsx` | Different table density, local filters, modal forms, show-more behavior |
| Recent Projects | `pages/OverviewExtras.tsx` | Event Manager card, paging, CSV/image export and project dialogs |
| Settings | `pages/Settings.tsx` | Left navigation card, profile edit mode, password form, local toggles |
| Login | `pages/Login.tsx` | Login-specific dark surfaces, custom door illustration, social demo notices |
| Invitation | `pages/SetPassword.tsx` | Loading, valid/expired/invalid/used invite, retry, completion states |
| Password recovery | `pages/ForgotPassword.tsx` | Identify → six-digit OTP → password reset → done |
| Role module placeholders | `pages/RoleViews.tsx` | Existing centered “Coming soon” card, not a completed operational workflow |

## Practical implementation procedure

1. Confirm the task is implementation, not audit/review. For documentation-only
   requests, touch documentation only.
2. Read the nearest implemented page and the actual component signatures.
3. Identify the page family and CSS scope. Use `PageHeader`, `Card`, `Button`,
   `Field`, `Input`, `Badge`, and appropriate admin/auth helpers.
4. Preserve the existing shell. Pass `go` or use navigation context; use
   `roleConfig.ts` rather than duplicating role/module lists.
5. Keep exact values that define the shell and special tabs. Prefer existing
   spacing utilities for new content over arbitrary one-off values.
6. Add only necessary local state and wire every displayed control. Include
   initial empty, no-match, error, and loading states appropriate to the feature.
7. Use `Modal` or `Drawer` so `OverlayLayer` manages focus, portals and scroll.
   Place dropdown/date-picker portals inside the overlay container using the
   existing implementations.
8. Verify relevant permissions, event handlers, disabled/busy behavior,
   responsive overflow, status labels, theme contrast, and long content.
9. Keep changes narrowly scoped; update documentation if authorized work changes
   a documented contract.

## Verification standards and commands

These are **future implementation checks**, not claims that this documentation
audit ran or passed them:

- Build: `pnpm build` (`vite build`).
- Typecheck: `pnpm exec tsc --noEmit` (also prescribed by existing prototype docs).
- Formatting entrypoint: `pnpm format` (`oxfmt`). Scope formatter execution to
  intended files; do not reformat the entire frontend for a documentation task.
- Existing regression example:
  `node --experimental-strip-types scripts/verify-audit-security.mjs`.
  Additional focused scripts cover time windows, summary trends/snapshots/demo/
  comparison preview, user distribution, and sample-user removal. Inspect the
  relevant script before choosing it. There is no declared `test` or `lint`
  package script.
- The dev server is already supervised; do not start a second one.

Visual/interaction checklist:

- Light and dark; dashboard-specific scopes versus ordinary cards.
- Below/at 640, 768, 1024, 1280, and 1536px where the page uses those breakpoints.
- Collapsed desktop rail, expanded sidebar, mobile overlay and close-on-select.
- Search/filter reset, explicit submit where appropriate, safe pagination after
  filtering, empty and no-match rows.
- Tab/Shift+Tab, Escape, return focus, nested menus, labels and validation messages.
- Busy states prevent duplicate submission; destructive copy states the effect.
- Long names/emails, large counts, missing values, horizontal table scrolling.
- Reduced motion; report any untested cases and existing limitations.
