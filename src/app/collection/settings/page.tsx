import { ExternalLinkIcon } from "lucide-react"
import type { Metadata } from "next"

import { LayoutEditor } from "@/components/layout-editor"
import { SyncButton } from "@/components/sync-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { COLLECTION, COLLECTION_LABELS, type CollectionField } from "@/lib/collection"
import { clock, getCollectionData } from "@/lib/data"
import { rowIndex } from "@/lib/ledger"
import { RoleNote } from "@/components/role-note"
import { bookRoles, colLetter } from "@/lib/sheet-config"
import { COLLECTION_RANGE, COLLECTION_SHEET_ID, collectionSheetUrl, lastPull } from "@/lib/sheets"

export const metadata: Metadata = { title: "Settings · Collections" }

/** Where the collection module reads from, the header it matched, the layout settings, and every row it left out. */
export default async function CollectionSettings() {
  const { layout, entries, skipped, title, at } = await getCollectionData()
  const pull = lastPull("collection")
  const roles = bookRoles(COLLECTION, pull.lists)
  const fields = Object.keys(COLLECTION.headers) as CollectionField[]
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Collection sheet</CardTitle>
          <CardDescription>
            Set by <code>COLLECTION_SHEET_ID</code> (falls back to <code>GOOGLE_SHEET_ID</code>) and <code>COLLECTION_SHEET_RANGE</code> in the environment.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">Spreadsheet</dt><dd className="break-all">{title || COLLECTION_SHEET_ID || "Not set"}</dd>
            <dt className="text-muted-foreground">Tab</dt><dd>{COLLECTION_RANGE}</dd>
            <dt className="text-muted-foreground">Last pulled</dt><dd>{at ? `${clock(at)} · ${entries.length} entries` : "Not yet"}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <SyncButton variant="outline" module="collection" />
            {collectionSheetUrl && (
              <Button variant="ghost" render={<a href={collectionSheetUrl} target="_blank" rel="noopener" />} nativeButton={false}>
                Open in Google Sheets<ExternalLinkIcon data-icon="inline-end" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Columns</CardTitle>
          <CardDescription>
            {layout ? `Header row ${layout.headerRow}, entries from row ${layout.firstRow}. Columns past ${colLetter(Math.max(...Object.values(layout.columns) as number[], ...layout.extras.map((x) => x.col)))} (Deposit, Undeposited and the summary tables) are not read.` : "No header row found yet."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Column</TableHead>
                <TableHead className="w-full">Header in the sheet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((f) => {
                const col = layout?.columns[f]
                return (
                  <TableRow key={f}>
                    <TableCell className="font-medium">
                      {COLLECTION_LABELS[f]}{COLLECTION.required.includes(f) && <span className="text-muted-foreground"> · required</span>}
                    </TableCell>
                    <TableCell className="tabular-nums">{col === undefined ? <Badge variant="destructive">Missing</Badge> : colLetter(col)}</TableCell>
                    <TableCell className="whitespace-normal">{layout?.headers[f] ?? <span className="text-muted-foreground">Accepts: {COLLECTION.headers[f].join(", ")}</span>}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {pull.top.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Layout settings</CardTitle>
            <CardDescription>
              Choose the header row, rows to ignore, and each column&apos;s role, input and visibility. Saved inside the spreadsheet
              as hidden developer metadata, apart from the voucher settings. The ledger ends at its last column with a role, so
              give a column further right a role (or &ldquo;No role&rdquo;) to read it.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <RoleNote roles={roles} labels={COLLECTION_LABELS} />
            <LayoutEditor book="collection" fields={Object.fromEntries(roles.roles.map((r) => [r.field, r.label]))} top={pull.top} index={rowIndex(pull.values, pull.candidate?.columns ?? [])} saved={pull.saved} detected={{
              headerRow: layout?.headerRow ?? 1,
              roles: { ...Object.fromEntries(Object.entries(layout?.columns ?? {}).map(([f, c]) => [c, f])),
                ...Object.fromEntries((layout?.extras ?? []).filter((x) => x.custom).map((x) => [x.col, `x:${x.text}`])) },
            }} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Rows not read</CardTitle>
          <CardDescription>Rows with text in the ledger columns but no date or no amount: totals, cancelled receipts, notes.</CardDescription>
        </CardHeader>
        <CardContent>
          {skipped.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Why</TableHead>
                  <TableHead className="w-full">What it holds</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {skipped.map((s) => (
                  <TableRow key={s.row}>
                    <TableCell className="tabular-nums">{s.row}</TableCell>
                    <TableCell>{s.reason}</TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">{s.preview}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <p className="text-sm text-muted-foreground">Every row was read.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
