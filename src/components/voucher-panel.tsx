"use client"

import { CircleAlertIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"

import { saveVoucher } from "@/app/actions"
import { useUI } from "@/components/app-ui"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { FOR_REVIEW, VERIFIED } from "@/lib/ledger"
import type { Column } from "@/lib/sheet-config"

type Props = {
  row: number | null // null = new voucher
  initial: Record<string, string> // by column key
  columns: Column[] // the sheet's columns in sheet order; the form is built from them
  heading: string
  status: React.ReactNode
  source: string
  closeUrl: string
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

export function VoucherPanel({ row, initial, columns, heading, status, source, closeUrl }: Props) {
  const router = useRouter()
  const { run, setDirty } = useUI()
  const [changed, setChanged] = React.useState<string[]>([])
  const [error, setError] = React.useState("")
  React.useEffect(() => () => setDirty(""), [setDirty]) // closing the panel drops the guard
  const shown = columns.filter((c) => c.visibility !== "hidden")

  const onInput = (e: React.FormEvent<HTMLFormElement>) => {
    const data = new FormData(e.currentTarget)
    const list = shown.filter((c) => c.visibility === "shown" && String(data.get(c.key) ?? "") !== (initial[c.key] ?? "")).map((c) => c.label)
    setChanged(list)
    setDirty(list.length ? `Changed: ${list.join(", ")}` : "")
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const result = await run("Saving to the sheet…", () => saveVoucher(row, data, initial.dv_no), { inlineError: true })
    if (!result.ok) return setError(result.message)
    setError("")
    setChanged([])
    setDirty("")
    toast.add({ title: result.message, type: "success" })
    if (row === null) router.push(closeUrl, { scroll: false })
  }

  // One input per column, chosen by its type; labels are the sheet's own header text.
  const input = (c: Column) => {
    const value = initial[c.key] ?? ""
    const common = { id: c.key, name: c.key, defaultValue: value, disabled: c.visibility === "readonly" }
    if (c.field === "status") return (
      <NativeSelect {...common} className="w-full">
        <NativeSelectOption value={FOR_REVIEW}>{FOR_REVIEW}</NativeSelectOption>
        <NativeSelectOption value={VERIFIED}>{VERIFIED}</NativeSelectOption>
      </NativeSelect>
    )
    if (c.type === "dropdown") {
      // A value already in the row stays selectable even if the list dropped it.
      const choices = c.options.includes(value) || !value ? c.options : [value, ...c.options]
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
        <InputGroupInput {...common} inputMode="decimal" required={c.field === "gross_amount"} />
      </InputGroup>
    )
    if (c.type === "long") return <Textarea {...common} rows={3} />
    return <Input {...common} type={c.type === "date" && (!value || ISO.test(value)) ? "date" : "text"} required={c.field === "dv_no"} />
  }

  const note = row === null
    ? "Not saved yet · appends a row"
    : changed.length ? `Unsaved · writes to row ${row}` : `No changes · row ${row}`

  return (
    <form data-voucher-form onInput={onInput} onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 lg:sticky lg:top-16 lg:max-h-[calc(100svh-5rem)] lg:overflow-y-auto">
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
        {shown.map((c) => (
          <Field key={c.key} className={c.type === "long" || c.field === "payee" ? "col-span-2" : undefined}>
            <FieldLabel htmlFor={c.key}>{c.label}{c.visibility === "readonly" && <span className="font-normal text-muted-foreground"> · read-only</span>}</FieldLabel>
            {input(c)}
          </Field>
        ))}
      </FieldGroup>

      <div className="flex flex-col gap-1 text-sm">
        {changed.length > 0 && <p className="font-medium">Changed: {changed.join(", ")}</p>}
        {source && <p className="text-muted-foreground">{source}</p>}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t pt-4">
        <span className="text-sm font-medium">{note}</span>
        <Button variant="outline" className="ml-auto" render={<Link href={closeUrl} scroll={false} />} nativeButton={false}>
          Cancel<Kbd>Esc</Kbd>
        </Button>
        <Button type="submit">Save to sheet<Kbd>Ctrl S</Kbd></Button>
      </footer>
    </form>
  )
}
