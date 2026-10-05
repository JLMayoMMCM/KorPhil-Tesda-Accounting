import { MapIcon } from "lucide-react"
import type { Metadata } from "next"
import Form from "next/form"
import Link from "next/link"

import { AutoSubmitSelect } from "@/components/auto-submit"
import { Bar } from "@/components/bar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getData } from "@/lib/data"
import { label, monthLabel, months, peso, qs, toParams, total, values, type Field as FieldName } from "@/lib/ledger"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Trade Areas" }

const dvs = (n: number) => `${n} DV${n === 1 ? "" : "s"}`

export default async function Areas({ searchParams }: PageProps<"/areas">) {
  const params = toParams(await searchParams)
  const { rows, error } = await getData()
  const period = params.get("period") ?? ""
  const byCount = params.get("by") === "count"
  const scoped = rows.filter((r) => !period || r.month === period)
  const areas = values(scoped, "trade_area")
  const inArea = (a: string) => scoped.filter((r) => label(r, "trade_area") === a)
  // One column per DV month, oldest first; "" collects rows with no readable DV date.
  const columns = [...months(scoped).reverse(), ...(scoped.some((r) => !r.month) ? [""] : [])]
  const colName = (m: string) => (m ? monthLabel(m) : "No DV date")

  const matrix = areas.map((area) => {
    const mine = inArea(area)
    const cells = columns.map((key) => {
      const hit = mine.filter((r) => r.month === key)
      return {
        key, count: hit.length, amount: total(hit),
        url: "/vouchers/" + qs(new URLSearchParams(), key ? { area, month: key } : { area, issue: "no_date" }),
      }
    })
    const share = total(scoped) ? (100 * total(mine)) / total(scoped) : 0
    return { area, cells, sum: total(mine), count: mine.length, share, shareLabel: share > 0 && share < 1 ? "<1" : String(Math.round(share)) }
  })
  const totals = columns.map((_, i) => ({
    count: matrix.reduce((a, m) => a + m.cells[i].count, 0),
    amount: matrix.reduce((a, m) => a + m.cells[i].amount, 0),
  }))
  const pair = (count: number, amount: number) => byCount
    ? <><strong className="font-medium">{count}</strong><small className="text-muted-foreground">{peso(amount)}</small></>
    : <><strong className="font-medium">{peso(amount)}</strong><small className="text-muted-foreground">{dvs(count)}</small></>

  const split = (field: FieldName) => {
    const cols = values(scoped, field)
    return { cols, rows: areas.map((a) => ({ area: a, amounts: cols.map((c) => total(inArea(a).filter((r) => label(r, field) === c))) })) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Form action="/areas/">
          {byCount && <input type="hidden" name="by" value="count" />}
          <Field orientation="horizontal">
            <FieldLabel htmlFor="period">Period</FieldLabel>
            <AutoSubmitSelect id="period" name="period" defaultValue={period}>
              <NativeSelectOption value="">All time</NativeSelectOption>
              {months(rows).map((m) => <NativeSelectOption key={m} value={m}>{monthLabel(m)}</NativeSelectOption>)}
            </AutoSubmitSelect>
          </Field>
        </Form>
        <div role="group" aria-label="Show" className="inline-flex rounded-lg border p-0.5">
          <Button size="sm" variant={byCount ? "ghost" : "secondary"} aria-current={!byCount || undefined}
            render={<Link href={"/areas/" + qs(params, { by: null })} />} nativeButton={false}>Amount</Button>
          <Button size="sm" variant={byCount ? "secondary" : "ghost"} aria-current={byCount || undefined}
            render={<Link href={"/areas/" + qs(params, { by: "count" })} />} nativeButton={false}>Count</Button>
        </div>
        <span className="ml-auto text-sm text-muted-foreground">Click any number to open those vouchers</span>
      </div>

      {matrix.length ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Area</TableHead>
                {columns.map((key) => <TableHead key={key} className="text-right">{colName(key)}</TableHead>)}
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-40">Share of total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrix.map((m) => (
                <TableRow key={m.area}>
                  <TableHead scope="row" className="font-medium">{m.area}</TableHead>
                  {m.cells.map((c) => (
                    <TableCell key={c.key} className="p-1 text-right">
                      {c.count ? (
                        <Link href={c.url} className="flex flex-col items-end rounded-md px-2 py-1 tabular-nums hover:bg-muted"
                          aria-label={`Open ${dvs(c.count)}: ${m.area}, ${colName(c.key)}`}>
                          {pair(c.count, c.amount)}
                        </Link>
                      ) : <span className="px-2 text-muted-foreground" aria-label="none">—</span>}
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <span className="flex flex-col items-end tabular-nums">{pair(m.count, m.sum)}</span>
                  </TableCell>
                  <TableCell>
                    <span className="grid grid-cols-[1fr_3rem] items-center gap-2">
                      <Bar pct={m.share} />
                      <span className="text-right text-muted-foreground tabular-nums">{m.shareLabel}%</span>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableHead scope="row">All areas</TableHead>
                {totals.map((t, i) => <TableCell key={i} className="text-right tabular-nums">{byCount ? t.count : peso(t.amount)}</TableCell>)}
                <TableCell className="text-right tabular-nums">{byCount ? scoped.length : peso(total(scoped))}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>

          <div className="grid gap-4 xl:grid-cols-2">
            {([["Program split", split("diploma_st_assessment")], ["Category split", split("category")]] as const).map(([title, s]) => (
              <Card key={title}>
                <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Area</TableHead>
                        {s.cols.map((c) => <TableHead key={c} className="text-right">{c}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {s.rows.map((r) => (
                        <TableRow key={r.area}>
                          <TableHead scope="row" className="font-medium">{r.area}</TableHead>
                          {r.amounts.map((a, i) => (
                            <TableCell key={s.cols[i]} className={cn("text-right tabular-nums", !a && "text-muted-foreground")}>{a ? peso(a) : "—"}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : !error && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><MapIcon /></EmptyMedia>
            <EmptyTitle>No vouchers in this period.</EmptyTitle>
            <EmptyDescription>Pick another period.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}
