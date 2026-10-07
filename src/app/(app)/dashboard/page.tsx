import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon, ChartNoAxesColumnIcon, NotebookTextIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { AreaSummary, DonutChart, RankedBars, TrendChart, type AreaStat, type Day, type Point } from "@/components/dashboard-charts"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { getData } from "@/lib/data"
import { byIssue, group, isVerified, ISSUES, label, longMonth, monthLabel, months, monthsBack, peso, qs, total, yearThrough, type Voucher } from "@/lib/ledger"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Dashboard" }

// Program slices step through the chart ramp so neighbours differ in lightness, not just hue.
const RAMP = ["var(--chart-5)", "var(--chart-3)", "var(--chart-1)", "var(--chart-4)", "var(--chart-2)"]

// Soft panels: rounded, hairline border instead of a ring, barely-there shadow.
const PANEL = "rounded-2xl ring-0 border shadow-xs"
const vouchers = (n: number) => `${n.toLocaleString("en-US")} voucher${n === 1 ? "" : "s"}`
const MONTH_NUMBERS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]
const share = (n: number, of: number) => (of ? (100 * n) / of : 0)
/** Whole percent, but never rounds a partial share up to 100 or down to 0. */
const percent = (n: number, of: number) => {
  const p = share(n, of)
  return `${p > 0 && p < 1 ? "<1" : p > 99 && p < 100 ? ">99" : Math.round(p)}%`
}
/** "up 12% on X" / "down 3% on X" / "the same as X"; null when there's nothing to compare against. */
const change = (now: number, before: number, against: string) => {
  if (!before) return null
  const p = Math.round((100 * (now - before)) / before)
  return p ? `${p > 0 ? "up" : "down"} ${Math.abs(p).toLocaleString("en-US")}% on ${against}` : `the same as ${against}`
}

