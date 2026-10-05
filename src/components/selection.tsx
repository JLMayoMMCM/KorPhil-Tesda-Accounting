"use client"

// Row checkboxes and the bulk bar (Verify / For review / Export / Clear).
import { BadgeCheckIcon, DownloadIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"

import { setStatus } from "@/app/actions"
import { useUI } from "@/components/app-ui"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import { peso } from "@/lib/ledger"

export type Item = { sheet_row: number; dv_no: string; amount: number }
type Ctx = { items: Item[]; selected: Set<number>; toggle: (row: number, on: boolean) => void; setAll: (on: boolean) => void }
const SelectionCtx = React.createContext<Ctx | null>(null)
const useSelection = () => React.use(SelectionCtx)!

export function Selection({ items, children }: { items: Item[]; children: React.ReactNode }) {
  const [selected, setSelected] = React.useState<Set<number>>(new Set())
  // Drop rows that disappeared (edited, filtered away) after a refresh.
  const live = React.useMemo(() => new Set(items.map((i) => i.sheet_row)), [items])
  const current = React.useMemo(() => new Set([...selected].filter((n) => live.has(n))), [selected, live])
  const toggle = React.useCallback((row: number, on: boolean) => setSelected((s) => {
    const next = new Set(s)
    if (on) next.add(row)
    else next.delete(row)
    return next
  }), [])
  const setAll = React.useCallback((on: boolean) => setSelected(on ? new Set(live) : new Set()), [live])
  return (
    <SelectionCtx value={{ items, selected: current, toggle, setAll }}>
      {children}
      <BulkBar />
    </SelectionCtx>
  )
}

export function RowCheck({ row, label }: { row: number; label: string }) {
  const { selected, toggle } = useSelection()
  return <Checkbox checked={selected.has(row)} onCheckedChange={(on) => toggle(row, on)} aria-label={`Select ${label}`} />
}

export function SelectAll() {
  const { items, selected, setAll } = useSelection()
  const all = items.length > 0 && selected.size === items.length
  return (
    <Checkbox
      checked={all}
      indeterminate={selected.size > 0 && !all}
      onCheckedChange={(on) => setAll(on)}
      aria-label="Select all shown"
      disabled={!items.length}
    />
  )
}

function BulkBar() {
  const { items, selected, setAll } = useSelection()
  const { run } = useUI()
  if (!selected.size) return null
  const rows = items.filter((i) => selected.has(i.sheet_row))
  const sum = rows.reduce((a, r) => a + r.amount, 0)
  const exportUrl = "/vouchers/export/?" + new URLSearchParams(rows.map((r) => ["sel", String(r.sheet_row)]))
  const mark = async (verified: boolean) => {
    const result = await run("Saving to the sheet…", () => setStatus(rows.map((r) => r.sheet_row), verified))
    if (result.ok) {
      toast.add({ title: result.message, type: "success" })
      setAll(false)
    }
  }
  return (
    <div role="region" aria-label="Selection"
      className="sticky bottom-4 z-10 mx-auto mt-4 flex w-full max-w-2xl flex-wrap items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm text-background shadow-lg">
      <span><strong>{rows.length}</strong> selected · <span className="tabular-nums">{peso(sum)}</span></span>
      <Button variant="secondary" className="ml-auto" onClick={() => mark(true)}>
        <BadgeCheckIcon data-icon="inline-start" />Verify {rows.length}
      </Button>
      <Button variant="ghost" className="text-background hover:bg-background/10 hover:text-background" onClick={() => mark(false)}>For review</Button>
      <Button variant="secondary" render={<a href={exportUrl} download />} nativeButton={false}>
        <DownloadIcon data-icon="inline-start" />Export {rows.length}
      </Button>
      <Button variant="ghost" className="text-background hover:bg-background/10 hover:text-background" onClick={() => setAll(false)}>Clear</Button>
    </div>
  )
}

/** A tbody whose rows stay hidden until "Show N" in its header row is pressed (long Workspace groups). */
export function CollapsedBody({ header, count, children }: { header: React.ReactNode; count: number; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <tbody>
      <TableRow className="bg-muted/50 hover:bg-muted/50">
        <th colSpan={7} scope="rowgroup" className="px-2 py-1.5 text-left font-medium">
          <div className="flex items-center gap-2">
            {header}
            <Button variant="link" size="sm" className="ml-auto" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? "Hide" : `Show ${count}`}
            </Button>
          </div>
        </th>
      </TableRow>
      {open && children}
    </tbody>
  )
}

/** A table row that opens href when clicked anywhere outside its own controls. */
export function LinkRow({ href, ...props }: { href: string } & React.ComponentProps<typeof TableRow>) {
  const router = useRouter()
  const { leave } = useUI()
  return (
    <TableRow
      className="cursor-pointer"
      onClick={(e) => {
        if ((e.target as Element).closest("a, button, input, label, [role=checkbox]")) return
        leave(() => router.push(href, { scroll: false }))
      }}
      {...props}
    />
  )
}
