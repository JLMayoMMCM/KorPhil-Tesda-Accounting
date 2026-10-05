import { DownloadIcon } from "lucide-react"
import type { Metadata } from "next"
import Form from "next/form"
import Image from "next/image"
import Link from "next/link"

import { AutoSubmitSelect } from "@/components/auto-submit"
import { BarList, Columns, Totals } from "@/components/charts"
import { PrintButton } from "@/components/print-button"
import { IssueBadges } from "@/components/issue-badges"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getData } from "@/lib/data"
import { monthLabel, months, peso, qs, toParams, total, values } from "@/lib/ledger"
import { buildReport, REPORTS, type Kind } from "@/lib/reports"
import { fullName } from "@/lib/session"

export const metadata: Metadata = { title: "Reports" }

const fmtShare = (v: number, of: number) => `${of ? ((100 * v) / of).toFixed(1) : "0.0"}%`

const CHART_TITLES: Record<Exclude<Kind, "audit">, string> = {
  monthly: "Amount by month", area: "Amount by trade area", program: "Amount by diploma / ST / assessment",
  category: "Amount by category", payee: "Amount by payee", review: "Amount by review check",
}
/** Long groupings chart only their largest bars; the table below lists every line. */
const CHART_LIMIT = 15

const HEADINGS: Partial<Record<Kind, string>> = {
  monthly: "Month", area: "Trade area", program: "Diploma / ST / Assessment", category: "Category", payee: "Payee", review: "Check",
}

