# LUMIÈRE — current frontend design system

Source-derived visual reference. Read [SKILL.md](./SKILL.md) for mandatory future
AI instructions and audit limitations, and [COMPONENT_REFERENCE.md](./COMPONENT_REFERENCE.md)
for actual component APIs. **This document does not authorize a redesign.**

## 1. Evidence and visual identity

**Verified:** the current visual system is Inter-based, neutral, compact and
operational. Panels have thin borders and rounded corners; action buttons are
usually pills. Dark mode is not a simple inversion: scoped gradients supply
subtle surface depth. Status and chart colors are localized accents, not a
bright global brand scheme. The logo is `public/lumiere-logo.png`, 24px high with
automatic width and `dark:invert`.

**Inferred design intent:** information hierarchy should come from size,
weight, spacing, grouping and muted text before color. This is an inference from
the repeated implementations, not a separate original design specification.

The restored version has no asset-catalog page. The earlier asset screenshots,
beige/brown palette, serif type and catalog layout are not this audit's source
of truth.

## 2. Color system and cascade

### 2.1 Two coexisting token families

`src/index.css` defines legacy app variables and shadcn-style semantic variables,
then maps them to Tailwind with `@theme inline`.

- `bg-bg`, `bg-panel`, `bg-elev`, `bg-field`, `border-line`, `text-fg`,
  `bg-invert`, `text-invert-fg`, `bg-chip`, `bg-nav`, `bg-chrome`, and
  `border-edge` use the app family.
- `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-card`,
  `bg-primary`, `border-border`, etc. use the semantic family.
- **`text-fg` and `text-foreground` are not the same variable.**
- **`text-muted` is a custom compatibility utility** that uses
  `--legacy-muted-foreground`. `bg-muted` uses `--muted`, a surface. Never
  substitute one for the other.
- `--card` and `--muted` retain app-era names but currently contain semantic
  OKLCH values.
- Unlayered `html, body` rules set `background: var(--bg)` and `color: var(--fg)`.
  Later `@layer base` also applies `bg-background text-foreground` to body.
  Unlayered normal declarations outrank layered normal declarations; do not
  assume the later base block makes the body pure `--background`.
- `.dark` and `@custom-variant dark (&:where(.dark, .dark *))` select dark styles;
  `color-scheme` is explicitly light/dark. App-level theme persistence was not
  verified because `App.tsx` tool output was unavailable.

### 2.2 App token values (literal source)

| CSS variable → utility suffix | Light | Dark |
| --- | --- | --- |
| `--bg` → `bg` | `#f9fafb` | `#0b0b0b` |
| `--panel` → `panel` | `#ffffff` | `#141414` |
| `--card` → `card` | `oklch(1 0 0)` | `oklch(0.205 0 0)` |
| `--elev` → `elev` | `#f3f4f6` | `#222222` |
| `--field` → `field` | `#f3f4f6` | `#1f1f1f` |
| `--line` → `line` | `#e5e7eb` | `#262626` |
| `--fg` → `fg` | `#111827` | `#f5f5f5` |
| `--muted` → `muted` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` |
| `--legacy-muted-foreground` → `text-muted` | `#6b7280` | `#b3b4b5` |
| `--invert` → `invert` | `#111827` | `#ededed` |
| `--invert-fg` → `invert-fg` | `#ffffff` | `#111111` |
| `--chip` → `chip` | `#f1f2f4` | `#262626` |
| `--nav` → `nav` | `#ffffff` | `#151515` |
| `--chrome` → `chrome` | `rgb(255,255,255)` = `#ffffff` | `rgb(29,29,29)` = `#1d1d1d` |
| `--edge` → `edge` | `#e5e7eb` | `#1a1a1a` |

### 2.3 Semantic token values (literal source)

The OKLCH strings below are the **actual CSS values**, not guessed HEX
replacements. Preserve them as written. Transparent colors cannot be represented
as one opaque HEX without knowing the underlying surface.

| CSS variable | Light | Dark |
| --- | --- | --- |
| `--background` | `oklch(1 0 0)` | `oklch(0.145 0 0)` |
| `--foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |
| `--card-foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |
| `--popover` | `oklch(1 0 0)` | `oklch(0.205 0 0)` |
| `--popover-foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |
| `--primary` | `oklch(0.205 0 0)` | `oklch(0.922 0 0)` |
| `--primary-foreground` | `oklch(0.985 0 0)` | `oklch(0.205 0 0)` |
| `--secondary` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` |
| `--secondary-foreground` | `oklch(0.205 0 0)` | `oklch(0.985 0 0)` |
| `--muted-foreground` | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` |
| `--accent` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` |
| `--accent-foreground` | `oklch(0.205 0 0)` | `oklch(0.985 0 0)` |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` |
| `--border` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 10%)` |
| `--input` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 15%)` |
| `--ring` | `oklch(0.708 0 0)` | `oklch(0.556 0 0)` |
| `--sidebar` | `oklch(0.985 0 0)` | `oklch(0.205 0 0)` |
| `--sidebar-foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |
| `--sidebar-primary` | `oklch(0.205 0 0)` | `oklch(0.488 0.243 264.376)` |
| `--sidebar-primary-foreground` | `oklch(0.985 0 0)` | `oklch(0.985 0 0)` |
| `--sidebar-accent` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` |
| `--sidebar-accent-foreground` | `oklch(0.205 0 0)` | `oklch(0.985 0 0)` |
| `--sidebar-border` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 10%)` |
| `--sidebar-ring` | `oklch(0.708 0 0)` | `oklch(0.556 0 0)` |

