import { ArrowDownIcon, ArrowUpIcon, ChartNoAxesColumnIcon, CheckIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { DashboardBoard, type Panel } from "@/components/dashboard-board"
import { RankedBars, TrendChart, type Day, type Point } from "@/components/dashboard-charts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { account, collected, ENTRY_ISSUES, groupBy, tag, type Entry, type EntryIssue } from "@/lib/collection"
import { FIGURE, WIDTHS, type DashLayout } from "@/lib/dashboard"
import { getCollectionData, getDashboard } from "@/lib/data"
import { longMonth, monthLabel, monthsBack, NOT_SET, peso, qs } from "@/lib/ledger"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Dashboard · Collections" }

const MONTH_NUMBERS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]
const receipts = (n: number) => `${n.toLocaleString("en-US")} receipt${n === 1 ? "" : "s"}`
/** Whole percent of a total, but never rounds a small share down to 0. */
const share = (n: number, of: number) => { const p = of ? (100 * n) / of : 0; return `${p > 0 && p < 1 ? "<1" : Math.round(p)}%` }
const change = (now: number, before: number, against: string) => {
  if (!before) return null
  const p = Math.round((100 * (now - before)) / before)
  return p ? `${p > 0 ? "up" : "down"} ${Math.abs(p).toLocaleString("en-US")}% on ${against}` : `the same as ${against}`
}
/** Today's dashboard: what a person sees until they change it, and what Reset layout brings back. */
const DEFAULT: DashLayout = [["ytd", 2], ["month", 2], ["trend", 2], ["uacs", 2], ["area", 2], ["review", 2]]

