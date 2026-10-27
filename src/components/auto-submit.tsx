"use client"

import { NativeSelect } from "@/components/ui/native-select"

/** A GET-form checkbox that applies as soon as it's ticked or cleared. */
export function AutoSubmitCheckbox(props: Omit<React.ComponentProps<"input">, "type" | "onChange">) {
  return <input type="checkbox" {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
}

/** A GET-form select that applies as soon as it changes. */
export function AutoSubmitSelect(props: React.ComponentProps<typeof NativeSelect>) {
  return <NativeSelect {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
}