Both themes define chart tokens identically:

| Variable | Exact value |
| --- | --- |
| `--chart-1` | `oklch(0.87 0 0)` |
| `--chart-2` | `oklch(0.556 0 0)` |
| `--chart-3` | `oklch(0.439 0 0)` |
| `--chart-4` | `oklch(0.371 0 0)` |
| `--chart-5` | `oklch(0.269 0 0)` |

These variables are available, but current dashboard SVG charts also use
independent literal and Tailwind colors. The custom sidebar uses `bg-nav`,
`text-foreground`, and scoped CSS, not the full semantic `sidebar-*` palette.

### 2.4 Status and accent colors

Direct `@theme inline` constants:

| Utility color | Literal HEX |
| --- | --- |
| `success` | `#10b981` |
| `danger` | `#ef4444` |
| `warning` | `#f59e0b` |
| `violet` | `#8b5cf6` |
| `pink` | `#ec4899` |

`Badge` in `components/ui.tsx` uses its own exact recipes:

| Tone | Background | Text | Border/ring |
| --- | --- | --- | --- |
| success | `#16a34a` at 15% | `#4ade80` | 1px inset `#4ade80` at 20% |
| warning | `#ca8a04` at 15% | `#facc15` | 1px inset `#facc15` at 20% |
| danger | `danger` at 15% | `danger` | none explicit |
| info | `primary` at 15% | `primary` | none explicit |
| neutral | `elev` | `muted-foreground` | none explicit |

**Info is neutral, not blue.** Primary is theme-aware grayscale.
`resultTone` in `AdminKit.tsx` maps Success → success, Failed → warning,
other results (including Blocked) → danger. Account Active → success,
Pending Activation → warning, Inactive → neutral; expired/locked add danger
badges. Project Ready → success, In Progress → warning, Blocked → danger.

Other verified local accents:

- Trends: positive `#4ade80`, negative `#ef4444`, flat/unavailable `#b3b4b5`.
  Direction and semantic positivity are distinct; more locks/failures is bad.
- Success notification dot/progress `#22c55e`; alert/count/error text `#f87171`
  appears in shell/account forms.
- Overview insight rings: blue `#2563eb`, green `#10b981`, gray `#9ca3af`.
  Weather moon `#3b82f6`; sun is `amber-400`, cloud white.
- Sign-in chart series use Tailwind `emerald-500`, `red-500`, `amber-500`;
  audit chart uses `blue-500`. These are Tailwind v4 palette values, not aliases
  of the app status constants.
- Sign-in total area: fill `#aebbc8` at 50% → 2%, stroke `#b8c5d0`,
  axes `#454545`, axis labels `#858585`.
- Users-by-role bars: leading `#b8c2d0`, others `#6e747d`.
- Initials avatars: `#3c3d41` with white text.
- Red validation utilities (`red-400`, etc.) come from Tailwind; do not
  mislabel them as `--danger`.

### 2.5 Scoped surfaces and overrides

All below are verified in `src/index.css`; their selectors matter.

**Dark app chrome**

- `.app-topbar`: `linear-gradient(110deg, #202020 0%, #191919 22%,
  #141414 55%, #121212 100%)`.
- `.app-sidebar`: `linear-gradient(180deg, #202020 0%, #191919 25%,
  #141414 65%, #121212 100%)`.
- Both: `1px solid #1b1b1b`, no shadow.

**Dark dashboard cards**

`.dark .stat-card` and `.dark :is(#dashboard-image-export,
.dashboard-surfaces) .dashboard-card`:

```css
background-color: #0e0e0e;
background-image: radial-gradient(
  ellipse 340px 240px at 0% 0%,
  #202020 0%, #191919 30%, #121212 65%, #0e0e0e 100%
);
border: 1px solid #1b1b1b;
box-shadow: none;
```

- The welcome hero additionally receives a dark blue radial layer **only**
  under `.dark .dashboard-surfaces .dashboard-card.dashboard-welcome`:
  ellipse `340px 250px` at `calc(100% - 150px) 0%`,
  `rgba(49,79,116,.72)` → `rgba(34,54,77,.45)` at 35% →
  `rgba(19,29,39,.18)` at 65% → transparent.
