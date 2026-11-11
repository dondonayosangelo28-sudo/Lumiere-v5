# LUMIÈRE component reference

Actual components in the restored source, not an aspirational library. See
[SKILL.md](./SKILL.md) before frontend work and
[DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) for styling values and known differences.

Notation: `?` optional; `ReactNode` accepts composed content; “native props”
means the component's declared React HTML attribute type, not an assurance that
every attribute is forwarded to every internal element. Do not import private
helpers by inventing exports.

## 1. Core primitives — `src/components/ui.tsx`

All listed exports are **named**, not default.

| Export | Properties / defaults | Usage and implementation contract |
| --- | --- | --- |
| `cx` | `(...c: (string \| false \| null \| undefined)[])` | Joins truthy strings; not a Tailwind conflict merger |
| `Card` | `children: ReactNode`, `className?` | Div with dashboard-card hook, themed border/fill/radius; caller supplies padding |
| `PageHeader` | `crumbs: string[]`, `title`, `subtitle`, `actions?: ReactNode`, `onHome?: () => void`, `large?: boolean` | Breadcrumbs + wrapping title/actions; uses NavigationContext fallback; large30px versus default24px |
| `Button` | native button props; `variant?: 'solid' \| 'ghost' \| 'outline' = 'solid'`, `icon?: LucideIcon` | h36 pill; icon15; className forwarded; set type explicitly in forms when needed |
| `IconButton` | native button props; `icon: LucideIcon`, `label: string` | Circle32; label supplies aria-label and title; optional className |
| `Field` | `label: string`, `children` | A wrapping label with visible heading; no generated IDs or error handling |
| `Input` | native input props; `icon?: LucideIcon` | Relative wrapper, optional left icon; className applies to input, not wrapper |
| `Badge` | `tone: 'success' \| 'warning' \| 'danger' \| 'neutral' \| 'info'`, `children` | Fixed pill recipes; no className prop; info is neutral primary |
| `Avatar` | `name: string`, `gender?: 'm' \| 'f'`, `size?: number = 36` | Illustrated inline SVG, role=img/name; not initials or image upload |
| `Segmented<T extends string>` | `options: {value:T; label:string; icon?:LucideIcon}[]`, `value:T`, `onChange:(v:T)=>void`, `keyboardNavigation?:boolean = false` | Equal-width sliding selection; opt-in arrow/Home/End and aria-pressed; no className prop |
| `Toggle` | `checked:boolean`, `onChange:(v:boolean)=>void`, `label:string` | Controlled role=switch, aria-checked; track36×20/thumb16 |

### `StatCard` (named export from `ui.tsx`)

Required: `icon: LucideIcon`, `title: string`, `value: string | number`.

Optional:

- `trend?: string`, `trendTone?: 'up' | 'flat' | 'down' = 'up'`.
- `watermark?: boolean = true`.
- `handle?: React.HTMLAttributes<HTMLSpanElement>`.
- `showHandle?: boolean = true`, `aligned?: boolean = false`.
- `description?: string`, `handleContent?: ReactNode`,
  `trendContent?: ReactNode`.

An empty description deliberately reserves height. `handleContent` replaces the
decorative/default grip. Use `StatCards` for working reordering rather than
pretending a plain grip is interactive.

### Common composition

```tsx
import { Card, PageHeader, Button, Field, Input, Badge } from '../components/ui'

// Match the existing page's breadcrumb and navigation contract.
<PageHeader
  crumbs={['Dashboard', 'Projects', 'All Projects']}
  title="All Projects"
  subtitle="Manage development projects and deployments"
  onHome={onHome}
  actions={<Button onClick={openCreate}>Create Project</Button>}
/>
<Card className="p-4">
  <Field label="Project Name">
    <Input value={name} onChange={(event) => setName(event.target.value)} />
  </Field>
  <Badge tone="success">Ready</Badge>
</Card>
```

This is a composition example, not a new route or feature. Use the actual
current page as the template and don't add layout padding to the shell globally.

## 2. Admin helpers — `src/components/AdminKit.tsx`

All exports below are named.

