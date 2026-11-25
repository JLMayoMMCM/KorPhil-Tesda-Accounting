"use client"

import { ArrowRightIcon } from "lucide-react"
import { useFormStatus } from "react-dom"

import { Spinner } from "@/components/ui/spinner"

/** The portal row's submit: its ::after covers the whole row (a `group` that is `relative`).
    "Open" shows on hover or focus; while the action runs it stays up as "Opening…" and the row is locked. */
export function OpenRowButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" data-stretched aria-label={label} disabled={pending} aria-busy={pending || undefined}
      className="cursor-pointer text-lg font-semibold text-primary opacity-0 outline-none transition-opacity duration-200 group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-wait aria-busy:opacity-100 after:absolute after:inset-0 after:content-['']">
      {/* The slide lives on this span: a transform on the button would trap its ::after inside it. */}
      <span className="flex translate-x-2 items-center gap-1.5 transition-transform duration-200 group-hover:translate-x-0 group-has-focus-visible:translate-x-0 group-has-aria-busy:translate-x-0">
        {pending ? <>Opening…<Spinner aria-hidden="true" className="size-5" /></> : <>Open<ArrowRightIcon className="size-5" /></>}
      </span>
    </button>
  )
}
