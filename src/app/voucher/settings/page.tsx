import { CircleAlertIcon, CircleCheckIcon, ExternalLinkIcon, PlugIcon, UnplugIcon, UsersIcon } from "lucide-react"
import type { Metadata } from "next"

import { LayoutEditor } from "@/components/layout-editor"
import { SyncButton } from "@/components/sync-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { clock, getData } from "@/lib/data"
import { FIELD_LABELS, type Field } from "@/lib/ledger"
import { colLetter, fixedLayout, INPUT_TYPES, layoutDiff, REQUIRED, VISIBILITY, type SheetModel } from "@/lib/sheet-config"
import { fullName } from "@/lib/session"
import { CACHE_SECONDS, LAYOUT_MODE, SHEET_ID, SHEET_RANGE, sheetUrl } from "@/lib/sheets"

export const metadata: Metadata = { title: "Settings" }

export default async function Settings() {
  const { error, pull, user } = await getData()
  const open = (text: string) => sheetUrl && (
    <Button variant="outline" render={<a href={sheetUrl} target="_blank" rel="noopener" />} nativeButton={false}>
      {text}<ExternalLinkIcon data-icon="inline-end" />
    </Button>
  )
  const settings: [string, string, React.ReactNode, React.ReactNode?][] = [
    ["Google Sheet", "Every save writes back here.", <>
      <strong className="font-medium">{pull.title || "Untitled sheet"}</strong>
      {error
        ? <Badge variant="destructive"><UnplugIcon data-icon="inline-start" />Not connected</Badge>
        : <Badge variant="secondary"><PlugIcon data-icon="inline-start" />Connected through your Google account</Badge>}
    </>, open("Open sheet")],
    ["Sheet ID and range", "", <>
      <code className="break-all">{SHEET_ID || "Not set"}</code>
      <code>{SHEET_RANGE}</code>
      {pull.model && <span className="text-muted-foreground">
        Header on row {pull.model.layout.headerRow}, vouchers from row {pull.model.layout.firstRow}, columns A:{colLetter(Math.max(0, ...pull.model.columns.map((c) => c.col)))}
      </span>}
    </>],
    ["Signed in as", "Reads and saves use this Google account.", <>
      <strong className="font-medium">{fullName(user)}</strong>
      <span className="text-muted-foreground">{user.email}</span>
    </>],
    ["Who can use the app", "Follows the sheet's own sharing.", <>
      <span className="inline-flex items-center gap-2"><UsersIcon className="size-4 shrink-0" />Anyone the sheet is shared with can sign in. Editors can save; viewers can only look.</span>
    </>, open("Manage sharing")],
    ["Auto-refresh", "How long a pull is reused before the next one.", <>Every {CACHE_SECONDS} seconds, or when you press Sync</>],
    ["Last sync", "", pull.at ? <>
      <span>{clock(pull.at)} · {pull.rows} rows</span>
      {error ? <Badge variant="destructive"><CircleAlertIcon data-icon="inline-start" />{error}</Badge> : <span className="text-muted-foreground">no errors</span>}
    </> : "Never", <SyncButton key="sync" />],
  ]

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Data source</CardTitle>
          <CardDescription>
            The Google Sheet this app reads from and writes back to. These values come from <code>.env.local</code> (or the
            Vercel project&apos;s environment variables); change them there and restart.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col">
            {settings.map(([term, hint, value, action], i) => (
              <div key={term}>
                {i > 0 && <Separator />}
                <div className="grid gap-2 py-4 md:grid-cols-[14rem_1fr_auto] md:items-center">
                  <dt className="flex flex-col">
                    <span className="font-medium">{term}</span>
                    {hint && <small className="text-muted-foreground">{hint}</small>}
                  </dt>
                  <dd className="flex flex-wrap items-center gap-2 text-sm">{value}</dd>
                  <dd>{action}</dd>
                </div>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      {pull.model && pull.candidate && <SheetLayout model={pull.model} candidate={pull.candidate} />}
      {pull.candidate && (
        <Card>
          <CardHeader>
            <CardTitle>Layout settings</CardTitle>
            <CardDescription>
              Choose the header row, rows to ignore, and each column&apos;s role, input and visibility. Saved inside the spreadsheet
              as hidden developer metadata, so nothing visible in the sheet changes; tagged rows and columns keep their settings
              when rows or columns are inserted around them. Order of use: saved settings, then auto-detection, then the fixed layout.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LayoutEditor top={pull.top} saved={pull.saved} detected={{
              headerRow: pull.candidate.layout.headerRow,
              roles: Object.fromEntries(Object.entries(pull.candidate.layout.columns).map(([f, c]) => [c, f as Field])),
            }} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

const SOURCE = { saved: "Saved settings", detected: "Detected from the header row", fixed: "Fixed layout (A:L, header row 2, vouchers from row 5)" }
// What the app switches off when an optional column is missing.
const WITHOUT: Partial<Record<Field, string>> = {
  status: "Verification controls hidden",
  payee: "Payee report hidden",
  check_number: "“No check #” flag and coverage KPI off",
  trade_area: "“No trade area” flag and its report off",
  category: "Category report off",
  diploma_st_assessment: "Diploma / ST / Assessment report off",
}

/** The layout in use, and what saved settings or detection make of the sheet (the two differ only when SHEET_LAYOUT=fixed). */
function SheetLayout({ model, candidate }: { model: SheetModel; candidate: SheetModel }) {
  const fixed = fixedLayout()
  const differs = layoutDiff(candidate.layout, fixed)
  const col = (i: number | undefined) => (i === undefined ? "—" : colLetter(i))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sheet layout</CardTitle>
        <CardDescription>
          How the app reads the sheet. {LAYOUT_MODE === "fixed"
            ? <>SHEET_LAYOUT is <code>fixed</code>: reads and saves use the fixed layout. Set <code>SHEET_LAYOUT=detected</code> to use the layout below.</>
            : <>SHEET_LAYOUT is <code>detected</code>: reads and saves use the layout below. Set <code>SHEET_LAYOUT=fixed</code> to go back.</>}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">In use: {SOURCE[model.source]}</Badge>
          {candidate.error && <span className="text-destructive">{candidate.error} The fixed layout is the fallback.</span>}
          {candidate.source !== "fixed" && (differs.length
            ? <Badge variant="destructive"><CircleAlertIcon data-icon="inline-start" />Differs from the fixed layout: {differs.map((f) => FIELD_LABELS[f]).join(", ")}</Badge>
            : <Badge variant="secondary"><CircleCheckIcon data-icon="inline-start" />Same columns as the fixed layout</Badge>)}
          <span className="text-muted-foreground">
            {SOURCE[candidate.source]}: header on row {candidate.layout.headerRow} · {candidate.vouchers.length} vouchers
            {model !== candidate && ` (the fixed layout reads ${model.vouchers.length})`}
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Column</TableHead><TableHead>Header in sheet</TableHead><TableHead>Role</TableHead><TableHead>Input</TableHead><TableHead>Show</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {candidate.columns.map((c) => (
              <TableRow key={c.key}>
                <TableCell className="font-mono">
                  {col(c.col)}
                  {c.field && differs.includes(c.field) && <span className="text-destructive"> (fixed: {col(fixed.columns[c.field])})</span>}
                </TableCell>
                <TableCell>{c.label}</TableCell>
                <TableCell>
                  {c.field ? FIELD_LABELS[c.field] : <span className="text-muted-foreground">Extra</span>}
                  {c.field && REQUIRED.includes(c.field) && <span className="text-muted-foreground"> · required</span>}
                  {c.field && candidate.layout.duplicates.includes(c.field) && <span className="text-destructive"> · header found twice (first used)</span>}
                </TableCell>
                <TableCell>{INPUT_TYPES[c.type]}{c.type === "dropdown" && c.field !== "status" && <span className="text-muted-foreground"> · {c.options.length} choices</span>}</TableCell>
                <TableCell>{VISIBILITY[c.visibility]}</TableCell>
              </TableRow>
            ))}
            {candidate.layout.missing.map((f) => (
              <TableRow key={f}>
                <TableCell className="font-mono">—</TableCell>
                <TableCell className="text-muted-foreground">Missing</TableCell>
                <TableCell>{FIELD_LABELS[f]}</TableCell>
                <TableCell colSpan={2} className="text-muted-foreground">{WITHOUT[f] ?? "Left blank"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {candidate.skipped.length > 0 && (
          <details>
            <summary className="cursor-pointer font-medium">
              {candidate.skipped.length} row{candidate.skipped.length === 1 ? "" : "s"} to look at
              ({candidate.skipped.filter((r) => r.kind === "unsure").length} unsure and still read as vouchers; the rest skipped)
            </summary>
            <Table className="mt-2">
              <TableHeader>
                <TableRow><TableHead>Row</TableHead><TableHead>Reason</TableHead><TableHead>Content</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {candidate.skipped.map((r) => (
                  <TableRow key={r.row}>
                    <TableCell className="font-mono">{r.row}</TableCell>
                    <TableCell>{r.kind === "unsure" ? <strong className="font-medium">Unsure: {r.reason}</strong> : r.reason}</TableCell>
                    <TableCell className="max-w-80 truncate text-muted-foreground">{r.preview}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