| Export | Properties / signature | Details |
| --- | --- | --- |
| `fieldCls` | string constant | 40px admin input recipe, fg5% fill, invalid border; Accounts currently has a private duplicate |
| `ghostBtn` | string constant | 32px pill text-action recipe including explicit focus states |
| `SearchField` | `label`, `value`, `onChange:(v:string)=>void`, `placeholder` | Search input with icon and search-control hook; not debounced internally |
| `SelectField` | `label`, `value`, `onChange:(v:string)=>void`, `children` | Wraps Dropdown and adds visible chevron; label is accessible label, not visible field heading |
| `DateField` | `label`, `value`, `onChange:(v:string)=>void`, `min?`, `max?` | Visible compact label + shared DatePicker |
| `ResetFiltersButton` | `onClick:()=>void`, `disabled:boolean`, `compact?:boolean=false` | Refresh icon and fixed copy; compact h32 otherwise h40 |
| `SkeletonRows` | `cols:number`, `rows?:number=5` | Returns table rows, aria-hidden; use only inside tbody |
| `EmptyRow` | `cols:number`, `children` | Returns one tr/td with correct colSpan and centered empty content |
| `Pager` | `page`, `pages`, `total`, `per`: numbers; `noun:string`; `onPage:(n:number)=>void` | 1-based controlled page, hidden if total0; ellipsis when pages>7; caller computes/clamps |
| `FlashBanner` | `flash: Flash \| null`, `onDismiss:()=>void` | Error alert or success status, close button, 9000ms dismiss; prefer stable callback |
| `Flash` | `{tone:'success' \| 'error'; text:string}` | Feedback type |
| `resultTone` | `(r:string) => 'success' \| 'warning' \| 'danger'` | Success green, Failed warning, all others danger |
| `useNow` | `(ms=1000)=>number` | Periodic Date.now; unlike AuthShell variant, no visibility-change wake listener |
| `useDebounced<T>` | `(value:T, ms=250)=>T` | Timer cleanup on changes |

Re-exports from `auth/manilaTime.ts`:
`TIMEZONE`, `fmtDateTime`, `fmtTime`, `fmtFull`, `dayStart`, `dayEnd`.
Security and audit use these GMT+8 helpers instead of browser-local dates.

Table helper composition used by Security/Audit:

```tsx
<Card className="mt-4 overflow-hidden bg-none">
  <div className="overflow-x-auto">
    <table className="w-full min-w-[820px] text-[14px]">
      <caption className="sr-only">Describe this list and its ordering</caption>
      <thead className="bg-fg/[0.08] text-left">{/* semantic column headings */}</thead>
      <tbody>
        {loading ? <SkeletonRows cols={5} /> :
          total === 0 ? <EmptyRow cols={5}>No matching records.</EmptyRow> :
          rows}
      </tbody>
    </table>
  </div>
  {!loading && <Pager page={page} pages={pages} total={total} per={10}
    noun="records" onPage={setPage} />}
</Card>
```

The project does **not** export a generic Table, TableRow, or DataTable. Preserve
the relevant page's column semantics and density rather than inventing imports.

## 3. Selects, menus and date controls

### `Dropdown` — `src/components/Dropdown.tsx` (default)

Declared props: `SelectHTMLAttributes<HTMLSelectElement>`, including
`children`, `value`, `defaultValue`, `onChange`, `className`, `disabled`,
`required`, `name`, `id`, title, tabIndex and selected ARIA attributes.

- Accepts existing `<option>` children, recursively collects value/label/disabled.
- Renders Base UI `Select.Root modal={false}` plus Trigger/Portal/Popup/List.
- `onChange` receives a synthesized select-like event with
  `target/currentTarget: {value, name}`. Don't expect a real native select
  element or every native event method.
- Value normalized to string. Without controlled/default value, first option
  is used as default.
- Trigger receives caller styling and explicit forwarded id/title/tabIndex/
  ARIA label/labelledby/invalid/describedby. Other native props are not all
  automatically spread onto Trigger.
- Does not add a chevron automatically; use SelectField or the same
  relative-wrapper/ChevronDown pattern as Projects/Accounts.
- Integrates with `useOverlayContainer` and `useCloseOnOverlay`.

Named style exports: `dropdownSurface`, `dropdownItem`. Shared by RowMenu and
DatePicker; do not duplicate their recipes unnecessarily.

```tsx
<SelectField label="Filter by result" value={result} onChange={setResult}>
  <option value="">All results</option>
  <option value="Success">Success</option>
  <option value="Failed">Failed</option>
</SelectField>
```

### `RowMenu` — `src/components/RowMenu.tsx` (default)

Props:

