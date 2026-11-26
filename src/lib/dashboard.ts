// A dashboard layout: which panels, in what order, how wide. Panels live in fixed sections (key figures, charts,
// breakdowns), each with one row height, on a 4-column grid; a panel's width is 1, 2 or 4 columns and its height comes
// from its section. Pure (tested); saved per person in the spreadsheet (sheets.ts) and in a cookie (dashboard-board.tsx).

/** [panel id, width in columns of 4]. */
export type DashLayout = [id: string, width: number][]
export type Section = "figures" | "charts" | "breakdowns"

/** The kinds of panel, as menus group them. */
export const SECTIONS: { key: Section; name: string }[] = [
  { key: "figures", name: "Key figures" },
  { key: "charts", name: "Charts" },
  { key: "breakdowns", name: "Breakdowns" },
]
/** Where panels sit: key figures in their own short rows; charts and breakdowns share taller rows, side by side. */
export type Area = "figures" | "panels"
export const AREAS: { key: Area; name: string }[] = [
  { key: "figures", name: "Key figures" },
  { key: "panels", name: "Charts and breakdowns" },
]
export const areaOf = (s: Section): Area => (s === "figures" ? "figures" : "panels")
/** The widths each kind of panel reads well at, narrowest first; the first is the one it gets when added. */
export const WIDTHS = { figure: [1, 2], chart: [2, 4], summary: [4], bars: [2, 4] } satisfies Record<string, number[]>
const ALL_WIDTHS = [1, 2, 4]
export const WIDTH_NAMES: Record<number, string> = { 1: "Quarter", 2: "Half", 4: "Full width" }
const MAX_PANELS = 40

/** A figure that scales with its panel (the panel body is a size container). */
export const FIGURE = "text-2xl font-semibold tracking-tight tabular-nums @xs/panel:text-3xl @lg/panel:text-4xl"

/** The cookie holding this browser's copy of a module's layout, read when the spreadsheet has none (a Viewer can't save there). */
export const dashboardCookie = (name: string) => `dashboard-${name}`

/**
 * A layout from untrusted input (a request, the sheet, a cookie), or null if it isn't one. Layouts saved by the
 * earlier grid ("2x3": columns x rows) keep their width.
 */
export function cleanLayout(x: unknown): DashLayout | null {
  if (!Array.isArray(x) || x.length > MAX_PANELS) return null
  const out: DashLayout = []
  for (const item of x) {
    if (!Array.isArray(item) || item.length !== 2) return null
    const [id, size] = item
    if (typeof id !== "string" || !id || id.length > 120 || /[\u0000-\u001f]/.test(id)) return null
    const width = typeof size === "string" && /^[124]x[1-4]$/.test(size) ? Number(size[0]) : size
    if (!ALL_WIDTHS.includes(width)) return null
    if (!out.some(([seen]) => seen === id)) out.push([id, width])
  }
  return out
}

/** The list with item `from` moved to position `to`; unchanged when either is out of range. */
export function moved<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = list.slice()
  next.splice(to, 0, next.splice(from, 1)[0])
  return next
}

/** A place on a section's grid, 0-based: column, row, and how many columns. */
export type Cell = { x: number; y: number; span: number }
/** The empty end of a row that isn't full. after: the index (in the layout given) of the last panel on that row. */
export type Gap = Cell & { after: number }

/**
 * Each panel's cell on a grid `cols` wide (4, 2 or 1), rows filled left to right at the panel's own width (wider ones
 * shrink to fit narrow grids). A panel that doesn't fit what's left of a row starts the next one, and what it leaves
 * empty is a gap, where the board offers + Add.
 */
export function arrange(layout: DashLayout, cols: number): { cells: Cell[]; gaps: Gap[] } {
  const cells: Cell[] = [], gaps: Gap[] = []
  let x = 0, y = 0
  const close = (after: number) => {
    if (x > 0) gaps.push({ x, y, span: cols - x, after })
    x = 0
    y++
  }
  layout.forEach(([, w], i) => {
    const span = Math.min(w, cols)
    if (x + span > cols) close(i - 1)
    cells.push({ x, y, span })
    x += span
    if (x === cols) { x = 0; y++ }
  })
  if (x > 0) close(layout.length - 1)
  return { cells, gaps }
}

/** The widest of `widths` that fits in `room` columns, or undefined. */
export const fitting = (widths: number[], room: number) => widths.filter((w) => w <= room).at(-1)

/** The allowed width nearest to `cells` columns (a resize handle's position). */
export const nearest = (widths: number[], cells: number) =>
  widths.reduce((best, w) => (Math.abs(w - cells) < Math.abs(best - cells) ? w : best), widths[0])
