import { ListFilterIcon, SearchXIcon, XIcon } from "lucide-react"
import type { Metadata } from "next"
import Form from "next/form"
import Link from "next/link"

import { LinkRow, PayButton, RowCheck, SelectAll, Selection } from "@/components/selection"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { VoucherPanel } from "@/components/voucher-panel"
import { clock, getData } from "@/lib/data"
import {
  BUCKETS, FIELDS, filterRows, inTab, monthLabel, months, NOT_SET, parseDate, peso, qs, shortDate, TABS, toParams, total,
  values, type Bucket, type Field as FieldName, type Tab, type Voucher,
} from "@/lib/ledger"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Vouchers" }

/** Panel form values: sheet values, with parseable dates as ISO for the date pickers. */
function formFromRow(r: Voucher | null): Record<FieldName, string> {
  const form = Object.fromEntries(FIELDS.map((f) => [f, r ? r[f] : ""])) as Record<FieldName, string>
  if (!r) form.status = "PENDING"
  for (const f of ["dv_date", "due_date"] as const) form[f] = parseDate(form[f]) ?? form[f]
  return form
}

const plural = (n: number) => (n === 1 ? "" : "s")

export default async function Vouchers({ searchParams }: PageProps<"/vouchers">) {
  const params = toParams(await searchParams)
  const { rows, error, pull } = await getData()
  const shown = filterRows(rows, params)
  const tab = (params.get("tab") ?? "") in TABS ? (params.get("tab") as Tab) : "all"

  const panelRow = rows.find((r) => String(r.sheet_row) === params.get("open")) ?? null
  const isNew = !panelRow && params.has("new")
  const panel = !!panelRow || isNew
  const closeUrl = "/vouchers/" + qs(params, { open: null, new: null })

  const chips: [string, string][] = []
  const area = params.get("area"), month = params.get("month"), bucket = params.get("bucket"), q = params.get("q")
  if (area) chips.push([`Area is ${area}`, qs(params, { area: null, open: null })])
  if (month) chips.push([`DV date in ${monthLabel(month)}`, qs(params, { month: null, open: null })])
  if (bucket && bucket in BUCKETS) chips.push([BUCKETS[bucket as Bucket], qs(params, { bucket: null, open: null })])
  if (q) chips.push([`Matches “${q}”`, qs(params, { q: null, open: null })])
  const clearUrl = qs(params, { area: null, month: null, bucket: null, q: null, open: null })
  const filterCount = [area, month, bucket].filter(Boolean).length
  const wide = cn(panel && "hidden") // secondary columns hide while the panel is open

  return (
    <div className={cn("grid items-start gap-4", panel && "lg:grid-cols-[minmax(0,1fr)_26rem]")}>
      <section className="flex min-w-0 flex-col gap-3">
        <nav aria-label="Voucher views" className="flex flex-wrap items-center gap-1 border-b pb-2">
          {(Object.entries(TABS) as [Tab, string][]).map(([key, name]) => (
            <Button key={key} size="sm" variant={key === tab ? "secondary" : "ghost"} aria-current={key === tab ? "page" : undefined}
              render={<Link href={"/vouchers/" + qs(params, { tab: key, open: null, new: null })} />} nativeButton={false}>
              {name}<span className="text-muted-foreground tabular-nums">{rows.filter((r) => inTab(r, key)).length}</span>
            </Button>
          ))}
          {!panel && (
            <Popover>
              <PopoverTrigger render={<Button variant="outline" size="sm" className="ml-auto" />}>
                <ListFilterIcon data-icon="inline-start" />Filter{filterCount ? ` · ${filterCount}` : ""}
              </PopoverTrigger>
              <PopoverContent align="end">
                <Form action="/vouchers/">
                  <input type="hidden" name="tab" value={tab} />
                  {q && <input type="hidden" name="q" value={q} />}
                  {bucket && <input type="hidden" name="bucket" value={bucket} />}
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="f-area">Trade area</FieldLabel>
                      <NativeSelect id="f-area" name="area" defaultValue={area ?? ""} className="w-full">
                        <NativeSelectOption value="">Any area</NativeSelectOption>
                        {values(rows, "trade_area").map((a) => <NativeSelectOption key={a} value={a}>{a}</NativeSelectOption>)}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="f-month">DV date</FieldLabel>
                      <NativeSelect id="f-month" name="month" defaultValue={month ?? ""} className="w-full">
                        <NativeSelectOption value="">Any month</NativeSelectOption>
                        {months(rows).map((m) => <NativeSelectOption key={m} value={m}>{monthLabel(m)}</NativeSelectOption>)}
                      </NativeSelect>
                    </Field>
                    <Button type="submit">Apply</Button>
                  </FieldGroup>
                </Form>
              </PopoverContent>
            </Popover>
          )}
        </nav>

        {(chips.length > 0 || !panel) && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {chips.map(([text, url]) => (
              <Badge key={text} variant="secondary" render={<Link href={"/vouchers/" + url} aria-label={`Remove filter: ${text}`} />}>
                {text}<XIcon data-icon="inline-end" />
              </Badge>
            ))}
            {chips.length > 0 && <Link className="text-muted-foreground underline-offset-4 hover:underline" href={"/vouchers/" + clearUrl}>Clear filters</Link>}
            <span className="ml-auto font-medium tabular-nums">{shown.length} shown · {peso(total(shown))}</span>
          </div>
        )}

        {shown.length ? (
          <Selection items={shown.filter((r) => r.state !== "paid").map(({ sheet_row, dv_no, amount }) => ({ sheet_row, dv_no, amount }))}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={cn("w-8", wide)}><SelectAll /></TableHead>
                  <TableHead>DV #</TableHead>
                  <TableHead className={wide}>DV date</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Payee</TableHead>
                  <TableHead className={wide}>Particulars</TableHead>
                  <TableHead className={wide}>Area</TableHead>
                  <TableHead className={wide}>Program</TableHead>
                  <TableHead className={wide}>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className={wide}><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((r) => {
                  const openUrl = "/vouchers/" + qs(params, { open: String(r.sheet_row), new: null })
                  return (
                    <LinkRow key={r.sheet_row} href={openUrl} data-state={panelRow?.sheet_row === r.sheet_row ? "selected" : undefined}>
                      <TableCell className={wide}>{r.state !== "paid" && <RowCheck row={r.sheet_row} label={r.dv_no} />}</TableCell>
                      <TableCell className="font-medium"><Link className="hover:underline" href={openUrl} scroll={false}>{r.dv_no || "Untitled DV"}</Link></TableCell>
                      <TableCell className={cn("text-muted-foreground", wide)}>{r.dv ? shortDate(r.dv) : r.dv_date}</TableCell>
                      <TableCell>
                        {r.days_late ? <strong className="text-destructive">{r.days_late}d late</strong>
                          : r.bucket === "today" ? "Today" : r.due ? shortDate(r.due) : r.due_date}
                      </TableCell>
                      <TableCell className="max-w-40 truncate">{r.payee}</TableCell>
                      <TableCell className={cn("max-w-56 truncate text-muted-foreground", wide)}>{r.particulars}</TableCell>
                      <TableCell className={wide}>{r.trade_area || "—"}</TableCell>
                      <TableCell className={wide}>{r.diploma_st_assessment || "—"}</TableCell>
                      <TableCell className={wide}>{r.category || "—"}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{peso(r.amount)}</TableCell>
                      <TableCell><StatusBadge state={r.state} /></TableCell>
                      <TableCell className={cn("text-right", wide)}>
                        {r.state !== "paid" && <PayButton item={{ sheet_row: r.sheet_row, dv_no: r.dv_no, amount: r.amount }} />}
                      </TableCell>
                    </LinkRow>
                  )
                })}
              </TableBody>
              {!panel && (
                <TableFooter>
                  <TableRow>
                    <TableHead scope="row" colSpan={9}>Total · {shown.length} voucher{plural(shown.length)}</TableHead>
                    <TableCell className="text-right tabular-nums">{peso(total(shown))}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </Selection>
        ) : !error && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><SearchXIcon /></EmptyMedia>
              <EmptyTitle>No vouchers match.</EmptyTitle>
              <EmptyDescription>Try another tab or clear the filters.</EmptyDescription>
            </EmptyHeader>
            {chips.length > 0 && (
              <EmptyContent>
                <Button variant="outline" render={<Link href={"/vouchers/" + clearUrl} />} nativeButton={false}>Clear filters</Button>
              </EmptyContent>
            )}
          </Empty>
        )}
        {!panel && shown.length > 0 && <p className="text-sm text-muted-foreground">Click a row to open it in the side panel.</p>}
      </section>

      {panel && (
        <VoucherPanel
          key={panelRow ? `${panelRow.sheet_row}:${FIELDS.map((f) => panelRow[f]).join("|")}` : "new"}
          row={panelRow?.sheet_row ?? null}
          initial={formFromRow(panelRow)}
          heading={isNew ? "New voucher" : panelRow!.dv_no || "Untitled DV"}
          status={panelRow ? (
            <StatusBadge state={panelRow.state}>
              {[
                panelRow.state.charAt(0).toUpperCase() + panelRow.state.slice(1),
                panelRow.days_late ? `${panelRow.days_late} day${plural(panelRow.days_late)} late` : "",
                panelRow.due ? `due ${shortDate(panelRow.due)}` : "",
              ].filter(Boolean).join(" · ")}
            </StatusBadge>
          ) : "Adds a new row at the bottom of the sheet."}
          payable={panelRow && panelRow.state !== "paid" ? { sheet_row: panelRow.sheet_row, dv_no: panelRow.dv_no, amount: panelRow.amount } : null}
          source={panelRow ? `Source: ${pull.title || "Google Sheet"} · row ${panelRow.sheet_row} · pulled ${clock(pull.at)}` : ""}
          options={{
            trade_area: values(rows, "trade_area").filter((v) => v !== NOT_SET),
            diploma_st_assessment: values(rows, "diploma_st_assessment").filter((v) => v !== NOT_SET),
            category: values(rows, "category").filter((v) => v !== NOT_SET),
          }}
          closeUrl={closeUrl}
        />
      )}
    </div>
  )
}