```ts
{
  items: {
    label: string
    icon: LucideIcon
    danger?: boolean
    disabled?: string
    onClick: () => void
  }[]
  menuClassName?: string
}
```

- `disabled` is an explanation string, **not a boolean**; shown as a small
  second line and used as title. Suppresses action.
- Trigger is a32px fg8% circle with MoreVertical15, aria-label “Row actions”.
- Base UI Menu, non-modal, end-aligned, offset8/collision8; viewport-constrained
  and scrollable; shared dropdown styles.
- Danger affects enabled menu item color only; confirmation is caller's job.

### `DatePicker` — `src/components/DatePicker.tsx` (default)

Props: `AriaAttributes & {value:string; onChange:(value:string)=>void;
min?:string; max?:string; disabled?:boolean; id?:string; name?:string;
className?:string}`.

Use `YYYY-MM-DD` values and min/max. Renders hidden input only if `name`
provided. Labelled popup, native button trigger, Base UI Popover,42-day grid.
Keyboard support and bounds are detailed in the design reference.
ClassName modifies trigger, not popup.

Helper module `src/components/calendarDates.ts` exports `dateKey`, `parseDate`,
`calendarDays`, `allowedDate`, `shiftMonth`. Uses noon for local-date parsing
and42-day Sunday-first grid; month shifting clamps day to valid month length.

## 4. Modal infrastructure

### `OverlayLayer` — `src/components/OverlayLayer.tsx` (default)

Props: `children`, `panelRef: RefObject<HTMLElement | null>`,
`onClose:()=>void`, `className?`.

- Low-level infrastructure, not a styled dialog.
- Portals to document.body. Tracks nested layers, sets stacking1000+layer,
  locks root/body scrolling, and makes outside body children inert.
- Focuses panel; traps Tab/Shift+Tab and unexpected outside focus; handles
  Escape on top layer; restores focus on cleanup.
- Caller supplies dialog semantics and backdrop-click behavior.
- Named `useOverlayContainer()` returns current portal container ref.
- Named `useCloseOnOverlay(close:(root?:HTMLElement)=>void)` subscribes to
  `app:overlay-open`; used to close menus when a new overlay appears.

Prefer the styled wrappers below for ordinary UI.

### `Modal` — `src/components/Modal.tsx` (default)

Props: `open:boolean`, `onClose:()=>void`, `title:string`, `children`,
`lowered?:boolean=false`, `compact?:boolean=false`.

- Unmounts when closed; role=dialog/aria-modal/aria-label, explicit close
  control and click-outside.
- Standard max512px/p24, compact max448px/p20.
- Lowered changes top padding and max-height, not a bottom-sheet behavior.
- No footer prop: compose action row inside children. No generic className prop.
- If busy operations must not close, guard `onClose` in caller.

### `Drawer` — `src/components/Drawer.tsx` (default)

Props: `open:boolean`, `onClose:()=>void`, `title:string`, `subtitle?:string`,
`children`, `footer?:ReactNode`, `compact?:boolean=false`.

- Right sheet448px/max-full; mounted during300ms exit animation.
- Calls `useShell().setCollapsed(true)` on open; doesn't restore prior width.
- Scroll body, title/subtitle header, optional sticky-layout footer.
- Compact top24/max viewport-minus48; footer stacked until sm.
- Keep last selected data during exit if content otherwise disappears
  immediately; see `AuditLogs.tsx`'s private EventDrawer.
- Can use form `id` + footer button `form` attribute as account creation does.

```tsx
<Drawer open={!!selected} onClose={() => setSelected(null)}
  title="Event Details" subtitle={selected?.action}>
  {/* Read-only detail content; see AuditLogs.tsx for dl/table composition. */}
</Drawer>
```

### `ConfirmAction` — `src/components/AccountConfirm.tsx` (default)

Named `ConfirmKey = 'deactivate' | 'reactivate' | 'reset' | 'unlock' |
'delete' | 'restore'`.

Props: `confirm:{key:ConfirmKey; id:number}|null`, `account:Account|null`,
`onClose:()=>void`, `onDone:(text:string)=>void`.

This is **account-specific**, not a generic confirmation UI:
executes `authService` actions, handles pending/busy/errors, disables closure
while busy and changes confirmation copy by action. Used in Accounts and
Security; keyed by action/account so local state resets between actions.
Use Modal directly for a different domain rather than passing arbitrary keys.

