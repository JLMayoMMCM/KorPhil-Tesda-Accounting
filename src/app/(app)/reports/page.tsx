import { DownloadIcon } from "lucide-react"
import type { Metadata } from "next"
import Form from "next/form"
import Image from "next/image"
import Link from "next/link"

import { AutoSubmitSelect } from "@/components/auto-submit"
import { PrintButton } from "@/components/print-button"
import { Button } from "@/components/ui/button"
import { NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getData } from "@/lib/data"
import { monthLabel, months, paginate, qs, todayManila, toParams, values } from "@/lib/ledger"
import { buildReport, CLUSTERS, clusterOf, fmtCell, PERIODS, REPORTS, type Cell, type Col } from "@/lib/reports"
import { fullName } from "@/lib/session"

export const metadata: Metadata = { title: "Reports" }

/** Paper sizes: label, CSS width, CSS height, height and width in px (96 dpi). "Long" is PH long bond (8.5 × 13 in). */
const PAPERS = {
  short: ["Short (8.5 × 11 in)", "8.5in", "11in", 1056, 816],
  long: ["Long (8.5 × 13 in)", "8.5in", "13in", 1248, 816],
  a4: ["A4 (210 × 297 mm)", "210mm", "297mm", 1123, 794],
} as const
type Paper = keyof typeof PAPERS

// Fixed heights (px) the pages are packed by. A row is 28px plus 16px per extra wrapped line.
// ponytail: estimated, not measured; measure in the browser if pages start spilling over.
const H = { pad: 96, foot: 32, start: 236, contents: 44, line: 20, carry: 50, head: 64, row: 28, wrap: 16, gap: 24, end: 130 }
const CHAR = 6.2 // average px per character at text-xs

const right = (c: Col) => (c.fmt === "text" ? "" : "text-right")

