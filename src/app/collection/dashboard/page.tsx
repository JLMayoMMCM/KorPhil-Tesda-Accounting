import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon, ChartNoAxesColumnIcon, CheckIcon, ChevronDownIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { compact } from "@/components/charts"
import { RankedBars, TrendChart, type Day, type Point } from "@/components/dashboard-charts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { account, collected, ENTRY_ISSUES, entryMonths, groupBy, tag, type EntryIssue } from "@/lib/collection"
import { getCollectionData } from "@/lib/data"
import { longMonth, monthLabel, monthsBack, peso, qs } from "@/lib/ledger"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Dashboard · Collections" }

// Same soft panels as the voucher dashboard.
const PANEL = "rounded-2xl ring-0 border shadow-xs"
const MONTH_NUMBERS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]
const receipts = (n: number) => `${n.toLocaleString("en-US")} receipt${n === 1 ? "" : "s"}`
/** Whole percent of a total, but never rounds a small share down to 0. */
const share = (n: number, of: number) => { const p = of ? (100 * n) / of : 0; return `${p > 0 && p < 1 ? "<1" : Math.round(p)}%` }
const change = (now: number, before: number, against: string) => {
  if (!before) return null
  const p = Math.round((100 * (now - before)) / before)
  return p ? `${p > 0 ? "up" : "down"} ${Math.abs(p).toLocaleString("en-US")}% on ${against}` : `the same as ${against}`
}

