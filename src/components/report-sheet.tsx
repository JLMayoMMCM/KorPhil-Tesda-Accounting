// The printed report's parts: paper sizes and page packing, letterhead, contents, schedules, sign-off.
// Server-rendered; each <article> the page draws is one printed sheet.
import Image from "next/image"

import { Table as T, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { monthLabel, NOT_SET, paginate, peso } from "@/lib/ledger"
import { fmtCell, type Cell, type Col, type KpiBlock, type KpiCharts as Charts, type Slice, type Table } from "@/lib/reports"

/** Paper sizes: label, CSS width, CSS height, height and width in px (96 dpi). "Long" is PH long bond (8.5 × 13 in). */
export const PAPERS = {
  short: ["Short (8.5 × 11 in)", "8.5in", "11in", 1056, 816],
  long: ["Long (8.5 × 13 in)", "8.5in", "13in", 1248, 816],
  a4: ["A4 (210 × 297 mm)", "210mm", "297mm", 1123, 794],
} as const
export type Paper = keyof typeof PAPERS

// Fixed heights (px) the pages are packed by. A row is 28px plus 16px per extra wrapped line.
// ponytail: estimated, not measured; measure in the browser if pages start spilling over.
// A two-line register row is 8px of padding plus 20px per line, wrapping as above; its heading gets a second line too.
const H = { pad: 96, foot: 32, start: 236, contents: 44, line: 20, carry: 50, head: 64, row: 28, wrap: 16, gap: 24, end: 150, pair: 8, sub: 20, head2: 28 }
// The KPI charts are drawn at fixed heights (px), so their share of the page is exact: highlights, tiles, trend, donuts, coverage, gaps.
const KPI = { fact: 22, tiles: 92, trend: 196, donut: 160, coverage: 40, title: 20, gap: 20 }
/** A KPI chart band; each one packs onto the page by itself, ahead of the indicator table's rows. */
type KpiPart = "highlights" | "tiles" | "trend" | "donuts" | "coverage"
/** The shown bands, in page order, with their heights (each followed by a gap). */
const kpiParts = (c: Charts): [KpiPart, number][] => {
  const on = (...b: KpiBlock[]) => b.some((x) => c.show.includes(x))
  const parts: [KpiPart, boolean, number][] = [
    ["highlights", on("highlights") && c.highlights.length > 0, KPI.title + c.highlights.length * KPI.fact],
    ["tiles", on("tiles"), KPI.tiles],
    ["trend", on("trend"), KPI.title + KPI.trend],
    ["donuts", on("area", "category"), KPI.title + KPI.donut],
    ["coverage", on("coverage"), KPI.title + KPI.coverage],
  ]
  return parts.filter(([, shown]) => shown).map(([p, , h]) => [p, h + KPI.gap])
}
const CHAR = 6.2 // average px per character at text-xs

/** lead: the KPI chart bands; they take the first lead.length slots of heights, the table's rows the rest. */
export type Block = Table & { body: string[][]; foot?: string[]; heights: number[]; lead: KpiPart[] }

/** Cells as printed, each row's height, and the pages they pack into. */
export function layout(tables: Table[], paper: Paper, contents: boolean) {
  const textW = PAPERS[paper][4] - 96
  const lines = (text: string, w = 1) => Math.max(1, Math.ceil(text.length / Math.max(4, Math.floor((w * textW) / CHAR) - 2)))
  const blocks = tables.map((t): Block => {
    const show = (cells: Cell[]) => cells.map((v, i) => fmtCell(v, t.cols[i].fmt))
    const body = t.rows.map(show), foot = t.foot && show(t.foot)
    const extra = (cells: string[], idx: number[]) => H.wrap * Math.max(0, ...idx.map((i) => (t.cols[i].fmt === "text" ? lines(cells[i], t.cols[i].w) - 1 : 0)))
    const heights = [...body, ...(foot ? [foot] : [])].map((cells) => t.lines
      ? H.pair + t.lines.filter((idx) => idx.some((i) => cells[i])).reduce((s, idx) => s + H.sub + extra(cells, idx), 0)
      : H.row + extra(cells, cells.map((_, i) => i)))
    // KPI chart bands go first, each its own slot, so a page takes as many as fit instead of all or none.
    const parts = t.charts ? kpiParts(t.charts) : []
    heights.unshift(...parts.map(([, h]) => h))
    if (t.charts && !heights.length) heights.push(0) // every part hidden: the title and basis still need a place
    // The basis line rides with the first slot and the notes with the last, so neither is stranded on its own page.
    if (heights.length && t.basis) heights[0] += H.wrap * lines(t.basis)
    if (heights.length) heights[heights.length - 1] += t.notes.reduce((s, n) => s + 4 + H.wrap * lines(n), 0)
    return { ...t, body, foot, heights, lead: parts.map(([p]) => p) }
  })
  const clusters = new Set(blocks.flatMap((b) => b.cluster ?? [])).size
  const pages = paginate(blocks.map((b) => b.heights), {
    ...H, heads: blocks.map((b) => H.head + (b.lines ? H.head2 : 0)), cap: PAPERS[paper][3] - H.pad - H.foot, start: H.start + (contents ? H.contents + H.line * (blocks.length + clusters) : 0),
  })
  return { blocks, pages }
}

const right = (c: Col) => (c.fmt === "text" ? "" : "text-right")
const name = (b: Table) => (b.no ? `Schedule ${b.no}. ${b.title}` : b.title)

/** Page 1: the office letterhead, as on its printed forms, then the report's title block. */
export function Letterhead({ title, period, area }: { title: string; period: string; area: string }) {
  return (
    <>
      <header className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-[#1b2a6b]">
        <div className="flex items-center gap-1.5">
          <Image src="/bagong_pilipinas_logo.png" alt="Bagong Pilipinas" width={86} height={80} className="h-20 w-auto" />
          <Image src="/tesda_logo.png" alt="TESDA" width={80} height={80} className="size-20" />
        </div>
        <div className="text-center leading-tight">
          <div className="text-[15px]">Technical Education and Skills Development Authority XI</div>
          <div className="text-[15px] font-bold">REGIONAL TRAINING CENTER – KOREA PHILIPPINES</div>
          <div className="text-[15px] font-bold">VOCATIONAL TRAINING CENTER</div>
          <div className="text-[15px]">Buhisan Tibungco, Davao City, Philippines</div>
        </div>
        <Image src="/tesda_korphil_logo.png" alt="Korea-Philippines Vocational Training Center" width={80} height={80} className="size-20" />
      </header>
      <div className="flex flex-col items-center gap-0.5 border-y-2 border-double border-foreground/70 py-2 text-center">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Accounting Office · Disbursement report</p>
        <h2 className="font-heading text-lg font-bold tracking-tight text-balance">{title}</h2>
        <p className="text-sm">{period}</p>
        <p className="text-xs text-muted-foreground">{area} · Amounts in Philippine pesos (₱)</p>
      </div>
    </>
  )
}

/** Later pages: one line naming the office, report and period. */
export function RunningHeader({ title, period, area }: { title: string; period: string; area: string }) {
  return (
    <header className="flex justify-between gap-4 border-b pb-2 text-xs text-muted-foreground">
      <strong className="text-foreground">RTC – KorPhil VTC · {title}</strong>
      <span>{period} · {area}</span>
    </header>
  )
}

/** The full report's contents: numbered schedules under their cluster, the basis last, each with its page. */
export function Contents({ blocks, startsOn }: { blocks: Block[]; startsOn: (i: number) => number }) {
  const clusters = [...new Set(blocks.flatMap((b) => b.cluster ?? []))]
  const entry = (b: Block, i: number) => (
    <li key={b.kind} className="flex h-5 gap-2 pl-3">
      <span>{name(b)}</span>
      <span className="flex-1 -translate-y-1 border-b border-dotted border-foreground/30" />
      <span className="tabular-nums">{startsOn(i)}</span>
    </li>
  )
  return (
    <nav aria-label="Contents" className="flex flex-col gap-2 text-sm">
      <h3 className="font-heading font-bold">Contents</h3>
      <ol className="flex flex-col">
        {clusters.map((c) => (
          <li key={c}>
            <span className="block h-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{c}</span>
            <ol>{blocks.map((b, i) => b.cluster === c && entry(b, i))}</ol>
          </li>
        ))}
        {blocks.map((b, i) => !b.cluster && entry(b, i))}
      </ol>
    </nav>
  )
}

/** One row of a two-line table: each line a grid of its columns, the second indented under the first column. Empty lines are left out. */
function Lines({ b, cells, className = "" }: { b: Block; cells: React.ReactNode[]; className?: string }) {
  return b.lines!.map((idx, li) => idx.some((i) => cells[i]) && (
    <div key={li} className="grid gap-x-2" style={{ gridTemplateColumns: idx.map((i) => `minmax(0, ${b.cols[i].w}fr)`).join(" "), paddingLeft: li ? `${b.cols[0].w * 100}%` : 0 }}>
      {idx.map((i) => <div key={i} className={`break-words ${className} ${right(b.cols[i])}`}>{cells[i]}</div>)}
    </div>
  ))
}

/** Rows [from, to) of one schedule: title (and cluster in the full report), basis, table, total row, notes. */
export function Schedule({ b, from, to, cluster }: { b: Block; from: number; to: number; cluster: boolean }) {
  // Slots [from, to) cover KPI chart bands first (b.lead), then table rows.
  const parts = b.lead.slice(from, to), rf = Math.max(0, from - b.lead.length), rt = Math.max(0, to - b.lead.length)
  const foot = b.foot && rt > b.body.length
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="flex items-baseline justify-between gap-4 font-heading text-sm font-bold">
          <span>{name(b)}{from > 0 && <span className="font-normal text-muted-foreground"> (continued)</span>}</span>
          {cluster && <span className="text-xs font-normal text-muted-foreground">{b.cluster}</span>}
        </h3>
        {from === 0 && b.basis && <p className="text-xs text-muted-foreground">{b.basis}</p>}
      </div>
      {b.charts && parts.length > 0 && <KpiCharts c={b.charts} parts={parts} />}
      {rt <= rf && !foot ? null : b.lines ? (
        <T className="table-fixed border-y border-foreground/70 text-xs">
          <TableHeader>
            <TableRow className="border-foreground/70 bg-muted/60 hover:bg-muted/60">
              <TableHead className="h-auto py-1.5 whitespace-normal"><Lines b={b} cells={b.cols.map((c) => c.head)} className="font-semibold" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {b.body.slice(rf, rt).map((cells, ri) => (
              <TableRow key={rf + ri} className="hover:bg-transparent">
                <TableCell className="py-1 whitespace-normal tabular-nums"><Lines b={b} cells={cells} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
          {foot && (
            <TableFooter className="border-foreground/70 bg-transparent">
              <TableRow className="border-b-[3px] border-double border-foreground/70 hover:bg-transparent">
                <TableCell className="py-1.5 whitespace-normal tabular-nums"><Lines b={b} cells={b.foot!} className="font-bold" /></TableCell>
              </TableRow>
            </TableFooter>
          )}
        </T>
      ) : (
        <T className="table-fixed border-y border-foreground/70 text-xs">
          <colgroup>{b.cols.map((c) => <col key={c.head} style={{ width: `${c.w * 100}%` }} />)}</colgroup>
          <TableHeader>
            <TableRow className="border-foreground/70 bg-muted/60 hover:bg-muted/60">
              {b.cols.map((c) => <TableHead key={c.head} className={`h-8 font-semibold whitespace-normal ${right(c)}`}>{c.head}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {b.body.slice(rf, rt).map((cells, ri) => (
              <TableRow key={rf + ri} className="h-7 hover:bg-transparent">
                {cells.map((v, ci) => (
                  <TableCell key={ci} className={`py-1.5 align-top tabular-nums ${b.cols[ci].fmt === "text" ? "whitespace-normal break-words" : right(b.cols[ci])}`}>{v}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
          {foot && (
            <TableFooter className="border-foreground/70 bg-transparent">
              {/* Accounting rule: a single line above the total, a double line below. */}
              <TableRow className="h-7 border-b-[3px] border-double border-foreground/70 hover:bg-transparent">
                {b.foot!.map((v, ci) => <TableCell key={ci} className={`py-1.5 font-bold tabular-nums ${right(b.cols[ci])}`}>{v}</TableCell>)}
              </TableRow>
            </TableFooter>
          )}
        </T>
      )}
      {to === b.heights.length && b.notes.length > 0 && (
        <ol className="flex flex-col gap-1 text-xs text-muted-foreground">
          {b.notes.map((n, i) => <li key={i}>{b.notes.length > 1 ? `Note ${i + 1}. ` : "Note. "}{n}</li>)}
        </ol>
      )}
    </section>
  )
}

// Chart ink, from the dataviz reference palette, validated on both card surfaces. The trend: one blue for the period,
// gray for context months. Donut slices: the categorical slots in fixed order; "All others" and "Not set" stay neutral.
// Text keeps the text tokens. Coverage meters follow DESIGN.md: navy (primary) on the muted track.
const BAR = "bg-[#2a78d6] dark:bg-[#3987e5]", GRAY = "bg-[#c3c2b7] dark:bg-[#52514e]"
const SLOTS = [
  ["stroke-[#2a78d6] dark:stroke-[#3987e5]", "bg-[#2a78d6] dark:bg-[#3987e5]"],
  ["stroke-[#eb6834] dark:stroke-[#d95926]", "bg-[#eb6834] dark:bg-[#d95926]"],
  ["stroke-[#1baf7a] dark:stroke-[#199e70]", "bg-[#1baf7a] dark:bg-[#199e70]"],
  ["stroke-[#eda100] dark:stroke-[#c98500]", "bg-[#eda100] dark:bg-[#c98500]"],
  ["stroke-[#e87ba4] dark:stroke-[#d55181]", "bg-[#e87ba4] dark:bg-[#d55181]"],
]
const REST = ["stroke-[#898781]", "bg-[#898781]"], NONE = ["stroke-[#c3c2b7] dark:stroke-[#52514e]", GRAY]
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`)

/** 1, 2, 2.5 or 5 times a power of ten: the smallest clean tick step that covers max in four steps. */
function niceStep(max: number) {
  const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 2.5, 5, 10].find((m) => m * p >= raw)! * p
}

function ChartTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-semibold" style={{ height: KPI.title }}>{children}</h4>
}

/** Area chart by month: the period in blue (line, wash, dots), months before it in gray; y ticks in compact pesos; the period's peak labelled. */
function Trend({ data }: { data: Charts["trend"] }) {
  const W = 720, top = 18, bottom = 30, left = 44, right = 8, plotH = KPI.trend - top - bottom
  const max = Math.max(...data.map((d) => d.amount), 0)
  const step = max ? niceStep(max) : 1, ceil = step * Math.ceil(max / step || 1)
  const y = (v: number) => top + plotH - (v / ceil) * plotH
  const band = (W - left - right) / data.length, x = (i: number) => left + band * (i + 0.5)
  const last = data.length - 1, fi = data.findIndex((d) => d.inScope), first = fi < 0 ? last : fi // the period is the window's tail
  const peak = data.reduce((p, d, i) => (d.inScope && d.amount > (data[p]?.amount ?? -1) ? i : p), -1)
  const ticks = Array.from({ length: Math.round(ceil / step) + 1 }, (_, i) => i * step)
  const line = (from: number, to: number) => data.slice(from, to + 1).map((d, k) => `${k ? "L" : "M"}${x(from + k)},${y(d.amount)}`).join(" ")
  return (
    <svg viewBox={`0 0 ${W} ${KPI.trend}`} width="100%" height={KPI.trend} role="img" aria-label="Disbursements by month" className="overflow-visible text-xs">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} className={t ? "stroke-border" : "stroke-foreground/40"} strokeWidth={1} />
          <text x={left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground tabular-nums">₱{compact.format(t / 100)}</text>
        </g>
      ))}
      {fi >= 0 && <path d={`${line(first, last)} L${x(last)},${y(0)} L${x(first)},${y(0)} Z`} className="fill-[#2a78d6]/10 dark:fill-[#3987e5]/15" />}
      {first > 0 && <path d={line(0, first)} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-[#c3c2b7] dark:stroke-[#52514e]" />}
      {fi >= 0 && <path d={line(first, last)} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-[#2a78d6] dark:stroke-[#3987e5]" />}
      {data.map((d, i) => {
        const [mon, yr] = monthLabel(d.month).split(" ")
        return (
          <g key={d.month}>
            <title>{`${monthLabel(d.month)}: ${peso(d.amount)}, ${d.count} voucher${d.count === 1 ? "" : "s"}${d.inScope ? "" : " (before the period)"}`}</title>
            {/* Hit area: the whole band, so the tooltip doesn't need a pinpoint hover. */}
            <rect x={x(i) - band / 2} y={top} width={band} height={plotH} fill="transparent" />
            <circle cx={x(i)} cy={y(d.amount)} r={4} strokeWidth={2} className={`stroke-card ${d.inScope ? "fill-[#2a78d6] dark:fill-[#3987e5]" : "fill-[#c3c2b7] dark:fill-[#52514e]"}`} />
            {i === peak && d.amount > 0 && <text x={x(i)} y={y(d.amount) - 9} textAnchor="middle" className="fill-foreground font-medium tabular-nums">₱{compact.format(d.amount / 100)}</text>}
            <text x={x(i)} y={y(0) + 12} textAnchor="middle" className="fill-muted-foreground">{mon}</text>
            {(i === 0 || mon === "Jan") && <text x={x(i)} y={y(0) + 24} textAnchor="middle" className="fill-muted-foreground">{yr}</text>}
          </g>
        )
      })}
    </svg>
  )
}

/** Part-to-whole of the amount: a ring of at most six slices with 2px gaps, the total inside, a legend with every share beside it. */
function Donut({ title, slices, missing }: { title: string; slices: Slice[] | null; missing: string }) {
  const size = KPI.donut - 8, r = size / 2 - 12, C = 2 * Math.PI * r
  // Slots go to named slices in order; "Not set" and "All others" stay neutral and don't use one up.
  const neutral = (s: Slice) => s.rest || s.name === NOT_SET
  const ink = (s: Slice, i: number) => (s.rest ? REST : neutral(s) ? NONE : SLOTS[slices!.slice(0, i).filter((x) => !neutral(x)).length])
  const sum = slices?.reduce((a, s) => a + s.amount, 0) ?? 0
  const drawn = slices?.filter((s) => s.share) ?? [], gap = drawn.length > 1 ? 2 : 0
  // Where each slice starts along the ring: the lengths of the slices before it.
  const starts = (slices ?? []).map((_, i) => (slices ?? []).slice(0, i).reduce((a, s) => a + (s.share ?? 0) * C, 0))
  return (
    <figure className="flex flex-col">
      <ChartTitle>{title}</ChartTitle>
      {!slices || !sum || slices.length === 1 ? (
        <p className="text-xs text-muted-foreground">{!slices ? missing : !sum ? "No amounts in scope." : `All of the amount in scope (${peso(sum)}) is ${slices[0].name}.`}</p>
      ) : (
        <div className="flex items-center gap-4">
          <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={title} className="shrink-0">
            <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              {slices.map((s, i) => {
                const len = (s.share ?? 0) * C
                return len > 0 && (
                  <circle key={s.name} cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={22} className={ink(s, i)[0]}
                    strokeDasharray={`${Math.max(0, len - gap)} ${C}`} strokeDashoffset={-starts[i]}>
                    <title>{`${s.name}: ${peso(s.amount)} (${pct(s.share)})`}</title>
                  </circle>
                )
              })}
            </g>
            <text x="50%" y="47%" textAnchor="middle" className="fill-foreground text-sm font-semibold">₱{compact.format(sum / 100)}</text>
            <text x="50%" y="59%" textAnchor="middle" className="fill-muted-foreground text-xs">total</text>
          </svg>
          <ol className="flex min-w-0 flex-1 flex-col">
            {slices.map((s, i) => (
              <li key={s.name} title={`${s.name}: ${peso(s.amount)}`} className="grid h-5 grid-cols-[0.625rem_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                <span className={`size-2.5 rounded-xs ${ink(s, i)[1]}`} />
                <span className="truncate">{s.name}</span>
                <span className="text-right tabular-nums">{pct(s.share)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </figure>
  )
}

/** The chart bands given (those packed onto this page), above the KPI table that lists their figures in full. */
function KpiCharts({ c, parts }: { c: Charts; parts: KpiPart[] }) {
  const on = (b: KpiBlock) => c.show.includes(b), here = (p: KpiPart) => parts.includes(p)
  const context = c.trend.some((d) => !d.inScope)
  return (
    <div className="flex flex-col [print-color-adjust:exact]" style={{ gap: KPI.gap }}>
      {here("highlights") && (
        <section aria-label="Highlights" className="flex flex-col">
          <ChartTitle>Highlights</ChartTitle>
          {/* A ledger of facts: label left, value right of it, a hairline under each. */}
          <dl className="border-t border-border text-xs">
            {c.highlights.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[10rem_minmax(0,1fr)] items-center gap-4 border-b border-border" style={{ height: KPI.fact }}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="truncate font-medium tabular-nums" title={v}>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {here("tiles") && (
        <dl className="grid grid-cols-4 divide-x border-y border-foreground/20" style={{ height: KPI.tiles }}>
          {c.tiles.map((t) => (
            // Top-aligned, so every tile's figure sits on the same line whether it carries one note or two.
            <div key={t.label} className="flex min-w-0 flex-col gap-0.5 px-3 pt-2.5 first:pl-0">
              <dt className="text-xs text-muted-foreground">{t.label.replace(/ \(.*\)$/, "")}</dt>
              <dd className="text-base font-semibold">{t.value}</dd>
              {t.change && <dd className="text-xs text-muted-foreground">{t.change} vs prior period</dd>}
              {t.sub && <dd className="truncate text-xs text-muted-foreground" title={t.title}>{t.sub}</dd>}
            </div>
          ))}
        </dl>
      )}
      {here("trend") && (
        <figure className="flex flex-col">
          <div className="flex items-baseline justify-between gap-4">
            <ChartTitle>Disbursements by month</ChartTitle>
            {context && (
              <figcaption className="flex gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className={`size-2 rounded-full ${BAR}`} />In the period</span>
                <span className="flex items-center gap-1"><span className={`size-2 rounded-full ${GRAY}`} />Before the period</span>
              </figcaption>
            )}
          </div>
          {c.trend.length ? <Trend data={c.trend} /> : <p className="text-xs text-muted-foreground" style={{ height: KPI.trend }}>No dated vouchers.</p>}
        </figure>
      )}
      {here("donuts") && (
        <div className="grid grid-cols-2 gap-8" style={{ height: KPI.donut + KPI.title }}>
          {on("area") && <Donut title="Share of amount by trade area" slices={c.area} missing="The sheet has no trade area column." />}
          {on("category") && <Donut title="Share of amount by category" slices={c.category} missing="The sheet has no category column." />}
        </div>
      )}
      {here("coverage") && (
        <figure className="flex flex-col" style={{ height: KPI.title + KPI.coverage }}>
          <ChartTitle>Classification coverage, share of amount</ChartTitle>
          {c.coverage.length
            ? <ul className="grid grid-cols-3 gap-8">{c.coverage.map((r) => <Meter key={r.label} {...r} />)}</ul>
            : <p className="text-xs text-muted-foreground">The sheet has no category, trade area or diploma / ST / assessment column.</p>}
        </figure>
      )}
    </div>
  )
}

/** A share against 100%, as DESIGN.md's proportional bar: label and percent, then a 6px navy fill (3px ends, never under 3px when non-zero) on the muted track. */
function Meter({ label, share }: { label: string; share: number | null }) {
  return (
    <li className="flex flex-col gap-1.5 text-xs">
      <span className="flex justify-between gap-2"><span>{label}</span><span className="font-medium tabular-nums">{pct(share)}</span></span>
      <span className="block h-1.5 overflow-hidden rounded-[3px] bg-muted">
        <span className="block h-full rounded-[3px] bg-primary" style={{ width: share ? `max(3px, ${share * 100}%)` : 0 }} />
      </span>
    </li>
  )
}

/** Three signatories, the preparer's name filled in; each signs and dates by hand. */
export function SignOff({ preparer }: { preparer: string }) {
  return (
    <section aria-label="Sign-off" className="mt-auto grid grid-cols-3 gap-8 pt-6 text-sm break-inside-avoid">
      {([["Prepared by", preparer], ["Reviewed by", ""], ["Approved by", ""]] as const).map(([k, v]) => (
        <div key={k} className="flex flex-col gap-8">
          <span className="text-muted-foreground">{k}:</span>
          <div className="flex flex-col gap-3">
            <div className="border-t border-foreground/60 pt-1 text-center">
              <div className="min-h-5 font-medium">{v}</div>
              <div className="text-xs text-muted-foreground">Signature over printed name</div>
            </div>
            <div className="text-xs text-muted-foreground">Date: <span className="inline-block w-24 border-b border-foreground/60" /></div>
          </div>
        </div>
      ))}
    </section>
  )
}

export function PageFooter({ source, generated, page, of, push }: { source: string; generated: string; page: number; of: number; push: boolean }) {
  return (
    <footer className={`flex justify-between gap-2 text-xs text-muted-foreground ${push ? "mt-auto" : ""}`}>
      <span>System-generated from {source || "Google Sheet"} · {generated}</span>
      <span className="tabular-nums">Page {page} of {of}</span>
    </footer>
  )
}