export default async function Reports({ searchParams }: PageProps<"/reports">) {
  const params = toParams(await searchParams)
  const { rows, pull, user } = await getData()
  const { kind, month, area, scoped, lines } = buildReport(rows, params)
  const totalAmt = total(scoped)
  const generated = new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })

  const word = (name: string, labelText: string, value: string, options: [string, string][]) => (
    <AutoSubmitSelect name={name} defaultValue={value} aria-label={labelText} className="font-medium">
      {options.map(([v, t]) => <NativeSelectOption key={v} value={v}>{t}</NativeSelectOption>)}
    </AutoSubmitSelect>
  )

  return (
    <div className="flex flex-col gap-4">
      <Form action="/reports/" className="flex flex-col gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2 text-lg">
          <span>Show</span>
          {word("report", "Report", kind, Object.entries(REPORTS))}
          <span>for</span>
          {word("month", "Month", month, [["", "All months"], ...months(rows).map((m): [string, string] => [m, monthLabel(m)])])}
          <span>across</span>
          {word("area", "Trade area", area, [["", "All trade areas"], ...values(rows, "trade_area").map((a): [string, string] => [a, a])])}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Output</span>
          <Button render={<a href={"/reports/csv/" + qs(params)} download />} nativeButton={false}>
            <DownloadIcon data-icon="inline-start" />Download CSV
          </Button>
          <PrintButton />
          <span className="text-sm text-muted-foreground">The preview updates as you change the sentence.</span>
        </div>
      </Form>

      <div className="grid items-start gap-4 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Report templates" className="flex flex-col gap-1 print:hidden">
          <h2 className="px-2 text-sm font-medium text-muted-foreground">Templates</h2>
          {(Object.entries(REPORTS) as [Kind, string][]).map(([k, name]) => (
            <Button key={k} variant={k === kind ? "secondary" : "ghost"} className="justify-start" aria-current={k === kind ? "page" : undefined}
              render={<Link href={"/reports/" + qs(params, { report: k })} />} nativeButton={false}>
              {name}
            </Button>
          ))}
        </nav>

        <Card className="w-full max-w-[900px] gap-6 rounded-lg px-2 py-6 sm:px-7 print:max-w-none print:p-0 print:ring-0">
          {/* Letterhead: seal, office, date, over a 2px ink rule like a printed form. */}
          <CardHeader className="flex items-center gap-3 border-b-2 border-foreground pb-4!">
            <Image src="/logo.webp" alt="" width={44} height={44} />
            <div className="flex flex-col leading-tight">
              <strong className="text-base">KorPhil-TESDA</strong>
              <span className="text-xs text-muted-foreground">Regional Training Center, Davao · Accounting Office</span>
            </div>
            <div className="ml-auto text-right text-xs leading-tight text-muted-foreground">
              <div>Generated</div>
              <div className="font-medium text-foreground tabular-nums">{generated}</div>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-8">
            <header className="flex flex-col items-center gap-1 text-center">
              <h2 className="font-heading text-xl font-bold tracking-tight text-balance">{REPORTS[kind]}</h2>
              <p className="text-sm text-muted-foreground">
                {[monthLabel(month), area || "All trade areas"].join(" · ")}
              </p>
            </header>

            {!scoped.length ? (
              <p className="py-8 text-center text-muted-foreground">No vouchers match these choices. Widen the month or trade area above.</p>
            ) : (
              <>
                <Totals rows={scoped} />

                {kind !== "audit" && (
                  <section className="flex flex-col gap-4 break-inside-avoid">
                    <h3 className="font-heading text-base font-bold">
                      {CHART_TITLES[kind]}{kind !== "monthly" && lines.length > CHART_LIMIT && `, largest ${CHART_LIMIT}`}
                    </h3>
                    {kind === "monthly" ? (
                      <Columns caption="Amount by month" items={[...lines].reverse().map((l) => ({ label: l.label, value: l.amount }))} />
                    ) : (
                      <BarList caption={CHART_TITLES[kind]} items={lines.slice(0, CHART_LIMIT).map((l) => ({ label: l.label, value: l.amount }))} />
                    )}
                    {kind === "review" && <p className="text-sm text-muted-foreground">A voucher can fail more than one check, so these lines can add up to more than the total.</p>}
                  </section>
                )}

                <section className="flex flex-col gap-4">
                  <h3 className="font-heading text-base font-bold">{kind === "audit" ? "Vouchers" : "Details"}</h3>
                  {kind === "audit" ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {["DV #", "DV date", "Payee", "Particulars", "Area", "Check #", "Review"].map((h) => <TableHead key={h}>{h}</TableHead>)}
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scoped.map((r) => (
                          <TableRow key={r.sheet_row}>
                            <TableHead scope="row" className="font-medium">{r.dv_no}</TableHead>
                            <TableCell>{r.dv_date}</TableCell>
                            <TableCell>{r.payee}</TableCell>
                            <TableCell className="max-w-56 truncate">{r.particulars}</TableCell>
                            <TableCell>{r.trade_area}</TableCell>
                            <TableCell className="tabular-nums">{r.check_number}</TableCell>
                            <TableCell><IssueBadges issues={r.issues} /></TableCell>
                            <TableCell className="text-right tabular-nums">{peso(r.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableHead scope="row" colSpan={7}>Total · {scoped.length}</TableHead>
                          <TableCell className="text-right tabular-nums">{peso(totalAmt)}</TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{HEADINGS[kind]}</TableHead>
                          <TableHead className="text-right">Vouchers</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Share</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lines.map((l) => (
                          <TableRow key={l.label}>
                            <TableCell>{l.label}</TableCell>
                            <TableCell className="text-right tabular-nums">{l.count}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{peso(l.amount)}</TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">{fmtShare(l.amount, totalAmt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableHead scope="row">Total</TableHead>
                          <TableCell className="text-right tabular-nums">{scoped.length}</TableCell>
                          <TableCell className="text-right tabular-nums">{peso(totalAmt)}</TableCell>
                          <TableCell className="text-right tabular-nums">100%</TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  )}
                </section>

                {/* Sign-off block for the printed copy */}
                <section aria-label="Sign-off" className="mt-6 grid gap-8 text-sm break-inside-avoid sm:grid-cols-3">
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
              </>
            )}
          </CardContent>
          <CardFooter className="justify-between gap-2 text-xs text-muted-foreground">
            <span>Source: {pull.title || "Google Sheet"}</span>
            <span>Generated {generated}</span>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
