import { DownloadIcon } from "lucide-react"
import type { Metadata } from "next"
import Form from "next/form"
import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"

import { AutoSubmitSelect } from "@/components/auto-submit"
import { Totals } from "@/components/charts"
import { PrintButton } from "@/components/print-button"
import { Button } from "@/components/ui/button"
import { NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getData } from "@/lib/data"
import { ISSUES, monthLabel, months, paginate, peso, qs, toParams, total, values } from "@/lib/ledger"
import { buildReport, REPORTS, type Kind, type Part } from "@/lib/reports"
import { fullName } from "@/lib/session"

export const metadata: Metadata = { title: "Reports" }

/** Paper sizes: label, CSS width, CSS height, height in px (96 dpi). "Long" is PH long bond (8.5 × 13 in). */
const PAPERS = {
  short: ["Short (8.5 × 11 in)", "8.5in", "11in", 1056],
  long: ["Long (8.5 × 13 in)", "8.5in", "13in", 1248],
  a4: ["A4 (210 × 297 mm)", "210mm", "297mm", 1123],
} as const
type Paper = keyof typeof PAPERS

// Fixed heights (px) the pages are packed by; rows are a fixed h-7 so tables split predictably.
// ponytail: estimated, not measured; measure in the browser if pages start spilling over.
const H = { pad: 96, foot: 32, start: 270, contents: 172, carry: 50, head: 64, row: 28, gap: 24, end: 130 }

const HEADINGS: Record<Exclude<Part["kind"], "audit">, string> = {
  monthly: "Month", area: "Trade area", program: "Diploma / ST / Assessment", category: "Category", payee: "Payee", review: "Check",
}

type Col = { head: string; className?: string }
type Block = { title: string; cols: Col[]; rows: ReactNode[][]; foot: ReactNode[]; note?: string }

function Share({ of, v }: { of: number; v: number }) {
  const pct = of ? (100 * v) / of : 0
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-primary" style={{ width: `${Math.min(pct, 100)}%` }} /></span>
      <span className="w-10 tabular-nums">{pct.toFixed(1)}%</span>
    </span>
  )
}

/** A report part as one table: grouped lines with share bars, or every voucher for the audit. */
function toBlock(p: Part, title: string): Block {
  const sum = total(p.scoped), n = p.scoped.length
  if (p.kind === "audit") return {
    title,
    cols: [{ head: "DV #", className: "w-[11%]" }, { head: "DV date", className: "w-[11%]" }, { head: "Payee" }, { head: "Particulars" },
      { head: "Area", className: "w-[10%]" }, { head: "Check #", className: "w-[11%]" }, { head: "Review", className: "w-[13%]" }, { head: "Amount", className: "w-[14%] text-right" }],
    rows: p.scoped.map((r) => [r.dv_no, r.dv_date, r.payee, r.particulars, r.trade_area, r.check_number, r.issues.map((i) => ISSUES[i]).join(", ") || "OK", peso(r.amount)]),
    foot: [`Total · ${n}`, "", "", "", "", "", "", peso(sum)],
  }
  return {
    title,
    cols: [{ head: HEADINGS[p.kind] }, { head: "Vouchers", className: "w-20 text-right" }, { head: "Amount", className: "w-32 text-right" }, { head: "Share", className: "w-28 text-right" }],
    rows: p.lines.map((l) => [l.label, l.count, peso(l.amount), <Share key="s" of={sum} v={l.amount} />]),
    foot: ["Total", n, peso(sum), "100%"],
    note: p.kind === "review" ? "A voucher can fail more than one check, so these lines can add up to more than the total." : undefined,
  }
}

