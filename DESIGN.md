---
name: KorPhil-TESDA Disbursements
description: Light, dense voucher workspace for an accounting office; the Google Sheet stays the source of truth.
colors:
  brand: "#232a7c"
  brand-hover: "#181e62"
  brand-tint: "#e7e9f8"
  brand-ink: "#ffffff"
  overdue: "#b42318"
  overdue-bg: "#fdecea"
  pending: "#b86e00"
  pending-ink: "#8a5200"
  paid: "#1b7a45"
  paid-bg: "#e6f4ec"
  bg: "#ffffff"
  side: "#f3f4f9"
  tint: "#f6f7fb"
  hover: "#eef0f7"
  line: "#e3e5ee"
  line-2: "#cfd2e0"
  ink: "#161830"
  ink-2: "#4a4e6a"
  ink-3: "#676b86"
typography:
  headline:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  title:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "-0.005em"
    fontFeature: "tnum"
  body:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  table:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  label:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.45
    fontFeature: "tnum"
  caption:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.45
    fontFeature: "tnum"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "34px"
  button-hover:
    backgroundColor: "{colors.tint}"
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
  button-sm:
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  input:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "36px"
  nav-item:
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "34px"
  nav-item-current:
    backgroundColor: "{colors.brand-tint}"
    textColor: "{colors.brand}"
  chip:
    rounded: "{rounded.md}"
    padding: "0 8px 0 10px"
    height: "28px"
  table-row:
    height: "38px"
    padding: "0 12px"
  table-row-selected:
    backgroundColor: "{colors.brand-tint}"
  bulkbar:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.lg}"
    padding: "8px 8px 8px 16px"
---

# Design System: KorPhil-TESDA Disbursements

## Overview

**Creative North Star: "The Clerk's Ledger"**

A white working surface that behaves like a well-kept ledger book: hairline row rules, right-aligned tabular figures, a heavy ink rule under every total, and nothing decorative between the clerk and the numbers. It is an Operate interface for people at office desktops all day, so density is high (13px tables, 38px rows) and every screen opens on the work, not on a summary of it.

One colour carries intent. TESDA navy, the seal's outer ring, marks what you can do and what you have chosen: the primary action, the current nav item, the selected rows, the focus ring, the floating bulk-action bar. Everything else is cool grey-lavender neutrals. Voucher status is the only other colour voice, and it always arrives as a shape as well as a hue.

Structure comes from rules and tints, not cards. Panels are separated by 1px hairlines; the sidebar is a tonal step, not a box. Shadows exist only on things that float above the page.

**Key Characteristics:**
- Light only; white canvas, grey-lavender sidebar.
- Public Sans with tabular numerals everywhere.
- Navy for action, selection and focus; status is shape plus colour.
- Hairline tables, 2px ink rule above totals.
- Gently rounded controls (6px); flat at rest.
- Lucide line icons at 16px, 1.75 stroke.

## Colors

Cool neutral ground, one institutional navy, and three semantic status hues that never stand in for each other.

### Primary
- **Seal Navy** (brand): primary buttons, current nav item text and icon, selected tab underline, focus outlines and focus halos, checkbox accent, text links, the bulk-action bar, the active segmented option, and the fill of proportional bars. Hover deepens to **Midnight Navy** (brand-hover).
- **Navy Wash** (brand-tint): the selection fill. Current nav item, checked table rows, the open voucher row, the active report template, text selection, and the 3px focus halo on inputs.

### Status
- **Overdue Red** (overdue): overdue status mark and text, days-late figures, alert counts, error toasts and banners, invalid-field borders, disconnected flags. **Overdue Blush** (overdue-bg) backs the error banner.
- **Pending Amber** (pending): the outlined pending square only. Text that needs amber uses **Pending Umber** (pending-ink) for legibility (unsaved-changes note).
- **Paid Green** (paid): the paid dot. **Paid Mint** (paid-bg) is defined for paid backgrounds.

### Neutral
- **Paper** (bg): main canvas, panels, inputs, secondary buttons.
- **Lavender Grey** (side): the sidebar only.
- **Ledger Tint** (tint): table header bands, group rows, row hover, button hover, report preview sheet.
- **Hover Grey** (hover): nav and icon-button hover, button press, empty bar tracks.
- **Hairline** (line): row rules, panel dividers, section borders.
- **Control Line** (line-2): button, input, chip and segmented borders; scrollbar thumb.
- **Ledger Ink** (ink): body text, headings, the 2px total rule, toast background.
- **Slate** (ink-2): secondary text, labels, table headers, meta.
- **Mist** (ink-3): placeholders, idle nav icons, counts, nil cells.

### Named Rules
**The One Navy Rule.** Navy means "act here" or "you chose this". It never decorates, never tints a heading, and never marks status. The one data use is the fill of proportional bars.

**The Wash, Not Stripe Rule.** Selection is a full Navy Wash fill across the row or item. No left-edge stripes, no bold borders.

