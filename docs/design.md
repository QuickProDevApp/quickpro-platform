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

Charcoal, warm off-white and slate carry the interface; construction orange
is the accent and is used sparingly (marks, rules, the active tab, the
primary call to action on the public site). See D-043.

| Token | Use |
| --- | --- |
| `ink` (#242B31), `ink-soft`, `muted` (#5E6A74), `faint` | Text, from primary to placeholder. `muted` is slate darkened a step to pass 4.5:1 |
| `canvas` (#F7F6F2), `surface`, `subtle` | Page background, panels, quiet fills (hover, table headers) |
| `line`, `line-strong` | Borders and dividers, control borders |
| `charcoal`, `charcoal-strong` | App bar, footer, dark bands, primary buttons, selected state |
| `brand` (#A9531B) | Links, focus rings, "new" counts. Not for buttons |
| `signal` (#D97835), `signal-ink`, `signal-soft` | The orange accent. Text on `signal` is charcoal (4.6:1), never white |
| `slate` (#66737D) | Decorative only |
| `ok`, `warn`, `bad`, `info` (+ `-soft`) | Status only |

Radii are small and squared-off: 5px controls (`rounded-md`), 7px panels
(`rounded-lg`), 4px on public-site buttons. Panels have a 1px border and no
shadow; only floating menus have a shadow. Type: Geist in the app (page
titles 22–24px semibold, section titles 15px semibold, body 14px, secondary
13px, figures `tabular`); Source Serif 4 (`font-display`, medium weight)
for headings on the public site and sign-in pages. On charcoal, wrap the
area in `.on-dark` so focus rings switch to the light orange.

Two-column page layouts use `grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_<side>]`
so long content can't push the page sideways on phones.

## Components

- `ui/button`: `primary` (charcoal, one per area), `secondary` (outlined),
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

## Public site

- Pages under `src/app/page.tsx` and `src/app/(site)/` use
  `components/marketing/*`: `SiteHeader`, `SiteFooter`, `ScreenFrame`,
  `PhoneFrame`, `Reveal`, `FeatureTabs`, `HowItWorks`.
- Background `paper` alternating with `surface`; charcoal for the
  tradespeople band, the closing call to action and the footer. Section
  rhythm: eyebrow (orange square + uppercase label), serif heading 34/46px,
  body 17px.
- Product screens only, captured from the labeled demo data set
  (`scripts/demo-seed.mts`, then `.review/marketing-shots.mts`), with the
  caption saying so. No stock photography until licensed photos are supplied. On phones `ScreenFrame` crops to the top-left
  at a readable scale instead of shrinking the whole screen.
- Motion: one fade-up per element on first view, disabled under
  `prefers-reduced-motion`; content is visible without JavaScript.
