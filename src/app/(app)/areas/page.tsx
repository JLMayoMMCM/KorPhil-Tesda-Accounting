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
import { BUCKETS, label, monthLabel, months, peso, qs, toParams, total, values, type Bucket, type Field as FieldName } from "@/lib/ledger"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Trade Areas" }

const COLUMNS: [Bucket, Bucket[]][] = [["later", ["later"]], ["week", ["today", "week"]], ["late", ["late"]], ["late30", ["late30"]], ["paid", ["paid"]]]
const HEAT = ["", "bg-destructive/10", "bg-destructive/20", "bg-destructive/30"]
const dvs = (n: number) => `${n} DV${n === 1 ? "" : "s"}`

export default async function Areas({ searchParams }: PageProps<"/areas">) {
  const params = toParams(await searchParams)
  const { rows, error } = await getData()
  const period = params.get("period") ?? ""
  const byCount = params.get("by") === "count"
  const scoped = rows.filter((r) => !period || r.month === period)
  const unpaidAll = scoped.filter((r) => r.state !== "paid")
  const areas = values(scoped, "trade_area")
  const inArea = (a: string) => scoped.filter((r) => label(r, "trade_area") === a)

  const lateMax = Math.max(0, ...areas.flatMap((a) => (["late", "late30"] as const).map((b) => total(inArea(a).filter((r) => r.bucket === b))))) || 1
  const matrix = areas.map((area) => {
    const mine = inArea(area)
    const cells = COLUMNS.map(([key, buckets]) => {
      const hit = mine.filter((r) => buckets.includes(r.bucket))
      return {
        key, count: hit.length, amount: total(hit),
        heat: (key === "late" || key === "late30") && hit.length ? Math.min(3, Math.ceil((3 * total(hit)) / lateMax)) : 0,
        url: "/vouchers/" + qs(new URLSearchParams(), { area, bucket: key, month: period }),
      }
    })
    const unpaid = mine.filter((r) => r.state !== "paid")
    const share = total(unpaidAll) ? (100 * total(unpaid)) / total(unpaidAll) : 0
    return { area, cells, unpaid: total(unpaid), unpaidCount: unpaid.length, share, shareLabel: share > 0 && share < 1 ? "<1" : String(Math.round(share)) }
  })
  const totals = COLUMNS.map((_, i) => ({
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
                {COLUMNS.map(([key]) => <TableHead key={key} className="text-right">{BUCKETS[key]}</TableHead>)}
                <TableHead className="text-right">Unpaid total</TableHead>
                <TableHead className="w-40">Share of unpaid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrix.map((m) => (
                <TableRow key={m.area}>
                  <TableHead scope="row" className="font-medium">{m.area}</TableHead>
                  {m.cells.map((c) => (
                    <TableCell key={c.key} className="p-1 text-right">
                      {c.count ? (
                        <Link href={c.url} className={cn("flex flex-col items-end rounded-md px-2 py-1 tabular-nums hover:bg-muted", HEAT[c.heat])}
                          aria-label={`Open ${dvs(c.count)}: ${m.area}, ${BUCKETS[c.key]}`}>
                          {pair(c.count, c.amount)}
                        </Link>
                      ) : <span className="px-2 text-muted-foreground" aria-label="none">—</span>}
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    {m.unpaidCount ? <span className="flex flex-col items-end tabular-nums">{pair(m.unpaidCount, m.unpaid)}</span>
                      : <span className="text-muted-foreground">—</span>}
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
                <TableCell className="text-right tabular-nums">{byCount ? unpaidAll.length : peso(total(unpaidAll))}</TableCell>
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
