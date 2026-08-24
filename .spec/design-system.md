# DisplayQuest Design System Specification

> **✅ RE-BASELINED 2026-08-24 (Phase −1):** the user's token refactor landed on `dev`
> (commit `69529d4`). The color baseline is now **the user's landed HSL values** in
> `app/globals.css` + `tailwind.config.ts` (blue primary, `success/warning/info`,
> blue-tinted dark neutrals hue≈222). The provisional oklch palette below was REPLACED.
> Runtime is still Tailwind **v3** (`hsl(var(--*))`); the Tailwind v4 `@theme` migration
> goal stands — T0.7 = "port these exact values to v4", a mechanical migration with zero
> visual change (screenshot baseline captured before switching).

## Design Token System (Tailwind CSS v4 `@theme`)

### Color Palette — LANDED BASELINE (source: app/globals.css @ dev)

| Token (`--`) | Light | Dark |
|---|---|---|
| background | `0 0% 100%` | `222 15% 8%` |
| foreground | `222.2 84% 4.9%` | `210 20% 93%` |
| card / card-foreground | `0 0% 100%` / `222.2 84% 4.9%` | `222 13% 11%` / `210 20% 93%` |
| popover / popover-foreground | `0 0% 100%` / `222.2 84% 4.9%` | `222 12% 14%` / `210 20% 93%` |
| primary / primary-foreground | `221.2 83.2% 53.3%` / `210 40% 98%` | `217 91% 50%` / `210 40% 98%` |
| secondary / secondary-foreground | `210 40% 96%` / `222.2 84% 4.9%` | `220 10% 17%` / `210 15% 90%` |
| muted / muted-foreground | `210 40% 96%` / `215.4 16.3% 46.9%` | `220 10% 17%` / `218 11% 65%` |
| accent / accent-foreground | `210 40% 96%` / `222.2 84% 4.9%` | `220 12% 19%` / `210 15% 92%` |
| destructive / destructive-foreground | `0 84.2% 60.2%` / `210 40% 98%` | `0 72% 51%` / `0 0% 98%` |
| success / success-foreground | `160 84% 30%` / `0 0% 100%` | `158 64% 52%` / `160 45% 8%` |
| warning / warning-foreground | `32 92% 38%` / `0 0% 100%` | `38 92% 56%` / `30 50% 10%` |
| info / info-foreground | `221 83% 45%` / `0 0% 100%` | `213 94% 68%` / `220 45% 9%` |
| border / input | `214.3 31.8% 91.4%` | `220 10% 20%` |
| ring | `221.2 83.2% 53.3%` | `217 91% 60%` |
| chart-1…5 (light) | `12 76% 61%` · `173 58% 39%` · `197 37% 24%` · `43 74% 66%` · `27 87% 67%` | — |
| chart-1…5 (dark) | — | `217 91% 62%` · `160 70% 55%` · `45 96% 60%` · `262 83% 70%` · `0 84% 65%` |
| sidebar-background/foreground | `0 0% 98%` / `240 5.3% 26.1%` | `222 15% 7%` / `210 20% 93%` |
| sidebar-primary/-foreground | `240 5.9% 10%` / `0 0% 98%` | `217 91% 50%` / `210 40% 98%` |
| sidebar-accent/-foreground | `240 4.8% 95.9%` / `240 5.9% 10%` | `220 12% 19%` / `210 15% 92%` |
| sidebar-border / sidebar-ring | `220 13% 91%` / `217.2 91.2% 59.8%` | `220 10% 20%` / `217 91% 60%` |

Radius base: `--radius: 0.75rem` (lg=var, md=var−2px, sm=var−4px). Dark mode: class strategy.
Dark elevation scale (background 8% < card 11% < popover 14%, hue 222) is INTENTIONAL — preserve it.

### Target v4 form (T0.7 mechanical port — values above, shape below)

```css
/* globals.css after T0.7 */
@theme {
  --color-background: hsl(0 0% 100%);
  --color-foreground: hsl(222.2 84% 4.9%);
  --color-primary: hsl(221.2 83.2% 53.3%);
  --color-primary-foreground: hsl(210 40% 98%);
  /* …every row of the table above → --color-* … */
}
.dark {
  --color-background: hsl(222 15% 8%);
  /* … */
}
```