/** The collection overview: what came in, how it compares, and where it came from. */
export default async function CollectionDashboard({ searchParams }: PageProps<"/collection/dashboard">) {
  const { entries, error, today } = await getCollectionData()
  const years = [...new Set([today.slice(0, 4), ...entryMonths(entries).map((m) => m.slice(0, 4))])].sort().reverse()
  const { year: asked, month: askedMonth } = await searchParams
  const year = typeof asked === "string" && (asked === "all" || years.includes(asked)) ? asked : today.slice(0, 4)
  const mm = typeof askedMonth === "string" && MONTH_NUMBERS.includes(askedMonth) ? askedMonth : year === today.slice(0, 4) ? today.slice(5, 7) : "12"
  const thisMonth = year === "all" ? today.slice(0, 7) : `${year}-${mm}`, lastMonth = monthsBack(thisMonth, 1)
  const rows = year === "all" ? entries : entries.filter((e) => e.month.startsWith(year + "-"))
  const scope = year === "all" ? "all years" : year
  const link = (changes: Record<string, string>) => "/collection/collections/" + qs(new URLSearchParams(), year === "all" ? changes : { ...changes, year })

  const switcher = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-2 print:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="secondary" size="sm" className="rounded-full tabular-nums" aria-label={`Year: ${scope}`} />}>
          {year === "all" ? "All years" : year}<ChevronDownIcon data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Year, by date</DropdownMenuLabel>
            {[...years, "all"].map((y) => (
              <DropdownMenuItem key={y} className="gap-2 py-1.5" render={<Link href={`/collection/dashboard/?year=${y}`} aria-current={y === year ? "page" : undefined} />}>
                <CheckIcon className={cn("text-primary", y !== year && "invisible")} />
                <span className={cn("flex-1 tabular-nums", y === year && "font-medium")}>{y === "all" ? "All years" : y}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {compact(collected(y === "all" ? entries : entries.filter((e) => e.month.startsWith(y + "-"))))}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {year !== "all" && (
        <nav aria-label="Month" className="flex flex-wrap items-center gap-1">
          {MONTH_NUMBERS.map((m) => (
            <Button key={m} size="sm" variant={m === mm ? "secondary" : "ghost"} aria-current={m === mm ? "page" : undefined}
              render={<Link href={`/collection/dashboard/?year=${year}&month=${m}`} />} nativeButton={false}>
              {monthLabel(`${year}-${m}`).slice(0, 3)}
            </Button>
          ))}
        </nav>
      )}
      <span className="ml-auto hidden text-sm text-muted-foreground @6xl/main:inline">
        {year === "all" ? "Every entry on record" : `January – December ${year}, by date`}
      </span>
    </div>
  )

  if (!rows.length) {
    if (error) return null
    return (
      <div className="@container/main flex flex-col gap-6">
        {entries.length > 0 && switcher}
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ChartNoAxesColumnIcon /></EmptyMedia>
            <EmptyTitle>{entries.length ? `Nothing dated ${year}.` : "No collections yet."}</EmptyTitle>
            <EmptyDescription>{entries.length ? "Pick another year above, or All years." : "Charts appear once the Collection tab has receipts."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  const sum = collected(rows)
  const now = collected(entries.filter((e) => e.month === thisMonth)), before = collected(entries.filter((e) => e.month === lastMonth))
  const lastName = longMonth(lastMonth + "-01"), monthName = `${longMonth(thisMonth + "-01")} ${thisMonth.slice(0, 4)}`
  const delta = before ? Math.round((100 * (now - before)) / before) : null
  const tone = !delta ? "var(--muted-foreground)" : delta > 0 ? "#16a34a" : "#dc2626"
  // A year compares January through the same month against the year before (all of it for a past year).
  const y = Number(year), through = year === today.slice(0, 4) ? today.slice(5, 7) : "12"
  const ytd = (yr: number) => collected(entries.filter((e) => e.month >= `${yr}-01` && e.month <= `${yr}-${through}`))
  const yearChange = year === "all" ? null : change(ytd(y), ytd(y - 1), through === "12" ? String(y - 1) : `Jan–${monthLabel(`${y}-${through}`).slice(0, 3)} ${y - 1}`)

  const byDay = new Map<string, Day>()
  for (const e of rows) {
    const d = byDay.get(e.iso) ?? { date: e.iso, value: 0, verified: 0 }
    d.value += e.collected
    d.verified += e.collected
    byDay.set(e.iso, d)
  }
  const dated = entryMonths(rows), newest = dated[0] > thisMonth ? dated[0] : thisMonth
  const oldest = [dated.at(-1) ?? newest, monthsBack(newest, 11)].sort()[0]
  const from = year === "all" ? `${oldest}-01` : `${year}-01-01`
  const to = year === "all" ? new Date(Date.parse(`${monthsBack(newest, -1)}-01`) - 864e5).toISOString().slice(0, 10) : `${year}-12-31`

  // UACS as ranked bars: one account can be most of the money, and slivers of a pie can't be read.
  const uacs = groupBy(rows, (e) => tag(e, "uacs"))
  const uacsData: Point[] = uacs.map(([name, , amt]) => ({ label: `${account(name)} · ${share(amt, sum)}`, tip: name, value: amt, href: link({ uacs: name }) }))
  const areaData: Point[] = groupBy(rows, (e) => tag(e, "area")).slice(0, 8).map(([name, n, amt]) => ({ label: name, tip: `${name} · ${receipts(n)}`, value: amt, href: link({ area: name }) }))
  const flagged = rows.filter((e) => e.issues.length)
  const checks = (Object.keys(ENTRY_ISSUES) as EntryIssue[]).map((i) => [i, rows.filter((e) => e.issues.includes(i))] as const)

  return (
    <div className="@container/main flex w-full flex-col gap-4">
      {switcher}
      <dl aria-label="Key figures" className="grid gap-4 @3xl/main:grid-cols-2">
        <Figure label={`Collected, ${scope}`} value={peso(sum)} note={yearChange ?? receipts(rows.length)} />
        <div className={cn(PANEL, "flex flex-col gap-1 bg-card px-5 py-4")}>
          <dt className="text-sm text-muted-foreground">{monthName}</dt>
          <dd className="flex flex-wrap items-baseline gap-x-2.5">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">{peso(now)}</span>
            {delta !== null && (
              <span className="inline-flex items-center gap-0.5 text-sm font-medium tabular-nums" style={{ color: tone }}>
                {delta > 0 ? <ArrowUpIcon aria-hidden="true" className="size-3.5" /> : delta < 0 ? <ArrowDownIcon aria-hidden="true" className="size-3.5" /> : null}
                {delta > 0 ? "+" : delta < 0 ? "−" : ""}{Math.abs(delta).toLocaleString("en-US")}%
                <span className="sr-only"> compared to {lastName}</span>
              </span>
            )}
          </dd>
          <dd className="text-sm text-muted-foreground">{lastName}: <b className="font-semibold text-foreground tabular-nums">{peso(before)}</b></dd>
        </div>
      </dl>

      <div className="grid gap-4 @5xl/main:grid-cols-12">
        <Panel title="Collections summary" description={`Amount collected by date, ${scope} · by day, week or month, or any date range`} className="@5xl/main:col-span-7">
          <TrendChart key={year} days={[...byDay.values()]} from={from} to={to} single="Collected" />
        </Panel>
        <Panel title="By UACS code" description={`${uacs.length} account${uacs.length === 1 ? "" : "s"} · share of the amount collected`} className="@5xl/main:col-span-5">
          <RankedBars caption="Collections by UACS code" data={uacsData} />
          <p className="mt-3 flex items-baseline justify-between gap-3 border-t-2 border-foreground pt-2 text-sm font-semibold">
            <span>Total</span><span className="tabular-nums">{peso(sum)}</span>
          </p>
        </Panel>
      </div>

      <div className="grid gap-4 @5xl/main:grid-cols-12">
        <Panel title="By area" description="The largest areas by amount collected" href={link({})} className="@5xl/main:col-span-7">
          <RankedBars caption="Collections by area" data={areaData} />
        </Panel>
        {/* Same name as the Collections tab; every check is listed, with a tick where nothing is wrong. */}
        <Panel title="Needs review" description={flagged.length ? `${receipts(flagged.length)} · ${peso(collected(flagged))}` : "Every receipt passes the checks"}
          href={flagged.length ? link({ issue: "any" }) : undefined} action={`Open ${flagged.length.toLocaleString("en-US")}`} className="@5xl/main:col-span-5">
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
        </Panel>
      </div>
    </div>
  )
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  const tone = note.startsWith("up ") ? "bg-primary/10 text-primary" : note.startsWith("down ") ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
  return (
    <div className={cn(PANEL, "flex flex-col gap-1 bg-card px-5 py-4")}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-3xl font-semibold tracking-tight tabular-nums">{value}</dd>
      <dd><span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs tabular-nums", tone)}>{note}</span></dd>
    </div>
  )
}

function Panel({ title, description, href, action = "View entries", className, children }: {
  title: string; description: string; href?: string; action?: string; className?: string; children: React.ReactNode
}) {
  return (
    <Card className={cn(PANEL, className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {href && (
          <CardAction className="print:hidden">
            <Button variant="ghost" size="sm" render={<Link href={href} />} nativeButton={false}>{action}<ArrowRightIcon data-icon="inline-end" /></Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="min-h-0 flex-1">{children}</CardContent>
    </Card>
  )
}