## 5. Authentication primitives — `src/components/AuthShell.tsx`

`AuthShell` default export; remaining entries are named.

| Export | Properties / defaults | Notes |
| --- | --- | --- |
| `AuthShell` | `dark:boolean`, `setDark:(v:boolean)=>void`, `icon:ReactNode`, `children`, `loginSurfaces?:boolean=false` | Grid background, shared Logo/theme toggle, centered448px card,1400px header/footer; loginSurfaces enables special CSS |
| `AuthIcon` | `icon:LucideIcon` |60px tile,28px/stroke1.6 icon |
| `AuthHeading` | `title:string`, `subtitle?:ReactNode`, `focus?:boolean=true` | Centers heading; focuses it on mount when enabled |
| `authFieldCls` | string constant | Auth input styling; different from AdminKit.fieldCls |
| `AuthField` | native input props + `label:string`, `icon?:LucideIcon`, `error?:string`, `hint?:ReactNode` | Auto ID, label, hint/error IDs; describedby and aria-invalid |
| `PasswordInput` | `label`, `value`, `onChange:(v:string)=>void`; `error?`, `describedBy?`, `disabled?`, `autoFocus?`, `autoComplete?='new-password'` | Internal visibility toggle, Lock icon, show/hide accessible labels; not arbitrary input props |
| `PasswordRequirements` | `id:string`, `password:string`, `confirm:string` | Shared policy checks, guidance meter, matched/unmatched accessible descriptions |
| `Notice` | `tone?:'info'|'error'|'success'='info'`, `children` | Error role alert; others status; no dismissal timer |
| `AuthButton` | native button props + `busy?:boolean`, `busyLabel?:string`, `variant?:'primary'|'secondary'|'link'='primary'` | Busy disables button, aria-busy/spinner; defaults type=button |
| `useNow` | `(ms=1000)=>number` | Interval + visibilitychange refresh; distinguish from AdminKit variant |

See Login for its locally composed email/password fields and custom SVG
`DoorIcon`; see SetPassword/ForgotPassword for AuthField/PasswordInput usage.
OTP visual-slot input is **private** to ForgotPassword, not a reusable export.

## 6. Shell, navigation and notifications

### `Shell` — `src/components/Shell.tsx` (default)

Props: `account:Account`, `route:Route`, `go:(r:Route)=>void`, `dark:boolean`,
`setDark:(v:boolean)=>void`, `onLogout:()=>void`, `children`.

Owns internal Sidebar and TopBar (not exported); composes role-aware menu,
responsive rail, command palette, theme toggle, notification/profile menus,
main and footer. Don't build a second shell around a page rendered inside it.

Named exports:

- `Route`: overview, accounts, accounts-deleted, projects, projects-deleted,
  settings-profile, settings-security, settings-app, security, audit-logs,
  notifications, and template literal ``module-${string}``.
- `Logo()`: existing image wordmark.
- `initials(name:string)`: first letters of up to two words, uppercase;
  fallback `?`.
- `ShellContext`, `useShell()`: `{collapsed:boolean; setCollapsed:(v:boolean)=>void}`.
  Useful for overlays; don't use it to bypass mobile nav state.

Related:

- `src/components/NavigationContext.ts`: named `NavigationContext` with
  `{route,go}|null`, and `breadcrumbRoutes`. The breadcrumb label mapping is
  not a permission definition.
- `src/components/adminNavigation.ts`: type `AdminNavigation`, union of
  accounts with role/status intent, security with activity/locked/sessions
  tab and optional failedLast24h, or audit-logs.
- `src/auth/roleConfig.ts`: `RoleModule`, `roleModules`, `adminModules`,
  `notificationsModule`, `isAdminRoute`, `canAccess`, `moduleForRoute`.
  Always use these actual role strings/lists for new authorized navigation.

### `CommandPalette` — `src/components/CommandPalette.tsx` (default)

Props: `role:Role`, `open:boolean`, `onClose:()=>void`, `go:(r:Route)=>void`.
Searches page/module labels and descriptions, filters destinations with
canAccess, supports arrows/Enter/Escape, resets query on open.
Uses OverlayLayer; opening shortcut lives in private TopBar, not this component.
Contains hardcoded dark item/footer colors even under light mode.

### `SignInBanner` — `src/components/SignInBanner.tsx` (default)

