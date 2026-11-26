import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon, ChartNoAxesColumnIcon, NotebookTextIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { DashboardBoard, type Panel } from "@/components/dashboard-board"
import { AreaSummary, DonutChart, RankedBars, TrendChart, type AreaStat, type Breakdown, type Day, type Point } from "@/components/dashboard-charts"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { FIGURE, WIDTHS, type DashLayout } from "@/lib/dashboard"
import { clock, getDashboard, getData } from "@/lib/data"
import { byIssue, group, isVerified, ISSUES, label, labelOf, longMonth, NOT_SET, monthLabel, monthsBack, peso, qs, total, yearThrough, type Voucher } from "@/lib/ledger"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Dashboard" }

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
/** Today's dashboard: what a person sees until they change it, and what Reset layout brings back. */
const DEFAULT: DashLayout = [["ytd", 2], ["month", 2], ["verification", 2], ["trend", 2], ["summary", 4]]

/** Overview of the whole sheet as movable panels: how much is verified, what blocks the rest, and the shape of the money. */
export default async function Dashboard({ searchParams }: PageProps<"/voucher/dashboard">) {
  const [{ rows: everything, error, today, columns, pull, source }, saved] = await Promise.all([getData(), getDashboard("voucher")])
  // Scope: the sheet's year, January – December by DV date. Each year is its own spreadsheet, picked in the sidebar.
  const { month: askedMonth, by: askedBy } = await searchParams
  const year = source.year || today.slice(0, 4)
  // Month under comparison: the picked one, else the current month (December for a past year).
  const mm = typeof askedMonth === "string" && MONTH_NUMBERS.includes(askedMonth) ? askedMonth : year === today.slice(0, 4) ? today.slice(5, 7) : "12"
  const thisMonth = `${year}-${mm}`, lastMonth = monthsBack(thisMonth, 1)
  const rows = everything.filter((r) => r.month.startsWith(year + "-"))
  const link = (changes: Record<string, string>) =>
    "/voucher/vouchers/" + qs(new URLSearchParams(), { ...changes, year })

  // The month buttons, then the scope note and Summary; the board adds its own controls to this row.
  const switcher = (summary: React.ReactNode) => (
    <>
      <nav aria-label="Month" className="grid w-full grid-cols-6 gap-1 sm:flex sm:w-auto sm:items-center">
        {MONTH_NUMBERS.map((m) => (
          <Button key={m} size="sm" variant={m === mm ? "secondary" : "ghost"} aria-current={m === mm ? "page" : undefined}
            render={<Link href={`/voucher/dashboard/?month=${m}`} />} nativeButton={false}>
            {monthLabel(`${year}-${m}`).slice(0, 3)}
          </Button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-sm text-muted-foreground @6xl/main:inline">
          January – December {year}, by DV date
        </span>
        {summary}
      </div>
    </>
  )

  if (!rows.length) {
    if (error) return null
    return (
      <div className="@container/main flex flex-col gap-6">
        {everything.length > 0 && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-2 print:hidden">{switcher(null)}</div>}
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ChartNoAxesColumnIcon /></EmptyMedia>
            <EmptyTitle>{everything.length ? `No vouchers dated ${year}.` : "No vouchers yet."}</EmptyTitle>
            <EmptyDescription>
              {everything.length ? "Check the DV dates, or pick another year in the sidebar." : "Charts appear once the sheet has disbursement vouchers."}
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

  // The summary chart gets one entry per DV date and groups them itself, January 1 – December 31.
  const from = `${year}-01-01`, to = `${year}-12-31`
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
  // The per-group summary works for any dropdown column (trade area by default); a new one in the sheet appears as a choice.
  const groupings = columns.filter((c) => c.type === "dropdown" && c.field !== "status" && c.visibility !== "hidden")
  const by = groupings.find((c) => c.key === askedBy) ?? groupings.find((c) => c.field === "trade_area") ?? groupings[0]
  const filterBy = (key: string, isArea: boolean, name: string): Record<string, string> => (isArea ? { area: name } : { col: key, is: name })
  const keyOf = (r: Voucher) => (by ? labelOf(r, by.key) : "")
  const filter = (name: string) => filterBy(by?.key ?? "", by?.field === "trade_area", name)
  const areas = group(rows, keyOf).map(([name, n, amt]) => {
    const list = rows.filter((r) => keyOf(r) === name)
    const done = list.filter(isVerified)
    return { name, n, amt, done: done.length, doneAmt: total(done) }
  })
  // A voucher-list link inside one group (null = All). None when it would need a second column filter: the list filters one column at a time.
  const within = (name: string | null, changes: Record<string, string>) =>
    name && by?.field !== "trade_area" && "col" in changes ? undefined : link({ ...(name ? filter(name) : {}), ...changes })
  /** The top n named rows, and the rest (other names, and "Not set" kept apart) so they add up to the group's amount. */
  const breakdown = (list: Voucher[], key: (r: Voucher) => string, n: number, href: (name: string) => string | undefined): Breakdown => {
    const groups = group(list, key), named = groups.filter(([k]) => k !== NOT_SET), missing = groups.find(([k]) => k === NOT_SET)
    const rest = named.slice(n)
    return {
      top: named.slice(0, n).map(([name, , amt]) => ({ label: name, value: amt, href: href(name) })),
      other: rest.reduce((sum, [, , amt]) => sum + amt, 0), otherCount: rest.length,
      missing: missing?.[2] ?? 0, missingCount: missing?.[1] ?? 0,
    }
  }
  const statFor = (name: string | null, list: Voucher[]): AreaStat => {
    const done = list.filter(isVerified)
    return {
      name: name ?? "All", missing: name === NOT_SET, href: within(name, {})!, reviewHref: within(name, { tab: "pending" })!, fixHref: within(name, { issue: "any" })!,
      vouchers: list.length, amount: total(list), verifiedCount: done.length, verifiedAmount: total(done),
      pendingCount: list.length - done.length, flagged: list.filter((r) => r.issues.length && !isVerified(r)).length,
      payees: breakdown(list, (r) => r.payee.trim() || NOT_SET, 5, (p) => within(name, { q: p })),
      categories: breakdown(list, (r) => label(r, "category"), 4, (c) => within(name, { col: "category", is: c })),
      programs: breakdown(list, (r) => label(r, "diploma_st_assessment"), 3, (p) => within(name, { col: "diploma_st_assessment", is: p })),
    }
  }
  const areaStats: AreaStat[] = [statFor(null, rows), ...areas.map((a) => statFor(a.name, rows.filter((r) => keyOf(r) === a.name)))]
  const synced = clock(pull.at)
  const scopeLine = `January – December ${year}, by DV date${synced ? ` · synced from the sheet at ${synced}` : ""}`

  // Summary sentences: each a fact the page also shows.
  const now = total(monthRows), before = total(lastRows), lastName = longMonth(lastMonth + "-01")
  const monthChange = change(now, before, lastName)
  const trend = monthChange ? `, ${monthChange}` : now ? `; nothing was dated ${lastName}` : ""

  // KPIs. A single year compares January through the same month (December for a past year) against the year before.
  const sum = total(rows)
  const y = Number(year), through = year === today.slice(0, 4) ? today.slice(5, 7) : "12"
  const against = through === "12" ? String(y - 1) : `Jan–${monthLabel(`${y}-${through}`).slice(0, 3)} ${y - 1}`
  const yearChange = change(total(yearThrough(everything, y, through)), total(yearThrough(everything, y - 1, through)), against)
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
          <b className="tabular-nums">{peso(total(rows))}</b> disbursed across {vouchers(rows.length)} in {year};
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
  const largest = rows.reduce((a, b) => (b.amount > a.amount ? b : a))
  /** Ranked bars of the year's amount by any key, the largest n first, with the year's total under them. */
  const ranked = (caption: string, key: (r: Voucher) => string, href: (name: string) => string | undefined, n = 8) => (
    <>
      <RankedBars caption={caption} data={group(rows, key).slice(0, n).map(([name, count, amt]) => ({ label: name, tip: `${name} · ${vouchers(count)}`, value: amt, href: href(name) }))} />
      <Total amount={sum} />
    </>
  )

  const panels: Panel[] = [
    { id: "ytd", section: "figures", widths: WIDTHS.figure, title: `Disbursed, ${year}`, children: (
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className={FIGURE}>{peso(sum)}</span>
        <Pill text={yearChange ?? vouchers(rows.length)} />
      </div>
    ) },
    { id: "month", section: "figures", widths: WIDTHS.figure, title: monthName,
      description: <>Disbursed in {lastName}: <b className="font-semibold text-foreground tabular-nums">{peso(before)}</b></>, children: (
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          <span className="flex flex-wrap items-baseline gap-x-2.5">
            <span className={FIGURE}>{peso(now)}</span>
            {delta !== null && (
              <span title={verdict} className="inline-flex items-center gap-0.5 self-center text-sm font-medium tabular-nums" style={{ color: tone }}>
                {delta > 0 ? <ArrowUpIcon aria-hidden="true" className="size-3.5" /> : delta < 0 ? <ArrowDownIcon aria-hidden="true" className="size-3.5" /> : null}
                {delta > 0 ? "+" : delta < 0 ? "−" : ""}{Math.abs(delta).toLocaleString("en-US")}%
                <span className="sr-only">, {verdict}</span>
              </span>
            )}
          </span>
          <svg aria-hidden="true" viewBox="0 0 160 56" className="h-10 w-28 shrink-0 overflow-visible" style={{ color: tone }}>
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
        </div>
      ) },
    { id: "verified", section: "figures", widths: WIDTHS.figure, title: "Verified share", href: link({ tab: "verified" }), action: "View vouchers", children: (
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className={FIGURE}>{percent(verified.length, rows.length)}</span>
        <Pill text={`${verified.length.toLocaleString("en-US")} of ${vouchers(rows.length)}`} />
      </div>
    ) },
    ...states.slice(1).map((s): Panel => ({ id: s.key, section: "figures", widths: WIDTHS.figure, title: s.name, href: s.href, action: "View vouchers", children: (
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className={FIGURE}>{s.list.length.toLocaleString("en-US")}</span>
        <Pill text={`${peso(total(s.list))} · ${s.note}`} />
      </div>
    ) })),
    { id: "largest", section: "figures", widths: WIDTHS.figure, title: "Largest voucher", href: link({ q: largest.dv_no || largest.payee }), action: "View voucher", children: (
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className={FIGURE}>{peso(largest.amount)}</span>
        <Pill text={[largest.dv_no && `DV ${largest.dv_no}`, largest.payee.trim()].filter(Boolean).join(" · ") || vouchers(1)} />
      </div>
    ) },

    { id: "trend", section: "charts", widths: WIDTHS.chart, title: "Disbursed summary", description: `Amount by DV date, ${year} · by day, week or month, or any date range · verified under for review`,
      children: <TrendChart key={year} days={[...byDay.values()]} from={from} to={to} /> },
    // Verification: donut + the three states with a way into each; what blocks verification explains "Needs fixing".
    { id: "verification", section: "charts", widths: WIDTHS.chart, title: "Verification", description: (
      <>
        <span className="font-medium text-foreground tabular-nums">{verified.length.toLocaleString("en-US")}</span> of {vouchers(rows.length)} verified
        {" · "}{peso(total(verified))} of {peso(total(rows))}
      </>
    ), children: (
      <div className="@container flex flex-1 flex-col gap-5">
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
      </div>
    ) },

    ...groupings.map((c): Panel => ({
      id: `by.${c.key}`, section: "breakdowns", widths: WIDTHS.bars, title: `By ${c.label.toLowerCase()}`, description: `The largest by amount, ${year}`,
      href: link({}), action: "View vouchers",
      children: ranked(`Amount by ${c.label.toLowerCase()}`, (r) => labelOf(r, c.key), (name) => link(filterBy(c.key, c.field === "trade_area", name))),
    })),
    { id: "payee", section: "breakdowns", widths: WIDTHS.bars, title: "By payee", description: `The largest payees by amount, ${year}`, href: link({}), action: "View vouchers",
      children: ranked("Amount by payee", (r) => r.payee.trim() || NOT_SET, (name) => (name === NOT_SET ? undefined : link({ q: name }))) },
    { id: "bymonth", section: "breakdowns", widths: WIDTHS.bars, title: "By month", description: `Amount by DV month, ${year}`, children: (
      <>
        <RankedBars caption="Amount by month" data={group(rows, (r) => r.month).sort(([a], [b]) => a.localeCompare(b))
          .map(([m, n, amt]) => ({ label: monthLabel(m), tip: `${monthLabel(m)} · ${vouchers(n)}`, value: amt, href: link({ month: m }) }))} />
        <Total amount={sum} />
      </>
    ) },
    { id: "blocks", section: "breakdowns", widths: WIDTHS.bars, title: "What blocks verification", description: "Amount held up by each review check",
      href: link({ tab: "review" }), action: "Open review list",
      children: reviewData.length ? <RankedBars caption="Amount by review check" data={reviewData} />
        : <p className="text-sm text-muted-foreground">Every voucher passes the review checks.</p> },

    ...(by ? [{ id: "summary", section: "charts" as const, widths: WIDTHS.summary, tall: true, title: `Summary per ${by.label.toLowerCase()}`, description: scopeLine, children: (
      <>
        {groupings.length > 1 && (
          <nav aria-label="Group by" className="mb-3 flex flex-wrap items-center gap-1 print:hidden">
            <span className="mr-1 text-sm text-muted-foreground">Group by</span>
            {groupings.map((c) => (
              <Button key={c.key} size="sm" variant={c.key === by.key ? "secondary" : "ghost"} aria-current={c.key === by.key ? "page" : undefined}
                render={<Link href={`/voucher/dashboard/?${new URLSearchParams({ ...(year === today.slice(0, 4) ? {} : { year }), ...(askedMonth ? { month: mm } : {}), by: c.key })}`} scroll={false} />} nativeButton={false}>
                {c.label}
              </Button>
            ))}
          </nav>
        )}
        <AreaSummary key={by.key} stats={areaStats} noun={by.label} />
      </>
    ) }] : []),
  ]

  return (
    <div className="@container/main flex w-full flex-col gap-4">
      <DashboardBoard name="voucher" sheet={source.id} panels={panels} saved={saved} toolbar={switcher(summary)}
        defaults={DEFAULT.filter(([id]) => panels.some((p) => p.id === id))} />
    </div>
  )
}

/** The year's total under a ranked list, on a heavy rule. */
function Total({ amount }: { amount: number }) {
  return (
    <p className="mt-3 flex items-baseline justify-between gap-3 border-t-2 border-foreground pt-2 text-sm font-semibold">
      <span>Total</span><span className="tabular-nums">{peso(amount)}</span>
    </p>
  )
}

/** Small rounded pill for a figure's note; direction words ("up"/"down") tint it. */
function Pill({ text }: { text: string }) {
  const tone = text.startsWith("up ") ? "bg-primary/10 text-primary" : text.startsWith("down ") ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
  return <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs tabular-nums", tone)}>{text}</span>
}
