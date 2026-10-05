import { ArrowRightIcon, ChartNoAxesColumnIcon, NotebookTextIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { Bar } from "@/components/bar"
import { DonutChart, RankedBars, TrendChart, type Point } from "@/components/dashboard-charts"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getData } from "@/lib/data"
import { byIssue, group, isVerified, ISSUES, label, longMonth, median, monthLabel, months, monthsBack, peso, qs, total, yearThrough, type Voucher } from "@/lib/ledger"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Dashboard" }

// Program slices step through the chart ramp so neighbours differ in lightness, not just hue.
const RAMP = ["var(--chart-5)", "var(--chart-3)", "var(--chart-1)", "var(--chart-4)", "var(--chart-2)"]

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

  const switcher = (
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
    </nav>
  )

  if (!rows.length) {
    if (error) return null
    return (
      <div className="flex flex-col gap-6">
        {everything.length > 0 && switcher}
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
  const flagged = rows.filter((r) => r.issues.length) // verified rows only flag duplicate DV #s

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
  const payees = group(rows, (r) => r.payee.trim()).filter(([name]) => name)
  const top5 = new Set(payees.slice(0, 5).map(([name]) => name))
  const areas = group(rows, (r) => label(r, "trade_area")).map(([name, n, amt]) => {
    const list = rows.filter((r) => label(r, "trade_area") === name)
    return { name, n, amt, done: list.filter(isVerified).length }
  })

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

  const states: { key: string; name: string; note: string; list: Voucher[]; color: string; href: string; action: string }[] = [
    { key: "verified", name: "Verified", note: "Signed off in column K", list: verified, color: "var(--primary)", href: link({ tab: "verified" }), action: "Open" },
    { key: "ready", name: "Ready to verify", note: "For review, no flags", list: ready, color: "var(--chart-1)", href: link({ tab: "pending", issue: "none" }), action: "Verify" },
    { key: "fixing", name: "Needs fixing", note: "For review, flagged gaps", list: fixing, color: "var(--destructive)", href: link({ tab: "pending", issue: "any" }), action: "Fix" },
  ]

  return (
    <div className="@container/main flex w-full flex-col gap-6 pb-16 print:pb-0">
      {switcher}
      {/* KPI strip: ledger columns on hairlines (gap-px over the border colour), not cards. Wraps 2 → 3 → 6. */}
      <dl aria-label="Key figures" className="grid grid-cols-2 gap-px overflow-hidden border-y bg-border break-inside-avoid @2xl/main:grid-cols-3 @6xl/main:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.name} className="flex min-w-0 flex-col gap-0.5 bg-background px-4 py-3">
            <dt className="truncate text-xs text-muted-foreground">{k.name}</dt>
            <dd className="text-xl font-semibold tracking-tight tabular-nums">{k.value}</dd>
            <dd className="text-xs text-muted-foreground tabular-nums">{k.note}</dd>
          </div>
        ))}
      </dl>
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

      {/* Verification: one segmented bar, then the three states as a ledger strip with a way into each. */}
      <Card>
        <CardHeader>
          <CardTitle>Verification</CardTitle>
          <CardDescription>
            <span className="font-medium text-foreground tabular-nums">{verified.length.toLocaleString("en-US")}</span> of {vouchers(rows.length)} verified
            {" · "}{peso(total(verified))} of {peso(total(rows))}
          </CardDescription>
          <CardAction className="text-3xl font-semibold tracking-tight tabular-nums">
            {percent(verified.length, rows.length)}
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div role="img" aria-label={states.map((s) => `${s.name}: ${s.list.length}`).join(", ")}
            className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
            {states.filter((s) => s.list.length).map((s) => (
              <span key={s.key} className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `max(4px, ${share(s.list.length, rows.length)}%)`, background: s.color }} />
            ))}
          </div>
          <dl className="grid gap-y-4 @2xl/main:grid-cols-3 @2xl/main:divide-x">
            {states.map((s) => (
              <div key={s.key} className="flex items-start gap-3 @2xl/main:px-5 @2xl/main:first:pl-0 @2xl/main:last:pr-0">
                <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-[2px]" style={{ background: s.color }} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <dt className="text-sm font-medium">{s.name}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{s.list.length.toLocaleString("en-US")}</dd>
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
        </CardContent>
      </Card>

      <ChartCard title="Disbursed by month" description={`Amount by DV date, ${year === "all" ? "every month" : `January – December ${year}`} · verified under for review`}>
        <TrendChart key={year} data={monthly} />
      </ChartCard>

      <div className="grid gap-4 @4xl/main:grid-cols-2">
        <ChartCard title="What blocks verification" description={`${vouchers(flagged.length)} flagged · click a bar to open them`} href={link({ tab: "review" })} action="Open review list">
          {reviewData.length ? <RankedBars caption="Amount by review check" data={reviewData} />
            : <p className="text-sm text-muted-foreground">Every voucher passes the review checks.</p>}
        </ChartCard>

        <ChartCard title="Verification by trade area" description="Share of each area's vouchers verified, largest amount first" href="/areas/" action="Open trade areas">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Trade area</TableHead>
                <TableHead className="w-[40%]"><span className="sr-only">Verified share</span></TableHead>
                <TableHead className="text-right">Verified</TableHead>
                <TableHead className="text-right">For review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {areas.map((a) => (
                <TableRow key={a.name}>
                  <TableCell className="max-w-36 truncate font-medium" title={`${a.name} · ${peso(a.amt)}`}>{a.name}</TableCell>
                  <TableCell><Bar pct={share(a.done, a.n)} /></TableCell>
                  <TableCell className="text-right tabular-nums">{percent(a.done, a.n)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a.n - a.done
                      ? <Link className="underline-offset-4 hover:underline" href={link({ tab: "pending", area: a.name })}>{(a.n - a.done).toLocaleString("en-US")}</Link>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableHead scope="row" colSpan={2}>All areas</TableHead>
                <TableCell className="text-right font-semibold tabular-nums">{percent(verified.length, rows.length)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{pending.length.toLocaleString("en-US")}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </ChartCard>

        <ChartCard title="By category" description={`Vouchers in ${scope}, largest first`}>
          <RankedBars caption="Amount by category" data={group(rows, (r) => label(r, "category")).map(([name, , amt]) => ({ label: name, value: amt }))} />
        </ChartCard>
        <ChartCard title="Program split" description={`Diploma / ST / Assessment column, ${scope}, largest four`}>
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
