import { BadgeCheckIcon, ListFilterIcon, SearchXIcon, XIcon } from "lucide-react"
import type { Metadata } from "next"
import Form from "next/form"
import Link from "next/link"

import { AutoSubmitSelect } from "@/components/auto-submit"
import { IssueBadges } from "@/components/issue-badges"
import { LinkRow, RowCheck, SelectAll, Selection } from "@/components/selection"
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
  FIELDS, filterRows, FOR_REVIEW, inTab, isVerified, ISSUES, monthLabel, VERIFIED, months, NOT_SET, parseDate, peso, qs, longDate, TABS, toParams, total,
  values, type Field as FieldName, type Issue, type Tab, type Voucher,
} from "@/lib/ledger"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Vouchers" }

/** Panel form values: sheet values, with parseable dates as ISO for the date pickers. */
function formFromRow(r: Voucher | null): Record<FieldName, string> {
  const form = Object.fromEntries(FIELDS.map((f) => [f, r ? r[f] : ""])) as Record<FieldName, string>
  form.dv_date = parseDate(form.dv_date) ?? form.dv_date
  form.status = r && isVerified(r) ? VERIFIED : FOR_REVIEW
  return form
}

const plural = (n: number) => (n === 1 ? "" : "s")

/** Rows per page, in menu order. */
const PER = { "10": "10", "50": "50", "100": "100", all: "All" } as const

