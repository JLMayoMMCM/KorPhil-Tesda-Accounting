"use client"

// The sidebar's year switch. The choice is saved per user (a cookie), so every page and export shows the same year.
import * as React from "react"

import { setYear } from "@/app/actions"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"

export type YearChoice = { year: string; readOnly: boolean }

/** Nothing when the Years list is empty: the app then reads the one sheet set in .env.local. */
export function YearPicker({ years, year }: { years: YearChoice[]; year: string }) {
  const [pending, start] = React.useTransition()
  if (!years.length) return null
  return (
    <label className="flex flex-col gap-1 px-2 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
      Year
      <NativeSelect
        value={year}
        disabled={pending}
        aria-busy={pending}
        onChange={(e) => start(() => setYear(e.target.value))}
        className="w-full [&_select]:bg-sidebar [&_select]:text-sidebar-foreground"
      >
        {years.map((y) => (
          <NativeSelectOption key={y.year} value={y.year}>{y.year}{y.readOnly ? " · read-only" : ""}</NativeSelectOption>
        ))}
      </NativeSelect>
    </label>
  )
}
