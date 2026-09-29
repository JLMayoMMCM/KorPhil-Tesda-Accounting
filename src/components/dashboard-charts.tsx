"use client"

// Interactive Recharts views for the Dashboard, after shadcn's dashboard-01 block.
// Amounts arrive in centavos from the server page; every chart also carries a screen-reader list of its figures.
import { useRouter } from "next/navigation"
import { useId, useState } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Label, LabelList, Pie, PieChart, XAxis, YAxis } from "recharts"

import { compact, StatusMark } from "@/components/charts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { peso, type State } from "@/lib/ledger"

export type Point = { id?: string; label: string; value: number; tip?: string; color?: string; href?: string; mark?: State }

const config = { value: { label: "Amount", color: "var(--primary)" } } satisfies ChartConfig

/** Tooltip: the point's long label, then its amount in full pesos. */
const tooltip = (
  <ChartTooltipContent
    labelFormatter={(_, payload) => (payload?.[0]?.payload as Point | undefined)?.tip ?? (payload?.[0]?.payload as Point | undefined)?.label}
    formatter={(value) => (
      <div className="flex w-full items-center justify-between gap-4">
        <span className="text-muted-foreground">Amount</span>
        <span className="font-medium text-foreground tabular-nums">{peso(Number(value))}</span>
      </div>
    )}
  />
)

function Figures({ caption, data }: { caption: string; data: Point[] }) {
  return (
    <ul className="sr-only" aria-label={caption}>
      {data.map((d) => <li key={d.label}>{`${d.tip ?? d.label}: ${peso(d.value)}`}</li>)}
    </ul>
  )
}

const VIEWS = { "3": "Last 3 months", "6": "Last 6 months", "12": "Last 12 months", quarterly: "Quarterly", custom: "Custom range" } as const
type View = keyof typeof VIEWS

/** Months (id "2026-09") summed into quarters, oldest first: "Q3 2026". */
function quarters(data: Point[]): Point[] {
  const out = new Map<string, number>()
  for (const d of data) {
    const [y, m] = (d.id ?? "").split("-")
    const key = `Q${Math.ceil(Number(m) / 3)} ${y}`
    out.set(key, (out.get(key) ?? 0) + d.value)
  }
  return [...out].map(([label, value]) => ({ label, value }))
}

/** Monthly amounts as an area: last 3/6/12 months or quarters up to a chosen month, or any custom month range. */
export function TrendChart({ data }: { data: Point[] }) {
  const [view, setView] = useState<View>("12")
  const [from, setFrom] = useState(Math.max(0, data.length - 12))
  const [end, setEnd] = useState(data.length - 1)
  const shown = view === "quarterly" ? quarters(data.slice(0, end + 1))
    : view === "custom" ? data.slice(Math.min(from, end), Math.max(from, end) + 1)
    : data.slice(Math.max(0, end - Number(view) + 1), end + 1)
  const fill = useId().replace(/:/g, "")
  const month = (name: string, value: number, set: (i: number) => void) => (
    <NativeSelect size="sm" aria-label={name} value={value} onChange={(e) => set(Number(e.target.value))}>
      {data.map((d, i) => <NativeSelectOption key={d.id} value={i}>{d.tip}</NativeSelectOption>).reverse()}
    </NativeSelect>
  )
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground print:hidden">
        <NativeSelect size="sm" aria-label="View" value={view} onChange={(e) => setView(e.target.value as View)}>
          {Object.entries(VIEWS).map(([k, text]) => <NativeSelectOption key={k} value={k}>{text}</NativeSelectOption>)}
        </NativeSelect>
        {view === "custom"
          ? <>from {month("First month shown", from, setFrom)} to {month("Last month shown", end, setEnd)}</>
          : <>ending {month("Last month shown", end, setEnd)}</>}
      </div>
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        <AreaChart data={shown} margin={{ left: 4, right: 12, top: 8 }}>
          <defs>
            <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
          <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => compact(v)} />
          <ChartTooltip cursor={false} content={tooltip} />
          <Area dataKey="value" type="monotone" fill={`url(#${fill})`} stroke="var(--color-value)" strokeWidth={2} />
        </AreaChart>
      </ChartContainer>
      <Figures caption="Amount by DV month" data={shown} />
    </div>
  )
}

/** One column per point, oldest to newest (the next 14 days of dues). */
export function ColumnChart({ data, caption }: { data: Point[]; caption: string }) {
  return (
    <>
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <BarChart data={data} margin={{ top: 20, left: 0, right: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={0} />
          <ChartTooltip cursor={false} content={tooltip} />
          <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ChartContainer>
      <Figures caption={caption} data={data} />
    </>
  )
}

/** Ranked horizontal bars; a bar with an href opens its vouchers on click. */
export function RankedBars({ data, caption }: { data: Point[]; caption: string }) {
  const router = useRouter()
  const cut = (s: string) => (s.length > 18 ? s.slice(0, 17) + "…" : s)
  return (
    <>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height: Math.max(2, data.length) * 40 + 8 }}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 64 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={132} tickFormatter={cut} />
          <ChartTooltip cursor={false} content={tooltip} />
          <Bar dataKey="value" radius={4} maxBarSize={22}
            onClick={(d) => { const href = (d.payload as Point | undefined)?.href; if (href) router.push(href) }}>
            {data.map((d) => <Cell key={d.label} fill={d.color ?? "var(--color-value)"} className={d.href ? "cursor-pointer" : undefined} />)}
            <LabelList dataKey="value" position="right" offset={8} className="fill-foreground tabular-nums" fontSize={12}
              formatter={(v) => (Number(v) ? compact(Number(v)) : "")} />
          </Bar>
        </BarChart>
      </ChartContainer>
      <Figures caption={caption} data={data} />
    </>
  )
}

/** Share of the whole as a donut with the total in the hole; the legend carries label, amount and share. */
export function DonutChart({ data, caption }: { data: Point[]; caption: string }) {
  const sum = data.reduce((s, d) => s + Math.max(0, d.value), 0)
  const share = (v: number) => (sum ? `${Math.round((100 * v) / sum)}%` : "0%")
  return (
    <figure className="grid items-center gap-6 sm:grid-cols-[12rem_1fr]">
      <ChartContainer config={config} className="mx-auto aspect-square w-48">
        <PieChart>
          <ChartTooltip cursor={false} content={tooltip} />
          <Pie data={data.filter((d) => d.value > 0)} dataKey="value" nameKey="label" innerRadius={58} outerRadius={88} strokeWidth={3} paddingAngle={1}>
            {data.filter((d) => d.value > 0).map((d) => <Cell key={d.label} fill={d.color} stroke="var(--card)" />)}
            <Label content={({ viewBox }) => viewBox && "cx" in viewBox && (
              <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 10} className="fill-muted-foreground text-xs">Total</tspan>
                <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 12} className="fill-foreground text-lg font-bold">{compact(sum)}</tspan>
              </text>
            )} />
          </Pie>
        </PieChart>
      </ChartContainer>
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="flex flex-col divide-y text-sm">
        {data.map((d) => (
          <li key={d.label} className="grid grid-cols-[1fr_auto_3rem] items-center gap-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              {d.mark ? <StatusMark state={d.mark} /> : <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[2px]" style={{ background: d.color }} />}
              <span className="truncate">{d.label}</span>
            </span>
            <span className="text-right font-medium tabular-nums">{peso(d.value)}</span>
            <span className="text-right text-muted-foreground tabular-nums">{share(d.value)}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
