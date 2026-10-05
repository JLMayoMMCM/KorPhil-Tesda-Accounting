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
import { FIELD_LABELS, FOR_REVIEW, VERIFIED, type Field as FieldName } from "@/lib/ledger"

type Props = {
  row: number | null // null = new voucher
  initial: Record<FieldName, string>
  heading: string
  status: React.ReactNode
  source: string
  options: { trade_area: string[]; diploma_st_assessment: string[]; category: string[] }
  closeUrl: string
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

export function VoucherPanel({ row, initial, heading, status, source, options, closeUrl }: Props) {
  const router = useRouter()
  const { run, setDirty } = useUI()
  const [changed, setChanged] = React.useState<string[]>([])
  const [error, setError] = React.useState("")
  React.useEffect(() => () => setDirty(""), [setDirty]) // closing the panel drops the guard

  const onInput = (e: React.FormEvent<HTMLFormElement>) => {
    const data = new FormData(e.currentTarget)
    const list = (Object.keys(FIELD_LABELS) as FieldName[])
      .filter((f) => String(data.get(f) ?? "") !== initial[f])
      .map((f) => FIELD_LABELS[f])
    setChanged(list)
    setDirty(list.length ? `Changed: ${list.join(", ")}` : "")
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const result = await run("Saving to the sheet…", () => saveVoucher(row, data), { inlineError: true })
    if (!result.ok) return setError(result.message)
    setError("")
    setChanged([])
    setDirty("")
    toast.add({ title: result.message, type: "success" })
    if (row === null) router.push(closeUrl, { scroll: false })
  }

  const text = (name: FieldName, props: React.ComponentProps<typeof Input> = {}, wide = false) => (
    <Field className={wide ? "col-span-2" : undefined}>
      <FieldLabel htmlFor={name}>{FIELD_LABELS[name]}</FieldLabel>
      <Input id={name} name={name} defaultValue={initial[name]} {...props} />
    </Field>
  )

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
        {text("dv_no", { required: true })}
        {text("dv_date", { type: !initial.dv_date || ISO.test(initial.dv_date) ? "date" : "text" })}
        {text("payee", {}, true)}
        <Field>
          <FieldLabel htmlFor="gross_amount">Gross amount</FieldLabel>
          <InputGroup>
            <InputGroupAddon><InputGroupText>₱</InputGroupText></InputGroupAddon>
            <InputGroupInput id="gross_amount" name="gross_amount" defaultValue={initial.gross_amount} inputMode="decimal" required />
          </InputGroup>
        </Field>
        {text("check_number")}
        {text("trade_area", { list: "opt-area" })}
        {text("category", { list: "opt-category" })}
        {text("diploma_st_assessment", { list: "opt-program" }, true)}
        <Field className="col-span-2">
          <FieldLabel htmlFor="status">{FIELD_LABELS.status}</FieldLabel>
          <NativeSelect id="status" name="status" defaultValue={initial.status} className="w-full">
            <NativeSelectOption value={FOR_REVIEW}>{FOR_REVIEW}</NativeSelectOption>
            <NativeSelectOption value={VERIFIED}>{VERIFIED}</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field className="col-span-2">
          <FieldLabel htmlFor="particulars">Particulars</FieldLabel>
          <Textarea id="particulars" name="particulars" rows={3} defaultValue={initial.particulars} />
        </Field>
      </FieldGroup>
      <datalist id="opt-category">{options.category.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="opt-area">{options.trade_area.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="opt-program">{options.diploma_st_assessment.map((v) => <option key={v} value={v} />)}</datalist>

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
