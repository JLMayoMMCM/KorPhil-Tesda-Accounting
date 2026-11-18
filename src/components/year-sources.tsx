"use client"

// Data sources: the form that adds a year (checked with a preview first) and each listed year's actions.
import { CircleAlertIcon, CircleCheckIcon } from "lucide-react"
import * as React from "react"

import { sourceAction, type Result } from "@/app/actions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { STATUSES, type Status } from "@/lib/years"

function Message({ result }: { result: { ok: boolean; message: string } | null }) {
  if (!result) return null
  return (
    <Alert variant={result.ok ? "default" : "destructive"} aria-live="polite">
      {result.ok ? <CircleCheckIcon /> : <CircleAlertIcon />}
      <AlertDescription>{result.message}</AlertDescription>
    </Alert>
  )
}

/** Add a year: paste the link, Check to preview it (title, tab, header row, row count), then Save to list it. */
export function AddYear({ year, tabs }: { year: string; tabs: Record<"voucher" | "collection", string> }) {
  const [state, action, pending] = React.useActionState(sourceAction, null)
  const [module, setModule] = React.useState<"voucher" | "collection">("voucher")
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[8rem_12rem_1fr]">
        <Field>
          <FieldLabel htmlFor="year">Year</FieldLabel>
          <Input id="year" name="year" inputMode="numeric" pattern="\d{4}" maxLength={4} defaultValue={year} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="module">Module</FieldLabel>
          <NativeSelect id="module" name="module" value={module} onChange={(e) => setModule(e.target.value as typeof module)} className="w-full">
            <NativeSelectOption value="voucher">Disbursement</NativeSelectOption>
            <NativeSelectOption value="collection">Collection</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="link">Spreadsheet link</FieldLabel>
          <Input id="link" name="link" type="url" placeholder="https://docs.google.com/spreadsheets/d/…" required />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[12rem_12rem]">
        <Field>
          <FieldLabel htmlFor="tab">Tab</FieldLabel>
          <Input id="tab" name="tab" placeholder={tabs[module]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="status">Status</FieldLabel>
          <NativeSelect id="status" name="status" defaultValue="Active" className="w-full">
            {STATUSES.map((s) => <NativeSelectOption key={s} value={s}>{s}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
      </div>
      <Message result={state} />
      {state?.preview?.tabs.length ? (
        <p className="text-sm text-muted-foreground">Tabs in this spreadsheet: {state.preview.tabs.join(", ")}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="check" variant="outline" disabled={pending}>Check</Button>
        <Button type="submit" name="intent" value="save" disabled={pending}>Save to the Years list</Button>
      </div>
    </form>
  )
}

/** One listed year's actions: status, link or tab, remove. action is yearRowAction bound to the row as listed. */
export function YearActions({ action, status, link, tab, label, defaultTab }: {
  action: (form: FormData) => Promise<Result>; status: Status; link: string; tab: string; label: string; defaultTab: string
}) {
  const [state, run, pending] = React.useActionState((_: Result | null, form: FormData) => action(form), null)
  const removeForm = React.useId()
  return (
    <div className="flex min-w-64 flex-col gap-2">
      <form action={run} className="flex items-center gap-2">
        <input type="hidden" name="intent" value="status" />
        <NativeSelect name="status" defaultValue={status} aria-label={`Status of ${label}`} size="sm"
          onChange={(e) => e.currentTarget.form?.requestSubmit()} disabled={pending}>
          {STATUSES.map((s) => <NativeSelectOption key={s} value={s}>{s}</NativeSelectOption>)}
        </NativeSelect>
        <Button type="submit" form={removeForm} variant="ghost" size="sm" className="text-destructive" disabled={pending}>Remove</Button>
      </form>
      <form id={removeForm} action={run} hidden
        onSubmit={(e) => { if (!window.confirm(`Remove ${label} from the Years list? The spreadsheet itself is not deleted.`)) e.preventDefault() }}>
        <input type="hidden" name="intent" value="remove" />
      </form>
      <details>
        <summary className="cursor-pointer text-sm text-muted-foreground">Change link or tab</summary>
        <form action={run} className="mt-2 flex flex-col gap-2">
          <input type="hidden" name="intent" value="link" />
          <Input name="link" type="url" defaultValue={link} aria-label={`Spreadsheet link of ${label}`} required />
          <div className="flex gap-2">
            <Input name="tab" defaultValue={tab} placeholder={defaultTab} aria-label={`Tab of ${label}`} />
            <Button type="submit" size="sm" variant="outline" disabled={pending}>Check and save</Button>
          </div>
        </form>
      </details>
      {state && <p className={state.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"} aria-live="polite">{state.message}</p>}
    </div>
  )
}
