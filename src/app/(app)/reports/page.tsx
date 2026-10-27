import { DownloadIcon } from "lucide-react"
import type { Metadata } from "next"
import Form from "next/form"
import Link from "next/link"

import { AutoSubmitSelect } from "@/components/auto-submit"
import { PrintButton } from "@/components/print-button"
import { Contents, layout, Letterhead, PageFooter, PAPERS, RunningHeader, Schedule, SignOff, type Paper } from "@/components/report-sheet"
import { Button } from "@/components/ui/button"
import { NativeSelectOption } from "@/components/ui/native-select"
import { getData } from "@/lib/data"
import { monthLabel, months, qs, todayManila, toParams, values } from "@/lib/ledger"
import { buildReport, clustersFor, manilaTime, PERIODS, titleOf } from "@/lib/reports"
import { fullName } from "@/lib/session"

export const metadata: Metadata = { title: "Reports" }

export default async function Reports({ searchParams }: PageProps<"/reports">) {
  const params = toParams(await searchParams)
  const { rows, pull, user, columns } = await getData()
  const generated = new Date()
  const { kind, scope, area, tables } = buildReport(rows, params, todayManila(), columns, { source: pull.title, pulled: pull.at, generated, by: fullName(user) })
  const paper: Paper = (params.get("paper") ?? "") in PAPERS ? (params.get("paper") as Paper) : "short"
  const [, paperW, paperH] = PAPERS[paper]
  const summary = kind === "summary"
  const empty = !tables.some((t) => t.no)
  const { blocks, pages } = layout(tables, paper, summary && !empty)
  const startsOn = (i: number) => pages.findIndex((pg) => pg.some((c) => c.block === i && c.from === 0)) + 1
  const head = { title: titleOf(kind), period: scope.label, area: area || "All trade areas" }

  const ms = months(rows), years = [...new Set(ms.map((m) => m.slice(0, 4)))]
  const monthOpts = (value: string, order: string[]) => [...new Set([...order, value])].map((m): [string, string] => [m, monthLabel(m)])
  const word = (name: string, labelText: string, value: string, options: [string, string][]) => (
    <AutoSubmitSelect name={name} defaultValue={value} aria-label={labelText} className="font-medium">
      {options.map(([v, t]) => <NativeSelectOption key={v} value={v}>{t}</NativeSelectOption>)}
    </AutoSubmitSelect>
  )
  const yearPick = word("year", "Year", scope.from.slice(0, 4), years.map((y): [string, string] => [y, y]))

  return (
    <div className="flex flex-col gap-4">
      <Form action="/reports/" className="flex flex-col gap-3 print:hidden">
        <input type="hidden" name="report" value={kind} />
        {/* Carries the period over when the period type changes. */}
        {scope.by !== "month" && scope.to && <input type="hidden" name="month" value={scope.to} />}
        <div className="flex flex-wrap items-center gap-2 text-lg">
          <span>By</span>
          {word("period", "Period", scope.by, Object.entries(PERIODS))}
          {scope.by === "month" && word("month", "Month", scope.to, monthOpts(scope.to, ms))}
          {scope.by === "quarter" && <>{word("q", "Quarter", String(Number(scope.to.slice(5)) / 3), [1, 2, 3, 4].map((q): [string, string] => [String(q), `Q${q}`]))}{yearPick}</>}
          {scope.by === "year" && yearPick}
          {scope.by === "range" && <>
            {word("from", "From month", scope.from, monthOpts(scope.from, [...ms].reverse()))}
            <span>to</span>
            {word("to", "To month", scope.to, monthOpts(scope.to, [...ms].reverse()))}
          </>}
          <span>across</span>
          {word("area", "Trade area", area, [["", "All trade areas"], ...values(rows, "trade_area").map((a): [string, string] => [a, a])])}
          <span>on</span>
          {word("paper", "Paper size", paper, Object.entries(PAPERS).map(([k, [t]]): [string, string] => [k, t]))}
          <span>paper</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button render={<a href={"/reports/csv/" + qs(params)} download />} nativeButton={false}>
            <DownloadIcon data-icon="inline-start" />Download CSV
          </Button>
          <PrintButton />
          <span className="text-sm text-muted-foreground tabular-nums">{pages.length} page{pages.length === 1 ? "" : "s"}</span>
        </div>
      </Form>

      <div className="grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] print:block">
        <nav aria-label="Reports" className="flex flex-col gap-3 print:hidden">
          {clustersFor(columns).map(([name, kinds]) => (
            <div key={name} className="flex flex-col gap-1">
              <h2 className="px-2.5 text-xs font-medium text-muted-foreground">{name}</h2>
              {kinds.map((k) => (
                <Button key={k} variant={k === kind ? "secondary" : "ghost"} className="h-auto justify-start py-1.5 text-left whitespace-normal" aria-current={k === kind ? "page" : undefined}
                  render={<Link href={"/reports/" + qs(params, { report: k })} />} nativeButton={false}>
                  {titleOf(k)}
                </Button>
              ))}
            </div>
          ))}
        </nav>

        <style>{`@page { size: ${paperW} ${paperH}; margin: 0; }`}</style>
        {/* Each sheet is one printed page, drawn at the paper's real size. */}
        <div className="flex min-w-0 flex-col gap-6 overflow-x-auto pb-2 print:block print:overflow-visible">
          {pages.map((chunks, pi) => {
            const last = pi === pages.length - 1
            return (
              <article key={pi} aria-label={`Page ${pi + 1}`} style={{ width: paperW, minHeight: `calc(${paperH} - 1px)` }}
                className="mx-auto flex shrink-0 flex-col gap-6 bg-card p-[0.5in] text-card-foreground shadow-md ring-1 ring-foreground/10 break-after-page last:break-after-auto print:m-0 print:shadow-none print:ring-0">
                {pi === 0 ? <>
                  <Letterhead {...head} />
                  {empty && <p className="py-4 text-center text-muted-foreground">No vouchers match these choices. Widen the period or trade area above; the basis of preparation below shows what was left out.</p>}
                  {summary && !empty && <Contents blocks={blocks} startsOn={startsOn} />}
                </> : <RunningHeader {...head} />}
                {chunks.map(({ block, from, to }) => <Schedule key={`${block}-${from}`} b={blocks[block]} from={from} to={to} cluster={summary} />)}
                {last && !empty && <SignOff preparer={fullName(user)} />}
                <PageFooter source={pull.title} generated={manilaTime(generated)} page={pi + 1} of={pages.length} push={!last || empty} />
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}
