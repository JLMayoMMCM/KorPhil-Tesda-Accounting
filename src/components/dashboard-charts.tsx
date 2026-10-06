"use client"

// Interactive Recharts views for the Dashboard, after shadcn's dashboard-01 block.
// Amounts arrive in centavos from the server page; every chart also carries a screen-reader list of its figures.
import Link from "next/link"
import { useId, useState } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Label, Pie, PieChart, XAxis, YAxis } from "recharts"

import { ListFilterIcon } from "lucide-react"
import { compact } from "@/components/charts"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Checkbox } from "@/components/ui/checkbox"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { peso } from "@/lib/ledger"

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

const VIEWS = { "12": "Last 12 months", "6": "Last 6 months", "3": "Last 3 months", month: "Single month", quarterly: "Quarter", custom: "Custom range" } as const
type View = keyof typeof VIEWS

/** Quarter (1-4) of a month id "2026-09". */
const quarterOf = (id = "") => Math.ceil(Number(id.slice(5, 7)) / 3)

/** Monthly amounts as stacked areas (verified under for review): last 3/6/12 months up to a chosen month, the months of one quarter, or any custom month range. */
export function TrendChart({ data }: { data: Point[] }) {
  const [view, setView] = useState<View>("12")
  const [from, setFrom] = useState(Math.max(0, data.length - 12))
  const [end, setEnd] = useState(data.length - 1)
  const latest = data.at(-1)?.id ?? ""
  const [year, setYear] = useState(latest.slice(0, 4))
  const [quarter, setQuarter] = useState(quarterOf(latest))
  const years = [...new Set(data.map((d) => d.id?.slice(0, 4) ?? ""))].reverse()
  const shown = view === "quarterly" ? data.filter((d) => d.id?.startsWith(year) && quarterOf(d.id) === quarter)
    : view === "custom" ? data.slice(Math.min(from, end), Math.max(from, end) + 1)
    : view === "month" ? data.slice(end, end + 1)
    : data.slice(Math.max(0, end - Number(view) + 1), end + 1)
  const stacked = shown.map((d) => ({ ...d, verified: d.verified ?? 0, pending: d.value - (d.verified ?? 0) }))
  const fill = useId().replace(/:/g, "")
  const soft = "[&_select]:rounded-full [&_select]:border-transparent [&_select]:bg-muted [&_select]:pl-3 [&_select]:font-medium [&_select]:text-foreground"
  const month = (name: string, value: number, set: (i: number) => void) => (
    <NativeSelect size="sm" className={soft} aria-label={name} value={value} onChange={(e) => set(Number(e.target.value))}>
      {data.map((d, i) => <NativeSelectOption key={d.id} value={i}>{d.tip}</NativeSelectOption>).reverse()}
    </NativeSelect>
  )
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground print:hidden">
        <NativeSelect size="sm" className={soft} aria-label="View" value={view} onChange={(e) => setView(e.target.value as View)}>
          {Object.entries(VIEWS).map(([k, text]) => <NativeSelectOption key={k} value={k}>{text}</NativeSelectOption>)}
        </NativeSelect>
        {view === "custom"
          ? <>from {month("First month shown", from, setFrom)} to {month("Last month shown", end, setEnd)}</>
          : view === "quarterly" ? <>
            <NativeSelect size="sm" className={soft} aria-label="Quarter" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
              {[1, 2, 3, 4].map((q) => <NativeSelectOption key={q} value={q}>Q{q}</NativeSelectOption>)}
            </NativeSelect>
            {years.length > 1 && <NativeSelect size="sm" className={soft} aria-label="Year" value={year} onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => <NativeSelectOption key={y} value={y}>{y}</NativeSelectOption>)}
            </NativeSelect>}
          </>
          : view === "month" ? month("Month shown", end, setEnd)
          : <>ending {month("Last month shown", end, setEnd)}</>}
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
      <Figures caption="Amount by DV month" data={shown} />
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
