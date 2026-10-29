# DisplayQuest UI reference

- Last verified: 2026-10-24
- Refresh the captures: run `/ui-reference refresh` with the app up. The flow reads the screens and viewports from `manifest.json`.
- Validate without editing: `/ui-reference check`.
- Machine-readable manifest: [`manifest.json`](manifest.json).

## Product character

DisplayQuest is a laboratory project management system: projects, tasks, weekly reports, work sessions and a gamification layer. The interface should read as a calm academic tool with a game-like thread, not as a generic corporate SaaS dashboard. Light is the default theme and dark is a full peer, not an inversion. Every screen keeps the work area in front and lets summaries, deadlines and activity sit around it. The captured screens under `screens/` are the ground truth for these claims.

## Tokens

The authority is [`app/globals.css`](../../app/globals.css), in the `:root` and `.dark` blocks. Tailwind reads it through the `@theme inline` bridge, so utilities resolve the token value and the dark block can override it.

The tokens that carry the interface:

- surfaces: `--background`, `--card`, `--popover`, `--secondary`, `--muted`, `--accent`, `--sidebar-background`;
- text: `--foreground`, `--muted-foreground`, `--card-foreground`, `--sidebar-foreground`;
- identity and action: `--primary`, `--primary-foreground`, `--ring`;
- status: `--success`, `--warning`, `--info`, `--destructive`, `--review`, each with a matching `--*-foreground`;
- charts: `--chart-1` through `--chart-5`;
- shape: `--radius: 0.75rem`, with `--radius-md` and `--radius-sm` derived from it.

Use the utility (`bg-card`, `text-muted-foreground`, `border-border`) instead of a raw color. The status colors come from the semantic tokens, never from a Tailwind palette class, because `.dark` redefines them. Do not copy the HSL values into components or documents. The file is the authority.

## Typography

Inter is loaded through `next/font` as `--font-inter` and exposed as `--font-sans`. JetBrains Mono is exposed as `--font-mono` and is reserved for timers and identifiers. The theme does not change type.

The scale in use:

- page title: `text-2xl font-bold tracking-tight sm:text-3xl`, rendered once per page by `PageHeader`;
- summary value: `text-2xl font-bold` in `StatCard`;
- card and section title: `text-sm font-medium` or `text-base font-medium`;
- body and descriptions: `text-sm`; descriptions use `text-muted-foreground`;
- metadata: `text-xs text-muted-foreground`.

Hierarchy comes from size and weight. Do not add a display face or a handwritten face for emphasis.

## Layout

The dashboard frame is:

- a sticky header, `h-16`, with a bottom border and a translucent background (`bg-background/95 backdrop-blur`);
- a fixed sidebar from `top-16`, `md:w-60`, with icon plus label navigation and a tinted active item;
- the content area inside `container mx-auto p-4 md:p-6`;
- a compact footer below the frame.

`PageHeader` (`components/ui/page-header.tsx`) opens a page with an optional icon, one `h1`, a quiet description and a contextual action on the right. The main content takes the width. A secondary column is optional, narrower, and holds supporting information only.

The Home screen puts the Kanban board at the center, with a summary and secondary widgets around it. The Projects screen uses a toolbar, a vertical project list and an optional right column. The project detail uses tabs. Do not add a second application frame or a second page heading.

## Components

Reuse these primitives before creating another component for the same concept:

- `components/ui/page-header.tsx`: page title, description, icon and action.
- `components/ui/stat-card.tsx`: compact label, value and hint block.
- `components/ui/modern-button.tsx`: primary, secondary, outline and icon buttons.
- `components/ui/card.tsx`: bordered surface with header, content and footer.
- `components/ui/table.tsx`: tabular data, including the leaderboard and report tables.
- `components/ui/tabs.tsx`: section switching inside a page, used by the project detail and Reports.
- `components/ui/badge.tsx`: compact status and tag badge, with semantic variants.
- `components/ui/status.ts`: the single source of status label, color and chart color for projects and tasks.
- `components/ui/empty-state.tsx`: icon, title, description and one action. No artwork.
- `components/ui/search-input.tsx`, `components/ui/select.tsx`: search and filters that belong to the same control family.
- `components/ui/dialog.tsx`, `components/ui/dropdown-menu.tsx`, `components/ui/popover.tsx`, `components/ui/sheet.tsx`: overlays and contextual menus.
- `components/ui/season-card.tsx`, `components/ui/user-trophies.tsx`, `components/ui/cycle-history.tsx`: gamification surfaces, always with data from the server.
- `components/ui/points-delta.tsx`: the short-lived award chip.
- `components/layout/`: header, sidebar, mobile menu, theme toggle and footer.