### Spacing Scale
```css
@theme {
  --space-0: 0;
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-20: 5rem;     /* 80px */
  --space-24: 6rem;     /* 96px */
}
```

### Border Radius
```css
@theme {
  --radius-none: 0;
  --radius-sm: 0.25rem;   /* 4px */
  --radius-md: 0.375rem;  /* 6px */
  --radius-lg: 0.5rem;    /* 8px */
  --radius-xl: 0.75rem;   /* 12px */
  --radius-2xl: 1rem;     /* 16px */
  --radius-full: 9999px;
}
```

### Typography Scale
```css
@theme {
  /* Font Families */
  --font-sans: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", monospace;
  
  /* Font Sizes */
  --text-xs: 0.75rem;     /* 12px */
  --text-sm: 0.875rem;    /* 14px */
  --text-base: 1rem;      /* 16px */
  --text-lg: 1.125rem;    /* 18px */
  --text-xl: 1.25rem;     /* 20px */
  --text-2xl: 1.5rem;     /* 24px */
  --text-3xl: 1.875rem;   /* 30px */
  --text-4xl: 2.25rem;    /* 36px */
  --text-5xl: 3rem;       /* 48px */
  
  /* Line Heights */
  --leading-tight: 1.25;
  --leading-snug: 1.375;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;
  
  /* Font Weights */
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
}
```

### Shadows & Elevation
```css
@theme {
  --shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
  --shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
}
```

### Transitions & Motion
```css
@theme {
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --duration-slow: 300ms;
  
  --ease-linear: linear;
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  
  --transition-fast: var(--duration-fast) var(--ease-out);
  --transition-normal: var(--duration-normal) var(--ease-out);
  --transition-slow: var(--duration-slow) var(--ease-in-out);
}
```

### Breakpoints
```css
@theme {
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
  --breakpoint-2xl: 1536px;
}
```

### Z-Index Scale
```css
@theme {
  --z-index-dropdown: 100;
  --z-index-sticky: 200;
  --z-index-fixed: 300;
  --z-index-modal-backdrop: 400;
  --z-index-modal: 500;
  --z-index-popover: 600;
  --z-index-tooltip: 700;
  --z-index-toast: 800;
}
```

---

## Component Library (shadcn/ui + Custom)

### Base Components (from shadcn/ui)
| Component | Variants | States | Notes |
|-----------|----------|--------|-------|
| Button | default, destructive, outline, secondary, ghost, link | hover, active, focus, disabled, loading | sizes: sm, default, lg, icon |
| Card | default | hover (interactive) | header, content, footer |
| Dialog | default | open, closed | portal, focus trap, Esc close |
| Dropdown Menu | default | open, closed | keyboard nav, submenus |
| Form | default | validating, error, success | RHF + Zod integration |
| Input | default, error | focus, disabled, error | label, description, error message |
| Select | default, error | open, closed | searchable, multi-select |
| Table | default, striped | hover, selected, loading | sortable, pagination |
| Tabs | default, underline | active, disabled | keyboard nav |
| Badge | default, secondary, destructive, outline, success, warning, info | - | dot variant for status |
| Avatar | default, fallback | loading, error | sizes: sm, default, lg, xl |
| Toast | default, success, destructive, loading | - | sonner integration |
| Tooltip | default | open, delayed | portal |
| Checkbox | default | checked, unchecked, indeterminate | label |
| Radio Group | default | selected | label |
| Switch | default | on, off | label |
| Slider | default | dragging | label, value display |
| Progress | default, indeterminate | - | label |
| Separator | horizontal, vertical | - | decorative |
| Scroll Area | default | scrolling | custom scrollbar |
| Collapsible | default | open, closed | trigger + content |
| Accordion | single, multiple | open, closed | trigger + content |
| Sheet | default | open, closed | mobile drawer |
| Popover | default | open, closed | anchor positioning |
| Hover Card | default | open, closed | delay |
| Command | default | open, closed | search, groups |
| Calendar | single, range, multiple | - | date-fns locale pt-BR |

### Custom Components (DisplayQuest Specific)

