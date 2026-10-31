# QuickPro design standard

QuickPro should look like a product a construction company would trust with
its workforce: calm, precise, fast to scan. Every element earns its place.
This standard is mandatory for every screen and every phase.

## Principles

- **Content first.** Neutral surfaces, ink text, one primary action per
  area. Color carries meaning (status, links, focus), never decoration.
- **No filler.** No gradients, stock illustrations, decorative icons,
  invented statistics or sample data shown as live. Empty states say what
  will appear and what to do next.
- **Dense but readable.** Tables for lists people compare (jobs, queues,
  documents); stacked rows on phones. Labels left, values right in detail
  panels.
- **Phones are first-class.** Workers find, apply to and accept jobs on a
  phone. The action that matters comes first in the reading order; tap
  targets are at least 40px; inputs use 16px text so iOS does not zoom.
- **Honest UI.** Only working controls. Upcoming features are described in
  text.

## Tokens (`src/app/globals.css`)

| Token | Use |
| --- | --- |
| `ink`, `ink-soft`, `muted`, `faint` | Text, from primary to placeholder |
| `canvas`, `surface`, `subtle` | Page background, panels, quiet fills (hover, table headers) |
| `line`, `line-strong` | Borders and dividers, control borders |
| `navy`, `navy-strong` | Brand and primary buttons, selected state |
| `brand` | Links, focus rings, "new" counts. Not for buttons |
| `ok`, `warn`, `bad`, `info` (+ `-soft`) | Status only |

Radii are small: 6px controls (`rounded-md`), 8px panels (`rounded-lg`).
Panels have a 1px border and no shadow; only floating menus have a shadow.
Type is Geist: page titles 22–24px semibold with tight tracking, section
titles 15px semibold, body 14px, secondary 13px, figures `tabular`.

## Components

- `ui/button`: `primary` (navy, one per area), `secondary` (outlined),
  `ghost` (toolbar), `danger` (outlined red; destructive actions sit behind
  a "…" disclosure that asks for a reason or confirmation).
- `ui/form`: `ActionForm`, `Field`, `Input`, `Select`, `Textarea`,
  `Checkbox`, `SubmitButton` (spinner and pending label), `FormMessage`.
  Field errors mark the control `aria-invalid` and link the message.
- `ui/card`: `Card`, `CardHeader`, `CardBody`, `EmptyState`.
- `ui/table`: `Table`, `THead`, `Th`, `TBody`, `Tr`, `Td`, `RowLink`
  (whole row clickable).
- `ui/badge`: status badges carry a dot; counts and tags do not.
- `ui/page-header`, `app/nav` (`AppHeader`, `SubNav`), `app/filter-links`
  (segmented control).

## Review before a phase is done

Run the visual review at 1440px and Pixel 7 for every screen the phase
touched (signed out, contractor, worker, staff) and fix spacing, alignment,
overflow and hierarchy issues before opening the pull request.
