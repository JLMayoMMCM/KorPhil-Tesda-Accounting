import { ArrowRightIcon, CheckCheckIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { Bar } from "@/components/bar"
import { CollapsedBody, PayButton, RowCheck, Selection } from "@/components/selection"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { clock, getData } from "@/lib/data"
import { dayDate, group, label, longMonth, peso, total, type Bucket, type Voucher } from "@/lib/ledger"

export const metadata: Metadata = { title: "Workspace" }

const GROUPS: [string, Bucket[]][] = [
  ["Overdue", ["late", "late30"]], ["Due today", ["today"]], ["Due this week", ["week"]], ["Later", ["later"]],
]

export default async function Workspace() {
  const { rows, error, today, pull } = await getData()
  const unpaid = rows.filter((r) => r.state !== "paid")
  const groups = GROUPS.map(([name, keys]) => ({ name, rows: unpaid.filter((r) => keys.includes(r.bucket)) })).filter((g) => g.rows.length)
  const overdue = unpaid.filter((r) => r.state === "overdue")
  const pending = unpaid.filter((r) => r.state === "pending")
  const paidMonth = rows.filter((r) => r.state === "paid" && r.month === today.slice(0, 7))
  const byArea = group(unpaid, (r) => label(r, "trade_area"))
  const top = byArea[0]?.[2] || 1

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[1fr_22rem]">
      <section className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="font-heading text-base font-semibold">Needs action</h2>
          <span className="text-sm text-muted-foreground">{unpaid.length} unpaid · {peso(total(unpaid))}</span>
          <span className="ml-auto text-sm text-muted-foreground">Sorted by due date</span>
        </div>

        {groups.length ? (
          <Selection items={unpaid.map(({ sheet_row, dv_no, amount }) => ({ sheet_row, dv_no, amount }))}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"><span className="sr-only">Select</span></TableHead>
                  <TableHead>DV #</TableHead>
                  <TableHead>Payee · particulars</TableHead>
                  <TableHead className="hidden md:table-cell">Area</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead><span className="sr-only">Action</span></TableHead>
                </TableRow>
              </TableHeader>
              {groups.map((g) => {
                const header = (
                  <>
                    <span>{g.name}</span>
                    <span className="font-normal text-muted-foreground">{g.rows.length} · {peso(total(g.rows))}</span>
                  </>
                )
                const body = g.rows.map((r) => <NeedsRow key={r.sheet_row} r={r} />)
                return g.name === "Later" ? (
                  <CollapsedBody key={g.name} header={header} count={g.rows.length}>{body}</CollapsedBody>
                ) : (
                  <TableBody key={g.name}>
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
          </Selection>
        ) : !error && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><CheckCheckIcon /></EmptyMedia>
              <EmptyTitle>Nothing unpaid.</EmptyTitle>
              <EmptyDescription>Every voucher in the sheet is marked paid.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" render={<Link href="/vouchers/?new=1" />} nativeButton={false}>Add a DV</Button>
            </EmptyContent>
          </Empty>
        )}
      </section>

      <aside className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Open balance</CardTitle>
            {pull.at && <CardAction className="text-sm text-muted-foreground">as of {clock(pull.at)}</CardAction>}
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {([
                  ["overdue", "Overdue", overdue],
                  ["pending", "Pending", pending],
                  ["paid", `Paid, dated ${longMonth(today)}`, paidMonth],
                ] as const).map(([state, name, list]) => (
                  <TableRow key={state}>
                    <TableHead scope="row" className="font-normal"><StatusBadge state={state}>{name}</StatusBadge></TableHead>
                    <TableCell className="text-right text-muted-foreground tabular-nums">{list.length}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{peso(total(list))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableHead scope="row">Unpaid total</TableHead>
                  <TableCell className="text-right text-muted-foreground tabular-nums">{unpaid.length}</TableCell>
                  <TableCell className="text-right tabular-nums">{peso(total(unpaid))}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        {byArea.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Unpaid by trade area</CardTitle></CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-sm">
                {byArea.map(([name, , amt]) => (
                  <li key={name} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2">
                    <Link className="truncate hover:underline" href={`/vouchers/?tab=unpaid&area=${encodeURIComponent(name)}`}>{name}</Link>
                    <Bar pct={(100 * amt) / top} />
                    <span className="text-right tabular-nums">{peso(amt)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Button variant="link" className="self-start" render={<Link href="/reports/" />} nativeButton={false}>
          Open full report for this view<ArrowRightIcon data-icon="inline-end" />
        </Button>
      </aside>
    </div>
  )
}

function NeedsRow({ r }: { r: Voucher }) {
  return (
    <TableRow>
      <TableCell><RowCheck row={r.sheet_row} label={r.dv_no} /></TableCell>
      <TableCell className="font-medium">
        <Link className="hover:underline" href={`/vouchers/?open=${r.sheet_row}`}>{r.dv_no || "Untitled DV"}</Link>
      </TableCell>
      <TableCell className="max-w-72 truncate">{r.payee} <span className="text-muted-foreground">— {r.particulars}</span></TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">{r.trade_area || "—"}</TableCell>
      <TableCell>
        <StatusBadge state={r.state}>
          {r.days_late ? `${r.days_late} day${r.days_late === 1 ? "" : "s"} late`
            : r.bucket === "today" ? "Today" : r.due ? dayDate(r.due) : "No due date"}
        </StatusBadge>
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">{peso(r.amount)}</TableCell>
      <TableCell className="text-right">
        <PayButton item={{ sheet_row: r.sheet_row, dv_no: r.dv_no, amount: r.amount }} />
      </TableCell>
    </TableRow>
  )
}
