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

A bright marketplace: white and cool light-gray surfaces, near-black ink,
and QuickPro orange for calls to action and the brand. See D-045 (which
replaces the warm off-white, serif look of D-043).

| Token | Use |
| --- | --- |
| `ink` (#15191E), `ink-soft`, `muted` (#5A6470), `faint` | Text, from primary to placeholder. `muted` is 6.0:1 on white |
| `canvas` (#F5F6F8), `surface` (white), `subtle` | Page background, panels and cards, quiet fills (hover, table headers) |
| `line`, `line-strong` | Borders and dividers, control borders |
| `brand` (#C2410C), `brand-strong`, `brand-soft` | Primary buttons (white text, 5.2:1), links, focus rings, the active tab |
| `signal` (#F26A1F), `signal-ink`, `signal-soft` | Bright orange for marks, dots and badges only; text on it is `ink` |
| `charcoal`, `charcoal-strong` | Dark bands: footer, sign-in side panel, tradespeople section |
| `ok`, `warn`, `bad`, `info` (+ `-soft`) | Status only |

Radii: 6px controls (`rounded-md`), 8px panels (`rounded-lg`), 12–16px
marketing cards and the search bar. Panels have a 1px border; cards on the
public site lift slightly on hover. Type is Geist throughout: app page
titles 22–24px semibold, body 14px; public headings `font-display` (Geist,
bold, tight tracking). On dark bands wrap the area in `.on-dark` so focus
rings switch to the bright orange.

Two-column page layouts use `grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_<side>]`
so long content can't push the page sideways on phones.

## Components

- `ui/button`: `primary` (orange, one per area), `secondary` (outlined),
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
  `PhoneFrame`, `Reveal`, `FeatureTabs`, `ServiceIcon`.
- The homepage leads with finding a pro: a search (service and town, a GET
  to `/contractors`), popular services, a grid of every service, and how it
  works for customers, contractors and tradespeople. The service and town
  lists come from `src/lib/catalog.ts`, which `tests/db/catalog.test.ts`
  keeps equal to the reference data.
- White and `canvas` sections alternate; charcoal for the tradespeople
  band, the closing call to action and the footer. Section rhythm: orange
  uppercase eyebrow, bold heading 32/44px, body 17px.
- Product screens only, captured from the labeled demo data set
  (`scripts/demo-seed.mts`, then `.review/marketing-shots.mts`), with the
  caption saying so. No stock photography until licensed photos are supplied. On phones `ScreenFrame` crops to the top-left
  at a readable scale instead of shrinking the whole screen.
- Motion: one fade-up per element on first view, disabled under
  `prefers-reduced-motion`; content is visible without JavaScript.
