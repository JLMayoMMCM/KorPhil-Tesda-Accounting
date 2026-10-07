"use client"

// Interactive Recharts views for the Dashboard, after shadcn's dashboard-01 block.
// Amounts arrive in centavos from the server page; every chart also carries a screen-reader list of its figures.
import Link from "next/link"
import { useId, useState } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Label, Pie, PieChart, XAxis, YAxis } from "recharts"

import { CalendarIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ListFilterIcon } from "lucide-react"
import { compact } from "@/components/charts"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { longDate, longMonth, monthLabel, monthsBack, peso, shortDate } from "@/lib/ledger"
import { cn } from "@/lib/utils"

/** verified: the verified share of value (trend chart only). */
export type Point = { id?: string; label: string; value: number; verified?: number; tip?: string; color?: string; href?: string }

const config = {
  value: { label: "Amount", color: "var(--primary)" },
  verified: { label: "Verified", color: "var(--primary)" },
  pending: { label: "For review", color: "var(--chart-1)" },
} satisfies ChartConfig

/** Tooltip: the point's long label, then each series in full pesos (or `fmt`). */
const tooltipWith = (fmt: (n: number) => string) => (
  <ChartTooltipContent
    labelFormatter={(_, payload) => (payload?.[0]?.payload as Point | undefined)?.tip ?? (payload?.[0]?.payload as Point | undefined)?.label}
    formatter={(value, name, item) => (
      <div className="flex w-full items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {name !== "value" && <span aria-hidden="true" className="size-2.5 rounded-[2px]" style={{ background: item.color }} />}
          {config[name as keyof typeof config]?.label ?? "Amount"}
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

/** Disbursed amounts as stacked areas (verified under for review), by day, week, month or quarter, over the whole period or any date range inside it. */
export function TrendChart({ days, from: first, to: last }: { days: Day[]; from: string; to: string }) {
  const [unit, setUnit] = useState<Unit>("month")
  const [[a, b], setRange] = useState<[string, string]>([first, last])
  const points = new Map<string, Point & { verified: number }>()
  for (let d = a; d <= b; d = addDays(d, 1)) {
    const id = bucket(d, unit)
    if (points.has(id)) continue
    const start = id < a ? a : id, stop = addDays(id, 6) > b ? b : addDays(id, 6)
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
  const shown = [...points.values()]
  const stacked = shown.map((d) => ({ ...d, pending: d.value - d.verified }))
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
      <ChartContainer config={config} className="aspect-auto h-full min-h-64 w-full">
        {shown.length < 3 ? (
          <BarChart data={stacked} margin={{ left: 4, right: 12, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => compact(v)} />
            <ChartTooltip cursor={false} content={tooltip} />
            <Bar dataKey="verified" stackId="k" fill="var(--color-verified)" maxBarSize={72} />
            <Bar dataKey="pending" stackId="k" fill="var(--color-pending)" radius={[6, 6, 0, 0]} maxBarSize={72} />
            <ChartLegend content={<ChartLegendContent />} />
          </BarChart>
        ) : (
          <AreaChart data={stacked} margin={{ left: 4, right: 12, top: 8 }}>
            <defs>
              {(["verified", "pending"] as const).map((k) => (
                <linearGradient key={k} id={fill + k} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={k === "verified" ? 0.45 : 0.6} />
                  <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => compact(v)} />
            <ChartTooltip cursor={false} content={tooltip} />
            <Area dataKey="verified" stackId="k" type="monotone" fill={`url(#${fill}verified)`} stroke="var(--color-verified)" strokeWidth={2} />
            <Area dataKey="pending" stackId="k" type="monotone" fill={`url(#${fill}pending)`} stroke="var(--color-pending)" strokeWidth={2} />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        )}
      </ChartContainer>
      <Figures caption="Amount by DV date" data={shown} />
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
    <figure className={legend ? "grid items-center gap-6 @md:grid-cols-[12rem_1fr]" : undefined}>
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
          <li key={d.label} className="grid grid-cols-[1fr_auto_3rem] items-center gap-3 py-2">
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

/** Everything the summary shows for one trade area (or all of them); plain data so the server page can pass it. */
export type AreaStat = {
  name: string; href: string; vouchers: number; amount: number; verifiedCount: number; verifiedAmount: number
  pendingCount: number; flagged: number; average: number; payees: Point[]; categories: Point[]; programs: Point[]
}

/** One trade area at a time: a soft dropdown picks it, the figures and breakdowns follow. */
export function AreaSummary({ stats }: { stats: AreaStat[] }) {
  const [name, setName] = useState(stats[0]?.name ?? "")
  const a = stats.find((s) => s.name === name) ?? stats[0]
  if (!a) return null
  const pct = a.vouchers ? Math.round((100 * a.verifiedCount) / a.vouchers) : 0
  const figures = [
    ["Disbursed", peso(a.amount)],
    ["Vouchers", a.vouchers.toLocaleString("en-US")],
    ["Average voucher", peso(a.average)],
    ["Needs fixing", a.flagged.toLocaleString("en-US")],
  ]
  return (
    <div className="@container flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="secondary" size="sm" className="max-w-full rounded-full" aria-label={`Trade area: ${a.name}`} />}>
            <span className="truncate">{a.name}</span><ChevronDownIcon data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-72">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Trade area</DropdownMenuLabel>
              {/* About five rows show at once; the rest scroll. */}
              <div className="max-h-44 overflow-y-auto overscroll-contain">
                {stats.map((s) => (
                  <DropdownMenuItem key={s.name} className="gap-2 py-1.5" onClick={() => setName(s.name)}>
                    <CheckIcon className={cn("text-primary", s.name !== a.name && "invisible")} />
                    <span className={cn("min-w-0 flex-1 truncate", s.name === a.name && "font-medium")}>{s.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{compact(s.amount)}</span>
                  </DropdownMenuItem>
                ))}
              </div>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {a.pendingCount > 0 && (
          <Link href={a.href} className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline print:hidden">
            Open {a.pendingCount.toLocaleString("en-US")} pending
          </Link>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        {figures.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 rounded-xl bg-muted/50 p-3">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="text-lg font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium">Verified</span>
          <span className="text-muted-foreground tabular-nums">{a.verifiedCount.toLocaleString("en-US")} of {a.vouchers.toLocaleString("en-US")} · {pct}%</span>
        </div>
        <div role="img" aria-label={`${pct}% verified`} className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
          {pct > 0 && <span className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />}
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">{peso(a.verifiedAmount)} verified, {peso(a.amount - a.verifiedAmount)} for review</p>
      </div>
      <div className="grid gap-x-8 gap-y-5 border-t pt-4 @3xl:grid-cols-3">
        {([["Top payees", a.payees], ["By category", a.categories]] as const).map(([title, data]) => data.length > 0 && (
          <div key={title} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{title}</h3>
            <RankedBars caption={`${title}, ${a.name}`} data={data} />
          </div>
        ))}
        {a.programs.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Programs</h3>
            <DonutChart caption={`Amount by program, ${a.name}`} data={a.programs} />
          </div>
        )}
      </div>
    </div>
  )
}