/** Overview of the whole sheet: how much is verified, what blocks the rest, and the shape of the money. */
export default async function Dashboard({ searchParams }: PageProps<"/dashboard">) {
  const { rows: everything, error, today } = await getData()
  // Scope: one calendar year (Jan–Dec, default this year) or "all". Undated vouchers only show under All years.
  const years = [...new Set([today.slice(0, 4), ...months(everything).map((m) => m.slice(0, 4))])].sort().reverse()
  const { year: asked, month: askedMonth } = await searchParams
  const year = typeof asked === "string" && (asked === "all" || years.includes(asked)) ? asked : today.slice(0, 4)
  // Month under comparison: the picked one, else the current month (December for a past year). All years reads the current month.
  const mm = typeof askedMonth === "string" && MONTH_NUMBERS.includes(askedMonth) ? askedMonth : year === today.slice(0, 4) ? today.slice(5, 7) : "12"
  const thisMonth = year === "all" ? today.slice(0, 7) : `${year}-${mm}`, lastMonth = monthsBack(thisMonth, 1)
  const rows = year === "all" ? everything : everything.filter((r) => r.month.startsWith(year + "-"))
  const scope = year === "all" ? "all years" : year
  const link = (changes: Record<string, string>) =>
    "/vouchers/" + qs(new URLSearchParams(), year === "all" ? changes : { ...changes, year })

  const switcher = (summary: React.ReactNode) => (
    <div className="flex flex-col gap-1 border-b pb-2 print:hidden">
      <nav aria-label="Year" className="flex flex-wrap items-center gap-1">
        {[...years, "all"].map((y) => (
          <Button key={y} size="sm" variant={y === year ? "secondary" : "ghost"} aria-current={y === year ? "page" : undefined}
            render={<Link href={`/dashboard/?year=${y}`} />} nativeButton={false}>
            {y === "all" ? "All years" : y}
          </Button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">
          {year === "all" ? "Every voucher, dated or not" : `January – December ${year}, by DV date`}
        </span>
        {summary}
      </nav>
      {year !== "all" && (
        <nav aria-label="Month" className="flex flex-wrap items-center gap-1">
          {MONTH_NUMBERS.map((m) => (
            <Button key={m} size="sm" variant={m === mm ? "secondary" : "ghost"} aria-current={m === mm ? "page" : undefined}
              render={<Link href={`/dashboard/?year=${year}&month=${m}`} />} nativeButton={false}>
              {monthLabel(`${year}-${m}`).slice(0, 3)}
            </Button>
          ))}
        </nav>
      )}
    </div>
  )

  if (!rows.length) {
    if (error) return null
    return (
      <div className="flex flex-col gap-6">
        {everything.length > 0 && switcher(null)}
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ChartNoAxesColumnIcon /></EmptyMedia>
            <EmptyTitle>{everything.length ? `No vouchers dated ${year}.` : "No vouchers yet."}</EmptyTitle>
            <EmptyDescription>
              {everything.length ? "Pick another year above, or All years." : "Charts appear once the sheet has disbursement vouchers."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  // The three verification states. Ready + fixing = everything still For Review.
  const verified = rows.filter(isVerified)
  const pending = rows.filter((r) => !isVerified(r))
  const ready = pending.filter((r) => !r.issues.length), fixing = pending.filter((r) => r.issues.length)

  // The month comparison reads the whole sheet, so January compares against the December before it.
  const monthRows = everything.filter((r) => r.month === thisMonth), lastRows = everything.filter((r) => r.month === lastMonth)

  // The summary chart gets one entry per DV date and groups them itself. A year spans January 1 – December 31;
  // All years runs from the first DV month to the latest (at least 12 months).
  const dvMonths = months(rows), newest = dvMonths[0] > thisMonth ? dvMonths[0] : thisMonth
  const oldest = [dvMonths.at(-1) ?? newest, monthsBack(newest, 11)].sort()[0]
  const from = year === "all" ? `${oldest}-01` : `${year}-01-01`
  const to = year === "all" ? new Date(Date.parse(`${monthsBack(newest, -1)}-01`) - 864e5).toISOString().slice(0, 10) : `${year}-12-31`
  const byDay = new Map<string, Day>()
  for (const r of rows) {
    if (!r.dv) continue
    const d = byDay.get(r.dv) ?? { date: r.dv, value: 0, verified: 0 }
    d.value += r.amount
    if (isVerified(r)) d.verified += r.amount
    byDay.set(r.dv, d)
  }
  const reviewData: Point[] = byIssue(rows).map(([i, list]) => ({
    label: ISSUES[i], tip: `${ISSUES[i]} · ${vouchers(list.length)}`, value: total(list), href: link({ issue: i }), color: "var(--destructive)",
  }))
  const areas = group(rows, (r) => label(r, "trade_area")).map(([name, n, amt]) => {
    const list = rows.filter((r) => label(r, "trade_area") === name)
    const done = list.filter(isVerified)
    return { name, n, amt, done: done.length, doneAmt: total(done) }
  })
  const topFive = (list: Voucher[], by: (r: Voucher) => string, href?: (name: string) => string): Point[] =>
    group(list, by).filter(([name]) => name).slice(0, 5).map(([name, , amt]) => ({ label: name, value: amt, href: href?.(name) }))
  const statFor = (name: string, list: Voucher[], href: string): AreaStat => {
    const done = list.filter(isVerified), flagged = list.filter((r) => r.issues.length && !isVerified(r))
    const amount = total(list)
    return {
      name, href, vouchers: list.length, amount, verifiedCount: done.length, verifiedAmount: total(done),
      pendingCount: list.length - done.length, flagged: flagged.length, average: list.length ? Math.round(amount / list.length) : 0,
      payees: topFive(list, (r) => r.payee.trim(), (n) => link({ q: n })),
      categories: topFive(list, (r) => label(r, "category")),
      programs: group(list, (r) => label(r, "diploma_st_assessment")).slice(0, 4).map(([n, , amt], i) => ({ label: n, value: amt, color: RAMP[i] })),
    }
  }
  const areaStats: AreaStat[] = [
    statFor("All trade areas", rows, link({ tab: "pending" })),
    ...areas.map((a) => statFor(a.name, rows.filter((r) => label(r, "trade_area") === a.name), link({ tab: "pending", area: a.name }))),
  ]

  // Summary sentences: each a fact the page also shows.
  const now = total(monthRows), before = total(lastRows), lastName = longMonth(lastMonth + "-01")
  const monthChange = change(now, before, lastName)
  const trend = monthChange ? `, ${monthChange}` : now ? `; nothing was dated ${lastName}` : ""

  // KPIs. A single year compares January through the same month (December for a past year) against the year before.
  const sum = total(rows)
  const y = Number(year), through = year === today.slice(0, 4) ? today.slice(5, 7) : "12"
  const against = through === "12" ? String(y - 1) : `Jan–${monthLabel(`${y}-${through}`).slice(0, 3)} ${y - 1}`
  const yearChange = year === "all" ? null : change(total(yearThrough(everything, y, through)), total(yearThrough(everything, y - 1, through)), against)
  const monthName = `${longMonth(thisMonth + "-01")} ${thisMonth.slice(0, 4)}`
  // Twelve months ending at the picked one, drawn as a 160x56 line beside its figure.
  const spark = Array.from({ length: 12 }, (_, i) => total(everything.filter((r) => r.month === monthsBack(thisMonth, 11 - i))))
  const peak = Math.max(1, ...spark)
  const line = spark.map((v, i) => `${(i * 160) / 11},${52 - (46 * v) / peak}`)
  const delta = before ? Math.round((100 * (now - before)) / before) : null
  // The usual chart convention for the month card: green up, red down.
  const tone = !delta ? "var(--muted-foreground)" : delta > 0 ? "#16a34a" : "#dc2626"
  const verdict = delta === null ? `Nothing dated ${lastName} to compare`
    : delta ? `${delta > 0 ? "Up" : "Down"} ${Math.abs(delta).toLocaleString("en-US")}% compared to ${lastName}` : `Same as ${lastName}`

  const summary = (
  <Popover>
    <PopoverTrigger render={
      <Button size="sm" variant="outline" className="print:hidden" />
    }>
      <NotebookTextIcon data-icon="inline-start" />Summary
    </PopoverTrigger>
    <PopoverContent side="bottom" align="end" sideOffset={8} className="w-[min(24rem,calc(100vw-2rem))] gap-3 p-4">
      <PopoverHeader>
        <PopoverTitle>Summary</PopoverTitle>
      </PopoverHeader>
      <div className="flex flex-col gap-2 leading-relaxed text-pretty">
        <p>
          <b className="tabular-nums">{peso(total(rows))}</b> disbursed across {vouchers(rows.length)} in {scope};
          {" "}<b className="tabular-nums">{vouchers(verified.length)}</b> ({percent(verified.length, rows.length)}) are verified.
        </p>
        <p>
          {pending.length
            ? <>Of the {pending.length.toLocaleString("en-US")} for review, {ready.length.toLocaleString("en-US")} have no flags and can be verified now{fixing.length ? <>; {vouchers(fixing.length)} need fixing first</> : null}.</>
            : <>Nothing is left for review.</>}
        </p>
        <p className="text-muted-foreground">
          Vouchers dated {monthName} total <b className="text-foreground tabular-nums">{peso(now)}</b>{trend}.
        </p>
      </div>
    </PopoverContent>
  </Popover>
  )

  const states: { key: string; name: string; note: string; list: Voucher[]; color: string; href: string; action: string }[] = [
    { key: "verified", name: "Verified", note: "Signed off in column L", list: verified, color: "var(--primary)", href: link({ tab: "verified" }), action: "Open" },
    { key: "ready", name: "Ready to verify", note: "For review, no flags", list: ready, color: "var(--chart-1)", href: link({ tab: "pending", issue: "none" }), action: "Verify" },
    { key: "fixing", name: "Needs fixing", note: "For review, flagged gaps", list: fixing, color: "var(--destructive)", href: link({ tab: "pending", issue: "any" }), action: "Fix" },
  ]

  return (
    <div className="@container/main flex w-full flex-col gap-6 ">
      {switcher(summary)}
      {/* Key figures: this scope's total, and the picked month against the one before it. */}
      <dl aria-label="Key figures" className="grid gap-4 break-inside-avoid @3xl/main:grid-cols-2">
        <div className={cn(PANEL, "flex flex-col justify-between gap-4 bg-card p-5")}>
          <dt className="text-sm text-muted-foreground">Disbursed, {scope}</dt>
          <dd className="text-5xl font-semibold tracking-tight tabular-nums">{peso(sum)}</dd>
          <dd><Pill text={yearChange ?? vouchers(rows.length)} /></dd>
        </div>
        <div className={cn(PANEL, "flex flex-col justify-between gap-4 bg-card p-5")}>
          <dt className="text-sm text-muted-foreground">{monthName}</dt>
          <dd className="flex flex-wrap items-end justify-between gap-4">
            <span className="flex flex-wrap items-baseline gap-x-2.5">
              <span className="text-4xl font-semibold tracking-tight tabular-nums">{peso(now)}</span>
              {delta !== null && (
                <span title={verdict} className="inline-flex items-center gap-0.5 self-center text-sm font-medium tabular-nums" style={{ color: tone }}>
                  {delta > 0 ? <ArrowUpIcon aria-hidden="true" className="size-3.5" /> : delta < 0 ? <ArrowDownIcon aria-hidden="true" className="size-3.5" /> : null}
                  {delta > 0 ? "+" : delta < 0 ? "−" : ""}{Math.abs(delta).toLocaleString("en-US")}%
                  <span className="sr-only">, {verdict}</span>
                </span>
              )}
            </span>
            <svg aria-hidden="true" viewBox="0 0 160 56" className="h-14 w-40 shrink-0 overflow-visible" style={{ color: tone }}>
              <defs>
                <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                </linearGradient>
              </defs>
              <polygon points={`0,56 ${line.join(" ")} 160,56`} fill="url(#spark-fill)" />
              <polyline points={line.join(" ")} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={160} cy={52 - (46 * now) / peak} r={3} fill="currentColor" />
            </svg>
          </dd>
          <dd className="text-sm text-muted-foreground">
            Disbursed in {lastName}: <b className="text-base font-semibold text-foreground tabular-nums">{peso(before)}</b>
          </dd>
        </div>
      </dl>

      <div className="grid gap-4 @3xl/main:grid-cols-2 @5xl/main:grid-cols-12">
        {/* Verification: donut + the three states with a way into each; what blocks verification explains "Needs fixing". */}
        <Card className={cn(PANEL, "break-inside-avoid @5xl/main:col-span-5")}>
          <CardHeader>
            <CardTitle>Verification</CardTitle>
            <CardDescription>
              <span className="font-medium text-foreground tabular-nums">{verified.length.toLocaleString("en-US")}</span> of {vouchers(rows.length)} verified
              {" · "}{peso(total(verified))} of {peso(total(rows))}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-5">
            <div className="grid items-center gap-4 @md:grid-cols-[12rem_1fr]">
              <DonutChart caption="Vouchers by verification state" legend={false} unit="voucher"
                center={{ label: "Verified", value: percent(verified.length, rows.length) }}
                data={states.map((s) => ({ label: s.name, value: s.list.length, color: s.color }))} />
              <dl className="flex flex-col gap-3">
                {states.map((s) => (
                  <div key={s.key} className="flex items-start gap-3">
                    <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-[2px]" style={{ background: s.color }} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <dt className="text-sm font-medium">{s.name}</dt>
                      <dd className="text-xl font-semibold tabular-nums">{s.list.length.toLocaleString("en-US")}</dd>
                      <dd className="text-xs text-muted-foreground tabular-nums">{peso(total(s.list))} · {s.note}</dd>
                    </div>
                    {s.list.length > 0 && (
                      <Button variant="ghost" size="sm" className="print:hidden" render={<Link href={s.href} />} nativeButton={false}
                        aria-label={`${s.action}: ${s.name}`}>
                        {s.action}<ArrowRightIcon data-icon="inline-end" />
                      </Button>
                    )}
                  </div>
                ))}
              </dl>
            </div>
            <div className="mt-auto flex flex-col gap-2 border-t pt-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">What blocks verification</h3>
                <Button variant="ghost" size="sm" className="print:hidden" render={<Link href={link({ tab: "review" })} />} nativeButton={false}>
                  Open review list<ArrowRightIcon data-icon="inline-end" />
                </Button>
              </div>
              {reviewData.length ? <RankedBars caption="Amount by review check" data={reviewData} />
                : <p className="text-sm text-muted-foreground">Every voucher passes the review checks.</p>}
            </div>
          </CardContent>
        </Card>

        <ChartCard title="Disbursed summary" description={`Amount by DV date, ${year === "all" ? "all years" : year} · by day, week or month, or any date range · verified under for review`}
          className="@5xl/main:col-span-7">
          <TrendChart key={year} days={[...byDay.values()]} from={from} to={to} />
        </ChartCard>

        <ChartCard title="Summary per trade area" description="Pick an area to see its figures, payees, categories and programs" className="@3xl/main:col-span-2 @5xl/main:col-span-12">
          <AreaSummary stats={areaStats} />
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
    <Card className={cn(PANEL, "break-inside-avoid", className)}>
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
      <CardContent className="flex-1">{children}</CardContent>
    </Card>
  )
}

/** Small rounded pill for a figure's note; direction words ("up"/"down") tint it. */
function Pill({ text }: { text: string }) {
  const tone = text.startsWith("up ") ? "bg-primary/10 text-primary" : text.startsWith("down ") ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
  return <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs tabular-nums", tone)}>{text}</span>
}
