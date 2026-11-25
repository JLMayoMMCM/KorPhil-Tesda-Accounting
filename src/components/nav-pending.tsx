"use client"

import { useLinkStatus } from "next/link"

import { Spinner } from "@/components/ui/spinner"

/**
 * Covers a navigation link with a spinner while its page loads. Put it inside a <Link> that is `relative`;
 * it takes the link's own background so the label underneath is hidden. Outside a <Link> it never shows.
 */
export function NavPending() {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return (
    <span className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-inherit">
      <Spinner />
    </span>
  )
}

/** A link's right-hand slot (a count, or nothing): swapped for a spinner while the link's page loads. */
export function NavSlot({ children }: { children?: React.ReactNode }) {
  const { pending } = useLinkStatus()
  return <span className="ml-auto flex items-center text-sidebar-foreground/70 tabular-nums">{pending ? <Spinner /> : children}</span>
}
