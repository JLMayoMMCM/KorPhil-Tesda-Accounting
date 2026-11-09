"use client"

// Settings → Layout settings: pick the header row and rows to ignore, set column roles, input types and visibility.
// Saved inside the spreadsheet as developer metadata (see layoutAction and saveSettings).
import * as React from "react"

import { layoutAction, type LayoutResult } from "@/app/actions"
import { useUI } from "@/components/app-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { findRows, type RowHit } from "@/lib/ledger"
import { colLetter, INPUT_TYPES, VISIBILITY, type Saved } from "@/lib/sheet-config"

type Props = {
  book: "voucher" | "collection" // which tab's settings this edits
  fields: Record<string, string> // the book's roles, by field, labelled as its roles table names them
  top: string[][] // the tab's first 20 rows
  index: RowHit[] // every non-blank row, for finding rows to ignore by reference, row number or amount
  detected: { headerRow: number; roles: Record<number, string> } // what auto-detection found, shown as the "Auto" choice
  saved: Saved<string> | null
}

const SHOW = 200 // search results listed at once (the table scrolls)
const ROWS = /[\s,]+/

/**
 * The editor, remounted whenever the saved settings change (a save or reset, or someone else's), so every field starts
 * from what the sheet now holds. The result message lives out here, so it survives that remount.
 */
export function LayoutEditor(props: Props) {
  const [state, action, pending] = React.useActionState(layoutAction, null)
  return <Editor key={props.saved ? `${props.saved.at}:${props.saved.by}` : "auto"} {...props} state={state} action={action} pending={pending} />
}

/**
 * Section 2: each column's role, input and visibility. The roles are the book's (from its roles table in the Selection
 * List), and each can be on one column only: a role picked on one column is greyed out on the others, and a column whose
 * Auto role was picked elsewhere has no role. A column with no role shows as Hidden until Show is set by hand.
 */
