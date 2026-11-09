"use client"

// The voucher form: the shared RecordPanel plus what only vouchers have, the DV # that follows its date and the Status
// select that wears its state.
import { CheckIcon } from "lucide-react"
import * as React from "react"

import { saveVoucher } from "@/app/actions"
import { RecordPanel, type RecordPanelProps } from "@/components/record-panel"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { nextDvNo, sameChoice, VERIFIED } from "@/lib/ledger"
import { cn } from "@/lib/utils"

type Props = Omit<RecordPanelProps, "save" | "remove" | "input" | "onField" | "required" | "wide"> & {
  dvNos?: string[] // every DV # in use, for a new voucher's number to follow its date
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Status wears its state, as on the Dashboard: indigo with a tick when Verified, the blue outlined square otherwise. Its choices are the sheet's. */
function StatusSelect({ choices, ...props }: React.ComponentProps<typeof NativeSelect> & { choices: string[] }) {
  const [value, setValue] = React.useState(String(props.defaultValue ?? ""))
  const verified = sameChoice(value, VERIFIED)
  return (
    <div className="relative">
      <NativeSelect {...props} onChange={(e) => setValue(e.target.value)}
        className={cn("w-full [&_select]:pl-8 [&_select]:font-medium",
          verified ? "[&_select]:border-primary [&_select]:bg-primary/10 [&_select]:text-primary [&_svg]:text-primary" : "[&_select]:border-review [&_select]:bg-review/10")}>
        <NativeSelectOption value="">Not set</NativeSelectOption>
        {choices.map((v) => <NativeSelectOption key={v} value={v}>{v}</NativeSelectOption>)}
      </NativeSelect>
      {verified
        ? <CheckIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-primary" />
        : <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-2.5 -translate-y-1/2 rounded-[2px] border-2 border-review" />}
    </div>
  )
}

export function VoucherPanel({ dvNos, ...props }: Props) {
  const autoNo = React.useRef(props.initial.dv_no) // the number last filled in; once the user types another, it stays theirs
  const save = React.useMemo(() => saveVoucher.bind(null, props.row, props.initial.dv_no ?? ""), [props.row, props.initial.dv_no])
  return (
    <RecordPanel
      {...props}
      save={save}
      required={["dv_no", "gross_amount"]}
      wide={["payee"]}
      input={(c, common, choices) => (c.field === "status" ? <StatusSelect {...common} choices={choices} /> : undefined)}
      onField={(form, name, value) => {
        const dvNo = form.elements.namedItem("dv_no") as HTMLInputElement | null
        if (dvNos && dvNo && name === "dv_date" && ISO.test(value) && dvNo.value === autoNo.current)
          dvNo.value = autoNo.current = nextDvNo(dvNos, value)
      }}
    />
  )
}