- Light `.dashboard-welcome::before`: pointer-inert, full inset,
  ellipse `420px 220px` at `84% 0%`,
  `rgba(80,120,190,.28)` → transparent 70%. Dark removes this pseudo-element.
- `.dark #dashboard-image-export .dashboard-inset`: `#141414`,
  `1px solid #191919`, no shadow. This is narrower than `.dashboard-surfaces`.

**Dark filters**

- `.filter-toolbar`: ellipse `340px 220px` at top left, `#202020` →
  `#171717` at 45% → transparent, over `#0e0e0e`;
  `1px solid #1b1b1b`, no shadow.
- `.search-control`, `.filter-control`, and toolbar `input`, `[role=combobox]`,
  `[aria-haspopup=dialog]`: `linear-gradient(135deg,#242424,#1b1b1b)`,
  border `#303030`, text `#ededed`, no shadow.
- Hover border `#414141`; placeholders/icons `#b3b3b3`.
- Focus-visible outline `2px solid #737373`, offset 2px; search uses
  `:focus-within` too. Disabled opacity .5 and `not-allowed`.
- `.search-control input` gets transparent background to avoid double fill.

**Dark login-specific surfaces**

- `.auth-card`: vertical `#252525` → `#1d1d1d` at 32% → `#1b1b1b` at
  65% → `#1c1c1c`; border `#747474`; inset shadows
  `0 0 0 1px rgba(255,255,255,.025)` and
  `0 0 12px rgba(255,255,255,.035)`; text `#f5f5f5`.
- Email/password/text inputs: `#191919`, text `#f5f5f5`, resting valid border
  `#292929`, placeholder `#b3b3b3`.
- Subtitle/secondary text `#b8b8b8`; submit `#858585` on `#111111`.
- Social buttons transparent, border `#484848`, text `#f5f5f5`.
- Divider `#454545`, divider label `#1c1c1c`.
- Auth top/footer `#121212`, border white at 2.5%, no shadow; footer
  text `#b3b3b3`.
- These hooks are enabled by `AuthShell loginSurfaces`, currently used by
  Login. Recovery/invitation instead use `dark:bg-elev` and
  `dark:border-white/30`; do not assume identical auth surfaces.

## 3. Typography

### 3.1 Font setup

`index.css` imports `@fontsource-variable/inter` after the Tailwind,
tw-animate-css and shadcn imports. `--font-sans: 'Inter Variable', sans-serif`;
`--font-heading: var(--font-sans)`. `html, body` set 16px, line-height 1.5,
antialiasing. No second heading face or serif hierarchy is present.
`font-mono` is reserved for keys, IDs, OTP and technical values.

Weights commonly used: normal 400, medium 500, semibold 600, bold 700.
Tailwind default `tracking-tight` is `-0.025em`.

### 3.2 Actual hierarchy

| Use | Size/weight | Line height / source |
| --- | --- | --- |
| Standard page title | `text-2xl` = 24px / 700 | 32px; `PageHeader` |
| Large page title | 30px / 700 | `leading-9` = 36px; Settings and role dashboards |
| Page subtitle | 16px / 400 | no extra leading class; `mt-2` |
| Breadcrumbs | 14px; current 600 | row gap 8px; bottom margin 16px |
| Dashboard card titles | 16px / 600 | `Overview`, `AdminDashboardCards` |
| Drawer title | 18px / 600 | `leading-7` = 28px |
| Modal title | `text-lg` = 18px / 600 | 28px; compact 16px/24px |
| Auth heading | 24px / 700 | default 32px; centered |
| Hero greeting | 28px / 700 | 36px |
| Hero clock / temperature | 48px / 700; 44px / 700 | leading-none |
| Hero AM/PM | 20px / 500 | clock baseline-aligned |
| Stat value | 18px / 700 | 28px, tabular numbers |
| Stat title | 14px / 600 | muted-foreground |
| Main admin table text | 14px | headings 600; dates muted, tabular |
| Projects table text | 13px | page-specific density |
| Input / general field label | 14px | label 600; auth label 500 |
| General action button | 13px / 600 | auth/form actions often 14px |
| Supporting row/email text | 13px or 12px | usually muted |
| Badge | 12px / 600 | `leading-4` = 16px |
| Compact Security tab | 12px / 500 | line-height 1; count 10px |
| Uppercase labels | 10–12px | detail labels / sidebar section headings |
| Chart axis labels | 10px, total-area 11px | source-specific |
| Trend | 12px / 400 | 16px |

Explicit Tailwind text sizes use its theme's paired line-height: xs 12/16px,
sm 14/20px, base 16/24px, lg 18/28px, xl 20/28px, 2xl 24/32px.
Arbitrary `text-[Npx]` without an explicit `leading-*` has no universal fixed
line-height contract; inspect the surrounding cascade rather than inventing one.
`leading-5` = 20px, `leading-6` = 24px, `leading-none` = 1,
`leading-tight` = 1.25.

