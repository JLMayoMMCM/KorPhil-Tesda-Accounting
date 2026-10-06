import { ArrowRightIcon, CheckCheckIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { Columns } from "@/components/charts"
import { AreaDonutCard } from "@/components/dashboard-charts"
import { CollapsedBody } from "@/components/selection"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle, EmptyMedia } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { clock, getData } from "@/lib/data"
import { byIssue, group, ISSUES, label, monthLabel, monthsBack, peso, shortDate, total, type Voucher } from "@/lib/ledger"

export const metadata: Metadata = { title: "Workspace" }

/** Groups longer than this start collapsed. */
const OPEN_LIMIT = 10

export default async function Workspace() {
  const { rows, error, today, pull } = await getData()
  const flagged = rows.filter((r) => r.issues.length)
  const groups = byIssue(rows)
  const recent = Array.from({ length: 6 }, (_, i) => monthsBack(today.slice(0, 7), 5 - i))
  const byArea = group(rows, (r) => label(r, "trade_area"))
  const sum = total(rows)

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
                <TableHead>DV # · date</TableHead>
                <TableHead className="w-full">Payee · particulars</TableHead>
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
                    <th colSpan={6} scope="rowgroup" className="px-2 py-2 text-left font-medium">
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
          <CardContent className="flex flex-col gap-4">
            <p className="flex flex-col">
              <span className="text-2xl font-bold tabular-nums">{peso(sum)}</span>
              <span className="text-sm text-muted-foreground">{rows.length} vouchers in all</span>
            </p>
            <Columns caption="Amount by DV month, last 6 months" items={recent.map((m) => ({
              label: monthLabel(m).slice(0, 3), value: total(rows.filter((r) => r.month === m)),
            }))} />
          </CardContent>
        </Card>

        {byArea.length > 0 && (
          <AreaDonutCard data={byArea.map(([name, , amt]) => ({ label: name, value: amt, href: `/vouchers/?area=${encodeURIComponent(name)}` }))} />
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
      <TableCell>
        <Link className="font-medium hover:underline" href={`/vouchers/?open=${r.sheet_row}`}>{r.dv_no || "Untitled DV"}</Link>
        <div className="text-xs text-muted-foreground">{r.dv ? shortDate(r.dv) : r.dv_date || "No date"}</div>
      </TableCell>
      <TableCell className="w-full max-w-0">
        <div className="truncate" title={r.payee}>{r.payee || "—"}</div>
        <div className="truncate text-xs text-muted-foreground" title={r.particulars}>{r.particulars || "—"}</div>
      </TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">{r.trade_area || "—"}</TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">{r.check_number || "—"}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{peso(r.amount)}</TableCell>
      <TableCell className="text-right">
        <Button variant="outline" size="sm" render={<Link href={`/vouchers/?open=${r.sheet_row}`} />} nativeButton={false}>Fix</Button>
      </TableCell>
    </TableRow>
  )
}