**The Shape-First Status Rule.** Voucher status is always a 10px mark plus colour: filled red square (2px corners) for overdue, outlined amber square (2px border) for pending, green dot for paid. These three marks are reserved for voucher status; other states (connection, access, errors) use lucide icons.

## Typography

**Display Font:** none; the system has no display tier.
**Body Font:** Public Sans (with system-ui, -apple-system, Segoe UI, sans-serif)
**Label/Mono Font:** ui-monospace, Cascadia Mono, Consolas for `code` values only (12.5px, 500).

**Character:** An open, civic sans that reads as government-official without ceremony. Tabular numerals on the body make every column of pesos align without per-cell work.

### Hierarchy
- **Headline** (700, 20px, -0.01em): page title in the action bar; also the report sentence-builder at 20px. Voucher panel title steps up to 22px.
- **Title** (700, 16px, -0.005em): section heads (Needs action, Open balance). Split tables and templates use 14-15px.
- **Body** (400, 14px, 1.45): base text, fields, ledger rows, matrix figures.
- **Table** (400, 13px): data grids, buttons (600), toolbars, tabs. Compact grids go to 12.5px.
- **Label** (500, 12.5px): field labels, chips, small buttons, hints.
- **Caption** (600, 12px): table header cells, counts, secondary meta lines.

### Named Rules
**The Tabular Rule.** `font-variant-numeric: tabular-nums` is set on the body and never turned off. Money is right-aligned and never wraps.

**The Weight-Not-Size Rule.** Hierarchy inside tables comes from weight (DV numbers 600-700, totals 700), not larger sizes. The scale stays between 12px and 22px.

## Layout

A fixed app shell: a 200px sticky sidebar, then a 56px sticky action bar carrying the page title, the primary action, search (max 420px), secondary actions and sync. Content below uses two-column work/rail splits: Workspace 1fr + 480px rail, Vouchers register 1fr + 520px side panel, Reports 320px template list + preview. Columns are divided by 1px hairlines, never gutters with cards.

Spacing runs on 4px steps: 8px between controls, 12px table cell padding, 16px section gaps, 24px page padding, 32px between rail sections. Rows are 38px (30px compact, 56px matrix); header bands are 32px.