Long content: tables/details use `min-w-0`, `break-words`, `break-all` for emails
and IDs, and `truncate` for concise labels. Numeric metrics/dates use
`tabular-nums`.

## 4. Spacing, geometry and layout

### 4.1 Tailwind scale and radii

Tailwind's installed theme supplies `--spacing: .25rem` (4px at this root).
Observed regular scale:

| Utility | Pixels | Common application |
| --- | --- | --- |
| `1`, `1.5` | 4, 6 | tiny margins and count gaps |
| `2`, `2.5` | 8, 10 | control gaps, popup padding |
| `3`, `3.5` | 12, 14 | small card/row padding |
| `4` | 16 | card padding, grid gap, table horizontal inset |
| `5` | 20 | card padding / form vertical spacing |
| `6` | 24 | dialog/drawer inset, section spacing |
| `7`, `8` | 28, 32 | header margin / hero horizontal padding |
| `10`, `12`, `14`, `16` | 40, 48, 56, 64 | control/icon sizes and large empty-state space |

**Important:** `--radius: .625rem` changes the Tailwind radius scale. Do not use
the generic Tailwind/shadcn assumptions of 6/8/12/16px for these names.

| Token/class | Defined formula | Pixels at 16px |
| --- | --- | --- |
| `rounded-sm` | `radius × .6` | 6 |
| `rounded-md` | `radius × .8` | 8 |
| `rounded-lg` | `radius` | 10 |
| `rounded-xl` | `radius × 1.4` | 14 |
| `rounded-2xl` | `radius × 1.8` | 18 |
| `rounded-3xl` | `radius × 2.2` | 22 |
| `rounded-4xl` | `radius × 2.6` | 26 |
| `rounded-full` | pill/circle | fully rounded |

Literal radii still take precedence in special components: shell 14px,
Security outer 12px and tabs 8px, rail items 10px, dashboard Calendar days 3px.

### 4.2 Shell geometry

Source: `components/Shell.tsx`.

- Top wrapper sticky at top 0, z40, 15px horizontal padding, 10px top padding.
  Actual header is 64px high, radius 14px, border 1px. Left brand/menu group
  `w-60` = 240px, `px-3`; action group `gap-4`, `pr-6`.
- Topbar chips 32px high; menu button 32px square; logo height 24px.
  Search 208×32px, hidden below `md`.
- Content shell: bottom 15px, left 14px, right 16px, top 11px; desktop sidebar
  gets 16px right margin. Main `pt-[14px]`, full width, flex growth,
  `min-w-0`; content min-height `calc(100vh - 100px)`.
- Sidebar: left 14px, top 85px, bottom 15px; width 220px expanded or 60px
  collapsed at `lg`; desktop sticky height `calc(100vh - 100px)`.
  Initially collapsed in Shell state.
- Expanded nav rows: 11px horizontal / 10px vertical padding, gap 8px,
  14px/20px text. Rail rows 44px square, radius 10px. Nav icon 20px
  expanded / 18px rail, stroke 1.6.
- Sections: 11px/600 uppercase, tracking .02em; collapsed section divider 20px.
  Child items inset 26px plus 10px padding; child icons 16px.
- Active row `bg-fg/[.18]`, inactive hover `bg-fg/[.06]`.
  Child active uses a 1px vertical foreground marker and semibold text.
- Footer: `mt-4`, radius-xl, border-edge, bg-nav, `px-5 py-3`, 12px text.
  It is a flex row, not an independently redesigned mobile footer.

There is no global centered max-width container for authenticated content.
Auth top/footer have `max-w-[1400px]`; auth card has `max-w-md` (448px).

### 4.3 Page layout examples

- `PageHeader`: bottom margin 28px; breadcrumb bottom 16px; wrapped
  title/actions flex row with 16px gap; actions gap 12px.
- Overview: 16px grid gap; `xl:grid-cols-3`; main column spans two,
  side column one. Tasks/calendar split at `lg`.
- Summary groups: default 1 → 2 (`sm`) → 4 (`lg`) columns, gap 16px,
  equal-height rows. Security uses `sm:grid-cols-3`.
- Role modules: `sm:grid-cols-2 xl:grid-cols-3`; card padding 20px.
- Settings: one column until `lg:grid-cols-[260px_1fr]`, gap 16px;
  settings nav card p12, content p20 → p24 at sm.
- Accounts filter toolbar: 1 → 2 → `1fr 220px 200px auto`, gap 12px.
- Security activity filter toolbar: 1 → 2 →
  `1fr 160px 160px 170px auto`, aligned to bottom at lg.
