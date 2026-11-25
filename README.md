# LUMIÈRE Frontend Application

React 19 + TypeScript + Vite + Tailwind CSS v4 dashboard and operational console for LUMIÈRE event management and operations.

## Setup and Development

### Prerequisites

- Node.js >= 22 (managed via `.mise.toml`)
- pnpm >= 10

### Installation

```bash
pnpm install
```

### Development Server

Start the local Vite development server:

```bash
pnpm run dev
```

The Vite dev server starts with hot module replacement (HMR).

### Building and Serving Production

Build production assets into `dist/`:

```bash
pnpm run build
```

Preview the production build locally:

```bash
pnpm run preview
```

The production preview serves the optimized bundles from `dist/`.

## Canonical Root Application

- `src/main.tsx` — Application entrypoint; mounts `#root` and `SignInBanner` within `React.StrictMode`, imports `src/index.css`, and mounts `App`.
- `src/App.tsx` — Application orchestration, route resolution, session gating, and top-level view composition.
- `src/index.css` — Global CSS entrypoint with Tailwind CSS v4 `@import 'tailwindcss';`, font-face imports, theme tokens, and animations.
- `index.html` — HTML shell hosting the `#root` element.
- `vite.config.ts` — Vite configuration enabling React, Tailwind v4, and `@` path alias.
- `package.json` — Tooling scripts and dependencies.

## Architecture Boundaries

The application is structured into decoupled modules with clear responsibilities:

### 1. Navigation & Theme
- `src/navigation.ts` — Neutral routing definitions (`Route`), URL hash invitation token parsing (`readInviteToken`), and navigation hook (`useAppNavigation`).
- `src/theme.ts` — Light/dark theme management (`useTheme`).
- `src/components/layout/NavigationContext.ts` — Shared navigation context (`route`, `go`) and breadcrumb mapping.

### 2. Event Manager Feature (`src/features/event-manager/`)
- `EventManager.tsx` — Feature entry point connecting state, routes, and views.
- `routes.ts`, `intent.ts`, `model.ts`, `preview-data.ts`, `stock-policy.ts`, `shared.tsx` — Feature models, routes, intents, and shared utilities.
- `calendar/` — Master schedule grid, mini-calendar, agenda, breakdown, preview popovers, and activity scheduling (`CalendarView.tsx`, `CalendarPreviews.tsx`, `calendar-helpers.ts`, `ActivityForm.tsx`).
- `pitch-editor/` — Multi-step pitch brief editor and budget utilities (`Editor.tsx`, `budget.ts`).
- `mood-board/` — Theme mood boards, interactive canvas, slideshows, assets, and styling:
  - `MoodBoardCanvas.tsx` — Embedded mood board canvas coordinator, owning viewport pan/zoom, selection, undo/redo, and export.
  - `canvas-constants.ts` — Starter layouts, typography options, paper presets, palette tools, and tab configurations.
  - `CanvasContextToolbar.tsx` — Contextual selection toolbar for text typography, shapes, sticky notes, opacity, and alignment.
  - `CanvasSidebarPanels.tsx` — Sidebar drawer panels for asset library, theme templates, elements, text, web inspiration, photo uploads, drawing tools, and layer ordering.
  - `CanvasPageFilmstrip.tsx` — Multi-page filmstrip thumbnail navigation, page addition/duplication, and grid overview mode.
  - `Board.tsx`, `BoardSlideshow.tsx`, `ThemeBoardEditor.tsx`, `theme-boards.ts`, `theme-templates.ts`, `board-assets.ts`, `mood-board.css`.
- `rentals/` — Event supplier catalog, rental entry, and vendor specifications (`RentalEntry.tsx`, `rental-catalog.ts`, `event-rentals.ts`).

### 3. Warehouse Feature (`src/features/warehouse/`)
- `WarehouseModules.tsx` — Warehouse route dispatcher and operational summary.
- `WarehouseDashboard.tsx` — Operational overview, fulfillment KPIs, dispatch pipeline, and quick links.
- `warehouse-shared.ts` — Shared warehouse badges, formatters, and status helpers.
- `modules/` — Dedicated workflow submodules:
  - `AssetInventoryModule.tsx` — Stock tracking, search/filter, and quick replenishment.
  - `OrderRequestsModule.tsx` — Event fulfillment, stock reservation, dispatch, and closeout.
  - `DeficitQueueModule.tsx` — Event shortage management and acquisition transitions.
  - `AssetAcquisitionModule.tsx` — Purchase orders and stock receipt ledger.
  - `CustomFabricationModule.tsx` — Custom build orders, crew instructions, and photo verification.
  - `PersonnelDeploymentModule.tsx` — Crew scheduling, lead assignment, and blocker tracking.
  - `DamageAssessmentModule.tsx` — Incident reporting, repair evaluation, and sign-off.

### 4. Ground Crew Feature (`src/features/ground-crew/`)
- `GroundCrewModules.tsx` — Ground crew route dispatcher and dashboard assignment summary.
- `ground-crew-shared.tsx` — Shared notifications, sample photo fixtures, and event selector header.
- `AssignedWorkModule.tsx` — Event assignments, task checklists, and manifest review.
- `DispatchLoadingChecksModule.tsx` — Loading verification, quantity tracking, and loading sign-off.
- `VenueArrivalAndEventHoursModule.tsx` — Arrival confirmation, direct rental receipt, and event incidents.
- `EvidenceCaptureModule.tsx` — Shift photo evidence and custom fabrication verification links.
- `WarehouseArrivalAndReturnAuditModule.tsx` — Return checklist, direct rental handback, and return damage reports.

