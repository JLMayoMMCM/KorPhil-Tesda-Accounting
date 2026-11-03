"use client"

// Interactive Recharts views for the Dashboard, after shadcn's dashboard-01 block.
// Amounts arrive in centavos from the server page; every chart also carries a screen-reader list of its figures.
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Label, Pie, PieChart, XAxis, YAxis } from "recharts"

import { CalendarIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CircleAlertIcon, InfoIcon, ListFilterIcon, SearchIcon } from "lucide-react"
import { compact } from "@/components/charts"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { longDate, longMonth, monthLabel, monthsBack, peso, shortDate } from "@/lib/ledger"
import { cn } from "@/lib/utils"

/** verified: the verified share of value (trend chart only). */
export type Point = { id?: string; label: string; value: number; verified?: number; tip?: string; color?: string; href?: string }

const config = {
  value: { label: "Amount", color: "var(--primary)" },
  verified: { label: "Verified", color: "var(--primary)" },
  pending: { label: "For review", color: "var(--review)" },
} satisfies ChartConfig

/** Tooltip: the point's long label, then each series in full pesos (or `fmt`). */
const tooltipWith = (fmt: (n: number) => string, names: ChartConfig = config) => (
  <ChartTooltipContent
    labelFormatter={(_, payload) => (payload?.[0]?.payload as Point | undefined)?.tip ?? (payload?.[0]?.payload as Point | undefined)?.label}
    formatter={(value, name, item) => (
      <div className="flex w-full items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {name !== "value" && <span aria-hidden="true" className="size-2.5 rounded-[2px]" style={{ background: item.color }} />}
          {names[name as keyof typeof names]?.label ?? "Amount"}
        </span>
        <span className="font-medium text-foreground tabular-nums">{fmt(Number(value))}</span>
      </div>
    )}
  />
)
const tooltip = tooltipWith(peso)

function Figures({ caption, data }: { caption: string; data: Point[] }) {
  return (
    <ul className="sr-only" aria-label={caption}>
      {data.map((d) => <li key={d.label}>{`${d.tip ?? d.label}: ${peso(d.value)}${d.verified === undefined ? "" : `, ${peso(d.verified)} verified`}`}</li>)}
    </ul>
  )
}

/**
 * One wheel notch moves a whole Dashboard section. CSS snap alone springs back on a mouse wheel, because a notch
 * scrolls less than half a screen; this glides to the next section instead. Renders nothing; sections are the
 * element children of [data-snap], and only windows matching the `fit` variant in globals.css are handled.
 */
export function SectionWheel() {
  useEffect(() => {
    const fit = matchMedia("screen and (min-width: 80rem) and (min-height: 44rem)")
    const calm = matchMedia("(prefers-reduced-motion: reduce)")
    let until = 0
    const onWheel = (e: WheelEvent) => {
      if (!fit.matches || e.ctrlKey || !e.deltaY) return
      const [first, second] = document.querySelectorAll<HTMLElement>("[data-snap] > *")
      if (!second) return
      // Menus, popovers and a card with its own overflow keep the wheel.
      for (let n = e.target as HTMLElement | null; n && n !== document.body; n = n.parentElement) {
        if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY)) return
      }
      // Wheel and trackpad events keep arriving during the glide; swallow them so they don't fight it.
      if (Date.now() < until) return e.preventDefault()
      // How far the second section is below its resting place under the action bar (0 when it is there).
      const gap = Math.round(second.getBoundingClientRect().top - parseFloat(getComputedStyle(second).scrollMarginTop))
      const to = e.deltaY > 0 ? (gap > 1 ? second : null) : gap >= -1 && scrollY > 0 ? first : null
      if (!to) return // inside a section taller than the window: scroll normally
      e.preventDefault()
      until = Date.now() + 600
      to.scrollIntoView({ behavior: calm.matches ? "auto" : "smooth", block: "start" })
    }
    addEventListener("wheel", onWheel, { passive: false })
    return () => removeEventListener("wheel", onWheel)
  }, [])
  return null
}

/** One DV date's amounts, in centavos. */
export type Day = { date: string; value: number; verified: number }

const UNITS = {
  day: { label: "By day", note: "One point for each DV date" },
  week: { label: "By week", note: "Monday to Sunday" },
  month: { label: "By month", note: "Calendar months" },
  quarter: { label: "By quarter", note: "January – March, April – June, and so on" },
} as const
type Unit = keyof typeof UNITS