- Audit and Projects forms: 1 → 2 (`sm`) → 4 (`lg`) columns.
  Audit gap-x16 / gap-y20, card p16 → p20.
- Name pairs in account forms: 1 → 2 at sm, gap16; form vertical gap20.

## 5. Reusable component styling

Actual props and examples are in the component reference.

### Buttons and small actions

- `Button`: h36, px16, gap8, pill, 13px/600. Solid uses invert/invert-fg
  with hover opacity .9; outline uses line border/card fill/elev hover;
  ghost uses foreground/elev hover. Disabled opacity .5.
  Optional Lucide icon 15px.
- `IconButton`: 32px circle, 16px icon, muted text, elev/foreground hover,
  aria-label/title.
- Admin ghost actions: h32, px12, 13px/600, hover fg at 8%, 2px
  focus outline offset2; disabled pointer-events none and muted text.
- Forms/auth frequently use 40px high, 14px actions, often weight500 for
  destructive/save confirmations. Create Account uses h32/13px.
- Destructive confirmation: `bg-danger text-white`; cancel ghost;
  busy spinner and changed action label. Do not recolor all solid actions red.

### Cards and summaries

- `Card`: `.dashboard-card`, rounded-xl (14px), 1px edge border, card fill,
  foreground text, linear overlay from white at 2.5% to transparent 60%.
  No built-in padding or default heavy shadow. Callers choose p16/p20/p24.
- `StatCard`: p16, icon tile40 with radius-md, foreground at 20% fill,
  20px icon/stroke1.6; title14/600 muted, value18/700, optional
  watermark44 at foreground6%. Dark `.stat-card` always gets scoped gradient.
- `StatCards`: equal rows; reorder handle24 with grip14; active scale .98
  and shadow-lg; order stored per user/group.
- Hero: min-height210, px32/py28, wrapped content gap24; preserve its
  visual hierarchy and scoped weather/clock effects.

### Inputs, dropdowns and calendars

- `Input`: h40, full width, radius-md8, border fg6%, fill fg8%, px12,
  14px text. Optional icon16 at left12; input left padding40.
  Focus fg25% border + 2px fg10% ring; placeholder muted.
- `AdminKit.fieldCls` and Accounts' private copy: same height/radius/font,
  fill fg5% instead of8%; red-400 border for aria-invalid.
- `Field`: block label, text14/600, bottom gap8; wraps children.
- Auth fields use field fill with transparent light border, dark line border;
  auth icons20/stroke1.6, focus-visible ring fg20%; label14/500.
- `Dropdown` wraps Base UI Select. Trigger style is supplied by caller;
  it is not a complete 40px field by itself. Popup uses radius-lg10,
  line border, card fill, p4, shadow-xl. Items radius-md8, px12/py8,
  text-sm, fg10% hover/highlight, fg15% selected, semibold selected.
  Disabled opacity .6, highlighted inset ring. Selected check16.
- Select popover offset6, collision padding8; max width `100vw - 16px`,
  list max-height `min(20rem, available-height)`, scroll/overscroll containment.
- DatePicker trigger h40, radius-md, line/field, icon16. Popup width256,
  p12, offset5, same collision bounds; six weeks, seven columns, h32 day
  controls, radius-md. Selected fg20%, bold; out-of-month muted; unavailable
  opacity .25.
- Dashboard Calendar and `OverviewExtras.DateRangePicker` are separate
  implementations; do not treat them as the shared DatePicker API.

### Tables and pagination

- No shared generic `Table` component exists. Compose semantic tables inside
  `Card` and `overflow-x-auto`; maintain min-widths rather than crushing cells.
- Standard admin list: text14, `thead bg-fg/[.08] text-left`;
  header px16/py14 font600; rows hover fg4%, 150ms; dates tabular/muted.
  Cards often use `overflow-hidden bg-none` to remove the normal card gradient.
- Accounts table min980; login/locked min820; sessions min960; audit min1040.
- Projects differs: text13, min760, header elev70%, px16/py12,
  border-t line, row hover elev40%. RecentProjects: text14, min600,
  header elev, header py16 and row py20.
- Detail changed-fields table: text13, px12/py8, edge dividers.
- Standard `Pager`: wrapping flex, border-top edge, px16/py16;
  Previous/Next h36/pill/px16 with edge border, number buttons32;
  active invert/invert-fg; gaps8; summary text14.
- `EmptyRow`: center, px16/py56. Reset is optional child content.
- `SkeletonRows`: five rows default, px16/py18, h14 rounded pulse bars,
  fg12%; first column width130, others80. Accounts has a six-row local copy.

### Badges, tabs and toggles

- Badge: pill, px10/py4, text12/600, line16. Status always has text.
- `Segmented`: radius-xl, fg4%, p8; absolute active pill inset8,
  radius-md, fg20%; equal option widths. Buttons py4, text14/600,
  gap8, icons14. Active foreground, inactive muted, foreground hover.
  Optional keyboard-navigation mode described below.
