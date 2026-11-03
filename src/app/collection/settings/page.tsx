import { ExternalLinkIcon } from "lucide-react"
import type { Metadata } from "next"

import { SyncButton } from "@/components/sync-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { COLLECTION_LABELS } from "@/lib/collection"
import { clock, getCollectionData } from "@/lib/data"
import { COLLECTION, colLetter, type CollectionField } from "@/lib/sheet-config"
import { COLLECTION_RANGE, COLLECTION_SHEET_ID, collectionSheetUrl } from "@/lib/sheets"

export const metadata: Metadata = { title: "Settings · Collections" }

/** Where the collection module reads from, the header it matched, and every row it left out. Read-only: the tab is edited in Sheets. */
export default async function CollectionSettings() {
  const { layout, entries, skipped, title, at } = await getCollectionData()
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
            {layout ? `Header row ${layout.headerRow}, entries from row ${layout.firstRow}. Columns past ${colLetter(COLLECTION.lastCol!)} (the summary tables) are not read.` : "No header row found yet."}
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
