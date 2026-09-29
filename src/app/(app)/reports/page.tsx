import { DownloadIcon } from "lucide-react"
import type { Metadata } from "next"
import Form from "next/form"
import Image from "next/image"
import Link from "next/link"

import { AutoSubmitSelect } from "@/components/auto-submit"
import { BarList, Columns, Donut, StatusMark } from "@/components/charts"
import { PrintButton } from "@/components/print-button"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getData } from "@/lib/data"
import { BUCKETS, group, label, monthLabel, months, peso, qs, STATE_LABELS, toParams, total, values } from "@/lib/ledger"
import { buildReport, REPORTS, type Kind } from "@/lib/reports"
import { fullName } from "@/lib/session"

export const metadata: Metadata = { title: "Reports" }

const fmtShare = (v: number, of: number) => `${of ? ((100 * v) / of).toFixed(1) : "0.0"}%`

/** Late buckets are overdue money, so they take the overdue hue; everything else stays navy. */
const AGING_COLORS: Record<string, string> = { [BUCKETS.late30]: "var(--chart-overdue)", [BUCKETS.late]: "var(--chart-overdue)" }

const CHART_TITLES: Record<Exclude<Kind, "audit">, string> = {
  summary: "Share by status", aging: "Unpaid amount by age", area: "Amount by trade area", category: "Amount by category", monthly: "Amount by month",
}

const HEADINGS: Partial<Record<Kind, string>> = { summary: "Status", aging: "Age", monthly: "Month", category: "Category", area: "Trade area" }

export default async function Reports({ searchParams }: PageProps<"/reports">) {
  const params = toParams(await searchParams)
  const { rows, pull, user } = await getData()
  const { kind, month, area, state, scoped, lines } = buildReport(rows, params)
  const byArea = group(scoped, (r) => label(r, "trade_area"))
  const totalAmt = total(scoped)
  const paid = scoped.filter((r) => r.state === "paid"), overdue = scoped.filter((r) => r.state === "overdue")
  const paidAmt = total(paid), overdueAmt = total(overdue), paidN = paid.length, overdueN = overdue.length
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
          <span>and</span>
          {word("status", "Status", state, [["", "All statuses"], ...Object.entries(STATE_LABELS)])}
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
                {[monthLabel(month), area || "All trade areas", STATE_LABELS[state as keyof typeof STATE_LABELS] ?? "All statuses"].join(" · ")}
              </p>
            </header>

            {!scoped.length ? (
              <p className="py-8 text-center text-muted-foreground">No vouchers match these choices. Widen the month, trade area, or status above.</p>
            ) : (
              <>
                {/* Totals as a ledger strip, not cards: hairline columns, figures right where the eye lands. */}
                <dl aria-label="Totals" className="grid grid-cols-2 border-y break-inside-avoid sm:grid-cols-4 sm:divide-x">
                  {([["Total", totalAmt, scoped.length, null], ["Paid", paidAmt, paidN, "paid"],
                    ["Outstanding", totalAmt - paidAmt, scoped.length - paidN, null], ["Overdue", overdueAmt, overdueN, "overdue"]] as const).map(([k, v, n, mark]) => (
                    <div key={k} className="flex flex-col gap-0.5 px-4 py-3 first:pl-0 sm:first:pl-4">
                      <dt className="flex items-center gap-2 text-xs text-muted-foreground">{mark && <StatusMark state={mark} />}{k}</dt>
                      <dd className={`text-lg font-bold tabular-nums ${k === "Overdue" && v ? "text-destructive" : ""}`}>{peso(v)}</dd>
                      <dd className="text-xs text-muted-foreground tabular-nums">{n} voucher{n === 1 ? "" : "s"}</dd>
                    </div>
                  ))}
                </dl>

                {kind !== "audit" && (
                  <section className="flex flex-col gap-4 break-inside-avoid">
                    <h3 className="font-heading text-base font-bold">{CHART_TITLES[kind]}</h3>
                    {kind === "summary" ? (
                      <Donut caption="Amount by status" slices={lines.map((l) => ({ label: l.label, value: l.amount, color: `var(--chart-${l.state})`, mark: l.state || undefined }))} />
                    ) : kind === "monthly" ? (
                      <Columns caption="Amount by month" items={[...lines].reverse().map((l) => ({ label: l.label, value: l.amount }))} />
                    ) : (
                      <BarList caption={CHART_TITLES[kind]} items={lines.map((l) => ({ label: l.label, value: l.amount, color: kind === "aging" ? AGING_COLORS[l.label] : undefined }))} />
                    )}
                  </section>
                )}
                {kind === "summary" && byArea.length > 0 && (
                  <section className="flex flex-col gap-4 break-inside-avoid">
                    <h3 className="font-heading text-base font-bold">By trade area</h3>
                    <BarList caption="Amount by trade area" items={byArea.map(([name, , amt]) => ({ label: name, value: amt }))} />
                  </section>
                )}

                <section className="flex flex-col gap-4">
                  <h3 className="font-heading text-base font-bold">{kind === "audit" ? "Vouchers" : "Details"}</h3>
                  {kind === "audit" ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {["DV #", "DV date", "Due", "Payee", "Particulars", "Area", "Status"].map((h) => <TableHead key={h}>{h}</TableHead>)}
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scoped.map((r) => (
                          <TableRow key={r.sheet_row}>
                            <TableHead scope="row" className="font-medium">{r.dv_no}</TableHead>
                            <TableCell>{r.dv_date}</TableCell>
                            <TableCell>{r.due_date}</TableCell>
                            <TableCell>{r.payee}</TableCell>
                            <TableCell className="max-w-56 truncate">{r.particulars}</TableCell>
                            <TableCell>{r.trade_area}</TableCell>
                            <TableCell><StatusBadge state={r.state} /></TableCell>
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
                            <TableCell>{l.state ? <StatusBadge state={l.state}>{l.label}</StatusBadge> : l.label}</TableCell>
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