- Security tabs are **not** Segmented: outer44px, tabs36px, detailed below.
- Toggle: h20/w36 circle-ended track; checked invert, unchecked elev with
  line ring; thumb16 at top2, checked left18, unchecked left2.
  Checked thumb invert-fg, unchecked `bg-muted`.

### Security compact tab contract

Source: `index.css` and `pages/Security.tsx`.

- `.security-tabs`: flex, align center, gap2, fit-content/max100%, h44,
  padding4, mb16, border radius12, overflow-x auto.
- `.security-tab`: inline-flex, gap7, fixed h36, padding `0 16px`,
  border0, 12px/500, line-height1, nowrap, radius8; transition color/
  background150ms. These CSS rules override general Button sizing.
- Count: min-width18/h18, padding0 5, font10, line1, radius999.
- Dark outer `#131313`, inset1px `#1c1c1c`.
  Inactive transparent/`#a3a3a3`; hover `#202020`/`#ededed`;
  selected `#292929`/`#fafafa`, inset1px `#363636`;
  count `#303030`/`#c4c4c4`.
- Focus outline2 `#737373`, offset -2. Light relies on bg-panel,
  selected bg-elev/text-foreground/shadow-sm and muted inactive text.

### Dialogs, drawers and feedback

- `Modal`: backdrop black60%, blur-sm, outer p16; panel full width up to
  max-w-lg512, radius-2xl18, line border/card fill, shadow-2xl, p24.
  Compact max-w-md448/p20; lowered top padding48/bottom16.
  Max-height `100dvh - 32px` or lowered `100dvh - 64px`, internal scroll.
- Drawer: right-side448px/max100%, dark `#191919` / explicit light white;
  shadow `-20px 0 60px rgba(0,0,0,.5)`; black70% backdrop.
  Header px24/pt20/pb8; body px24/py20; footer px24/pb20/pt12.
  Full height normally; compact top24, max-height `100dvh - 48px`,
  body pt20/pb12, footer stacks below sm.
- Shared overlay stack begins at z1001; focus trap/inert and scroll-lock
  behavior is implemented, not just visual.
- `FlashBanner`: radius-xl, p12, gap10, 13px/20px, mb16. Errors
  red-400 border30%/fill10%; success uses edge/fg5% with green icon.
  Auto-dismiss9s and explicit dismiss.
- Auth `Notice`: similar p12/radius-xl/13px/20px; error alert versus other
  status role. No auto-dismiss.
- SignInBanner: centered top96, width356/max `100vw - 32px`, z100;
  radius-lg, edge/card, shadow `0 10px 30px rgba(0,0,0,.5)`;
  text13/500, px16/py12, green dot20/check12 and bottom4px progress,
  dismisses after4000ms.
- Overview's private Toasts reuse that visual treatment but z70; lifecycle
  depends on progress animation completion instead of the banner's timer.

## 6. Borders, shadows and iconography

- Borders are normally 1px; do not replace the distinct `line`, `edge` and
  semantic `border` variables indiscriminately.
- Ordinary cards/chrome generally avoid heavy shadows; floating menus and
  overlays use shadow-xl/2xl and the exact custom shadows above.
- Installed Tailwind shadow-xl:
  `0 20px 25px -5px rgb(0 0 0 / .1), 0 8px 10px -6px rgb(0 0 0 / .1)`;
  shadow-2xl `0 25px 50px -12px rgb(0 0 0 / .25)`.
- Lucide React is the established icon system. Most control icons14–16px,
  nav18–20px, hero/weather larger. Common strokes1.5/1.6/1.75; some
  emphasis icons use2 or3. Preserve per-component values.
- Most icons are outline/currentColor. Exceptions: Login's inline SVG door,
  monochrome provider marks, illustrative Avatar SVG, chart SVG, weather fills.
- Keep decorative icons aria-hidden and accessible labels for icon-only
  actions, following the nearest accessible implementation.

## 7. Navigation and UI/UX behavior

### Role navigation

Source: `auth/roleConfig.ts`, `Shell.tsx`, `NavigationContext.ts`,
`RoleViews.tsx`. `Route` is a string union; destinations use `go(route)`.
`moduleForRoute(role, route)` matches `module-${module.key}`.

- System Admin: Dashboard; Users → All/Deleted; Security; Audit Logs; Settings.
- Executive: Dashboard; Event Details; Event Schedules; Event Asset Details;
  Settings. Its dashboard title is fixed **Executive**, subtitle
  **Executive workspace**, shared Hero uses `account.firstName`, and wrapper
  uses `.dashboard-surfaces`.
- Event Manager: role modules for pitching, concepts, creation, canvas,
  approval and asset requests; Projects → All/Deleted; Settings.