### 5. Operations Store System (`src/operations/`)
- `store.ts` — Unified public facade re-exporting all state, hooks, and actions for backwards compatibility.
- `store-core.ts` — Core storage persistence (`OPERATIONS_STORAGE_KEY`), atomic mutations (`mutateOperationsStore`), `useOperationsStore` hook, active ground crew accounts, and manifest computation (`getEventManifestLines`).
- `store-fulfillment.ts` — Idempotent event approval publishing (`publishApprovedEventToWarehouse`), stock reservation, and full event allocation.
- `store-acquisitions.ts` — Acquisition order creation from deficit queue entries or direct restocking, and stock receipt ledger updates.
- `store-fabrication.ts` — Custom fabrication jobs (starts In Production), after-shift photo evidence linking, and Ready to Load verification.
- `store-deployment.ts` — Ground crew assignment, team lead designation audit history, and blocker status toggling.
- `store-rentals.ts` — Rental e-letters, supplier booking references, direct venue receipts, returns, and discrepancy resolutions.
- `store-dispatch.ts` — Manifest loaded quantity tracking, D03 shortfall dispatch blocking, final loading checklist sign-off, and outbound vehicle departure.
- `store-returns.ts` — Field incident reports, returned quantity audits, return checklist, damage resolution, and D05 closeout enforcement.
- `types.ts`, `apiClients.ts` — Operations data contracts, contract APIs, and mock transport.

### 6. Auth & Mock Store (`src/auth/`)
- `mockAuthService.ts` — Unified mock auth API surface (`authService`) with backward-compatible re-exports.
- `accountAdminOperations.ts` — Administrative account lifecycle operations (`createUser`, `updateAccount`, `deactivateAccount`, `deleteAccount`, `restoreAccount`, `reactivateAccount`, `unlockAccount`, `endSession`, `initiatePasswordReset`).
- `passwordRecoveryOperations.ts` — Password changes, invitation validation/acceptance, self-service recovery, and profile updates.
- `mockTransport.ts` — Latency simulation (`respond<T>`) and failure-switch injection.
- `prototypeAuth.ts` — Development-only demo credentials and reviewer helpers.
- `session.ts` — Session lifecycle, token checks, and `useSession` hook.
- `store.ts` — Browser-storage persistence (`lumiere_demo_state_v1`), audit trails, and accounts.

### 7. Dashboard Calculations (`src/dashboard/`)
- `dashboardMetrics.ts` — System Admin dashboard selectors, sign-in metrics, role distributions, and time bucketing.
- `summarySnapshots.ts` — Real 24h snapshot sampling and retention history.
- `summaryComparisonPreview.ts` — Sample preview comparison constants and trend evaluation.
- `summaryTrends.ts` — Metric-aware comparison trend computation and formatting.
- `seedSummaryDemo.ts` — One-time demo role and status seeds.
- `seedActivityHistoryDemo.ts` — Synthetic 30-day activity preview history seed.

### 8. Domain Types (`src/types/`)
- `src/types/project.ts` — Reusable domain types (`Project`, `ProjectStatus`).
- `src/data.ts` — Seed and fixture datasets (`projects`, `deletedProjects`, `roles`, `initialTasks`).

### 9. Components & Primitives (`src/components/`)
- `ui/ui.tsx` — Design system primitives (`Card`, `PageHeader`, `Button`, `IconButton`, `Field`, `Input`, `Badge`, `Avatar`, `Segmented`, `Toggle`, `StatCard`, `cx`) and controls (`Dropdown`, `DatePicker`, `TimePicker`, `ColourPicker`, `RowMenu`, `Notifications`).
- `admin/AdminKit.tsx` — Admin table controls, search/select fields, paging, and skeleton rows.
- `layout/Shell.tsx` — Role-aware layout, responsive navigation drawer, top bar, and breadcrumbs.
- `overlay/` — Portal stacking, backdrop, and dialogs (`OverlayLayer.tsx`, `Modal.tsx`, `Drawer.tsx`).
- `prototype/PrototypeTools.tsx` — Development-only overlay for testing invitations and recovery flows.
- `dashboard/StatCards/` — Reorderable dashboard summary groups and card data types.

## Verification Commands

Run the test suite and verification scripts:

```bash
# Type check TypeScript definitions
pnpm run typecheck

# Production build validation
pnpm run build

# Audit and security verification
node scripts/verify-audit-security.mjs

# Notification lifecycle verification
node scripts/verify-notifications.mjs

# Sample user cleanup verification
node scripts/verify-remove-sample-users.mjs

# Summary metrics and trends verification
node scripts/verify-summary-comparison-preview.mjs
node scripts/verify-summary-demo.mjs
node scripts/verify-summary-snapshots.mjs
node scripts/verify-summary-trends.mjs

# Time window and picker verification
node scripts/verify-time-picker.mjs
node scripts/verify-time-windows.mjs
node scripts/verify-user-distribution.mjs

# Operations store and state regression suite
node scripts/verify-operations-store.mjs

# Refactored flows and integration verification
node scripts/verify-refactor-flows.mjs

# Client brief regression verification
node scripts/verify-client-brief.mjs
```

## Mock System Limitations

1. **Client-Side Simulation**: All authentication, account administration, and session tracking operate in browser storage (`localStorage`). No real network requests or emails are sent.
2. **Presentational Role Security**: Access checks (`canAccess`) and admin guardrails are presentational for UI workflows. A production deployment requires server-side validation.
3. **Development Tooling Guard**: Prototype tools (`PrototypeTools.tsx`, `prototypeAuth.ts`) are restricted to development builds (`import.meta.env.DEV`) and tree-shaken from production builds.