Responsive: at 1280px the rails narrow (380px / 460px) and secondary action-bar buttons hide. At 1024px every split stacks to one column and the side panel replaces the list. At 760px the sidebar nav wraps onto rows of 32px items, search takes a full row, and nothing scrolls sideways: table cells wrap, register rows become two-line grids (DV # and amount, then payee, due and status), and `.stack` tables turn into one block per row with each cell labelled from `data-label`.

## Elevation & Depth

Flat by default. Depth is tonal: the sidebar sits one step darker than the canvas, header bands and hover use Ledger Tint, and hairlines do the rest. Shadows appear only on layers that float over content.

### Shadow Vocabulary
- **Toast** (`box-shadow: 0 6px 20px rgb(22 24 48 / .18)`): transient messages, top right.
- **Popover** (`box-shadow: 0 10px 30px rgb(22 24 48 / .14)`): the filter menu.
- **Bulk bar** (`box-shadow: 0 10px 30px rgb(22 24 48 / .25)`): the sticky navy selection bar.
- **Modal** (`box-shadow: 0 20px 50px rgb(22 24 48 / .3)`): confirm and busy dialogs, over a 45% ink backdrop.
- **Focus halo** (`box-shadow: 0 0 0 3px` Navy Wash): inputs and search on focus.

### Named Rules
**The Float-Only Shadow Rule.** If it scrolls with the page, it has no shadow. Only toasts, popovers, the bulk bar and modals lift.

## Shapes

Gently rounded, rectangular. Controls, nav items, chips, table header bands and matrix cells use 6px. Floating or sheet-like containers (bulk bar, filter menu, report preview) use 8px. Inner pieces use 4px (segmented options, `code`, `kbd`). Status squares use 2px corners; the paid mark and the seal are full circles; proportional bars are 6px tall with 3px ends. Borders are 1px; the only heavy lines are the 2px ink total rule, the 2px navy tab underline, and the 2px ink underline of report sentence selects.

## Components

### Buttons
Quiet, compact, and firm.
- **Shape:** gently rounded (6px), 34px tall, 600 weight at 13px, 6px icon gap.
- **Primary:** Seal Navy fill, white text; hover to Midnight Navy. One per view region (New DV, Save, Sync now).
- **Secondary:** white with Control Line border; hover to Ledger Tint with a Mist border; press to Hover Grey.
- **Small:** 28px tall, 12.5px (Mark paid, row actions). Row actions in the register reveal on row hover or focus.
- **On navy (bulk bar):** inverted white button with navy text, and a ghost white-text button with a 12% white hover.
- **Keyboard hints:** an outlined `kbd` inside the button (New DV · N), hidden on mobile.
- **Focus:** 2px navy outline, 2px offset.

### Chips
- **Style:** 28px, 6px radius, Control Line border, 12.5px 500, trailing 13px x icon. Used for active filters.
- **State:** hover turns border and text Overdue Red, signalling removal.

### Cards / Containers
There are no cards. The only boxed surface is the report preview sheet: Ledger Tint fill, hairline border, 8px radius, 24-28px padding, max 900px wide.

### Inputs / Fields
- **Style:** 36px tall, 1px Control Line border, 6px radius, white fill, 14px text, 12.5px Slate label above with 5px gap. Currency fields carry a peso affix inside the left edge.
- **Hover:** border to Mist.
- **Focus:** border to Seal Navy plus a 3px Navy Wash halo; caret is navy.
- **Error:** `:user-invalid` border in Overdue Red.

### Navigation
- **Sidebar:** 34px items, 500 weight, 16px Mist icons, trailing counts in 12px Mist (overdue count in bold red). Hover Hover Grey; current item Navy Wash with navy 700 text and navy icon. Voucher sub-items are 28px, 13px, indented 36px. A sheet footer (sync time, Open in Google Sheets link) sits at the bottom above a hairline.
- **Tabs:** 44px strip, Slate 500 text with counts; current tab Ledger Ink 700 with a 2px navy underline.
- **Segmented control:** 2px-padded outlined track; active option is a solid navy 4px-radius pill with white text.
- **Mobile:** sidebar collapses to wrapping rows of nav items; sub-nav and sheet footer hide.

### Data Grid
The core component. Full-width, 13px, 38px rows with 1px hairline rules, a 32px Ledger Tint header band (6px rounded ends, 12px 600 Slate text), money right-aligned and never wrapped. Totals sit in `tfoot` at 44px, 700 weight, under a 2px Ledger Ink rule. Row hover is Ledger Tint; checked or open rows are Navy Wash. Grouped tables (Needs action) insert 32px Ledger Tint group rows with a bold label and count · sum, and can collapse a Later group behind Show N.

### Status Mark
A 10px mark before the label, 8px gap. Overdue: filled red square, red text. Pending: 2px amber outlined square; text stays Ledger Ink in tables and ledgers. Paid: filled green circle. Days late render in red 600-700.

### Bulk Bar
Appears (rise 0.2s ease-out from 8px) only when a row checkbox is checked. Sticky 16px above the bottom of the list, Seal Navy fill, 8px radius, float shadow, white 13px text: "N selected · ₱sum" on the left, inverted primary action (Mark N paid), ghost Export and Clear on the right.

### Heat Matrix Cell
Trade Areas cells: right-aligned amount (14px 600) over a count (12px Slate) in a 46px, 6px-radius cell. Late buckets take an overdue-hue heat ramp (#fdf1ef, #f9d9d4, #f2b8af, with #6b2a22 captions on the two darker steps). Hover draws a navy 1px border and turns the amount navy; the cell links to the filtered register. Nil cells show a Mist em dash.

### Proportional Bars
6px Hover Grey track, Seal Navy fill, 3px ends, minimum 3px fill for non-zero values; label, bar and amount in a three-column grid.

### Toasts and Banners
Toasts: Ledger Ink fill, white 13px 500 text, 6px radius, toast shadow, auto-dismiss after 4s; success icon mint, error toasts turn Overdue Red and persist. The mark-paid toast carries an underlined white Undo link and stays 12s, pausing on hover. Banners: Overdue Blush with red text and an alert icon.

### Modals
Native `<dialog>` opened with `showModal()`, so the page behind is inert. White, 10px radius, modal shadow, max 400px wide, rises 0.15s on open.
- **Confirm:** heading question, Slate 13px note, right-aligned Cancel and primary action. Used before Mark paid and before discarding unsaved edits.
- **Busy:** 320px, centered 28px navy spinner on a Navy Wash ring, 600 status text, "Keep this page open" note. Shown while a save, sync or undo writes to the sheet; Escape cannot close it.

### Settings Rows
A definition list of 260px label column (600, with a 12.5px Slate note), value column, and right-aligned action; hairline between rows. Connection and access flags are a 16px lucide icon plus 13px Slate text, red when bad.

## Do's and Don'ts

### Do:
- **Do** reserve Seal Navy for primary actions, current and selected states, focus, links and bar fills.
- **Do** show selection as a full Navy Wash fill on the row or item.
- **Do** pair every voucher status with its mark: filled red square overdue, outlined amber square pending, green dot paid.
- **Do** set money in tabular numerals, right-aligned, no wrapping, with a 2px ink rule above totals.
- **Do** use lucide icons at 16px with 1.75 stroke for navigation, actions and non-voucher states.
- **Do** keep controls at 34px (28px small) with 6px radius, and floating surfaces at 8px.
- **Do** separate regions with 1px hairlines and Ledger Tint bands.

### Don't:
- **Don't** use the status squares or dot for anything other than voucher status.
- **Don't** convey status by colour alone.
- **Don't** use navy to decorate headings, dividers or status.
- **Don't** add left-edge accent stripes to selected or highlighted rows.
- **Don't** wrap sections in cards or add shadows to anything that scrolls with the page.
- **Don't** build KPI-card summaries; show totals in ledger tables and bars.
- **Don't** introduce a dark theme; the product is light only.