No props. Mounted alongside App by main.tsx. Listens for `app:signed-in`;
named `showSignInBanner()` dispatches that event.
Named `SIGN_IN_BANNER_DURATION = 4000`. Timer-driven dismissal independent of
progress animation, plus close button.

### `PrototypeTools` — `src/components/PrototypeTools.tsx` (default)

Props: `openInvitation:(token:string)=>void`, `openRecovery:()=>void`,
`onReset:()=>void`.
Development reviewer panel for invitations/recovery/mock failures/demo reset.
Its source comment describes App lazy-loading it only in development; App-level
loading wasn't independently visible in this audit. Do not expose it as a new
production workflow or copy sensitive demo values into general UI.

## 7. Reorderable summaries — `src/components/StatCards/`

### `StatCards` — `index.tsx` (default)

```ts
{
  data: readonly StatCardData[]
  userId: number
  groupId?: string // 'admin-summary'
  renderCard?: (card: StatCardData, handle: ReactNode) => ReactNode
  preserveDesign?: boolean // false
  gridCols?: string // 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
  gap?: string // 'gap-4'
}
```

- Default renderer uses shared StatCard with alignment, formatted numeric
  counts, working handle and optional comparison trend.
- `preserveDesign` currently controls watermark rendering; do not infer
  arbitrary theming behavior from its name.
- Custom renderer receives a ready-made accessible handle; place it as a
  sibling of navigation buttons, as RoleDashboard does, to avoid nesting buttons.
- Persisted order key: `lumiere.stat-card-order.${userId}` for admin-summary,
  or that prefix + `.${groupId}` for other groups. Normalizes saved IDs,
  removes unknown ones, appends new ones.
- Callers key groups by user and relevant context to reset state correctly.

### `StatCardData` — `types.ts` (named type)

`{id:string; title:string; value:string|number; icon:LucideIcon;
description?:string; trend?:SummaryTrend; action?:()=>void; actionLabel?:string}`.
The current default renderer does not consume `action`/`actionLabel`; do not
claim summary cards are automatically navigable merely because those props
exist. Supply explicit custom interaction when authorized.

## 8. Page exports and domain-local components

These are useful reference implementations but are not all generic primitives.
File paths are relative to `src/`.

| File/export | Props / role | Reuse convention |
| --- | --- | --- |
| `pages/Overview.tsx` default `Overview` | `onOpen:(nav:AdminNavigation)=>void` | Admin dashboard composition; callback forwarded into summaries, whose current renderer doesn't invoke it |
| `Overview.tsx` named `Hero` | `name?:string='Demo'` | Shared welcome/weather/clock card; Executive passes firstName; weather illustrative |
| `pages/AdminDashboardCards.tsx` named `AdminSummaryCards` | `onOpen:(nav:AdminNavigation)=>void` | Live demo counts, sample/history trends and seeds; not a generic data-free card |
| Same file `SignInActivity`, `AuditActivity`, `UsersByRole` | no props | Subscribe to shared browser store, SVG charts/ranges/coverage; don't duplicate selector logic |
| `pages/OverviewExtras.tsx` named `DateRangePicker` | no props | Overview-specific local selection,718px popup; not generic shared DatePicker |
| Same file `ExportMenu` | `variant?:'outline'|'ghost'='outline'`, `csv?:()=>string` | CSV supplied → CSV/PNG menu; otherwise direct PNG of dashboard-image-export |
| Same file `RecentProjects` | `account:Account` + `RecentProjectsData` | Event Manager permission check, four-per-page latest projects, export and project dialogs |
| Same file type `RecentProjectsData` | `all:Project[]`, `setAll`, `setTrash` React Dispatch/SetStateAction lists | Shared project state boundary |
| `pages/Accounts.tsx` default `AccountsPage` | `actor:Account`, `onHome`; optional `openAccountId:number|null`, `onOpened`, `deleted=false`, `initialRole=''`, `initialStatus=''` | Account management entry; modal read-only details, create/edit drawers, shared confirmations |
| Same file named `DetailsDrawer` | `account:Account|null`, `editing:boolean`, `setEditing:(v:boolean)=>void`, `onClose`, `onSaved:(text:string)=>void` | **Read-only uses compact lowered Modal**; editing uses Drawer; Security imports it |
| `pages/Security.tsx` default `SecurityPage` | `account`, `go`, `onLogout`; `initialTab?:'activity'|'locked'|'sessions'|'policy'`, `initialFailedLast24h?:boolean` | System Admin guard; compact semantic tabs and table panels |
| `pages/AuditLogs.tsx` default `AuditLogsPage` | `account:Account`, `go` | System Admin guard; draft/applied read-only filters/detail drawer |
| `pages/Projects.tsx` default `ProjectsPage` | `deleted?:boolean`, `onHome`, `all`, `setAll`, `trash`, `setTrash` | Projects/deleted lists and local forms; preserve different density/show-more behavior |
| `pages/Settings.tsx` default `SettingsPage` | `account`, `tab:'settings-profile'|'settings-security'|'settings-app'`, `go`, `onHome` | Role-visible tabs, profile/password/local preference panels |
| `pages/Login.tsx` default `Login` | `onLogin:(a:Account)=>void`, `onForgot`, `dark`, `setDark`, `notice?:string` | Public auth; synthetic service; loginSurfaces |
| `pages/SetPassword.tsx` default `SetPassword` | `token:string|null`, `dark`, `setDark`, `onLogin:()=>void` | Invitation state machine |
| `pages/ForgotPassword.tsx` default `ForgotPassword` | `dark`, `setDark`, `onLogin:()=>void` | Identify/verify/reset/done flow; private single-input OTP implementation |
| `pages/RoleViews.tsx` named `RoleDashboard` | `account`, `go`, `projectData:RecentProjectsData` | Role module shortcut cards; Executive special hero/scope; Event Manager recent projects |
| Same file `ModulePlaceholder` | `module:RoleModule`, `go`, `crumb?:string` | Existing Coming soon visual only |
| Same file `RoleModulePage` | `account`, `route:string`, `go` | Resolves module for role, then placeholder or AccessDenied in restored version |
| Same file `NotificationsPage` | `go` | Notifications placeholder |
| Same file `AccessDenied` | `go` | Centered max-width card and Return to Dashboard |

