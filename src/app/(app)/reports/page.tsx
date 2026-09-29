import { DownloadIcon } from "lucide-react"
import type { Metadata } from "next"
import Form from "next/form"
import Link from "next/link"

import { AutoSubmitSelect } from "@/components/auto-submit"
import { Bar } from "@/components/bar"
import { PrintButton } from "@/components/print-button"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getData } from "@/lib/data"
import { group, label, monthLabel, months, peso, qs, STATE_LABELS, toParams, total, values } from "@/lib/ledger"
import { buildReport, REPORTS, type Kind } from "@/lib/reports"

export const metadata: Metadata = { title: "Reports" }

const HEADINGS: Partial<Record<Kind, string>> = { summary: "Status", aging: "Age", monthly: "Month", category: "Category", area: "Trade area" }

export default async function Reports({ searchParams }: PageProps<"/reports">) {
  const params = toParams(await searchParams)
  const { rows, pull } = await getData()
  const { kind, month, area, state, scoped, lines } = buildReport(rows, params)
  const byArea = group(scoped, (r) => label(r, "trade_area"))
  const top = byArea[0]?.[2] || 1
  const subtitle = [
    monthLabel(month), area || "all trade areas", (STATE_LABELS[state as keyof typeof STATE_LABELS] ?? "all statuses").toLowerCase(),
    `${scoped.length} voucher${scoped.length === 1 ? "" : "s"}`,
  ].join(" · ")
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

        <Card className="print:border-0 print:shadow-none">
          <CardHeader>
            <CardTitle className="text-lg">{REPORTS[kind]}</CardTitle>
            <CardDescription>{subtitle}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!scoped.length ? (
              <p className="text-muted-foreground">No vouchers match these choices.</p>
            ) : kind === "audit" ? (
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
                    <TableCell className="text-right tabular-nums">{peso(total(scoped))}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{HEADINGS[kind]}</TableHead>
                      <TableHead className="text-right">Vouchers</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l) => (
                      <TableRow key={l.label}>
                        <TableCell>{l.state ? <StatusBadge state={l.state}>{l.label}</StatusBadge> : l.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.count}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{peso(l.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableHead scope="row">Total</TableHead>
                      <TableCell className="text-right tabular-nums">{scoped.length}</TableCell>
                      <TableCell className="text-right tabular-nums">{peso(total(scoped))}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>

                {kind === "summary" && byArea.length > 0 && (
                  <section className="flex flex-col gap-2">
                    <h3 className="font-medium">By trade area</h3>
                    <ul className="flex flex-col gap-2 text-sm">
                      {byArea.map(([name, , amt]) => (
                        <li key={name} className="grid grid-cols-[8rem_1fr_8rem] items-center gap-2">
                          <span className="truncate">{name}</span>
                          <Bar pct={(100 * amt) / top} />
                          <span className="text-right tabular-nums">{peso(amt)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </CardContent>
          <CardFooter className="text-sm text-muted-foreground">
            Generated {generated} from {pull.title || "Google Sheet"}
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
