"use client"

import { useEffect, useRef } from "react"

const RINGS = "pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[300rem] -translate-1/2 rounded-full motion-safe:animate-[login-rings_14s_ease-in-out_infinite_alternate]"

/* Rings that repeat the seal's own border, wide enough to cross the whole screen. They breathe outward slowly (keyframes in globals.css). A second, brighter set shows only around the pointer while it is over the page. */
export function SealRings() {
  const lit = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = lit.current
    const panel = el?.closest<HTMLElement>("[data-rings]")
    if (!el || !panel) return
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const scale = r.width / el.offsetWidth // the rings breathe, so the box is scaled
      el.style.setProperty("--x", `${(e.clientX - r.left) / scale}px`)
      el.style.setProperty("--y", `${(e.clientY - r.top) / scale}px`)
      el.style.opacity = "1"
    }
    const leave = () => { el.style.opacity = "0" }
    panel.addEventListener("pointermove", move)
    panel.addEventListener("pointerleave", leave)
    return () => {
      panel.removeEventListener("pointermove", move)
      panel.removeEventListener("pointerleave", leave)
    }
  }, [])

  return (
    <>
      <span aria-hidden="true" className={`${RINGS} bg-[repeating-radial-gradient(circle,transparent_0_4.95rem,rgb(255_255_255/0.09)_4.95rem_5rem)] mask-[radial-gradient(circle,black,transparent_60%)]`} />
      <span ref={lit} aria-hidden="true" className={`${RINGS} bg-[repeating-radial-gradient(circle,transparent_0_4.95rem,rgb(255_255_255/0.45)_4.95rem_5rem)] mask-[radial-gradient(14rem_circle_at_var(--x)_var(--y),black,transparent)] opacity-0 transition-opacity duration-300`} />
    </>
  )
}