`go` means `(r:Route)=>void`; callbacks without listed arguments return void.
Check actual types before extending these APIs.

### Private implementation helpers: inspect, do not import

- Shell: `Sidebar`, `TopBar`, `navFor`, `useClickOutside`.
- Accounts: `StatusBadges`, local `SkeletonRows`, `CreateDrawer`, `DetailsBody`,
  `EditForm`, action definitions and private field recipe.
- Security: `SecurityBody`, `LoginActivity`, `LockedAccounts`, `ActiveSessions`,
  `EndSessionDialog`, `PolicyPanel`.
- Audit: `AuditBody`, `EventDrawer`, display normalization helpers.
- Overview: `Insights`, `QuickTasks`, `Calendar`, `Toasts`.
- OverviewExtras: `Month`, `useOutside`.
- AdminDashboardCards: `CardHeader`, `RangeSelect`, `CoverageNote`, `TimeChart`,
  path helpers and role presentation map.
- Projects: `ProjectIcon`; Settings: `Profile`, `Security`, `AppSettings`.
- Auth pages: Login `DoorIcon`; recovery `IdentifyStep`, `OtpInput`,
  `VerifyStep`, `ResetStep`.

Extract a helper only if new authorized work justifies genuine cross-page reuse.
Do not export every private helper or reorganize the project during a feature.

## 9. Component selection rules

1. Page container → existing Shell; headings → PageHeader; surface → Card.
2. Basic field → Field/Input; admin filter → AdminKit; public auth field →
   AuthField/PasswordInput; selection → Dropdown/SelectField.
3. Date form field → shared DatePicker; don't use Overview's range picker
   as a replacement for a single-date input.
4. Data list → semantic table + Card + AdminKit helpers, matching its page family.
5. Read-only or short form → Modal or existing domain wrapper; long details/
   account editing → Drawer; never bypass OverlayLayer accessibility by default.
6. Account lifecycle action → ConfirmAction; unrelated action → compose Modal.
7. Status → Badge with meaningful text and verified tone mapping.
8. Summary ordering → StatCards, not decorative draggable styling alone.
9. New navigation must be reachable through actual route rendering and the
   role's module config, with access checks preserved. App.tsx must be inspected
   directly when accessible; this audit doesn't prove a new route is wired.
10. Existing stateful helpers may have side effects (demo seeding, storage,
    session changes). Reusing their visuals doesn't authorize those side effects
    in another feature.
