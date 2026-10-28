# DisplayQuest Design System

## Color hierarchy

The interface ships in two themes. The light one is the default shown in `../screens/home-light-desktop.png`, `../screens/projects-light-desktop.png`, `../screens/project-light-desktop.png` and `../screens/reports-light-desktop.png`; the dark one is `../screens/home-dark-desktop.png`.

Both themes come from the tokens in `app/globals.css`, from the `:root` and `.dark` blocks. A component that only holds up in one theme is incomplete.

### Primary

Use dark blue as the primary interface color.

It appears in:

- navigation;
- headings;
- primary actions;
- icons;
- borders and outlines where stronger contrast is needed.

### Surfaces

In the light theme (`:root`):

- white or near-white page backgrounds;
- very light tinted surfaces;
- lightly colored section backgrounds.

Surfaces stay visually close to white.

In the dark theme (`.dark`) the same tokens step up instead of down: `--background` is the lowest layer, `--card` sits above it and `--popover` above the card. Use `bg-background`, `bg-card` and `bg-popover` rather than a hard-coded dark color, and separate surfaces by tone plus border rather than by shadow.

### Semantic accents

Use restrained accent colors for semantic differentiation:

- blue — active/in-progress information;
- green — completed/success/progress;
- yellow/orange — attention, pending or upcoming information;
- purple — secondary category or review-related information;
- red — errors or exceptional states.

Do not use accent colors indiscriminately.

## Borders

Borders are thin and subtle.

They should establish grouping without becoming visually heavy.

Prefer a light border over a strong shadow.

In the dark theme the border (`--border`) does most of the separating, because the tone difference between surfaces is small. Do not drop it and rely on the background alone.

## Shadows

Use shadows sparingly.

The references rely more on:

- whitespace;
- borders;
- surface contrast;
- subtle elevation

than on large shadows.

Avoid dramatic floating-card shadows.

In the dark theme a large shadow reads as a dark halo around the element. Separate surfaces by tone and border, and keep shadows for things that genuinely float above the page (dialogs, popovers, dropdowns).

## Radius

Components have visibly rounded corners.

Maintain a consistent radius scale across:

- cards;
- inputs;
- buttons;
- filters;
- status badges;
- panels.

Do not give every component a different radius.

The scale is `--radius` (0.75rem), with `--radius-md` and `--radius-sm` derived from it. Do not introduce a value outside the scale.

## Typography

Typography is clean and highly readable.

Use strong weight and size differences to establish hierarchy.

Typical hierarchy:

1. page title;
2. section title;
3. component title;
4. supporting description;
5. metadata.

Type comes from `--font-sans` (Inter) everywhere and `--font-mono` for timers and identifiers. The theme does not change the type.

Do not add a decorative or handwritten face for emphasis.

## Icons

Icons should be simple line icons with consistent visual weight.

Icons are frequently paired with text.

Do not use large decorative icons when a small functional icon is sufficient.

## Progress indicators

Progress is represented visually using compact horizontal progress bars or circular progress indicators.

Progress bars should show:

- current progress;
- percentage when useful;
- enough surrounding context to understand what is progressing.

## Tags and status badges

Tags are compact and lightly colored.

They should visually identify categories without becoming the dominant element of a card.

Status colors come from the semantic tokens (`--success`, `--warning`, `--info`, `--destructive`, each with its `--*-foreground`), never from a raw palette class. The `.dark` block redefines those tokens, so a badge written against them needs no per-theme branch.

## Avatars

Small circular avatars are used for people associated with projects, tasks and activity.

Multiple members may appear as a compact avatar group.

## Buttons

Primary actions use the primary blue.

Secondary actions are quieter.

Buttons should not all look like primary calls to action.

## Search and filters

Search fields have:

- subtle borders;
- rounded corners;
- simple search icon;
- restrained visual weight.

Filters should visually belong to the same component family as the search field.