export default async function Reports({ searchParams }: PageProps<"/reports">) {
  const params = toParams(await searchParams)
  const { rows, pull, user } = await getData()
  const { kind, month, area, scoped, parts } = buildReport(rows, params)
  const paper: Paper = (params.get("paper") ?? "") in PAPERS ? (params.get("paper") as Paper) : "short"
  const [, paperW, paperH, paperPx] = PAPERS[paper]
  const generated = new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })
  const scope = [monthLabel(month), area || "All trade areas"].join(" · ")
  const summary = kind === "summary"

  // A single report needs no section title; it is the document title.
  const blocks = scoped.length ? parts.map((p) => toBlock(p, summary ? REPORTS[p.kind] : "")) : []
  const pages = paginate(blocks.map((b) => b.rows.length), {
    ...H, cap: paperPx - H.pad - H.foot, start: H.start + (summary ? H.contents : 0),
  })
  const startsOn = (i: number) => pages.findIndex((pg) => pg.some((c) => c.block === i && c.from === 0)) + 1
  const right = (c: Col) => (c.className?.includes("text-right") ? "text-right" : "")

  const word = (name: string, labelText: string, value: string, options: [string, string][]) => (
    <AutoSubmitSelect name={name} defaultValue={value} aria-label={labelText} className="font-medium">
      {options.map(([v, t]) => <NativeSelectOption key={v} value={v}>{t}</NativeSelectOption>)}
    </AutoSubmitSelect>
  )

  return (
    <div className="flex flex-col gap-4">
      <Form action="/reports/" className="flex flex-col gap-3 print:hidden">
        <input type="hidden" name="report" value={kind} />
        <div className="flex flex-wrap items-center gap-2 text-lg">
          <span>For</span>
          {word("month", "Month", month, [["", "All months"], ...months(rows).map((m): [string, string] => [m, monthLabel(m)])])}
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

      <div className="grid items-start gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] print:block">
        <nav aria-label="Reports" className="flex flex-col gap-1 print:hidden">
          {(Object.entries(REPORTS) as [Kind, string][]).map(([k, name]) => (
            <Button key={k} variant={k === kind ? "secondary" : "ghost"} className="justify-start" aria-current={k === kind ? "page" : undefined}
              render={<Link href={"/reports/" + qs(params, { report: k })} />} nativeButton={false}>
              {name}
            </Button>
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
                    {/* Letterhead: seal, office, date, over a 2px ink rule like a printed form. */}
                    <header className="flex items-center gap-3 border-b-2 border-foreground pb-3">
                      <Image src="/logo.webp" alt="" width={44} height={44} />
                      <div className="flex flex-col leading-tight">
                        <strong className="text-base">KorPhil-TESDA</strong>
                        <span className="text-xs text-muted-foreground">Regional Training Center, Davao · Accounting Office</span>
                      </div>
                      <div className="ml-auto text-right text-xs leading-tight text-muted-foreground">
                        <div>Generated</div>
                        <div className="font-medium text-foreground tabular-nums">{generated}</div>
                      </div>
                    </header>
                    <div className="flex flex-col items-center gap-1 text-center">
                      <h2 className="font-heading text-xl font-bold tracking-tight text-balance">{REPORTS[kind]}</h2>
                      <p className="text-sm text-muted-foreground">{scope}</p>
                    </div>
                    {scoped.length ? <Totals rows={scoped} /> : (
                      <p className="py-8 text-center text-muted-foreground">No vouchers match these choices. Widen the month or trade area above.</p>
                    )}
                    {summary && blocks.length > 0 && (
                      <nav aria-label="Contents" className="flex flex-col gap-2 text-sm">
                        <h3 className="font-heading font-bold">Contents</h3>
                        <ol className="flex flex-col">
                          {blocks.map((b, i) => (
                            <li key={b.title} className="flex gap-2">
                              <span>{i + 1}. {b.title}</span>
                              <span className="flex-1 -translate-y-1 border-b border-dotted border-foreground/30" />
                              <span className="tabular-nums">{startsOn(i)}</span>
                            </li>
                          ))}
                        </ol>
                      </nav>
                    )}
                  </>
                ) : (
                  <header className="flex justify-between gap-4 border-b pb-2 text-xs text-muted-foreground">
                    <strong className="text-foreground">KorPhil-TESDA · {REPORTS[kind]}</strong>
                    <span>{scope}</span>
                  </header>
                )}

                {chunks.map(({ block, from, to }) => {
                  const b = blocks[block], foot = to > b.rows.length
                  return (
                    <section key={`${block}-${from}`} className="flex flex-col gap-2">
                      {b.title && <h3 className="font-heading text-sm font-bold">{b.title}{from > 0 && <span className="font-normal text-muted-foreground"> (continued)</span>}</h3>}
                      <Table className="table-fixed text-xs">
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            {b.cols.map((c) => <TableHead key={c.head} className={`h-8 ${c.className ?? ""}`}>{c.head}</TableHead>)}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {b.rows.slice(from, to).map((cells, ri) => (
                            <TableRow key={from + ri} className="h-7">
                              {cells.map((v, ci) => (
                                <TableCell key={ci} title={typeof v === "string" ? v : undefined} className={`truncate py-0 tabular-nums ${right(b.cols[ci])}`}>{v}</TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                        {foot && (
                          <TableFooter>
                            <TableRow className="h-7">
                              {b.foot.map((v, ci) => <TableCell key={ci} className={`truncate py-0 font-medium tabular-nums ${right(b.cols[ci])}`}>{v}</TableCell>)}
                            </TableRow>
                          </TableFooter>
                        )}
                      </Table>
                      {foot && b.note && <p className="text-xs text-muted-foreground">{b.note}</p>}
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