- Warehouse Operations Manager: inventory, order requests, deficit queue,
  acquisition, fabrication, personnel deployment, damage assessment.
- Ground Crew: assigned work, dispatch loading, arrival, evidence,
  post-event audits.
- Operational module pages and Notifications currently use placeholders.
- Only Event Manager can access Projects routes. Admin routes are System
  Admin-only. `settings-security` is intentionally denied to System Admin.
  Other shared routes are overview, notifications and settings profile/app.
- Breadcrumb map includes a `Security` → `settings-security` label mapping.
  Current final crumb is inert unless Dashboard; intermediate mapping must
  not be assumed to mean admin Security.

### Menus, focus and overlays

- Topbar command search: Ctrl/Meta+K, no toggle while an aria-modal exists;
  opens a560px/max viewport-minus32 panel at top96. Role-filtered results;
  ArrowUp/Down/Enter/Escape. No results message.
- User/notification menus dismiss on outside mousedown, Escape or overlay
  opening. Keyboard ArrowUp/Down/Home/End focuses available buttons.
  Fixed at right16/top80, max-height `100dvh - 112px`.
- Notification counts/read/dismiss are local demo state; settings shortcut
  routes to settings-app.
- `OverlayLayer` portals to body; only top layer handles Escape/Tab;
  background body siblings become inert; html/body overflow is locked.
  Focus starts on panel, traps visible enabled items, and returns to the
  connected opener when closed. Nested dropdown portals use overlay context.
- Drawer opening collapses the desktop sidebar; closing does **not**
  explicitly restore its previous expansion state.
- Dropdown/RowMenu use Base UI non-modal Select/Menu, shared item recipes
  and collision-aware positioning. They close when another overlay opens.
- DatePicker: arrows move days/weeks; Home/End week boundaries;
  PageUp/Down month; Shift+PageUp/Down year; min/max clamp;
  Escape closes its own popup without dismissing the parent.
- Security tabs implement role=tab, roving tabIndex, ArrowLeft/Right,
  Home/End, aria-controls and labeled panels. Segmented's keyboard mode
  instead uses aria-pressed and supports the same directional/home/end keys;
  mode is opt-in and not used by every caller.
- Stat reorder: pointer capture or Space/Enter pick/drop; arrows/Home/End
  move; Escape cancel; live announcements; persistence failure announces
  non-persistence.

### Filters, feedback and validation

- Accounts search debounces250ms, resets page; simulated loading400ms on
  applied search/filter/page changes. Security search uses250ms debounce;
  Security/Audit initially show400ms loading.
- Audit uses draft/applied filters with explicit Filter submit, range error,
  constrained dates and reset. Projects also explicitly applies a draft form.
  Do not silently make all pages use one filtering mode.
- Standard admin paging10 rows; RecentProjects4; Projects shows5 then
  increments5 via Show more (not page-number navigation).
- Preserve separate empty dataset and no-match copy where implemented.
  Use missing-value labels such as “Never”, “Unknown”, “Not recorded”, or `—`
  according to the source meaning; do not invent historical values.
- Auth/account forms use controlled values, field-specific errors,
  aria-invalid/describedby where wired, noValidate plus explicit validation.
  Pending refs/busy flags prevent duplicate requests; disabled controls and
  Loader2 spinner communicate progress. Some native required validation
  remains in simpler project forms.
- Password policy is8–128 Unicode code points; confirmation must match.
  Strength is guidance, not a separate complexity rule. Paste/spaces/password
  managers are allowed.
- Recovery has one real numeric input driving six48px visual slots;
  supports paste/autofill and native selection, strips non-digits.
  Expiration/resend timers and retry messages derive from timestamps.
- Destructive account/session actions show confirmation copy with specific
  effects. Project deletion currently acts immediately without the same
  confirmation flow.
- Profile fields are disabled until Edit Profile; email/role remain disabled.
  App Settings toggles are local state only and do not alter global compact
  density, email delivery, push delivery or analytics.
- ExportMenu actually exports CSV when supplied and PNG of
  `#dashboard-image-export` through `html-to-image`; busy and failure copy
  are present. Overview DateRangePicker only manages its own displayed
  selection; it is not a connected global chart filter.
- Public social buttons explicitly report that Google/Microsoft sign-in
  is not connected. Auth/logging are synthetic browser behavior.

## 8. Motion and responsive behavior

### Motion

| Source | Exact motion |
| --- | --- |
| `.animate-fade-up` | .35s ease-out both; opacity0 + translateY6px → visible/none |
| `.animate-pop` | .16s ease-out both; Y-4px/scale.96 → none; origin top-right |
| `.animate-toast-in` | .25s ease-out both; Y-10px → none |
| `.animate-shrink` | linear forwards scaleX1 →0, origin left; duration supplied |
| Shell rail | transform/width300ms cubic-bezier(.4,0,.2,1) |
| Drawer | transform300ms cubic-bezier(.32,.72,0,1); opacity backdrop300ms |
| Segmented pill | transform300ms cubic-bezier(.4,0,.2,1) |
| Stat reorder | FLIP180ms ease-out; wrapper200ms |
| Common hover | color150–200ms; shared utilities sometimes use defaults |

