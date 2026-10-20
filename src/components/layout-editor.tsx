"use client"

// Settings → Layout settings: pick the header row and rows to ignore, set column roles, input types and visibility.
// Saved inside the spreadsheet as developer metadata (see layoutAction and saveSettings).
import * as React from "react"

import { layoutAction } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FIELD_LABELS, type Field } from "@/lib/ledger"
import { colLetter, INPUT_TYPES, VISIBILITY, type Saved } from "@/lib/sheet-config"

type Props = {
  top: string[][] // the tab's first 20 rows
  detected: { headerRow: number; roles: Record<number, Field> } // what auto-detection found, shown as the "Auto" choice
  saved: Saved | null
}

export function LayoutEditor({ top, detected, saved }: Props) {
  const [state, action, pending] = React.useActionState(layoutAction, null)
  const [header, setHeader] = React.useState(saved?.headerRow ?? detected.headerRow)
  const cells = top[header - 1] ?? []
  const width = Math.max(cells.length, ...Object.keys(saved?.columns ?? {}).map((c) => Number(c) + 1))
  const ignored = new Set(saved?.ignored ?? [])
  const preview = Math.min(8, Math.max(0, ...top.map((r) => r.length)))

  return (
    <form action={action} className="flex flex-col gap-4 text-sm">
      <p className="text-muted-foreground">
        {saved ? <>Saved by {saved.by || "someone"}{saved.at && ` on ${new Date(saved.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })}`}.</>
          : "Nothing saved yet: the layout is auto-detected."} Only the sheet&apos;s Editors can save; for Viewers, Google refuses the change.
      </p>

      <section className="flex flex-col gap-2">
        <h3 className="font-medium">1. Header row and rows to ignore</h3>
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow><TableHead>Header</TableHead><TableHead>Ignore</TableHead><TableHead>Row</TableHead>
                {Array.from({ length: preview }, (_, j) => <TableHead key={j} className="font-mono">{colLetter(j)}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {top.map((cellsOf, i) => (
                <TableRow key={i} data-state={i + 1 === header ? "selected" : undefined}>
                  <TableCell>
                    <input type="radio" name="header" value={i + 1} checked={i + 1 === header} onChange={() => setHeader(i + 1)} aria-label={`Row ${i + 1} is the header`} />
                  </TableCell>
                  <TableCell>
                    {i + 1 > header && <input type="checkbox" name="ignore" value={i + 1} defaultChecked={ignored.has(i + 1)} aria-label={`Ignore row ${i + 1}`} />}
                  </TableCell>
                  <TableCell className="font-mono">{i + 1}</TableCell>
                  {Array.from({ length: preview }, (_, j) => <TableCell key={j} className="max-w-32 truncate">{cellsOf[j] ?? ""}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <label className="flex flex-wrap items-center gap-2">
          Other rows to ignore
          <Input name="ignore-more" className="w-64" placeholder="e.g. 140, 152"
            defaultValue={[...ignored].filter((r) => r > top.length).join(", ")} />
        </label>
      </section>

      <section key={header} className="flex flex-col gap-2">
        <h3 className="font-medium">2. Columns of row {header}</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Column</TableHead><TableHead>Header</TableHead><TableHead>Role</TableHead><TableHead>Input</TableHead><TableHead>Show</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: width }, (_, j) => {
                const set = saved?.columns[j] ?? {}
                const auto = header === detected.headerRow ? detected.roles[j] : undefined
                return (
                  <TableRow key={j}>
                    <TableCell className="font-mono">{colLetter(j)}</TableCell>
                    <TableCell>{cells[j] || <span className="text-muted-foreground">(blank)</span>}</TableCell>
                    <TableCell>
                      <NativeSelect name={`role-${j}`} defaultValue={set.role ?? ""} aria-label={`Role of column ${colLetter(j)}`}>
                        <NativeSelectOption value="">Auto{auto ? ` (${FIELD_LABELS[auto]})` : ""}</NativeSelectOption>
                        {(Object.keys(FIELD_LABELS) as Field[]).map((f) => <NativeSelectOption key={f} value={f}>{FIELD_LABELS[f]}</NativeSelectOption>)}
                        <NativeSelectOption value="none">No role (extra column)</NativeSelectOption>
                      </NativeSelect>
                    </TableCell>
                    <TableCell>
                      <NativeSelect name={`type-${j}`} defaultValue={set.type ?? ""} aria-label={`Input type of column ${colLetter(j)}`}>
                        <NativeSelectOption value="">Auto</NativeSelectOption>
                        {Object.entries(INPUT_TYPES).map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}
                      </NativeSelect>
                    </TableCell>
                    <TableCell>
                      <NativeSelect name={`vis-${j}`} defaultValue={set.visibility ?? ""} aria-label={`Visibility of column ${colLetter(j)}`}>
                        <NativeSelectOption value="">Shown</NativeSelectOption>
                        {Object.entries(VISIBILITY).filter(([k]) => k !== "shown").map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}
                      </NativeSelect>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
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