export default async function Reports({ searchParams }: PageProps<"/reports">) {
  const params = toParams(await searchParams)
  const { rows, pull, user } = await getData()
  const { kind, scope, area, scoped, tables } = buildReport(rows, params, todayManila())
  const paper: Paper = (params.get("paper") ?? "") in PAPERS ? (params.get("paper") as Paper) : "short"
  const [, paperW, paperH, paperPx, paperWPx] = PAPERS[paper]
  const generated = new Date().toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })
  const where = area || "All trade areas"
  const summary = kind === "summary"

  // Cells as printed, and each row's height from its longest wrapped text cell.
  const blocks = scoped.length ? tables.map((t) => {
    const show = (cells: Cell[]) => cells.map((v, i) => fmtCell(v, t.cols[i].fmt))
    const body = t.rows.map(show), foot = t.foot && show(t.foot)
    const height = (cells: string[]) => H.row + H.wrap * Math.max(0, ...cells.map((v, i) =>
      t.cols[i].fmt === "text" ? Math.ceil(v.length / Math.max(4, Math.floor((t.cols[i].w * (paperWPx - 96)) / CHAR) - 2)) - 1 : 0))
    return { ...t, body, foot, heights: [...body, ...(foot ? [foot] : [])].map(height) }
  }) : []
  const clusters = [...new Set(blocks.map((b) => clusterOf(b.kind)))]
  const pages = paginate(blocks.map((b) => b.heights), {
    ...H, cap: paperPx - H.pad - H.foot, start: H.start + (summary ? H.contents + H.line * (blocks.length + clusters.length) : 0),
  })
  const startsOn = (i: number) => pages.findIndex((pg) => pg.some((c) => c.block === i && c.from === 0)) + 1

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
          {CLUSTERS.map(([name, kinds]) => (
            <div key={name} className="flex flex-col gap-1">
              <h2 className="px-2.5 text-xs font-medium text-muted-foreground">{name}</h2>
              {kinds.map((k) => (
                <Button key={k} variant={k === kind ? "secondary" : "ghost"} className="h-auto justify-start py-1.5 text-left whitespace-normal" aria-current={k === kind ? "page" : undefined}
                  render={<Link href={"/reports/" + qs(params, { report: k })} />} nativeButton={false}>
                  {REPORTS[k]}
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
                {pi === 0 ? (
                  <>
                    {/* Letterhead, as on the office's printed forms. */}
                    <header className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-[#1b2a6b]">
                      <div className="flex items-center gap-1.5">
                        <Image src="/bagong_pilipinas_logo.png" alt="Bagong Pilipinas" width={86} height={80} className="h-20 w-auto" />
                        <Image src="/tesda_logo.png" alt="TESDA" width={80} height={80} className="size-20" />
                      </div>
                      <div className="text-center leading-tight">
                        <div className="text-[15px]">Technical Education and Skills Development Authority XI</div>
                        <div className="text-[15px] font-bold">REGIONAL TRAINING CENTER – KOREA PHILIPPINES</div>
                        <div className="text-[15px] font-bold">VOCATIONAL TRAINING CENTER</div>
                        <div className="text-[15px]">Buhisan Tibungco, Davao City, Philippines</div>
                      </div>
                      <Image src="/tesda_korphil_logo.png" alt="Korea-Philippines Vocational Training Center" width={80} height={80} className="size-20" />
                    </header>
                    <div className="flex flex-col items-center gap-0.5 border-y-2 border-double border-foreground/70 py-2 text-center">
                      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Accounting Office · Disbursement report</p>
                      <h2 className="font-heading text-lg font-bold tracking-tight text-balance">{REPORTS[kind]}</h2>
                      <p className="text-sm">{scope.label} · {where}</p>
                      <p className="text-xs text-muted-foreground">Generated {generated}</p>
                    </div>
                    {!scoped.length && (
                      <p className="py-8 text-center text-muted-foreground">No vouchers match these choices. Widen the period or trade area above.</p>
                    )}
                    {summary && blocks.length > 0 && (
                      <nav aria-label="Contents" className="flex flex-col gap-2 text-sm">
                        <h3 className="font-heading font-bold">Contents</h3>
                        <ol className="flex flex-col">
                          {clusters.map((c) => (
                            <li key={c}>
                              <span className="block h-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{c}</span>
                              <ol>
                                {blocks.map((b, i) => clusterOf(b.kind) === c && (
                                  <li key={b.kind} className="flex h-5 gap-2 pl-3">
                                    <span>{i + 1}. {b.title}</span>
                                    <span className="flex-1 -translate-y-1 border-b border-dotted border-foreground/30" />
                                    <span className="tabular-nums">{startsOn(i)}</span>
                                  </li>
                                ))}
                              </ol>
                            </li>
                          ))}
                        </ol>
                      </nav>
                    )}
                  </>
                ) : (
                  <header className="flex justify-between gap-4 border-b pb-2 text-xs text-muted-foreground">
                    <strong className="text-foreground">RTC – KorPhil VTC · {REPORTS[kind]}</strong>
                    <span>{scope.label} · {where}</span>
                  </header>
                )}

                {chunks.map(({ block, from, to }) => {
                  const b = blocks[block], foot = b.foot && to > b.body.length
                  return (
                    <section key={`${block}-${from}`} className="flex flex-col gap-2">
                      <h3 className="flex items-baseline justify-between gap-4 font-heading text-sm font-bold">
                        <span>{summary && `${block + 1}. `}{b.title}{from > 0 && <span className="font-normal text-muted-foreground"> (continued)</span>}</span>
                        {summary && <span className="text-xs font-normal text-muted-foreground">{clusterOf(b.kind)}</span>}
                      </h3>
                      <Table className="table-fixed border-y border-foreground/70 text-xs">
                        <colgroup>{b.cols.map((c) => <col key={c.head} style={{ width: `${c.w * 100}%` }} />)}</colgroup>
                        <TableHeader>
                          <TableRow className="border-foreground/70 bg-muted/60 hover:bg-muted/60">
                            {b.cols.map((c) => <TableHead key={c.head} className={`h-8 font-semibold whitespace-normal ${right(c)}`}>{c.head}</TableHead>)}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {b.body.slice(from, to).map((cells, ri) => (
                            <TableRow key={from + ri} className="h-7 hover:bg-transparent">
                              {cells.map((v, ci) => (
                                <TableCell key={ci} className={`py-1.5 align-top tabular-nums ${b.cols[ci].fmt === "text" ? "whitespace-normal break-words" : right(b.cols[ci])}`}>{v}</TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                        {foot && (
                          <TableFooter className="border-foreground/70">
                            <TableRow className="h-7 hover:bg-transparent">
                              {b.foot!.map((v, ci) => <TableCell key={ci} className={`py-1.5 font-bold tabular-nums ${right(b.cols[ci])}`}>{v}</TableCell>)}
                            </TableRow>
                          </TableFooter>
                        )}
                      </Table>
                      {to === b.heights.length && b.note && <p className="text-xs text-muted-foreground">Note: {b.note}</p>}
                    </section>
                  )
                })}

                {last && blocks.length > 0 && (
                  <section aria-label="Sign-off" className="mt-auto grid grid-cols-3 gap-8 pt-6 text-sm break-inside-avoid">
                    {([["Prepared by", fullName(user)], ["Reviewed by", ""], ["Approved by", ""]] as const).map(([k, v]) => (
                      <div key={k} className="flex flex-col gap-8">
                        <span className="text-muted-foreground">{k}:</span>
                        <div className="border-t border-foreground/60 pt-1 text-center">
                          <div className="min-h-5 font-medium">{v}</div>
                          <div className="text-xs text-muted-foreground">Signature over printed name</div>
                        </div>
                      </div>
                    ))}
                  </section>
                )}

                <footer className={`flex justify-between gap-2 text-xs text-muted-foreground ${last && blocks.length ? "" : "mt-auto"}`}>
                  <span>Source: {pull.title || "Google Sheet"}</span>
                  <span className="tabular-nums">Page {pi + 1} of {pages.length}</span>
                </footer>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}