export default async function Vouchers({ searchParams }: PageProps<"/vouchers">) {
  const params = toParams(await searchParams)
  const { rows, error, pull } = await getData()
  const shown = filterRows(rows, params)
  const tab = (params.get("tab") ?? "") in TABS ? (params.get("tab") as Tab) : "all"
  const per = (params.get("per") ?? "") in PER ? (params.get("per") as keyof typeof PER) : "50"
  const size = per === "all" ? Math.max(1, shown.length) : Number(per)
  const pages = Math.max(1, Math.ceil(shown.length / size))
  const page = Math.min(pages, Math.max(1, Math.floor(Number(params.get("page"))) || 1)) // a stale page number lands on the last page
  const pageRows = shown.slice((page - 1) * size, page * size)

  const panelRow = rows.find((r) => String(r.sheet_row) === params.get("open")) ?? null
  const isNew = !panelRow && params.has("new")
  const panel = !!panelRow || isNew
  const closeUrl = "/vouchers/" + qs(params, { open: null, new: null })

  const chips: [string, string][] = []
  const area = params.get("area"), month = params.get("month"), issue = params.get("issue"), q = params.get("q"), year = params.get("year")
  if (year) chips.push([`DV date in ${year}`, qs(params, { year: null, open: null, page: null })])
  if (area) chips.push([`Area is ${area}`, qs(params, { area: null, open: null, page: null })])
  if (month) chips.push([`DV date in ${monthLabel(month)}`, qs(params, { month: null, open: null, page: null })])
  if (issue) chips.push([issue in ISSUES ? ISSUES[issue as Issue] : issue === "none" ? "No review flags" : issue === "any" ? "Any review flag" : `Check: ${issue}`, qs(params, { issue: null, open: null, page: null })])
  if (q) chips.push([`Matches “${q}”`, qs(params, { q: null, open: null, page: null })])
  const clearUrl = qs(params, { area: null, month: null, year: null, issue: null, q: null, open: null, page: null })
  const filterCount = [area, month, year, issue].filter(Boolean).length
  const wide = cn(panel && "hidden") // secondary columns hide while the panel is open
  const step = (to: number, text: string) => to < 1 || to > pages
    ? <Button variant="outline" size="sm" disabled>{text}</Button>
    : <Button variant="outline" size="sm" render={<Link href={"/vouchers/" + qs(params, { page: String(to) })} />} nativeButton={false}>{text}</Button>

  return (
    <div className={cn("grid items-start gap-4", panel && "lg:grid-cols-[minmax(0,1fr)_26rem]")}>
      <section className="flex min-w-0 flex-col gap-3">
        <nav aria-label="Voucher views" className="flex flex-wrap items-center gap-1 border-b pb-2">
          {(Object.entries(TABS) as [Tab, string][]).map(([key, name]) => (
            <Button key={key} size="sm" variant={key === tab ? "secondary" : "ghost"} aria-current={key === tab ? "page" : undefined}
              render={<Link href={"/vouchers/" + qs(params, { tab: key, open: null, new: null, page: null })} />} nativeButton={false}>
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
                  <input type="hidden" name="per" value={per} />
                  {q && <input type="hidden" name="q" value={q} />}
                  {year && <input type="hidden" name="year" value={year} />}
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="f-area">Trade area</FieldLabel>
                      <NativeSelect id="f-area" name="area" defaultValue={area ?? ""} className="w-full">
                        <NativeSelectOption value="">Any area</NativeSelectOption>
                        {values(rows, "trade_area").map((a) => <NativeSelectOption key={a} value={a}>{a}</NativeSelectOption>)}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="f-issue">Review check</FieldLabel>
                      <NativeSelect id="f-issue" name="issue" defaultValue={issue ?? ""} className="w-full">
                        <NativeSelectOption value="">Any</NativeSelectOption>
                        <NativeSelectOption value="none">No review flags</NativeSelectOption>
                        <NativeSelectOption value="any">Any review flag</NativeSelectOption>
                        {Object.entries(ISSUES).map(([k, t]) => <NativeSelectOption key={k} value={k}>{t}</NativeSelectOption>)}
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
          <Selection items={pageRows.map(({ sheet_row, dv_no, amount }) => ({ sheet_row, dv_no, amount }))}>
            {/* Related fields stack two to a cell so every field fits without scrolling sideways; Payee takes the slack and truncates. */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={cn("w-8", wide)}><SelectAll /></TableHead>
                  <TableHead>DV # · date</TableHead>
                  <TableHead className="w-full">Payee · particulars</TableHead>
                  <TableHead className={cn("hidden md:table-cell", wide)}>Area · program · category</TableHead>
                  <TableHead className="hidden md:table-cell">Check #</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((r) => {
                  const openUrl = "/vouchers/" + qs(params, { open: String(r.sheet_row), new: null })
                  const kind = [r.diploma_st_assessment, r.category].filter(Boolean).join(" · ")
                  return (
                    <LinkRow key={r.sheet_row} href={openUrl} data-state={panelRow?.sheet_row === r.sheet_row ? "selected" : undefined}>
                      <TableCell className={wide}><RowCheck row={r.sheet_row} label={r.dv_no} /></TableCell>
                      <TableCell>
                        <Link className="font-medium hover:underline" href={openUrl} scroll={false}>{r.dv_no || "Untitled DV"}</Link>
                        <div className="text-xs text-muted-foreground">{(r.dv ? longDate(r.dv) : r.dv_date) || "No date"}</div>
                      </TableCell>
                      <TableCell className="w-full max-w-0">
                        <div className="truncate" title={r.payee}>{r.payee || "—"}</div>
                        <div className="truncate text-xs text-muted-foreground" title={r.particulars}>{r.particulars || "—"}</div>
                      </TableCell>
                      <TableCell className={cn("hidden max-w-48 md:table-cell", wide)}>
                        <div className="truncate" title={r.trade_area}>{r.trade_area || "—"}</div>
                        <div className="truncate text-xs text-muted-foreground" title={kind}>{kind || "—"}</div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">{r.check_number || "—"}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{peso(r.amount)}</TableCell>
                      <TableCell className="max-w-56 whitespace-normal">
                        <div className="flex flex-col items-start gap-1">
                          {isVerified(r)
                            ? <Badge variant="outline" className="border-primary/40 text-primary"><BadgeCheckIcon data-icon="inline-start" />{VERIFIED}</Badge>
                            : <span className="whitespace-nowrap text-muted-foreground">{FOR_REVIEW}</span>}
                          {r.issues.length > 0 && <IssueBadges issues={r.issues} />}
                        </div>
                      </TableCell>
                    </LinkRow>
                  )
                })}
              </TableBody>
              {!panel && (
                <TableFooter>
                  <TableRow>
                    <TableHead scope="row" colSpan={3}>Total · {shown.length} voucher{plural(shown.length)}</TableHead>
                    <TableCell colSpan={2} className="hidden md:table-cell" />
                    <TableCell className="text-right tabular-nums">{peso(total(shown))}</TableCell>
                    <TableCell />
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
        {shown.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground print:hidden">
            {!panel && <span>Click a row to open it in the side panel.</span>}
            <Form action="/vouchers/" className="ml-auto flex items-center gap-2">
              {[...params].filter(([k]) => k !== "per" && k !== "page").map(([k, v], i) => <input key={i} type="hidden" name={k} value={v} />)}
              <label htmlFor="per">Rows per page</label>
              <AutoSubmitSelect id="per" name="per" size="sm" defaultValue={per}>
                {Object.entries(PER).map(([k, text]) => <NativeSelectOption key={k} value={k}>{text}</NativeSelectOption>)}
              </AutoSubmitSelect>
            </Form>
            <span className="tabular-nums">{(page - 1) * size + 1}-{Math.min(page * size, shown.length)} of {shown.length}</span>
            {pages > 1 && (
              <nav aria-label="Pages" className="flex items-center gap-1">
                {step(page - 1, "Previous")}
                {step(page + 1, "Next")}
              </nav>
            )}
          </div>
        )}
      </section>

      {panel && (
        <VoucherPanel
          key={panelRow ? `${panelRow.sheet_row}:${FIELDS.map((f) => panelRow[f]).join("|")}` : "new"}
          row={panelRow?.sheet_row ?? null}
          initial={formFromRow(panelRow)}
          heading={isNew ? "New voucher" : panelRow!.dv_no || "Untitled DV"}
          status={panelRow ? <IssueBadges issues={panelRow.issues} /> : "Adds a new row at the bottom of the sheet."}
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