const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10)
const quarterOf = (iso: string) => Math.ceil(Number(iso.slice(5, 7)) / 3)
/** The bucket a date falls in: itself, its week's Monday, its month "2026-09" or its quarter "2026-Q3". */
const bucket = (iso: string, unit: Unit) =>
  unit === "quarter" ? `${iso.slice(0, 4)}-Q${quarterOf(iso)}` : unit === "month" ? iso.slice(0, 7)
    : unit === "week" ? addDays(iso, -((new Date(iso).getUTCDay() + 6) % 7)) : iso
/** First and last date of quarter q (1-4) of a year. */
const quarter = (year: string, q: number): [string, string] =>
  [`${year}-${String(q * 3 - 2).padStart(2, "0")}-01`, `${year}-${["03-31", "06-30", "09-30", "12-31"][q - 1]}`]
const sorted = (x: string, y: string): [string, string] => (x <= y ? [x, y] : [y, x])
const monthTitle = (m: string) => `${longMonth(m + "-01")} ${m.slice(0, 4)}`
/** The dates of month "2026-09", led by blanks so the 1st lands under its weekday (Monday first). */
const monthGrid = (m: string): (string | null)[] => [
  ...Array<null>((new Date(m + "-01").getUTCDay() + 6) % 7).fill(null),
  ...Array.from({ length: new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate() }, (_, i) => `${m}-${String(i + 1).padStart(2, "0")}`),
]

