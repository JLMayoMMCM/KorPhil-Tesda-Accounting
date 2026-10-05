import { ArrowRightIcon, CheckCheckIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { Bar } from "@/components/bar"
import { CollapsedBody } from "@/components/selection"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle, EmptyMedia } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { clock, getData } from "@/lib/data"
import { byIssue, group, ISSUES, label, longMonth, monthsBack, peso, shortDate, total, type Voucher } from "@/lib/ledger"

export const metadata: Metadata = { title: "Workspace" }

/** Groups longer than this start collapsed. */
const OPEN_LIMIT = 10

export default async function Workspace() {
  const { rows, error, today, pull } = await getData()
  const flagged = rows.filter((r) => r.issues.length)
  const groups = byIssue(rows)
  const thisMonth = today.slice(0, 7), lastMonth = monthsBack(thisMonth, 1)
  const periods: [string, Voucher[]][] = [
    [longMonth(today), rows.filter((r) => r.month === thisMonth)],
    [longMonth(lastMonth + "-01"), rows.filter((r) => r.month === lastMonth)],
  ]
  const byArea = group(rows, (r) => label(r, "trade_area"))
  const top = byArea[0]?.[2] || 1

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[1fr_22rem]">
      <section className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="font-heading text-base font-semibold">Needs review</h2>
          <span className="text-sm text-muted-foreground">{flagged.length} of {rows.length} vouchers · {peso(total(flagged))}</span>
          <span className="ml-auto text-sm text-muted-foreground">Newest first · a voucher can appear under more than one check</span>
        </div>

        {groups.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>DV #</TableHead>
                <TableHead>DV date</TableHead>
                <TableHead>Payee · particulars</TableHead>
                <TableHead className="hidden md:table-cell">Area</TableHead>
                <TableHead className="hidden md:table-cell">Check #</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead><span className="sr-only">Action</span></TableHead>
              </TableRow>
            </TableHeader>
            {groups.map(([issue, list]) => {
              const header = (
                <>
                  <span>{ISSUES[issue]}</span>
                  <span className="font-normal text-muted-foreground">{list.length} · {peso(total(list))}</span>
                  <Link className="font-normal text-muted-foreground underline-offset-4 hover:underline" href={`/vouchers/?issue=${issue}`}>Open in Vouchers</Link>
                </>
              )
              const body = list.map((r) => <ReviewRow key={r.sheet_row} r={r} />)
              return list.length > OPEN_LIMIT ? (
                <CollapsedBody key={issue} header={header} count={list.length}>{body}</CollapsedBody>
              ) : (
                <TableBody key={issue}>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <th colSpan={7} scope="rowgroup" className="px-2 py-2 text-left font-medium">
                      <div className="flex items-center gap-2">{header}</div>
                    </th>
                  </TableRow>
                  {body}
                </TableBody>
              )
            })}
          </Table>
        ) : !error && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><CheckCheckIcon /></EmptyMedia>
              <EmptyTitle>Nothing to review.</EmptyTitle>
              <EmptyDescription>Every voucher has a unique DV #, a DV date, an amount, a check # and a trade area.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>

      <aside className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Disbursed</CardTitle>
            {pull.at && <CardAction className="text-sm text-muted-foreground">as of {clock(pull.at)}</CardAction>}
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {periods.map(([name, list]) => (
                  <TableRow key={name}>
                    <TableHead scope="row" className="font-normal">Dated {name}</TableHead>
                    <TableCell className="text-right text-muted-foreground tabular-nums">{list.length}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{peso(total(list))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableHead scope="row">All vouchers</TableHead>
                  <TableCell className="text-right text-muted-foreground tabular-nums">{rows.length}</TableCell>
                  <TableCell className="text-right tabular-nums">{peso(total(rows))}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        {byArea.length > 0 && (
          <Card>
            <CardHeader><CardTitle>By trade area</CardTitle></CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-sm">
                {byArea.map(([name, , amt]) => (
                  <li key={name} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2">
                    <Link className="truncate hover:underline" href={`/vouchers/?area=${encodeURIComponent(name)}`}>{name}</Link>
                    <Bar pct={(100 * amt) / top} />
                    <span className="text-right tabular-nums">{peso(amt)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Button variant="link" className="self-start" render={<Link href="/reports/?report=audit" />} nativeButton={false}>
          Open the audit extract<ArrowRightIcon data-icon="inline-end" />
        </Button>
      </aside>
    </div>
  )
}

function ReviewRow({ r }: { r: Voucher }) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link className="hover:underline" href={`/vouchers/?open=${r.sheet_row}`}>{r.dv_no || "Untitled DV"}</Link>
      </TableCell>
      <TableCell className="text-muted-foreground">{r.dv ? shortDate(r.dv) : r.dv_date || "—"}</TableCell>
      <TableCell className="max-w-72 truncate">{r.payee} <span className="text-muted-foreground">— {r.particulars}</span></TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">{r.trade_area || "—"}</TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">{r.check_number || "—"}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{peso(r.amount)}</TableCell>
      <TableCell className="text-right">
        <Button variant="outline" size="sm" render={<Link href={`/vouchers/?open=${r.sheet_row}`} />} nativeButton={false}>Fix</Button>
      </TableCell>
    </TableRow>
  )
}