/** The collection overview as movable panels: what came in, how it compares, and where it came from. */
export default async function CollectionDashboard({ searchParams }: PageProps<"/collection/dashboard">) {
  const [{ entries, error, today, source }, saved] = await Promise.all([getCollectionData(), getDashboard("collection")])
  // Scope: the sheet's year, January – December. Each year is its own spreadsheet, picked in the sidebar.
  const { month: askedMonth } = await searchParams
  const year = source.year || today.slice(0, 4)
  const mm = typeof askedMonth === "string" && MONTH_NUMBERS.includes(askedMonth) ? askedMonth : year === today.slice(0, 4) ? today.slice(5, 7) : "12"
  const thisMonth = `${year}-${mm}`, lastMonth = monthsBack(thisMonth, 1)
  const rows = entries.filter((e) => e.month.startsWith(year + "-"))
  const link = (changes: Record<string, string>) => "/collection/collections/" + qs(new URLSearchParams(), { ...changes, year })

  const switcher = (
    <>
      <nav aria-label="Month" className="grid w-full grid-cols-6 gap-1 sm:flex sm:w-auto sm:items-center">
        {MONTH_NUMBERS.map((m) => (
          <Button key={m} size="sm" variant={m === mm ? "secondary" : "ghost"} aria-current={m === mm ? "page" : undefined}
            render={<Link href={`/collection/dashboard/?month=${m}`} />} nativeButton={false}>
            {monthLabel(`${year}-${m}`).slice(0, 3)}
          </Button>
        ))}
      </nav>
      <span className="ml-auto hidden text-sm text-muted-foreground @6xl/main:inline">
        January – December {year}, by date
      </span>
    </>
  )

  if (!rows.length) {
    if (error) return null
    return (
      <div className="@container/main flex flex-col gap-6">
        {entries.length > 0 && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-2 print:hidden">{switcher}</div>}
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ChartNoAxesColumnIcon /></EmptyMedia>
            <EmptyTitle>{entries.length ? `Nothing dated ${year}.` : "No collections yet."}</EmptyTitle>
            <EmptyDescription>{entries.length ? "Check the dates, or pick another year in the sidebar." : "Charts appear once the Collection tab has receipts."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  const sum = collected(rows)
  const now = collected(entries.filter((e) => e.month === thisMonth)), before = collected(entries.filter((e) => e.month === lastMonth))
  const lastName = longMonth(lastMonth + "-01"), monthName = `${longMonth(thisMonth + "-01")} ${thisMonth.slice(0, 4)}`
  // A month still in progress isn't compared with a whole one: November so far vs all of October reads as a fall.
  const partial = thisMonth === today.slice(0, 7)
  const delta = before && !partial ? Math.round((100 * (now - before)) / before) : null
  const tone = !delta ? "var(--muted-foreground)" : delta > 0 ? "#16a34a" : "#dc2626"
  // A year compares January through the same month against the year before (all of it for a past year).
  const y = Number(year), through = year === today.slice(0, 4) ? today.slice(5, 7) : "12"
  const ytd = (yr: number) => collected(entries.filter((e) => e.month >= `${yr}-01` && e.month <= `${yr}-${through}`))
  const yearChange = change(ytd(y), ytd(y - 1), through === "12" ? String(y - 1) : `Jan–${monthLabel(`${y}-${through}`).slice(0, 3)} ${y - 1}`)

  const byDay = new Map<string, Day>()
  for (const e of rows) {
    const d = byDay.get(e.iso) ?? { date: e.iso, value: 0, verified: 0 }
    d.value += e.collected
    d.verified += e.collected
    byDay.set(e.iso, d)
  }
  const from = `${year}-01-01`, to = `${year}-12-31`

  // UACS as ranked bars: one account can be most of the money, and slivers of a pie can't be read.
  const uacs = groupBy(rows, (e) => tag(e, "uacs"))
  const uacsData: Point[] = uacs.map(([name, , amt]) => ({ label: `${account(name)} · ${share(amt, sum)}`, tip: name, value: amt, href: link({ uacs: name }) }))
  const areaData: Point[] = groupBy(rows, (e) => tag(e, "area")).slice(0, 8).map(([name, n, amt]) => ({ label: name, tip: `${name} · ${receipts(n)}`, value: amt, href: link({ area: name }) }))
  const flagged = rows.filter((e) => e.issues.length)
  const checks = (Object.keys(ENTRY_ISSUES) as EntryIssue[]).map((i) => [i, rows.filter((e) => e.issues.includes(i))] as const)
  const largest = rows.reduce((a, b) => (b.collected > a.collected ? b : a))
  /** Ranked bars of the year's amount by any key, the largest 8 first, with the year's total under them. */
  const ranked = (caption: string, key: (e: Entry) => string, href: (name: string) => string | undefined) => (
    <>
      <RankedBars caption={caption} data={groupBy(rows, key).slice(0, 8).map(([name, n, amt]) => ({ label: name, tip: `${name} · ${receipts(n)}`, value: amt, href: href(name) }))} />
      <Total amount={sum} />
    </>
  )
  const figure = (value: string, note: string) => (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span className={FIGURE}>{value}</span>
      <Pill text={note} />
    </div>
  )

  const panels: Panel[] = [
    { id: "ytd", section: "figures", widths: WIDTHS.figure, title: `Collected, ${year}`, children: figure(peso(sum), yearChange ?? receipts(rows.length)) },
    { id: "month", section: "figures", widths: WIDTHS.figure, title: `${monthName}${partial ? " so far" : ""}`,
      description: <>{lastName}: <b className="font-semibold text-foreground tabular-nums">{peso(before)}</b></>, children: (
        <span className="flex flex-wrap items-baseline gap-x-2.5">
          <span className={FIGURE}>{peso(now)}</span>
          {delta !== null && (
            <span className="inline-flex items-center gap-0.5 text-sm font-medium tabular-nums" style={{ color: tone }}>
              {delta > 0 ? <ArrowUpIcon aria-hidden="true" className="size-3.5" /> : delta < 0 ? <ArrowDownIcon aria-hidden="true" className="size-3.5" /> : null}
              {delta > 0 ? "+" : delta < 0 ? "−" : ""}{Math.abs(delta).toLocaleString("en-US")}%
              <span className="sr-only"> compared to {lastName}</span>
            </span>
          )}
        </span>
      ) },
    { id: "receipts", section: "figures", widths: WIDTHS.figure, title: "Receipts", href: link({}), action: "View entries",
      children: figure(rows.length.toLocaleString("en-US"), `January – December ${year}`) },
    { id: "flagged", section: "figures", widths: WIDTHS.figure, title: "Flagged receipts", href: flagged.length ? link({ issue: "any" }) : undefined, action: "View entries",
      children: figure(flagged.length.toLocaleString("en-US"), flagged.length ? peso(collected(flagged)) : "Every receipt passes the checks") },
    { id: "largest", section: "figures", widths: WIDTHS.figure, title: "Largest receipt", href: link({ q: largest.or_no || largest.payor }), action: "View entry",
      children: figure(peso(largest.collected), [largest.or_no && `OR ${largest.or_no}`, largest.payor.trim()].filter(Boolean).join(" · ") || receipts(1)) },

    { id: "trend", section: "charts", widths: WIDTHS.chart, title: "Collections summary", description: `Amount collected by date, ${year} · by day, week or month, or any date range`,
      children: <TrendChart key={year} days={[...byDay.values()]} from={from} to={to} single="Collected" /> },

    { id: "uacs", section: "breakdowns", widths: WIDTHS.bars, title: "By UACS code", description: `${uacs.length} account${uacs.length === 1 ? "" : "s"} · share of the amount collected`, children: (
      <>
        <RankedBars caption="Collections by UACS code" data={uacsData} />
        <Total amount={sum} />
      </>
    ) },
    { id: "area", section: "breakdowns", widths: WIDTHS.bars, title: "By area", description: "The largest areas by amount collected", href: link({}), action: "View entries",
      children: <RankedBars caption="Collections by area" data={areaData} /> },
    { id: "payor", section: "breakdowns", widths: WIDTHS.bars, title: "By payor", description: "The largest payors by amount collected", href: link({}), action: "View entries",
      children: ranked("Collections by payor", (e) => tag(e, "payor"), (name) => (name === NOT_SET ? undefined : link({ q: name }))) },
    { id: "nature", section: "breakdowns", widths: WIDTHS.bars, title: "By nature of collection", description: "The largest by amount collected", href: link({}), action: "View entries",
      children: ranked("Collections by nature of collection", (e) => tag(e, "nature"), (name) => (name === NOT_SET ? undefined : link({ q: name }))) },
    { id: "bymonth", section: "breakdowns", widths: WIDTHS.bars, title: "By month", description: `Amount collected by month, ${year}`, children: (
      <>
        <RankedBars caption="Collections by month" data={groupBy(rows, (e) => e.month).sort(([a], [b]) => a.localeCompare(b))
          .map(([m, n, amt]) => ({ label: monthLabel(m), tip: `${monthLabel(m)} · ${receipts(n)}`, value: amt, href: link({ month: m }) }))} />
        <Total amount={sum} />
      </>
    ) },

    // Same name as the Collections tab; every check is listed, with a tick where nothing is wrong.
    { id: "review", section: "breakdowns", widths: WIDTHS.bars, title: "Needs review", description: flagged.length ? `${receipts(flagged.length)} · ${peso(collected(flagged))}` : "Every receipt passes the checks",
      href: flagged.length ? link({ issue: "any" }) : undefined, action: `Open ${flagged.length.toLocaleString("en-US")}`, children: (
        <ul className="flex flex-col divide-y text-sm">
          {checks.map(([i, list]) => (
            <li key={i}>
              {list.length ? (
                <Link href={link({ issue: i })} className="flex items-center gap-2 py-2 hover:text-primary">
                  <span className="flex-1">{ENTRY_ISSUES[i]}</span>
                  <Badge variant="destructive" className="tabular-nums">{list.length}</Badge>
                  <span className="font-medium tabular-nums">{peso(collected(list))}</span>
                </Link>
              ) : (
                <span className="flex items-center gap-2 py-2 text-muted-foreground">
                  <span className="flex-1">{ENTRY_ISSUES[i]}</span>none<CheckIcon aria-hidden="true" className="size-3.5" />
                </span>
              )}
            </li>
          ))}
        </ul>
      ) },
  ]

  return (
    <div className="@container/main flex w-full flex-col gap-4">
      <DashboardBoard name="collection" sheet={source.id} panels={panels} defaults={DEFAULT} saved={saved} toolbar={switcher} />
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
