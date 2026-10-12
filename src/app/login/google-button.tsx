"use client"

import { ArrowRightIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Spinner } from "@/components/ui/spinner"

/* The form is a native post, which useFormStatus never reports, so the click sets the label.
   A navy pill with a round glass arrow, matching the card.
   The button stays enabled: disabling it during the click would cancel the submit. */
export function GoogleButton() {
  const [pending, setPending] = useState(false)

  // Coming back from Google can restore this page with its old state.
  useEffect(() => {
    const reset = () => setPending(false)
    window.addEventListener("pageshow", reset)
    return () => window.removeEventListener("pageshow", reset)
  }, [])

  return (
    <button
      type="submit"
      aria-busy={pending}
      onClick={() => setPending(true)}
      className="group flex h-14 w-full items-center gap-3 rounded-full bg-sidebar px-2 font-medium text-sidebar-foreground shadow-[inset_0_1px_1px_rgb(255_255_255/0.35),inset_0_-8px_14px_-10px_rgb(255_255_255/0.25)] outline-offset-2 outline-sidebar transition-colors duration-200 hover:bg-[color-mix(in_oklch,var(--sidebar),black_22%)] focus-visible:outline-2 active:translate-y-px"
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-white"><GoogleMark className="size-5" /></span>
      {pending ? "Opening Google…" : "Continue with Google"}
      {pending ? (
        <Spinner aria-hidden="true" className="mr-3 ml-auto" />
      ) : (
        <span aria-hidden="true" className="ml-auto flex size-10 items-center justify-center rounded-full border border-white/30 bg-white/15 shadow-[inset_0_1px_1px_rgb(255_255_255/0.6)]">
          <ArrowRightIcon className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </span>
      )}
    </button>
  )
}

function GoogleMark(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