/** Two months of days for picking a date range: press and drag across days, or click a start then an end. Dots mark dates with vouchers. */
function RangeCalendar({ first, last, range, marked, onPick }: {
  first: string; last: string; range: [string, string] | null; marked: Set<string>; onPick: (from: string, to: string) => void
}) {
  const [view, setView] = useState((range?.[0] ?? [...marked].sort().at(-1) ?? last).slice(0, 7))
  const [drag, setDrag] = useState<[string, string] | null>(null)
  const [anchor, setAnchor] = useState<string | null>(null)
  const picked = drag ? sorted(...drag) : range
  const year = view.slice(0, 4)
  const clamp = ([x, y]: [string, string]): [string, string] => [x < first ? first : x, y > last ? last : y]
  const dayAt = (e: React.PointerEvent) =>
    (document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-day]") as HTMLElement | null)?.dataset.day
  // A click (or Enter) sets the start; the next one on another day closes the range.
  const tap = (d: string) => {
    if (anchor && anchor !== d) { onPick(...sorted(anchor, d)); setAnchor(null) }
    else { onPick(d, d); setAnchor(d) }
  }
  const length = picked ? Math.round((Date.parse(picked[1]) - Date.parse(picked[0])) / 864e5) + 1 : 0
  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex touch-none gap-5 select-none"
        onPointerDown={(e) => { const d = dayAt(e); if (d) setDrag([d, d]) }}
        onPointerMove={(e) => {
          if (!drag) return
          if (!e.buttons) return setDrag(null)
          const d = dayAt(e)
          if (d && d !== drag[1]) setDrag([drag[0], d])
        }}
        onPointerUp={() => {
          if (drag && drag[0] !== drag[1]) { onPick(...sorted(...drag)); setAnchor(null) }
          setDrag(null)
        }}>
        <Button variant="ghost" size="icon-sm" className="absolute top-0 left-0" aria-label="Earlier months"
          disabled={view <= first.slice(0, 7)} onClick={() => setView(monthsBack(view, 1))}><ChevronLeftIcon /></Button>
        <Button variant="ghost" size="icon-sm" className="absolute top-0 right-0" aria-label="Later months"
          disabled={view >= last.slice(0, 7)} onClick={() => setView(monthsBack(view, -1))}><ChevronRightIcon /></Button>
        {[view, monthsBack(view, -1)].map((m, col) => (
          <div key={m} className={cn("flex flex-col gap-2", col && "hidden sm:flex")}>
            <div className="flex h-7 items-center justify-center text-sm font-medium text-foreground">{monthTitle(m)}</div>
            <div role="group" aria-label={monthTitle(m)} className="grid grid-cols-7 gap-y-0.5">
              {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((w) => (
                <span key={w} aria-hidden="true" className="grid size-9 place-items-center text-xs text-muted-foreground">{w}</span>
              ))}
              {monthGrid(m).map((d, i) => {
                if (!d) return <span key={i} />
                const off = d < first || d > last
                const inside = !!picked && d >= picked[0] && d <= picked[1]
                const edge = !!picked && (d === picked[0] || d === picked[1])
                return (
                  <span key={d} className={cn("size-9", inside && "bg-primary/10",
                    (d === picked?.[0] || i % 7 === 0) && "rounded-l-md", (d === picked?.[1] || i % 7 === 6) && "rounded-r-md")}>
                    <button type="button" disabled={off} data-day={off ? undefined : d} aria-label={longDate(d)} aria-pressed={inside}
                      onClick={() => tap(d)}
                      className={cn("relative grid size-9 place-items-center rounded-md text-sm tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground/40",
                        edge ? "bg-primary font-semibold text-primary-foreground" : inside ? "text-foreground" : "text-foreground hover:bg-muted")}>
                      {Number(d.slice(8))}
                      {marked.has(d) && <span aria-hidden="true" className={cn("absolute bottom-1 size-1 rounded-full", edge ? "bg-primary-foreground" : "bg-primary")} />}
                    </button>
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1 border-t pt-3">
        <span className="mr-1 text-xs text-muted-foreground tabular-nums">{year}</span>
        {[1, 2, 3, 4].map((q) => {
          const [x, y] = clamp(quarter(year, q))
          return (
            <Button key={q} size="sm" variant={range?.[0] === x && range[1] === y ? "secondary" : "ghost"} disabled={x > y}
              onClick={() => { onPick(x, y); setAnchor(null); setView(x.slice(0, 7)) }}>Q{q}</Button>
          )
        })}
        <Button size="sm" variant="ghost" className="ml-auto" disabled={!range} onClick={() => { onPick(first, last); setAnchor(null) }}>Whole period</Button>
      </div>
      <p aria-live="polite" className="text-xs text-muted-foreground tabular-nums">
        {anchor && !drag ? `Starts ${shortDate(anchor)}. Click the last day, or drag across days.`
          : picked ? `${shortDate(picked[0])} – ${shortDate(picked[1])}, ${picked[1].slice(0, 4)} · ${length} day${length === 1 ? "" : "s"}`
          : "Drag across days, or click a first and a last day."}
      </p>
    </div>
  )
}

/**
 * Disbursed amounts as stacked areas (verified under for review), by day, week, month or quarter, over the whole period or any date range inside it.
 * `single` draws only the lower series (each day's `verified`), under that name: one amount, such as money collected.
 */
export function TrendChart({ days, from: first, to: last, single }: { days: Day[]; from: string; to: string; single?: string }) {
  const series = single ? { ...config, verified: { ...config.verified, label: single } } : config
  const keys = single ? (["verified"] as const) : (["verified", "pending"] as const)
  const [unit, setUnit] = useState<Unit>("month")
  const [[a, b], setRange] = useState<[string, string]>([first, last])
  const points = new Map<string, Point & { verified: number }>()
  for (let d = a; d <= b; d = addDays(d, 1)) {
    const id = bucket(d, unit)
    if (points.has(id)) continue
    // Only a week id is a date; "2026-Q1" would throw in addDays.
    const start = id < a ? a : id, stop = unit !== "week" || addDays(id, 6) > b ? b : addDays(id, 6)
    points.set(id, {
      id, value: 0, verified: 0,
      label: unit === "quarter" ? id.slice(5) : unit === "month" ? monthLabel(id).slice(0, 3) : shortDate(unit === "week" ? start : id),
      tip: unit === "quarter" ? `${id.slice(5)} ${id.slice(0, 4)}` : unit === "month" ? monthLabel(id)
        : unit === "week" ? `${shortDate(start)} – ${shortDate(stop)}, ${stop.slice(0, 4)}` : longDate(id),
    })
  }
  for (const d of days) {
    const p = d.date >= a && d.date <= b ? points.get(bucket(d.date, unit)) : undefined
    if (p) { p.value += d.value; p.verified += d.verified }
  }
  // Start at the first date with amounts and end at the last, so empty months before and after don't read as ₱0.
  const dated = days.filter((d) => d.value && d.date >= a && d.date <= b).map((d) => d.date).sort()
  const shown = [...points.values()].filter((p) => !dated.length || (p.id! >= bucket(dated[0], unit) && p.id! <= bucket(dated.at(-1)!, unit)))
  const stacked = shown.map((d) => ({ ...d, pending: d.value - d.verified }))
  const end = stacked.at(-1)
  type Dot = { cx?: number; cy?: number; index: number; payload: { pending: number } }
  /** A series' point marker: the end value on the top series' last point, else a month/week dot when `on`. */
  const mark = (color: string, top: boolean, on: (p: Dot) => boolean) => function Mark(p: Dot) {
    if (top && p.index === stacked.length - 1 && end) return (
      <g key={p.index}>
        <circle cx={p.cx} cy={p.cy} r={5.5} className="fill-foreground" stroke="var(--background)" strokeWidth={2} />
        <text x={(p.cx ?? 0) + 12} y={(p.cy ?? 0) + 5} className="fill-foreground text-sm font-semibold tabular-nums">{compact(end.value)}</text>
        <text x={(p.cx ?? 0) + 12} y={(p.cy ?? 0) + 21} className="fill-muted-foreground text-xs">{end.label}</text>
      </g>
    )
    return unit !== "day" && on(p) && !(p.index === stacked.length - 1 && !single)
      ? <circle key={p.index} cx={p.cx} cy={p.cy} r={4} fill={color} stroke="var(--background)" strokeWidth={2} />
      : <g key={p.index} />
  }
  const custom = a !== first || b !== last
  const [qa, qb] = quarter(a.slice(0, 4), quarterOf(a))
  const isQuarter = custom && a === (qa < first ? first : qa) && b === (qb > last ? last : qb)
  const fill = useId().replace(/:/g, "")
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground print:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="secondary" size="sm" className="rounded-full" />}>
            {UNITS[unit].label}<ChevronDownIcon data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Group amounts</DropdownMenuLabel>
              {(Object.keys(UNITS) as Unit[]).map((k) => (
                <DropdownMenuItem key={k} className="items-start gap-2 py-1.5" onClick={() => setUnit(k)}>
                  <CheckIcon className={cn("mt-0.5 text-primary", k !== unit && "invisible")} />
                  <span className="flex flex-col">
                    <span className="font-medium">{UNITS[k].label}</span>
                    <span className="text-xs text-muted-foreground">{UNITS[k].note}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Popover>
          <PopoverTrigger render={<Button variant={custom ? "secondary" : "outline"} size="sm" className="rounded-full tabular-nums" />}>
            <CalendarIcon data-icon="inline-start" />
            {isQuarter ? `Q${quarterOf(a)} ${a.slice(0, 4)}` : custom ? `${shortDate(a)} – ${shortDate(b)}, ${b.slice(0, 4)}` : "Date range"}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-3">
            <RangeCalendar first={first} last={last} range={custom ? [a, b] : null} marked={new Set(days.map((d) => d.date))}
              onPick={(x, y) => setRange([x, y])} />
          </PopoverContent>
        </Popover>
        <span className="ml-auto font-medium text-foreground tabular-nums">{peso(shown.reduce((t, d) => t + d.value, 0))}</span>
      </div>
      <ChartContainer config={series} className="aspect-auto h-full min-h-64 w-full">
        {shown.length < 3 ? (
          <BarChart data={stacked} margin={{ left: 4, right: 12, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => compact(v)} />
            <ChartTooltip cursor={false} content={tooltipWith(peso, series)} />
            {keys.map((k, i) => (
              <Bar key={k} dataKey={k} stackId="k" fill={`var(--color-${k})`} radius={i === keys.length - 1 ? [6, 6, 0, 0] : undefined} maxBarSize={72} />
            ))}
            {!single && <ChartLegend content={<ChartLegendContent />} />}
          </BarChart>
        ) : (
          <AreaChart data={stacked} margin={{ left: 4, right: 76, top: 12 }}>
            <defs>
              <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-verified)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--color-verified)" stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* No gridlines: peso labels on the left, one faint baseline. */}
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border)" }} tickMargin={8} minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} width={56} tickCount={4} tickFormatter={(v: number) => compact(v)} />
            <ChartTooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} content={tooltipWith(peso, series)} />
            {/* Verified under for review, stacked; for review is a band with its own top edge and a dot only where it isn't 0. */}
            <Area dataKey="verified" stackId="k" type="monotone" fill={`url(#${fill})`} stroke="var(--color-verified)" strokeWidth={0} activeDot={false} />
            {!single && (
              <Area dataKey="pending" stackId="k" type="monotone" fill="var(--color-pending)" fillOpacity={0.35} stroke="var(--color-pending)" strokeWidth={2}
                activeDot={{ r: 4.5, strokeWidth: 2, stroke: "var(--background)" }} dot={mark("var(--color-pending)", true, (p) => p.payload.pending > 0)} />
            )}
            {/* The verified line again, on top, so a fully verified month reads as verified; it carries the month dots. */}
            <Area dataKey="verified" type="monotone" fill="none" stroke="var(--color-verified)" strokeWidth={2.25} legendType="none" tooltipType="none"
              activeDot={{ r: 4.5, strokeWidth: 2, stroke: "var(--background)" }} dot={mark("var(--color-verified)", !!single, () => true)} />
            {!single && <ChartLegend content={<ChartLegendContent />} />}
          </AreaChart>
        )}
      </ChartContainer>
      <Figures caption={single ? `${single} by date` : "Amount by DV date"} data={single ? shown.map((d) => ({ ...d, verified: undefined })) : shown} />
    </div>
  )
}

/** Compact ranked list: full names that wrap, amount right, a thin bar under each; a row with an href opens its vouchers. */
export function RankedBars({ data, caption }: { data: Point[]; caption: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <ul aria-label={caption} className="flex flex-col gap-3 text-sm">
      {data.map((d) => {
        const row = (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 break-words">{d.label}</span>
              <span className="shrink-0 font-medium tabular-nums">{peso(d.value)}</span>
            </span>
            <span aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full" style={{ width: `${(100 * d.value) / max}%`, background: d.color ?? "var(--primary)" }} />
            </span>
          </>
        )
        return (
          <li key={d.label}>
            {d.href
              ? <Link href={d.href} className="flex flex-col gap-1.5 rounded-md outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">{row}</Link>
              : <div className="flex flex-col gap-1.5">{row}</div>}
          </li>
        )
      })}
    </ul>
  )
}

/** Share of the whole as a donut; the legend (unless `legend={false}`) carries label, amount and share. `unit` counts in that unit (default pesos). */
export function DonutChart({ data, caption, center, legend = true, unit }: {
  data: Point[]; caption: string; center?: { label: string; value: string }; legend?: boolean; unit?: string
}) {
  const fmt = (n: number) => (unit ? `${n.toLocaleString("en-US")} ${unit}${n === 1 ? "" : "s"}` : peso(n))
  const sum = data.reduce((s, d) => s + Math.max(0, d.value), 0)
  const share = (v: number) => (sum ? `${Math.round((100 * v) / sum)}%` : "0%")
  const hole = center ?? { label: "Total", value: compact(sum) }
  return (
    <div className="@container">
    <figure className={legend ? "grid items-center gap-4 @md:grid-cols-[12rem_1fr]" : undefined}>
      <ChartContainer config={config} className="mx-auto aspect-square w-48">
        <PieChart>
          <ChartTooltip cursor={false} content={tooltipWith(fmt)} />
          <Pie data={data.filter((d) => d.value > 0)} dataKey="value" nameKey="label" innerRadius={58} outerRadius={88} strokeWidth={3} paddingAngle={1}>
            {data.filter((d) => d.value > 0).map((d) => <Cell key={d.label} fill={d.color} stroke="var(--card)" />)}
            <Label content={({ viewBox }) => viewBox && "cx" in viewBox && (
              <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 10} className="fill-muted-foreground text-xs">{hole.label}</tspan>
                <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 12} className="fill-foreground text-lg font-bold">{hole.value}</tspan>
              </text>
            )} />
          </Pie>
        </PieChart>
      </ChartContainer>
      <figcaption className="sr-only">{caption}</figcaption>
      {legend && <ul className="grid gap-x-8 divide-y text-sm @2xl:grid-cols-2 @2xl:divide-y-0 [&>li]:border-b">
        {data.map((d) => (
          <li key={d.label} className="grid grid-cols-[1fr_auto_3rem] items-center gap-3 py-1.5">
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
              {d.href ? <Link href={d.href} className="min-w-0 break-words hover:underline">{d.label}</Link> : <span className="min-w-0 break-words">{d.label}</span>}
            </span>
            <span className="text-right font-medium tabular-nums">{fmt(d.value)}</span>
            <span className="text-right text-muted-foreground tabular-nums">{share(d.value)}</span>
          </li>
        ))}
      </ul>}
    </figure>
    </div>
  )
}

const SLICES = ["var(--chart-5)", "var(--chart-3)", "var(--chart-1)", "var(--chart-4)"]

/** Workspace rail card: the largest trade areas as a donut beside their legend, the rest as "Other"; the Filter menu picks which areas count. */
export function AreaDonutCard({ data }: { data: Point[] }) {
  const [off, setOff] = useState<Set<string>>(new Set())
  const picked = data.filter((d) => !off.has(d.label))
  const sum = picked.reduce((s, d) => s + d.value, 0)
  const rest = picked.slice(SLICES.length)
  const slices: Point[] = [
    ...picked.slice(0, SLICES.length).map((d, i) => ({ ...d, color: SLICES[i] })),
    ...(rest.length ? [{ label: `${rest.length} other${rest.length === 1 ? "" : "s"}`, value: rest.reduce((s, d) => s + d.value, 0), color: "var(--muted-foreground)" }] : []),
  ]
  const toggle = (name: string, on: boolean) => setOff((s) => {
    const next = new Set(s)
    if (on) next.delete(name)
    else next.add(name)
    return next
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>By trade area</CardTitle>
        <CardAction>
          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="sm" />}>
              <ListFilterIcon data-icon="inline-start" />{off.size ? `${picked.length} of ${data.length}` : "All areas"}
            </PopoverTrigger>
            <PopoverContent align="end" className="flex max-h-80 w-60 flex-col gap-2 overflow-y-auto">
              <div className="flex gap-3 text-sm">
                <button type="button" className="underline-offset-4 hover:underline" onClick={() => setOff(new Set())}>Select all</button>
                <button type="button" className="text-muted-foreground underline-offset-4 hover:underline" onClick={() => setOff(new Set(data.map((d) => d.label)))}>Clear</button>
              </div>
              {data.map((d) => (
                <label key={d.label} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={!off.has(d.label)} onCheckedChange={(on) => toggle(d.label, on)} />
                  <span className="min-w-0 flex-1 truncate">{d.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{compact(d.value)}</span>
                </label>
              ))}
            </PopoverContent>
          </Popover>
        </CardAction>
      </CardHeader>
      <CardContent>
        {slices.length ? (
          <figure className="flex items-center gap-4">
            <figcaption className="sr-only">Amount by trade area</figcaption>
            <ul className="flex min-w-0 flex-1 flex-col gap-3">
              {slices.map((d) => (
                <li key={d.label} className="flex items-center gap-2.5" title={`${d.label}: ${peso(d.value)}`}>
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, ${d.color} 15%, transparent)` }}>
                    <span className="size-2.5 rounded-full" style={{ background: d.color }} />
                  </span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    {d.href
                      ? <Link className="truncate text-xs text-muted-foreground hover:underline" href={d.href}>{d.label}</Link>
                      : <span className="truncate text-xs text-muted-foreground">{d.label}</span>}
                    <span className="font-bold tabular-nums">{compact(d.value)} <span className="text-xs font-normal text-muted-foreground">{sum ? Math.round((100 * d.value) / sum) : 0}%</span></span>
                  </span>
                </li>
              ))}
            </ul>
            <ChartContainer config={config} className="aspect-square w-36 shrink-0">
              <PieChart>
                <ChartTooltip cursor={false} content={tooltip} />
                <Pie data={slices.filter((d) => d.value > 0)} dataKey="value" nameKey="label" innerRadius={48} outerRadius={68} strokeWidth={3} paddingAngle={1}>
                  {slices.filter((d) => d.value > 0).map((d) => <Cell key={d.label} fill={d.color} stroke="var(--card)" />)}
                  <Label content={({ viewBox }) => viewBox && "cx" in viewBox && (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle" className="fill-foreground text-lg font-bold">{compact(sum)}</text>
                  )} />
                </Pie>
              </PieChart>
            </ChartContainer>
          </figure>
        ) : <p className="py-6 text-center text-sm text-muted-foreground">No trade areas selected.</p>}
      </CardContent>
    </Card>
  )
}

/** One breakdown column: the top named rows, then everything else (other names and blanks) as Other, adding up to the group's amount. */
export type Breakdown = { top: Point[]; other: number; otherCount: number; missing: number; missingCount: number }

/** Everything the summary shows for one group (or all of them); plain data so the server page can pass it. `missing` marks the "Not set" group. */
export type AreaStat = {
  name: string; missing: boolean; href: string; reviewHref: string; fixHref: string
  vouchers: number; amount: number; verifiedCount: number; verifiedAmount: number; pendingCount: number; flagged: number
  payees: Breakdown; categories: Breakdown; programs: Breakdown
}

const SORTS = { amount: "Amount", review: "For review", name: "A–Z" } as const
type Sort = keyof typeof SORTS
const dvs = (n: number) => `${n.toLocaleString("en-US")} DV${n === 1 ? "" : "s"}`
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** For review's mark: an outlined square in the review blue, so the state never rests on colour alone. */
const ReviewMark = () => <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[2px] border-2 border-review" />

function BreakdownColumn({ title, data, things }: { title: string; data: Breakdown; things: string }) {
  const sum = data.top.reduce((s, d) => s + d.value, 0) + data.other + data.missing
  const rest = [data.otherCount && `${data.otherCount.toLocaleString("en-US")} ${things}`, data.missingCount && `${data.missingCount.toLocaleString("en-US")} blank`].filter(Boolean)
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-medium">{title}</h4>
      {data.top.length > 0 && <RankedBars caption={title} data={data.top} />}
      {rest.length > 0 && (
        <p className="flex items-baseline justify-between gap-3 text-sm text-muted-foreground">
          <span>Other · {rest.join(", ")}</span><span className="tabular-nums">{peso(data.other + data.missing)}</span>
        </p>
      )}
      <div className="flex flex-col gap-1 border-t-2 border-foreground pt-2 text-sm">
        <p className="flex items-baseline justify-between gap-3 font-semibold"><span>Total</span><span className="tabular-nums">{peso(sum)}</span></p>
      </div>
    </div>
  )
}

/** Every group in a ranked list (search, sort, arrow keys); the selected one's figures and breakdowns beside it. */
export function AreaSummary({ stats, noun }: { stats: AreaStat[]; noun: string }) {
  const router = useRouter()
  const [all, ...groups] = stats
  const unset = groups.find((s) => s.missing)
  const [name, setName] = useState(all?.name ?? "")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<Sort>("amount")
  const search = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null)
  const id = useId()
  // "/" jumps to the search box from anywhere on the page, unless you're already typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName) || (e.target as HTMLElement).isContentEditable) return
      e.preventDefault()
      search.current?.focus()
    }
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
  }, [])
  if (!all) return null
  const q = query.trim().toLowerCase()
  const named = groups.filter((s) => !s.missing && s.name.toLowerCase().includes(q))
    .sort((x, y) => sort === "name" ? x.name.localeCompare(y.name) : sort === "review" ? y.pendingCount - x.pendingCount || y.amount - x.amount : y.amount - x.amount)
  const shown = [all, ...named]
  // A selection the search hides falls back to All, so the figures, Enter and the listbox's active row agree.
  const a = shown.find((s) => s.name === name) ?? all
  const largest = Math.max(1, ...groups.map((s) => s.amount))
  const onListKey = (e: React.KeyboardEvent) => {
    const i = shown.findIndex((s) => s.name === a.name)
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      setName(shown[Math.min(shown.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))].name)
    } else if (e.key === "Enter") router.push(a.href)
    else if (e.key === "Escape") setName(all.name)
  }
  const verifiedShare = a.vouchers ? (100 * a.verifiedCount) / a.vouchers : 0

  return (
    <div className="@container">
    <div className="grid gap-6 @4xl:grid-cols-[19rem_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-3 print:hidden">
        <div className="relative">
          <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input ref={search} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Find a ${lower(noun)}`} aria-label={`Find a ${lower(noun)}`}
            className="pr-9 pl-8" onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); list.current?.focus() }
              if (e.key === "Escape") setQuery("")
            }} />
          <Kbd className="absolute top-1/2 right-2 -translate-y-1/2">/</Kbd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{named.length.toLocaleString("en-US")} of {groups.filter((s) => !s.missing).length.toLocaleString("en-US")}</span>
          <div role="group" aria-label="Sort" className="inline-flex rounded-lg bg-muted p-0.5">
            {(Object.keys(SORTS) as Sort[]).map((k) => (
              <button key={k} type="button" aria-pressed={k === sort} onClick={() => setSort(k)}
                className={cn("rounded-md px-2 py-0.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring", k === sort ? "bg-background font-medium shadow-xs" : "text-muted-foreground hover:text-foreground")}>
                {SORTS[k]}
              </button>
            ))}
          </div>
        </div>
        <div ref={list} role="listbox" tabIndex={0} aria-label={`${noun}s`} aria-activedescendant={`${id}-${shown.findIndex((s) => s.name === a.name)}`} onKeyDown={onListKey}
          className="flex max-h-[34rem] flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {shown.map((s, i) => (
            <div key={s.name} id={`${id}-${i}`} role="option" aria-selected={s.name === a.name} title={`${s.name}: ${peso(s.amount)}`}
              onClick={() => { setName(s.name); list.current?.focus() }}
              className={cn("group flex cursor-pointer flex-col gap-1.5 rounded-lg px-3 py-2.5", s.name === a.name ? "bg-primary/10" : "hover:bg-muted", i === 0 && "mb-1")}>
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className={cn("min-w-0 truncate", s.name === a.name ? "font-semibold" : "font-medium")}>{s.name}</span>
                <span className="flex shrink-0 items-center gap-0.5 font-semibold tabular-nums">
                  {compact(s.amount)}
                  <ChevronRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </span>
              <span className="flex items-center gap-2.5 text-xs text-muted-foreground">
                <span aria-hidden="true" className="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${i === 0 ? 100 : (100 * s.amount) / largest}%` }} />
                </span>
                <span className="tabular-nums">{dvs(s.vouchers)}</span>
                {s.pendingCount
                  ? <span className="ml-auto flex items-center gap-1.5 font-medium text-review-foreground"><ReviewMark />{s.pendingCount.toLocaleString("en-US")} for review</span>
                  : <span className="ml-auto flex items-center gap-1"><CheckIcon className="size-3.5" />all verified</span>}
              </span>
            </div>
          ))}
          {named.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">No {lower(noun)} matches “{query.trim()}”.</p>}
        </div>
        {unset && (
          <p className="flex items-baseline justify-between gap-3 border-t border-dashed px-3 pt-3 text-xs text-muted-foreground">
            <span>No {lower(noun)} · {dvs(unset.vouchers)} · {compact(unset.amount)}</span>
            <Link href={unset.href} className="shrink-0 font-medium text-primary underline-offset-4 hover:underline">Fix {unset.vouchers.toLocaleString("en-US")}</Link>
          </p>
        )}
      </div>

      <div className="@container/detail flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="text-base font-semibold">{a.name}</h3>
          {a.flagged > 0
            ? <Link href={a.fixHref} className="flex items-center gap-1.5 text-sm font-medium text-destructive underline-offset-4 hover:underline"><CircleAlertIcon className="size-4" />{a.flagged.toLocaleString("en-US")} need{a.flagged === 1 ? "s" : ""} fixing</Link>
            : <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><CheckIcon className="size-4" />No vouchers need fixing</span>}
        </div>
        <div className="grid gap-3 @xl/detail:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="flex flex-col gap-1 rounded-xl bg-muted/50 p-4">
            <span className="text-xs text-muted-foreground">Disbursed</span>
            <span className="text-2xl font-semibold tracking-tight tabular-nums">{peso(a.amount)}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{a.vouchers.toLocaleString("en-US")} vouchers</span>
          </div>
          <div className="flex flex-col gap-2 rounded-xl bg-muted/50 p-4">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Review status
              <Tooltip>
                <TooltipTrigger render={<button type="button" aria-label="What verified means" className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" />}>
                  <InfoIcon className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent className="max-w-64">Verified: the Status column in the sheet says “Verified”. Every other voucher is for review.</TooltipContent>
              </Tooltip>
            </span>
            <span className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold tabular-nums">
              {a.verifiedCount.toLocaleString("en-US")} verified
              {a.pendingCount > 0 && <span className="flex items-center gap-1.5 text-review-foreground"><ReviewMark />{a.pendingCount.toLocaleString("en-US")} for review</span>}
              {a.pendingCount > 0 && <Link href={a.reviewHref} className="ml-auto text-sm font-medium text-primary underline-offset-4 hover:underline">Open {a.pendingCount.toLocaleString("en-US")}</Link>}
            </span>
            <div role="img" aria-label={`${a.verifiedCount} verified, ${a.pendingCount} for review`} className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
              {a.verifiedCount > 0 && <span className="h-full rounded-full bg-primary" style={{ width: `${verifiedShare}%` }} />}
              {a.pendingCount > 0 && <span className="h-full min-w-1 flex-1 rounded-full bg-review" />}
            </div>
            <span className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground tabular-nums">
              <span>{peso(a.verifiedAmount)} verified</span>
              {a.pendingCount > 0 && <span className="text-review-foreground">{peso(a.amount - a.verifiedAmount)} for review</span>}
            </span>
          </div>
        </div>
        <div className="grid gap-x-8 gap-y-6 border-t pt-4 @xl/detail:grid-cols-2 @3xl/detail:grid-cols-3">
          <BreakdownColumn title="Top payees" data={a.payees} things="payees" />
          <BreakdownColumn title="By category" data={a.categories} things="categories" />
          <BreakdownColumn title="Programs" data={a.programs} things="programs" />
        </div>
      </div>
    </div>
    </div>
  )
}