The detailed rules for each pattern live in `references/components.md` and `references/design-system.md`.

## Themes

The product ships two themes, `light` and `dark`. `next-themes` switches them with `attribute="class"` on the `html` element, and the default is `light`. The control is the header button labelled "Alternar tema", with the options Claro, Escuro and Sistema.

The light theme is the `:root` block. The dark theme is the `.dark` block, where the same tokens step up instead of down: `--background` is the lowest layer, `--card` above it and `--popover` above the card. Borders do most of the separation in dark, because the tone difference between surfaces is small. Shadows stay for things that genuinely float: dialogs, popovers and dropdowns.

A component is complete only when both themes hold. Use semantic utilities and let the block redefine them. Do not write a `dark:` pair for a color that already has a token, and do not treat dark as an inverted light theme.

## Screens

| id | route | purpose | states | captures |
| --- | --- | --- | --- | --- |
| `home` | `/dashboard` | Daily working area: greeting, laboratory summary, Kanban board, recent activity, deadlines and gamification. | default | `home-light-desktop`, `home-dark-desktop` |
| `projects` | `/dashboard/projetos` | Project list with filters, search, sorting and the Dashboard/List views. | default | `projects-light-desktop` |
| `project` | `/dashboard/projetos/9` | Single project with the Overview, Tasks, Members, Files and Settings tabs. The capture uses demo project 9. | default | `project-light-desktop` |
| `reports` | `/dashboard/weekly-reports` | Weekly reports by user, technical reports by project and attendance certificates. | default | `reports-light-desktop` |

This table mirrors `manifest.screens`. When a state earns its own capture, it gets its own screen id (`home-empty`, `home-error`) so the canonical file name survives.

## Responsive

The CSS uses the Tailwind default breakpoints: `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px and `2xl` 1536px. Do not invent a breakpoint the stylesheet does not have.

What changes:

- below `md`, the sidebar becomes the mobile menu and the header keeps the toggle and the compact controls;
- at `md`, the sidebar becomes fixed at `md:w-60` and the desktop header controls appear;
- page headers stack below `sm` and align the action to the right from `sm` up;
- grids and filter rows collapse to one column below `md`.

Verification viewports are `desktop` 1440x900 and `mobile` 390x844. The current captures cover desktop only. Mobile captures are added when a screen changes at that viewport, using the same `<screen>-<theme>-<viewport>.png` name.

## Anti-patterns

- Do not build a generic AI dashboard: metric cards, colorful charts and rounded containers around decorative statistics. The work area stays the focus.
- Do not put every section in a card, and never nest card inside card.
- Do not turn ordinary controls, navigation or arbitrary text into pills. Badges are for tags and status.
- Do not assign a bright color to every element. Accent colors establish semantic hierarchy.
- Do not use large floating shadows, decorative gradients or artwork.
- Do not fill empty space with widgets, charts or motivational text.
- Do not remove useful information to make a page look cleaner. The reference screens are information-rich.
- Do not create a second visual treatment for a concept that already has a component.
- Do not add animation or effects without a visual reason.
- Do not reproduce a capture as a static composition. The implementation must adapt to real content.

The detailed list is in `references/anti-patterns.md`.

## Maintenance

Refresh the reference when a visible change lands: a new screen, a new component pattern, a token change, a theme change or a layout change. A capture is invalid when the screen it shows no longer exists, when the theme or viewport in the file name changed, or when the data in the capture no longer represents the product.

To add a screen:

1. add the entry to `manifest.screens` with id, route, purpose, states and capture ids;
2. capture each theme and viewport with the canonical name under `screens/`;
3. add the matching entries to `manifest.captures`;
4. add the screen to the table above;
5. run `/ui-reference check`.

The owner approves visual changes. A review writes evidence under `docs/ui-reference/.review/`, which is gitignored. Credentials never enter this directory: the manifest names the environment variables and the values live in `docs/.capture.env`.

Detailed documents:

- `references/visual-language.md`
- `references/design-system.md`
- `references/layout-patterns.md`
- `references/components.md`
- `references/anti-patterns.md`