function Columns({ header, width, cells, saved, fields, auto }: {
  header: number; width: number; cells: string[]; saved: Saved<string> | null; fields: Record<string, string>; auto: Record<number, string>
}) {
  // A role saved as "none" (the old "No role" choice) reads as Auto; its column was taken in, so it starts Shown.
  const [roles, setRoles] = React.useState<Record<number, string>>(() =>
    Object.fromEntries(Array.from({ length: width }, (_, j) => [j, saved?.columns[j]?.role === "none" ? "" : saved?.columns[j]?.role ?? ""])))
  const picked = (j: number) => new Set(Object.entries(roles).filter(([k, v]) => Number(k) !== j && v).map(([, v]) => v))
  // Auto-set: pin every column's Auto role as its role, so what detection found is saved and survives header edits.
  const offered = Object.entries(auto).filter(([, f]) => f in fields) // a role the roles table doesn't list can't be picked
  const autoCount = offered.filter(([j, f]) => roles[Number(j)] !== f).length
  const autoSet = () => setRoles((r) => {
    const next = { ...r }
    for (const [j, f] of offered) {
      for (const k of Object.keys(next)) if (next[Number(k)] === f) next[Number(k)] = "" // a role is on one column only
      next[Number(j)] = f
    }
    return next
  })
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">2. Columns of row {header}</h3>
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={autoSet} disabled={!autoCount}
          title={Object.keys(auto).length ? "Set each column's role to its Auto role" : "Auto roles are only known for the detected header row"}>
          Auto-set roles{autoCount ? ` (${autoCount})` : ""}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Column</TableHead><TableHead>Header</TableHead><TableHead>Role</TableHead><TableHead>Input</TableHead><TableHead>Show</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: width }, (_, j) => {
              const taken = picked(j)
              const set = saved?.columns[j] ?? {}
              return (
                <ColumnRow key={j} j={j} header={cells[j] ?? ""} fields={fields} taken={taken} role={roles[j] ?? ""}
                  onRole={(role) => setRoles((r) => ({ ...r, [j]: role }))} type={set.type ?? ""}
                  visibility={set.visibility ?? (set.role === "none" ? "shown" : null)}
                  auto={auto[j] && !taken.has(auto[j]) ? auto[j] : undefined} />
              )
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

function ColumnRow({ j, header, fields, taken, role, onRole, type, visibility, auto }: {
  j: number; header: string; fields: Record<string, string>; taken: Set<string>; role: string; onRole: (role: string) => void
  type: string; visibility: string | null; auto: string | undefined
}) {
  const [vis, setVis] = React.useState<string | null>(visibility) // null: not set by hand, follows the role
  const show = vis ?? (role || auto ? "shown" : "hidden")
  const letter = colLetter(j)
  return (
    <TableRow>
      <TableCell className="font-mono">{letter}</TableCell>
      <TableCell>{header || <span className="text-muted-foreground">(blank)</span>}</TableCell>
      <TableCell>
        <NativeSelect name={`role-${j}`} value={role} onChange={(e) => onRole(e.target.value)} aria-label={`Role of column ${letter}`}>
          <NativeSelectOption value="">{auto ? `Auto (${fields[auto] ?? auto})` : "Auto (no role found)"}</NativeSelectOption>
          {Object.entries(fields).map(([f, text]) => (
            <NativeSelectOption key={f} value={f} disabled={taken.has(f)}>{text}{taken.has(f) ? " · on another column" : ""}</NativeSelectOption>
          ))}
        </NativeSelect>
      </TableCell>
      <TableCell>
        <NativeSelect name={`type-${j}`} defaultValue={type} aria-label={`Input type of column ${letter}`}>
          <NativeSelectOption value="">Auto</NativeSelectOption>
          {Object.entries(INPUT_TYPES).map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}
        </NativeSelect>
      </TableCell>
      <TableCell>
        {/* Posted only once set by hand: the default (Shown with a role, Hidden without) needs no saved setting. */}
        <NativeSelect name={vis === null ? undefined : `vis-${j}`} value={show} onChange={(e) => setVis(e.target.value)} aria-label={`Visibility of column ${letter}`}>
          {Object.entries(VISIBILITY).map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}
        </NativeSelect>
      </TableCell>
    </TableRow>
  )
}

/** "Header row 2 · 3 rows ignored · 4 columns set": what a save would store, for the confirm dialog. */
function summary(data: FormData) {
  const ignored = new Set(String(data.get("ignore-more") ?? "").split(ROWS).filter((r) => Number(r) > 0))
  const columns = new Set([...data].filter(([k, v]) => /^(role|type|vis)-\d+$/.test(k) && v).map(([k]) => k.split("-")[1]))
  const n = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`
  return `Header row ${data.get("header")} · ${n(ignored.size, "row")} ignored · ${n(columns.size, "column")} set by hand.`
}

function Editor({ book, fields, top, index, detected, saved, state, action, pending }: Props & {
  state: LayoutResult; action: (data: FormData) => void; pending: boolean
}) {
  const { confirm } = useUI()
  // Submitted by hand, not through <form action>: React resets a form after its action runs, which put every field
  // back to the settings loaded before the save (or wiped unsaved edits after Check).
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter)
    const intent = data.get("intent")
    if (intent === "save" && !(await confirm("Save these layout settings to the sheet?",
      `${summary(data)} They're stored in the spreadsheet, so everyone using the app gets them.`, "Save to sheet"))) return
    if (intent === "reset" && !(await confirm("Reset to auto-detect?",
      "Removes the saved header row, ignored rows and column settings from the spreadsheet for everyone. The layout is then read from the header text again.", "Reset"))) return
    React.startTransition(() => action(data))
  }
  const [header, setHeader] = React.useState(saved?.headerRow ?? detected.headerRow)
  const byRow = React.useMemo(() => new Map(index.map((r) => [r.row, r.cells])), [index])
  const cellsOf = (row: number) => byRow.get(row) ?? top[row - 1] ?? []
  const cells = cellsOf(header)
  const width = Math.max(cells.length, ...Object.keys(saved?.columns ?? {}).map((c) => Number(c) + 1))
  // Every row to ignore, as typed; the checkboxes add and remove row numbers here, so it's the one list that's saved.
  const [typed, setTyped] = React.useState((saved?.ignored ?? []).join(", "))
  const ignored = new Set(typed.split(ROWS).map(Number).filter((n) => Number.isInteger(n) && n > 0))
  const toggle = (row: number, on: boolean) => {
    const next = new Set(ignored)
    if (on) next.add(row)
    else next.delete(row)
    setTyped([...next].sort((a, b) => a - b).join(", "))
  }
  // The table: the first rows of the tab, or every row matching the search.
  const [query, setQuery] = React.useState("")
  const hits = React.useMemo(() => findRows(index, query), [index, query])
  const shown = query.trim() ? hits.slice(0, SHOW).map((h) => h.row) : top.map((_, i) => i + 1)
  const preview = Math.min(8, Math.max(0, ...shown.map((r) => cellsOf(r).length)))

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 text-sm">
      <input type="hidden" name="book" value={book} />
      <p className="text-muted-foreground">
        {saved ? <>Saved by {saved.by || "someone"}{saved.at && ` on ${new Date(saved.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })}`}.</>
          : "Nothing saved yet: the layout is auto-detected."} Only the sheet&apos;s Editors can save; for Viewers, Google refuses the change.
      </p>

      <section className="flex flex-col gap-2">
        <h3 className="font-medium">1. Header row and rows to ignore</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="search" className="w-80" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Find rows: reference, row number, or amount (>5000)" aria-label="Find rows by reference, row number, or amount"
            onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault() }} />
          <span className="text-muted-foreground" role="status">
            {query.trim() ? `${hits.length} row${hits.length === 1 ? "" : "s"} match${hits.length > SHOW ? `; the first ${SHOW} are listed` : ""}` : `The first ${top.length} rows. Search to find any row in the tab.`}
          </span>
        </div>
        {/* The picks live in state, so rows filtered out of view keep theirs; these two fields are what's posted. */}
        <input type="hidden" name="header" value={header} />
        <div className="max-h-96 overflow-auto rounded-md border">
          <table className="w-full caption-bottom text-xs">
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--border)]">
              <TableRow><TableHead>Header</TableHead><TableHead>Ignore</TableHead><TableHead>Row</TableHead>
                {Array.from({ length: preview }, (_, j) => <TableHead key={j} className="font-mono">{colLetter(j)}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => (
                <TableRow key={row} data-state={row === header ? "selected" : undefined}>
                  <TableCell>
                    <input type="radio" name="header-pick" checked={row === header} onChange={() => setHeader(row)} aria-label={`Row ${row} is the header`} />
                  </TableCell>
                  <TableCell>
                    {row > header && <input type="checkbox" checked={ignored.has(row)} onChange={(e) => toggle(row, e.target.checked)} aria-label={`Ignore row ${row}`} />}
                  </TableCell>
                  <TableCell className="font-mono">{row}</TableCell>
                  {Array.from({ length: preview }, (_, j) => <TableCell key={j} className="max-w-32 truncate" title={cellsOf(row)[j]}>{cellsOf(row)[j] ?? ""}</TableCell>)}
                </TableRow>
              ))}
              {!shown.length && <TableRow><TableCell colSpan={3 + preview} className="text-muted-foreground">No rows match.</TableCell></TableRow>}
            </TableBody>
          </table>
        </div>
        <label className="flex flex-wrap items-center gap-2">
          Rows to ignore
          <Input name="ignore-more" className="w-80" placeholder="e.g. 4, 140, 152" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </label>
      </section>

      <section key={header} className="flex flex-col gap-2">
        <Columns header={header} width={width} cells={cells} saved={saved} fields={fields} auto={header === detected.headerRow ? detected.roles : {}} />
      </section>

      <footer className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button type="submit" name="intent" value="check" variant="outline" disabled={pending}>Check</Button>
        <Button type="submit" name="intent" value="save" disabled={pending}>Save to sheet</Button>
        {saved && <Button type="submit" name="intent" value="reset" variant="ghost" disabled={pending}>Reset to auto-detect</Button>}
        {state && <span role="status" className={state.ok ? "text-muted-foreground" : "text-destructive"}>{state.message}</span>}
      </footer>
    </form>
  )
}