`prefers-reduced-motion: reduce` disables fade-up/pop/toast-in animations,
sets all transition durations to .01ms and scroll-behavior auto.
StatCards skips FLIP and uses motion-reduce utilities.
**Not all animations are globally disabled:** shrink, pulse and spin are
not included in the explicit animation-none list.

### Breakpoints

Verified installed Tailwind defaults; no app override found:

| Prefix | Minimum width | Existing use |
| --- | --- | --- |
| base | below640px | stacked forms/cards; hidden desktop sidebar |
| `sm` |40rem /640px | two-column forms, account name visible, auth horizontal padding32 |
| `md` |48rem /768px | topbar search visible, two-column profile/policy |
| `lg` |64rem /1024px | desktop sidebar/rail, settings260px column, wide filter layouts |
| `xl` |80rem /1280px | dashboard two-plus-one grid, three role-module columns |
| `2xl` |96rem /1536px | available default; no dedicated layout rule found in audited pages |

“Laptop” and “tablet” are not separate named design modes in code. Their behavior
is determined by these breakpoints. Shell also uses an explicit
`window.innerWidth >= 1024` check for hamburger collapse versus mobile opening.

- Below lg the sidebar is fixed/off-canvas with black50% backdrop; always
  shows labels when opened. Selecting a route closes it. Desktop uses sticky
  sidebar and icon rail; no separate mobile app shell.
- Header first name hidden below sm; search hidden below md. Action groups
  remain horizontal; do not claim every narrow width has been tested.
- Cards/forms generally stack, then split; header actions flex-wrap.
- Tables scroll in their own wrappers, retaining operational min-widths.
  There is no automatic mobile table-to-card transformation.
- Modals/drawers cap width against viewport; height caps use dynamic viewport
  units. Popup collision padding8 prevents normal select/calendar overflow.
- Auth main has px16, pb32, pt112; card width448 max; top/footer1400 max.
  Background is a fixed40×40px line grid fading through a radial overlay.
- All scrollbars are thin using line/transparent.

## 9. Verified inconsistencies and limits — preserve unless authorized

| Observation | Evidence / implication |
| --- | --- |
| Duplicate token families | fg/foreground and line/edge/border differ; do not flatten |
| Badge colors not theme-adaptive | green/yellow text is identical in both themes; light contrast not independently tested |
| Radius naming differs from generic defaults | rounded-xl14, rounded-2xl18; Security literal12/8 |
| Auth surfaces differ by route | Login hooks versus recovery/invitation's generic dark elevated frame |
| Detail component name mismatch | exported `DetailsDrawer` renders a Modal when read-only and a Drawer when editing |
| Button variants/densities vary | shared36/13px, many account actions40/14px, compact actions32 |
| Table densities/pagination differ | Projects13px/show-more; admin14px/paging; RecentProjects own pager |
| Skeleton/field/feedback duplication | Accounts defines local versions overlapping AdminKit |
| CommandPalette hardcodes dark surfaces | selected `#3b3b3e`/border `#5c5c60`, icon tiles `#4b4b4f` or `#2a2a2d`; footer `#2a2a2d`/border `#323235`, no full light alternate |
| RecentProjects active page | explicit `bg-white text-neutral-900`, unlike themed Pager |
| DateRangePicker fixed width |718px absolute panel, no viewport clamp/focus-management equivalent to shared DatePicker |
| Date ranges not globally wired | overview picker selection doesn't change independent chart ranges |
| Mixed date handling | security/audit GMT+8, hero/calendar/accounts local time, range demo fixed October2026 |
| Hero data is illustrative | temperature26°C/location/weather hardcoded; clock/date live local |
| Demo content leftover | development-project names and legacy roles in data.ts, module placeholders remain |
| App preference toggles are isolated | compact/email/etc. don't affect actual global behavior |
| Focus coverage varies | AdminKit/auth/overlays explicitly handle it; general Button/IconButton and some legacy controls lack equivalent local focus classes |
| Mobile nav is not shared modal | Sidebar doesn't use OverlayLayer's focus trap/inert/return-focus machinery |
| Reduced motion is partial | shrink/pulse/spin not covered by global animation-none list |
| Existing hero includes emoji | legacy text only; do not propagate new emoji as an icon system |
| App-level inspection limited | App.tsx tool redaction; don't assert exact theme storage or route lifecycle |

These are audit findings, not tasks to fix. For new work, inspect the closest
page family, reuse its shared components, keep unrelated source unchanged, and
explicitly report any limitation that affects verification.