#### Kanban Components
```typescript
// features/tasks/components/KanbanBoard.tsx
interface KanbanBoardProps {
  projectId?: number;
  filters?: TaskFilters;
  onTaskClick: (task: Task) => void;
  onTaskUpdate: (taskId: number, updates: Partial<Task>) => void;
}

// features/tasks/components/KanbanColumn.tsx
interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  onTaskDragStart: (task: Task) => void;
  onTaskDragEnd: (task: Task, newStatus: TaskStatus) => void;
  onAddTask: (status: TaskStatus) => void;
  isCompact?: boolean;
}

// features/tasks/components/KanbanCard.tsx
interface KanbanCardProps {
  task: Task;
  isOverdue: boolean;
  isDragging: boolean;
  onClick: () => void;
  onEdit: () => void;
  isCompact?: boolean;
}
```

#### Work Session Timer
```typescript
// features/work-sessions/components/FloatingSessionTimer.tsx
interface FloatingSessionTimerProps {
  session?: WorkSession;
  onStart: (data: StartSessionData) => void;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
  onEnd: (id: number, data: EndSessionData) => void;
  position?: 'bottom-right' | 'bottom-left';
}
```

#### Data Table (Feature-Aware)
```typescript
// shared/ui/DataTable.tsx
interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  pagination?: PaginationState;
  onPaginationChange?: (state: PaginationState) => void;
  sorting?: SortingState;
  onSortingChange?: (state: SortingState) => void;
  filtering?: ColumnFiltersState;
  onFilteringChange?: (state: ColumnFiltersState) => void;
  selection?: RowSelectionState;
  onSelectionChange?: (state: RowSelectionState) => void;
  rowActions?: RowAction<T>[];
  emptyState?: React.ReactNode;
  loading?: boolean;
}
```

#### Form Field (Consistent)
```typescript
// shared/ui/FormField.tsx
interface FormFieldProps {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  htmlFor?: string;
}
```

---

## Accessibility Checklist (Per Component)

### Interactive Components
- [ ] Focus visible (`focus-visible:ring-2 focus-visible:ring-ring`)
- [ ] Keyboard operable (Tab, Enter, Space, Arrows, Esc)
- [ ] ARIA labels for icon-only buttons
- [ ] ARIA states (expanded, selected, checked, disabled)
- [ ] Focus trap in dialogs/sheets/popovers
- [ ] Return focus on close

### Color & Contrast
- [ ] Text: 4.5:1 (AA) / 7:1 (AAA)
- [ ] UI components: 3:1 (AA)
- [ ] Focus indicators: 3:1 against adjacent
- [ ] Not color-only for status (icons + text)

### Screen Readers
- [ ] Semantic HTML (landmarks, headings, lists)
- [ ] Live regions for dynamic content (toasts, timer)
- [ ] Descriptive link text (no "click here")
- [ ] Form labels associated (`htmlFor` + `id`)
- [ ] Error messages announced (`aria-live="assertive"`)

### Motion
- [ ] Respect `prefers-reduced-motion`
- [ ] No auto-playing animation > 5s
- [ ] Pause/stop controls for carousels

---

## Implementation Checklist

### Setup
- [ ] Migrate to Tailwind v4 (`@tailwindcss/postcss`)
- [ ] Replace `tailwind.config.ts` with `@theme` in `globals.css`
- [ ] Remove `tailwindcss-animate` (use native `@keyframes`)
- [ ] Update `components.json` for v4 paths
- [ ] Regenerate shadcn/ui components with v4 patterns

### Token Migration
- [ ] Map current CSS variables to `@theme` tokens
- [ ] Audit all `bg-*`, `text-*`, `border-*` classes for token compliance
- [ ] Replace arbitrary values (`bg-[#123456]`) with semantic tokens
- [ ] Create component variant recipes using `cva` with token references

### Component Audit
- [ ] Inventory all 60+ UI components
- [ ] Identify duplicates/near-duplicates (e.g., `button` vs `modern-button`)
- [ ] Consolidate to single source per pattern
- [ ] Add accessibility attributes to all
- [ ] Add TypeScript props with JSDoc

### Visual Regression
- [ ] Set up Playwright visual comparison
- [ ] Capture baseline screenshots for all components
- [ ] Test light/dark at 4 breakpoints
- [ ] Test high contrast mode
