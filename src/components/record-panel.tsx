"use client"

// The side-panel form for one ledger row of any book, built from the tab's columns (labels are the sheet's own headers).
// Module-specific inputs and field behaviour come in through `input` and `onField`, never field checks in here.
import { CircleAlertIcon, Trash2Icon, XIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"

import type { Result } from "@/app/actions"
import { useUI } from "@/components/app-ui"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { pairHalves } from "@/lib/ledger"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import type { Column } from "@/lib/sheet-config"

export type InputProps = { id: string; name: string; defaultValue: string; disabled: boolean; required: boolean }

export type RecordPanelProps = {
  row: number | null // null = new row
  initial: Record<string, string> // by column key
  columns: Column<string>[] // the sheet's columns in sheet order; the form is built from them
  heading: string
  status: React.ReactNode
  source: string
  closeUrl: string
  save: (form: FormData) => Promise<Result> // a server action, bound to the row
  remove?: () => Promise<Result> // shown as Delete on an existing row
  removeNote?: string // what Delete does, for the confirm dialog
  required?: string[] // column keys the form won't submit blank
  wide?: string[] // column keys that take the full width
  /** A custom input for a column, or undefined for the default one. */
  input?: (c: Column<string>, common: InputProps, choices: string[]) => React.ReactNode
  /** Called on every input, to keep one field in step with another. */
  onField?: (form: HTMLFormElement, name: string, value: string) => void
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

export function RecordPanel({ row, initial, columns, heading, status, source, closeUrl, save, remove, removeNote, required = [], wide = [], input, onField }: RecordPanelProps) {
  const router = useRouter()
  const { run, setDirty, confirm } = useUI()
  const [changed, setChanged] = React.useState<string[]>([])
  const [error, setError] = React.useState("")
  React.useEffect(() => () => setDirty(""), [setDirty]) // closing the panel drops the guard
  const shown = columns.filter((c) => c.visibility !== "hidden")
  const isWide = (c: Column<string>) => c.type === "long" || wide.includes(c.key)
  const laidOut = pairHalves(shown, isWide)

  const onInput = (e: React.FormEvent<HTMLFormElement>) => {
    const { name, value } = e.target as HTMLInputElement
    onField?.(e.currentTarget, name, value)
    const data = new FormData(e.currentTarget)
    const list = shown.filter((c) => c.visibility === "shown" && String(data.get(c.key) ?? "") !== (initial[c.key] ?? "")).map((c) => c.label)
    setChanged(list)
    setDirty(list.length ? `Changed: ${list.join(", ")}` : "")
  }

  const done = (message: string) => {
    setError("")
    setChanged([])
    setDirty("")
    toast.add({ title: message, type: "success" })
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const result = await run("Saving to the sheet…", () => save(data), { inlineError: true })
    if (!result.ok) return setError(result.message)
    done(result.message)
    if (row === null) router.push(closeUrl, { scroll: false })
  }

  const onDelete = async () => {
    if (!remove || !(await confirm(`Delete ${heading}?`, removeNote ?? `Clears row ${row} in the sheet.`, "Delete"))) return
    const result = await run("Deleting from the sheet…", remove, { inlineError: true })
    if (!result.ok) return setError(result.message)
    done(result.message)
    router.push(closeUrl, { scroll: false })
  }

  // One input per column, chosen by its type.
  const field = (c: Column<string>) => {
    const value = initial[c.key] ?? ""
    const common: InputProps = { id: c.key, name: c.key, defaultValue: value, disabled: c.visibility === "readonly", required: required.includes(c.key) }
    // A value already in the row stays selectable even if the list dropped it.
    const choices = c.options.includes(value) || !value ? c.options : [value, ...c.options]
    const custom = input?.(c, common, choices)
    if (custom) return custom
    if (c.type === "dropdown") {
      return (
        <NativeSelect {...common} className="w-full">
          <NativeSelectOption value="">Not set</NativeSelectOption>
          {choices.map((v) => <NativeSelectOption key={v} value={v}>{v}</NativeSelectOption>)}
        </NativeSelect>
      )
    }
    if (c.type === "money") return (
      <InputGroup>
        <InputGroupAddon><InputGroupText>₱</InputGroupText></InputGroupAddon>
        <InputGroupInput {...common} inputMode="decimal" />
      </InputGroup>
    )
    if (c.type === "long") return <Textarea {...common} rows={3} />
    return <Input {...common} type={c.type === "date" && (!value || ISO.test(value)) ? "date" : "text"} />
  }

  const note = row === null
    ? "Not saved yet · adds a row"
    : changed.length ? `Unsaved · writes to row ${row}` : `No changes · row ${row}`

  return (
    <form data-voucher-form onInput={onInput} onSubmit={onSubmit}
      // Below lg the list has no side column, so the panel is a full-screen sheet over it instead of landing under 100 rows.
      // z-40: above the sticky header (z-10), under dialogs and the save overlay (z-50).
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 max-lg:fixed max-lg:inset-0 max-lg:z-40 max-lg:overflow-y-auto max-lg:overscroll-contain max-lg:rounded-none max-lg:border-0 lg:sticky lg:top-16 lg:max-h-[calc(100svh-5rem)] lg:overflow-y-auto">
      <header className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="truncate font-heading text-lg font-semibold">{heading}</h2>
          <div className="text-sm text-muted-foreground">{status}</div>
        </div>
        <Button variant="ghost" size="icon" render={<Link href={closeUrl} scroll={false} />} nativeButton={false} aria-label="Close panel" data-key="escape">
          <XIcon />
        </Button>
      </header>

      {error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <FieldGroup className="grid grid-cols-2 gap-4">
        {laidOut.map((c) => (
          <Field key={c.key} className={isWide(c) ? "col-span-2" : undefined}>
            <FieldLabel htmlFor={c.key}>{c.label}{c.visibility === "readonly" && <span className="font-normal text-muted-foreground"> · read-only</span>}</FieldLabel>
            {field(c)}
          </Field>
        ))}
      </FieldGroup>

      <div className="flex flex-col gap-1 text-sm">
        {changed.length > 0 && <p className="font-medium">Changed: {changed.join(", ")}</p>}
        {source && <p className="text-muted-foreground">{source}</p>}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t pt-4">
        <span className="text-sm font-medium">{note}</span>
        {remove && row !== null && (
          <Button type="button" variant="ghost" className="text-destructive" onClick={onDelete}>
            <Trash2Icon data-icon="inline-start" />Delete
          </Button>
        )}
        <Button variant="outline" className="ml-auto" render={<Link href={closeUrl} scroll={false} />} nativeButton={false}>
          Cancel<Kbd>Esc</Kbd>
        </Button>
        <Button type="submit">Save to sheet<Kbd>Ctrl S</Kbd></Button>
      </footer>
    </form>
  )
}
