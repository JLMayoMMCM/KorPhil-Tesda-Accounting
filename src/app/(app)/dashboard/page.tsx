import { ArrowRightIcon, ChartNoAxesColumnIcon, MinusIcon, NotebookTextIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { Bar } from "@/components/bar"
import { StatusMark } from "@/components/charts"
import { ColumnChart, DonutChart, RankedBars, TrendChart, type Point } from "@/components/dashboard-charts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { getData } from "@/lib/data"
import {
  addDays, BUCKETS, dayDate, group, label, longMonth, monthLabel, months, peso, qs, shortDate, STATE_LABELS, total,
  type Bucket, type State, type Voucher,
} from "@/lib/ledger"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Dashboard" }

const AGING: Exclude<Bucket, "paid">[] = ["late30", "late", "today", "week", "later"]
// Program slices step through the chart ramp so neighbours differ in lightness, not just hue.
const RAMP = ["var(--chart-5)", "var(--chart-3)", "var(--chart-1)", "var(--chart-4)", "var(--chart-2)"]

/** "2026-09" shifted back n months -> "2026-06". */
const monthsBack = (m: string, n: number) => {
  const [y, mo] = m.split("-").map(Number)
  return new Date(Date.UTC(y, mo - 1 - n, 1)).toISOString().slice(0, 7)
}
const vouchers = (n: number) => `${n} voucher${n === 1 ? "" : "s"}`
const link = (changes: Record<string, string>) => "/vouchers/" + qs(new URLSearchParams(), changes)
/** Whole-percent change, or null when there is nothing to compare against. */
const change = (now: number, before: number) => (before ? Math.round((100 * (now - before)) / before) : null)

/** Overview of the whole sheet as charts. The to-do list lives on Workspace; this page only shows the shape of the money. */
export default async function Dashboard() {
  const { rows, error, today } = await getData()
  if (!rows.length) {
    return error ? null : (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><ChartNoAxesColumnIcon /></EmptyMedia>
          <EmptyTitle>No vouchers yet.</EmptyTitle>
          <EmptyDescription>Charts appear once the sheet has disbursement vouchers.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const unpaid = rows.filter((r) => r.state !== "paid")
  const overdue = unpaid.filter((r) => r.state === "overdue")
  const thisMonth = today.slice(0, 7), lastMonth = monthsBack(thisMonth, 1)
  const monthRows = rows.filter((r) => r.month === thisMonth), lastRows = rows.filter((r) => r.month === lastMonth)
  const lastName = longMonth(lastMonth + "-01")

  const statusData: Point[] = (Object.keys(STATE_LABELS) as State[]).map((s) => ({
    label: STATE_LABELS[s], value: total(rows.filter((r) => r.state === s)), color: `var(--chart-${s})`, mark: s,
  }))
  const agingData: Point[] = AGING.map((b) => ({
    label: BUCKETS[b], value: total(unpaid.filter((r) => r.bucket === b)), href: link({ bucket: b }),
    color: b === "late30" || b === "late" ? "var(--chart-overdue)" : undefined,
  }))
  // Every month from the first DV to now (at least 12), so the chart can end on any of them.
  const dvMonths = months(rows), newest = dvMonths[0] > thisMonth ? dvMonths[0] : thisMonth, oldest = dvMonths.at(-1) ?? newest
  const span = Math.max(12, (+newest.slice(0, 4) - +oldest.slice(0, 4)) * 12 + (+newest.slice(5) - +oldest.slice(5)) + 1)
  const monthly: Point[] = Array.from({ length: span }, (_, i) => monthsBack(newest, span - 1 - i)).map((m) => ({
    id: m, label: monthLabel(m).slice(0, 3), tip: monthLabel(m), value: total(rows.filter((r) => r.month === m)),
  }))
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i))
  const dueData: Point[] = days.map((d) => ({ label: String(Number(d.slice(8))), tip: dayDate(d), value: total(unpaid.filter((r) => r.due === d)) }))
  const dueSoon = dueData.reduce((s, d) => s + d.value, 0)
  const peak = dueData.reduce((best, d) => (d.value > best.value ? d : best), dueData[0])
  const programs = group(rows, (r) => label(r, "diploma_st_assessment"))
  const programData: Point[] = [
    ...programs.slice(0, 4).map(([name, , amt], i) => ({ label: name, value: amt, color: RAMP[i] })),
    ...(programs.length > 4 ? [{ label: "Other", value: programs.slice(4).reduce((s, p) => s + p[2], 0), color: RAMP[4] }] : []),
  ]
  const ranked = (field: "trade_area" | "category", href?: (name: string) => string): Point[] =>
    group(rows, (r) => label(r, field)).map(([name, , amt]) => ({ label: name, value: amt, href: href?.(name) }))
  const payees = group(rows, (r) => r.payee.trim()).filter(([name]) => name)

  // The summary: plain sentences, each a fact the charts below also show.
  const topOverdue = group(overdue, (r) => label(r, "trade_area"))[0]
  const now = total(monthRows), before = total(lastRows), pct = change(now, before)
  const trend = pct === null ? (now ? `; nothing was dated ${lastName}` : "")
    : pct === 0 ? `, the same as ${lastName}` : `, ${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% on ${lastName}`

  const stats: [string, (r: Voucher) => boolean, State | null][] = [
    ["Total", () => true, null], ["Paid", (r) => r.state === "paid", "paid"],
    ["Outstanding", (r) => r.state !== "paid", null], ["Overdue", (r) => r.state === "overdue", "overdue"],
  ]

  return (
    <div className="@container/main flex w-full flex-col gap-6 pb-16 print:pb-0">
      {/* Floating summary: the dashboard in plain sentences, one click away and out of the charts' way. */}
      <Popover>
        <PopoverTrigger render={
          <Button size="lg" className="fixed right-6 bottom-6 z-20 rounded-full shadow-lg print:hidden" />
        }>
          <NotebookTextIcon data-icon="inline-start" />Summary
        </PopoverTrigger>
        <PopoverContent side="top" align="end" sideOffset={8} className="w-[min(24rem,calc(100vw-2rem))] gap-3 p-4">
          <PopoverHeader>
            <PopoverTitle>Summary</PopoverTitle>
          </PopoverHeader>
          <div className="flex flex-col gap-2 leading-relaxed text-pretty">
            <p>
              {unpaid.length ? <><b className="tabular-nums">{peso(total(unpaid))}</b> is outstanding across {vouchers(unpaid.length)}.</>
                : <>Every voucher in the sheet is paid.</>}
              {" "}
              {overdue.length ? <>
                <b className="text-destructive tabular-nums">{peso(total(overdue))}</b> of it ({Math.round((100 * total(overdue)) / total(unpaid))}%) is overdue
                {topOverdue && <>, most of it in <b>{topOverdue[0]}</b> ({peso(topOverdue[2])})</>}.
              </> : unpaid.length ? <>None of it is overdue.</> : null}
            </p>
            <p className="text-muted-foreground">
              {dueSoon ? <>
                <b className="text-foreground tabular-nums">{peso(dueSoon)}</b> falls due in the next 14 days; the heaviest day is {peak.tip} (
                <span className="tabular-nums">{peso(peak.value)}</span>).
              </> : <>Nothing falls due in the next 14 days.</>}
              {" "}
              Vouchers dated {longMonth(today)} total <b className="text-foreground tabular-nums">{peso(now)}</b>{trend}.
            </p>
          </div>
        </PopoverContent>
      </Popover>

      {/* dashboard-01 section cards: this month's figures by DV date, each against last month. */}
      <section aria-label={`${monthLabel(thisMonth)} totals`}
        className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs dark:*:data-[slot=card]:bg-card">
        {stats.map(([name, test, mark]) => {
          const list = monthRows.filter(test), prev = lastRows.filter(test)
          const d = change(total(list), total(prev))
          const Icon = d === null || d === 0 ? MinusIcon : d > 0 ? TrendingUpIcon : TrendingDownIcon
          return (
            <Card key={name} className="@container/card">
              <CardHeader>
                <CardDescription className="flex items-center gap-2">{mark && <StatusMark state={mark} />}{name}</CardDescription>
                <CardTitle className={cn("text-2xl font-semibold tabular-nums @[250px]/card:text-3xl", name === "Overdue" && total(list) > 0 && "text-destructive")}>
                  {peso(total(list))}
                </CardTitle>
                <CardAction>
                  <Badge variant="outline" title={`vs ${lastName}`}>
                    <Icon />{d === null ? (total(list) ? "New" : "—") : `${d > 0 ? "+" : ""}${d}%`}
                    <span className="sr-only"> vs {lastName}</span>
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardFooter className="flex-col items-start gap-1.5 text-sm">
                <div className="font-medium">{vouchers(list.length)} dated {longMonth(today)}</div>
                {name === "Paid" && total(monthRows) > 0 ? (
                  <div className="grid w-full grid-cols-[1fr_auto] items-center gap-2 text-muted-foreground">
                    <Bar pct={(100 * total(list)) / total(monthRows)} />
                    <span className="tabular-nums">{Math.round((100 * total(list)) / total(monthRows))}% of the month</span>
                  </div>
                ) : (
                  <div className="text-muted-foreground tabular-nums">{peso(total(prev))} in {lastName}</div>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </section>

      <ChartCard title="Disbursed by month" description="Amount by DV date, all vouchers">
        <TrendChart data={monthly} />
      </ChartCard>

      <div className="grid gap-4 @4xl/main:grid-cols-2">
        <ChartCard title="Status" description="All vouchers, by amount" href={link({ tab: "all" })}>
          <DonutChart caption="Amount by status" data={statusData} />
        </ChartCard>
        <ChartCard title="Unpaid by age" description={`${vouchers(unpaid.length)} not yet paid · click a bar to open it`} href={link({ tab: "unpaid" })}>
          <RankedBars caption="Unpaid amount by age" data={agingData} />
        </ChartCard>
        <ChartCard title="Due in the next 14 days" description={`Unpaid, ${shortDate(days[0])} to ${shortDate(days[13])}`} href={link({ tab: "week" })}>
          <ColumnChart caption="Unpaid amount by due date, next 14 days" data={dueData} />
        </ChartCard>
        <ChartCard title="By trade area" description="All vouchers · click a bar to open its vouchers" href="/areas/" action="Open trade areas">
          <RankedBars caption="Amount by trade area" data={ranked("trade_area", (name) => link({ area: name }))} />
        </ChartCard>
        <ChartCard title="By category" description="All vouchers, largest first">
          <RankedBars caption="Amount by category" data={ranked("category")} />
        </ChartCard>
        <ChartCard title="Program split" description="Diploma, short-term and assessment">
          <DonutChart caption="Amount by program" data={programData} />
        </ChartCard>
        <ChartCard title="Top payees" description={`Five largest of ${payees.length} · click a bar to find their vouchers`} className="@4xl/main:col-span-2">
          <RankedBars caption="Five largest payees by amount" data={payees.slice(0, 5).map(([name, , amt]) => ({ label: name, value: amt, href: link({ q: name }) }))} />
        </ChartCard>
      </div>
    </div>
  )
}

/** A chart in a card: title, scope note, optional link to the vouchers behind it. */
function ChartCard({ title, description, href, action = "View vouchers", className, children }: {
  title: string; description: string; href?: string; action?: string; className?: string; children: React.ReactNode
}) {
  return (
    <Card className={cn("break-inside-avoid", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {href && (
          <CardAction className="print:hidden">
            <Button variant="ghost" size="sm" render={<Link href={href} />} nativeButton={false}>
              {action}<ArrowRightIcon data-icon="inline-end" />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
