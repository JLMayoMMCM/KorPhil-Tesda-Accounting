import { ArrowRightIcon, ChartNoAxesColumnIcon, NotebookTextIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { DonutChart, RankedBars, TrendChart, type Point } from "@/components/dashboard-charts"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { getData } from "@/lib/data"
import { byIssue, group, isVerified, ISSUES, label, longMonth, median, monthLabel, months, monthsBack, peso, qs, total, yearThrough, type Voucher } from "@/lib/ledger"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Dashboard" }

// Program slices step through the chart ramp so neighbours differ in lightness, not just hue.
const RAMP = ["var(--chart-5)", "var(--chart-3)", "var(--chart-1)", "var(--chart-4)", "var(--chart-2)"]

// Soft panels: rounded, hairline border instead of a ring, barely-there shadow.
const PANEL = "rounded-2xl ring-0 border shadow-xs"
// Second lap of the ramp, lightened, so up to ten slices stay distinguishable.
const SLICES = [...RAMP.slice(0, 4), ...RAMP.slice(0, 4).map((c) => `color-mix(in oklab, ${c} 55%, var(--card))`), RAMP[4]]

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
  const asked = (await searchParams).year
  const year = typeof asked === "string" && (asked === "all" || years.includes(asked)) ? asked : today.slice(0, 4)
  const rows = year === "all" ? everything : everything.filter((r) => r.month.startsWith(year + "-"))
  const scope = year === "all" ? "all years" : year
  const link = (changes: Record<string, string>) =>
    "/vouchers/" + qs(new URLSearchParams(), year === "all" ? changes : { ...changes, year })

  const switcher = (summary: React.ReactNode) => (
    <nav aria-label="Year" className="flex flex-wrap items-center gap-1 border-b pb-2 print:hidden">
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

  const thisMonth = today.slice(0, 7), lastMonth = monthsBack(thisMonth, 1)
  // The month comparison always reads the whole sheet: this month against last, whatever year is shown.
  const monthRows = everything.filter((r) => r.month === thisMonth), lastRows = everything.filter((r) => r.month === lastMonth)

  // A year shows its full January–December cycle. All years: every month from the first DV to now (at least 12).
  const dvMonths = months(rows), newest = dvMonths[0] > thisMonth ? dvMonths[0] : thisMonth, oldest = dvMonths.at(-1) ?? newest
  const span = Math.max(12, (+newest.slice(0, 4) - +oldest.slice(0, 4)) * 12 + (+newest.slice(5) - +oldest.slice(5)) + 1)
  const cycle = year === "all"
    ? Array.from({ length: span }, (_, i) => monthsBack(newest, span - 1 - i))
    : MONTH_NUMBERS.map((m) => `${year}-${m}`)
  const monthly: Point[] = cycle.map((m) => {
    const list = rows.filter((r) => r.month === m)
    return { id: m, label: monthLabel(m).slice(0, 3), tip: monthLabel(m), value: total(list), verified: total(list.filter(isVerified)) }
  })
  const reviewData: Point[] = byIssue(rows).map(([i, list]) => ({
    label: ISSUES[i], tip: `${ISSUES[i]} · ${vouchers(list.length)}`, value: total(list), href: link({ issue: i }), color: "var(--destructive)",
  }))
  const programs = group(rows, (r) => label(r, "diploma_st_assessment"))
  const programData: Point[] = [
    ...programs.slice(0, 4).map(([name, , amt], i) => ({ label: name, value: amt, color: RAMP[i] })),
    ...(programs.length > 4 ? [{ label: "Other", value: programs.slice(4).reduce((s, p) => s + p[2], 0), color: RAMP[4] }] : []),
  ]
  const categories = group(rows, (r) => label(r, "category"))
  const categoryData: Point[] = [
    ...categories.slice(0, 4).map(([name, , amt], i) => ({ label: name, value: amt, color: RAMP[i] })),
    ...(categories.length > 4 ? [{ label: "Other", value: categories.slice(4).reduce((s, p) => s + p[2], 0), color: RAMP[4] }] : []),
  ]
  const payees = group(rows, (r) => r.payee.trim()).filter(([name]) => name)
  const top5 = new Set(payees.slice(0, 5).map(([name]) => name))
  const areas = group(rows, (r) => label(r, "trade_area")).map(([name, n, amt]) => {
    const list = rows.filter((r) => label(r, "trade_area") === name)
    const done = list.filter(isVerified)
    return { name, n, amt, done: done.length, doneAmt: total(done) }
  })
  const areaData: Point[] = [
    ...areas.slice(0, 8).map((a, i) => ({ label: a.name, tip: `${a.name} · ${vouchers(a.n)}`, value: a.amt, color: SLICES[i], href: link({ tab: "pending", area: a.name }) })),
    ...(areas.length > 8 ? [{ label: "Other areas", value: areas.slice(8).reduce((t, a) => t + a.amt, 0), color: SLICES[8] }] : []),
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
  const withCheck = rows.filter((r) => r.check_number.trim()).length
  const noCategory = rows.filter((r) => !r.category.trim()).length
  const kpis: { name: string; value: string; note: string }[] = [
    { name: `Disbursed, ${scope}`, value: peso(sum), note: yearChange ?? vouchers(rows.length) },
    { name: `Dated ${longMonth(today)}`, value: peso(now), note: monthChange ?? (now ? `nothing dated ${lastName}` : `nothing dated yet`) },
    { name: "Average voucher", value: peso(Math.round(sum / rows.length)), note: `median ${peso(median(rows))}` },
    { name: "With check #", value: percent(withCheck, rows.length), note: `${vouchers(rows.length - withCheck)} without` },
    { name: "Top 5 payees", value: percent(total(rows.filter((r) => top5.has(r.payee.trim()))), sum), note: `of pesos, across ${payees.length.toLocaleString("en-US")} payees` },
    { name: "Category set", value: percent(rows.length - noCategory, rows.length), note: noCategory ? `${vouchers(noCategory)} blank` : "every voucher" },
  ]

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
          Vouchers dated {longMonth(today)} total <b className="text-foreground tabular-nums">{peso(now)}</b>{trend}.
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
      {/* Key figures: one big number, five small tiles. */}
      <dl aria-label="Key figures" className="grid gap-4 break-inside-avoid @5xl/main:grid-cols-12">
        <div className={cn(PANEL, "flex flex-col justify-between gap-6 bg-card p-5 @5xl/main:col-span-4")}>
          <dt className="text-sm text-muted-foreground">{kpis[0].name}</dt>
          <dd className="text-5xl font-semibold tracking-tight tabular-nums">{kpis[0].value}</dd>
          <dd><Pill text={kpis[0].note} /></dd>
        </div>
        <div className="grid grid-cols-2 gap-4 @3xl/main:grid-cols-6 @5xl/main:col-span-8">
          {kpis.slice(1).map((k, i) => (
            <div key={k.name} className={cn(PANEL, "flex flex-col gap-1 bg-card p-4 @3xl/main:col-span-2", i > 2 && "@3xl/main:col-span-3")}>
              <dt className="text-xs text-muted-foreground">{k.name}</dt>
              <dd className="text-2xl font-semibold tracking-tight tabular-nums">{k.value}</dd>
              <dd><Pill text={k.note} /></dd>
            </div>
          ))}
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

        <ChartCard title="Disbursed by month" description={`Amount by DV date, ${year === "all" ? "every month" : `January – December ${year}`} · verified under for review`}
          className="@5xl/main:col-span-7">
          <TrendChart key={year} data={monthly} />
        </ChartCard>

        <ChartCard title="Program split" description={`Diploma / ST / Assessment column, ${scope}, largest four`} className="@5xl/main:col-span-4">
          <DonutChart caption="Amount by program" data={programData} />
        </ChartCard>
        <ChartCard title="By category" description={`Vouchers in ${scope}, largest four`} className="@5xl/main:col-span-4">
          <DonutChart caption="Amount by category" data={categoryData} />
        </ChartCard>
        <ChartCard title="Top payees" description={`Five largest of ${payees.length} · click one to find their vouchers`} className="@3xl/main:col-span-2 @5xl/main:col-span-4">
          <RankedBars caption="Five largest payees by amount" data={payees.slice(0, 5).map(([name, , amt]) => ({ label: name, value: amt, href: link({ q: name }) }))} />
        </ChartCard>

        <ChartCard title="Disbursed by trade area" description="Share of the amount, largest eight areas · click one to open its pending vouchers"
          href="/areas/" action="Open trade areas" className="@3xl/main:col-span-2 @5xl/main:col-span-12">
          <DonutChart caption="Amount by trade area" data={areaData} />
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
