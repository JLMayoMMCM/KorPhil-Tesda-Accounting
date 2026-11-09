import { ListFilterIcon, SearchXIcon, XIcon } from "lucide-react"
import type { Metadata } from "next"
import Form from "next/form"
import Link from "next/link"

import { RecordPanel } from "@/components/record-panel"
import { LinkRow } from "@/components/selection"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { deleteEntry, saveEntry } from "@/app/actions"
import { account, COLLECTION, collected, ENTRY_ISSUES, entryMonths, filterEntries, tags, type EntryIssue } from "@/lib/collection"
import { clock, getCollectionData } from "@/lib/data"
import { formFromRow, longDate, monthLabel, peso, qs, rowSig, toParams } from "@/lib/ledger"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Collections · Collections" }

const VIEWS = { "": "All", review: "Needs review" } as const
const PER = 100
const BASE = "/collection/collections/"

/** Every receipt on the Collection tab, newest first, with the same filters the dashboard links to. A row opens in the side panel to edit or delete; ?new opens a blank one. */
export default async function Collections({ searchParams }: PageProps<"/collection/collections">) {
  const params = toParams(await searchParams)
  const { entries, rows, columns, title, at, today } = await getCollectionData()
  // "Needs review": receipts with any flag.
  const view = params.get("issue") === "any" ? "review" : ""
  const shown = filterEntries(entries, params)
  const pages = Math.max(1, Math.ceil(shown.length / PER))
  const page = Math.min(pages, Math.max(1, Math.floor(Number(params.get("page"))) || 1))
  const pageRows = shown.slice((page - 1) * PER, page * PER)

  const panelEntry = entries.find((e) => String(e.sheet_row) === params.get("open")) ?? null
  const panelRow = (panelEntry && rows.find((r) => r.sheet_row === panelEntry.sheet_row)) ?? null
  const isNew = !panelRow && params.has("new") && columns.length > 0
  const panel = !!panelRow || isNew
  const closeUrl = BASE + qs(params, { open: null, new: null })
  const sig = panelRow ? rowSig(panelRow, columns) : ""
  // Secondary columns: md+ only, and hidden while the panel is open (a bare "hidden" loses to md:table-cell).
  const wide = panel ? "hidden" : "hidden md:table-cell"
  // Columns added to the sheet beyond the known fields, one table column each, in sheet order.
  const extras = columns.filter((c) => !c.field && c.visibility !== "hidden")

  const area = params.get("area"), uacs = params.get("uacs"), month = params.get("month"), year = params.get("year"), issue = params.get("issue"), q = params.get("q")
  const chips: [string, string][] = []
  if (year) chips.push([`Dated ${year}`, qs(params, { year: null, page: null })])
  if (month) chips.push([`Dated ${monthLabel(month)}`, qs(params, { month: null, page: null })])
  if (area) chips.push([`Area is ${area}`, qs(params, { area: null, page: null })])
  if (uacs) chips.push([`UACS ${account(uacs)}`, qs(params, { uacs: null, page: null })])
  if (issue && issue !== "any") chips.push([ENTRY_ISSUES[issue as EntryIssue] ?? issue, qs(params, { issue: null, page: null })])
  if (q) chips.push([`Matches “${q}”`, qs(params, { q: null, page: null })])
  const step = (to: number, text: string) => to < 1 || to > pages
    ? <Button variant="outline" size="sm" disabled>{text}</Button>
    : <Button variant="outline" size="sm" render={<Link href={BASE + qs(params, { page: String(to) })} />} nativeButton={false}>{text}</Button>

  return (
    <div className={cn("grid items-start gap-4", panel && "lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]")}>
    <section className="flex min-w-0 flex-col gap-3">
      <nav aria-label="Collection views" className="flex flex-wrap items-center gap-1 border-b pb-2">
        {(Object.entries(VIEWS) as [keyof typeof VIEWS, string][]).map(([key, name]) => {
          const changes = { ...(key === "review" ? { issue: "any" } : { issue: view === "review" ? null : issue }), open: null, new: null }
          return (
            <Button key={key} size="sm" variant={key === view ? "secondary" : "ghost"} aria-current={key === view ? "page" : undefined}
              render={<Link href={BASE + qs(params, { ...changes, page: null })} />} nativeButton={false}>
              {name}<span className="text-muted-foreground tabular-nums">{filterEntries(entries, new URLSearchParams(qs(params, changes))).length}</span>
            </Button>
          )
        })}
        <Form action={BASE} role="search" className="ml-auto flex items-center gap-2">
          {[...params].filter(([k]) => k !== "q" && k !== "page").map(([k, v]) => <input key={k + v} type="hidden" name={k} value={v} />)}
          <Input type="search" name="q" defaultValue={q ?? ""} placeholder="Find OR #, payor, or amount (>5000)" aria-label="Find entries by OR #, payor, nature, or amount" className="h-8 w-64" />
        </Form>
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" />}>
            <ListFilterIcon data-icon="inline-start" />Filter
          </PopoverTrigger>
          <PopoverContent align="end">
            <Form action={BASE}>
              {[...params].filter(([k]) => !["area", "uacs", "month", "page"].includes(k)).map(([k, v]) => <input key={k + v} type="hidden" name={k} value={v} />)}
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="f-area">Area</FieldLabel>
                  <NativeSelect id="f-area" name="area" defaultValue={area ?? ""} className="w-full">
                    <NativeSelectOption value="">Any area</NativeSelectOption>
                    {tags(entries, "area").map((a) => <NativeSelectOption key={a} value={a}>{a}</NativeSelectOption>)}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="f-uacs">UACS code</FieldLabel>
                  <NativeSelect id="f-uacs" name="uacs" defaultValue={uacs ?? ""} className="w-full">
                    <NativeSelectOption value="">Any account</NativeSelectOption>
                    {tags(entries, "uacs").map((u) => <NativeSelectOption key={u} value={u}>{u}</NativeSelectOption>)}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="f-month">Date</FieldLabel>
                  <NativeSelect id="f-month" name="month" defaultValue={month ?? ""} className="w-full">
                    <NativeSelectOption value="">Any month</NativeSelectOption>
                    {entryMonths(entries).map((m) => <NativeSelectOption key={m} value={m}>{monthLabel(m)}</NativeSelectOption>)}
                  </NativeSelect>
                </Field>
                <Button type="submit">Apply</Button>
              </FieldGroup>
            </Form>
          </PopoverContent>
        </Popover>
      </nav>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {chips.map(([text, url]) => (
          <Badge key={text} variant="secondary" render={<Link href={BASE + url} aria-label={`Remove filter: ${text}`} />}>
            {text}<XIcon data-icon="inline-end" />
          </Badge>
        ))}
        <span className="ml-auto font-medium tabular-nums">
          {shown.length} shown · {peso(collected(shown))} collected
        </span>
      </div>

      {shown.length ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date · OR #</TableHead>
                <TableHead className="w-full">Payor · nature</TableHead>
                <TableHead className={wide}>UACS · area</TableHead>
                {extras.map((c) => <TableHead key={c.key} className={cn(wide, c.type === "money" && "text-right")}>{c.label}</TableHead>)}
                <TableHead className="text-right">Collection</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((e) => {
                const openUrl = BASE + qs(params, { open: String(e.sheet_row), new: null })
                return (
                <LinkRow key={e.sheet_row} href={openUrl} data-state={panelEntry?.sheet_row === e.sheet_row ? "selected" : undefined}>
                  <TableCell className="align-top whitespace-nowrap">
                    {/* No prefetch: a page of rows would be a page of requests. */}
                    <Link className="hover:underline" href={openUrl} scroll={false} prefetch={false}>{longDate(e.iso)}</Link>
                    <div className="text-xs text-muted-foreground tabular-nums">{e.or_no || "No OR #"} · row {e.sheet_row}</div>
                  </TableCell>
                  <TableCell className="align-top whitespace-normal">
                    <div className="font-medium">{e.payor || "—"}</div>
                    <div className="text-xs text-muted-foreground">{e.nature}</div>
                    {e.issues.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {e.issues.map((i) => <Badge key={i} variant="destructive">{ENTRY_ISSUES[i]}</Badge>)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className={cn("align-top whitespace-normal", wide)}>
                    <div className="tabular-nums">{e.uacs.match(/^\s*(\d{6,})/)?.[1] ?? (e.uacs ? account(e.uacs) : "—")}</div>
                    {/^\s*\d{6,}/.test(e.uacs) && <div className="text-xs text-muted-foreground">{account(e.uacs)}</div>}
                    <div className="text-xs text-muted-foreground">{e.area}</div>
                  </TableCell>
                  {extras.map((c) => (
                    <TableCell key={c.key} className={cn("max-w-40 align-top", wide, c.type === "money" && "text-right tabular-nums")}>
                      <div className="truncate" title={e.extra[c.key]}>{e.extra[c.key] || "—"}</div>
                    </TableCell>
                  ))}
                  <TableCell className="text-right align-top tabular-nums">{peso(e.collected)}</TableCell>
                </LinkRow>
                )
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="font-medium">Total, {shown.length} receipts</TableCell>
                <TableCell colSpan={1 + extras.length} className={wide} />
                <TableCell className="text-right font-medium tabular-nums">{peso(collected(shown))}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          {pages > 1 && (
            <nav aria-label="Pages" className="flex items-center justify-end gap-2 text-sm">
              {step(page - 1, "Previous")}
              <span className="text-muted-foreground tabular-nums">Page {page} of {pages}</span>
              {step(page + 1, "Next")}
            </nav>
          )}
        </>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><SearchXIcon /></EmptyMedia>
            <EmptyTitle>Nothing matches.</EmptyTitle>
            <EmptyDescription>{entries.length ? "Remove a filter above to see more." : "The Collection tab has no entries yet."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>

    {panel && (
      <RecordPanel
        key={panelRow ? `${panelRow.sheet_row}:${sig}` : "new"}
        row={panelRow?.sheet_row ?? null}
        initial={formFromRow(panelRow, columns, { date: today })}
        columns={columns}
        heading={isNew ? "New collection" : panelEntry!.or_no ? `OR # ${panelEntry!.or_no}` : `Row ${panelEntry!.sheet_row}`}
        status={panelEntry ? (
          panelEntry.issues.length ? (
            <span className="flex flex-wrap gap-1">{panelEntry.issues.map((i) => <Badge key={i} variant="destructive">{ENTRY_ISSUES[i]}</Badge>)}</span>
          ) : `${peso(panelEntry.collected)} collected ${longDate(panelEntry.iso)}`
        ) : "Adds a row after the last entry in the sheet."}
        source={panelRow ? `Source: ${title || "Google Sheet"} · row ${panelRow.sheet_row} · pulled ${clock(at)}` : ""}
        closeUrl={closeUrl}
        save={saveEntry.bind(null, panelRow?.sheet_row ?? null, sig)}
        remove={panelRow ? deleteEntry.bind(null, panelRow.sheet_row, sig) : undefined}
        removeNote={panelRow ? `Clears this entry's cells in row ${panelRow.sheet_row}. The row stays, and so do Deposit, Undeposited and the summary tables beside it. Undo from the sheet's version history.` : undefined}
        required={COLLECTION.required}
        wide={["payor"]}
      />
    )}
    </div>
  )
}
