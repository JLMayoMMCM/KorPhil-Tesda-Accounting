"use client"

import { NativeSelect } from "@/components/ui/native-select"

/** A GET-form select that applies as soon as it changes. */
export function AutoSubmitSelect(props: React.ComponentProps<typeof NativeSelect>) {
  return <NativeSelect {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
}
