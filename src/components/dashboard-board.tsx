"use client"

// The Dashboard as panels on a 4-column grid (2, then 1, on narrow screens) in two areas, each with one row height: key
// figures, then charts and breakdowns side by side. Rows fill left to right at each panel's own width (lib/dashboard.ts);
// the empty end of a short row stays blank until pointed at, then offers + Add with the panels that fit it. Drag a panel
// by its grip to move it within its area; drag its corner to resize
// it: it follows the pointer while a dashed outline shows the width it will snap to. A move or resize waits for ✓
// (keep) or ✕ (undo) on the panel; then it is saved in the year's spreadsheet for this person (saveDashboardLayout) and
// in a cookie for this browser. Title picks, adds and removals save at once. The server page renders every panel.
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { ArrowRightIcon, CheckIcon, ChevronDownIcon, GripVerticalIcon, MoveHorizontalIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react"

import { saveDashboardLayout } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { arrange, areaOf, AREAS, dashboardCookie, fitting, moved, nearest, SECTIONS, WIDTH_NAMES, type Area, type Cell, type DashLayout, type Section } from "@/lib/dashboard"
import type { BookName } from "@/lib/sheets"
import { cn } from "@/lib/utils"

/**
 * One choice for a panel. section: where it lives. widths: the widths (columns of 4) it reads well at, the first used
 * when it's added. tall: the full-width summary, taller than other charts. href/action: the link into the list behind it.
 */
export type Panel = {
  id: string; section: Section; title: string; description?: React.ReactNode; href?: string; action?: string
  widths: number[]; tall?: boolean; children: React.ReactNode
}

const HEIGHT: Record<Area, number> = { figures: 150, panels: 520 } // px per row of each area
const TALL = 700
const GAP = 16
const GLIDE = { duration: 420, easing: "cubic-bezier(0.32, 0.72, 0, 1)" } // fast out, long soft landing
const SPRING = { duration: 460, easing: "cubic-bezier(0.3, 1.22, 0.5, 1)" } // a resize settles with a small overshoot
const LIFT = "0 28px 56px -18px rgb(28 25 23 / 0.30), 0 10px 22px -12px rgb(28 25 23 / 0.16)"
// Soft panels, as before: rounded, hairline border instead of a ring, barely-there shadow.
const PANEL = "rounded-2xl ring-0 border shadow-xs break-inside-avoid"
// The panel's own controls: faint until the panel is pointed at or focused; always shown on touch screens.
const QUIET = "opacity-40 transition-opacity group-hover/panel:opacity-100 group-focus-within/panel:opacity-100 [@media(hover:none)]:opacity-100 print:hidden"
const columnsFor = (width: number) => (width >= 880 ? 4 : width >= 520 ? 2 : 1)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
/** Panels grouped by kind (key figures, charts, breakdowns) for the menus, empty groups left out. */
const bySection = (list: Panel[]) => SECTIONS.map((s) => ({ label: s.name, panels: list.filter((p) => p.section === s.key) })).filter((g) => g.panels.length)

type Box = { x: number; y: number; w: number; h: number }
type Drag = { id: string; offX: number; offY: number; w: number; h: number; px: number; py: number; order: DashLayout; hover: string | null }
/** A corner held down: the panel's box in its grid, where the pointer started, and how far it may stretch. */
type Resize = Box & { id: string; x0: number; w0: number; min: number; max: number; col: number; gridLeft: number }

export function DashboardBoard({ name, sheet, panels, defaults, saved, toolbar }: {
  name: BookName; sheet: string; panels: Panel[]; defaults: DashLayout; saved: DashLayout | null; toolbar: React.ReactNode
}) {
  const byId = new Map(panels.map((p) => [p.id, p]))
  /** Sections in order, each panel's entries kept together, unknown panels (a column gone from the sheet) dropped. */
  const tidy = (l: DashLayout): DashLayout => AREAS.flatMap((a) => l.flatMap(([id, w]): DashLayout => {
    const p = byId.get(id)
    return p && areaOf(p.section) === a.key ? [[id, p.widths.includes(w) ? w : nearest(p.widths, w)]] : []
  }))
  const [layout, setLayout] = useState<DashLayout>(() => tidy(saved ?? defaults))
  const [draft, setDraft] = useState<DashLayout | null>(null) // a move or resize waiting for ✓ or ✕
  const [focus, setFocus] = useState<{ id: string; kind: "move" | "resize" } | null>(null) // the panel carrying ✓ / ✕
  const [cols, setCols] = useState(4)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [resize, setResize] = useState<Resize | null>(null)
  const [removed, setRemoved] = useState<{ entry: DashLayout[number]; at: number } | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [saving, startSaving] = useTransition()
  const board = useRef<HTMLDivElement>(null)
  const nodes = useRef(new Map<string, HTMLElement>()) // each panel's cell (and "slot:"/"ghost:" placeholders)
  const boxes = useRef(new Map<string, Box>()) // each cell's box last frame, in its grid, without transforms
  const press = useRef<Omit<Drag, "order" | "hover"> | null>(null) // a grip held down, not yet dragged
  const landing = useRef<{ id: string; rect: DOMRect } | null>(null) // where a dropped or resized panel was, on screen

  const base = draft ?? layout
  const shown = drag?.order ?? base

  // Columns follow the board's own width (the sidebar may be open or collapsed), before paint so nothing jumps.
  useLayoutEffect(() => {
    const el = board.current
    if (!el) return
    const fit = () => setCols(columnsFor(el.clientWidth))
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  // A cell whose box changed glides (or, resized, springs) from where it is on screen to its new box (FLIP). Boxes are
  // read without transforms (offset*, the section grid being the offset parent); a glide still running is picked up
  // where it is and replaced, never stacked, since measuring moving cells and stacking glides runs away.
  useLayoutEffect(() => {
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches
    for (const [id, el] of nodes.current) {
      if (id === drag?.id || id === resize?.id) continue // under the pointer
      const now = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }
      const was = boxes.current.get(id)
      boxes.current.set(id, now)
      let dx = 0, dy = 0, sx = 1, sy = 1
      if (landing.current?.id === id) {
        const from = landing.current.rect, to = el.getBoundingClientRect()
        dx = from.left - to.left; dy = from.top - to.top; sx = from.width / to.width; sy = from.height / to.height
        landing.current = null
      } else if (was && !same(was, now)) {
        const m = new DOMMatrixReadOnly(getComputedStyle(el).transform) // a running glide's offset and scale
        dx = was.x + m.e - now.x; dy = was.y + m.f - now.y; sx = (was.w * m.a) / now.w; sy = (was.h * m.d) / now.h
      } else continue
      el.getAnimations().forEach((a) => a.cancel())
      const resized = Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01
      if (calm || (!resized && Math.abs(dx) < 1 && Math.abs(dy) < 1)) continue
      el.animate([{ transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transformOrigin: "0 0", transform: "none" }], resized ? SPRING : GLIDE)
      // While the box stretches, the content fades back in, so the stretch doesn't read as squashed text.
      if (resized) el.querySelector("[data-slot=card-content]")?.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 320, easing: GLIDE.easing })
    }
  })

  useEffect(() => {
    if (!removed) return
    const t = setTimeout(() => setRemoved(null), 8000)
    return () => clearTimeout(t)
  }, [removed])

  // Escape drops a drag where it started, or undoes a move or resize waiting for ✓.
  useEffect(() => {
    if (!drag && !draft) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      press.current = null
      if (drag) setDrag(null)
      else { setDraft(null); setFocus(null) }
    }
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
  }, [drag, draft])

  /** Save a layout now (and any move or resize still waiting with it). */
  const commit = (next: DashLayout, gone: typeof removed = null) => {
    next = tidy(next)
    setLayout(next)
    setDraft(null)
    setFocus(null)
    setRemoved(gone)
    document.cookie = `${dashboardCookie(name)}=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=31536000; samesite=lax`
    // Server actions run one after another, so the last change is the one that stays saved.
    startSaving(async () => setStatus(await saveDashboardLayout(name, sheet, next)))
  }
  /** Hold a moved or resized layout for ✓ / ✕ on that panel; a layout back where it was needs neither. */
  const hold = (next: DashLayout, id: string, kind: "move" | "resize") => {
    if (same(next, layout)) { setDraft(null); setFocus(null); return }
    setDraft(next)
    setFocus({ id, kind })
  }

  /** The panel under the pointer, in the dragged one's section, takes its turn in the order; the rest reflow. */
  const follow = (px: number, py: number) => setDrag((d) => {
    if (!d) return d
    const area = areaOf(byId.get(d.id)!.section)
    const under = d.order.find(([id]) => {
      const el = nodes.current.get(id)
      const q = byId.get(id)
      if (id === d.id || !q || areaOf(q.section) !== area || !el) return false
      const r = el.getBoundingClientRect()
      return px >= r.left && px < r.right && py >= r.top && py < r.bottom
    })?.[0] ?? null
    // Only a newly entered panel moves things, so a cell that shifts under a still pointer doesn't flip back and forth.
    if (!under || under === d.hover) return { ...d, px, py, hover: under ?? d.hover }
    const at = (id: string) => d.order.findIndex(([x]) => x === id)
    return { ...d, px, py, hover: under, order: moved(d.order, at(d.id), at(under)) }
  })

  const onBoard = new Set(base.map(([id]) => id))
  const notShown = panels.filter((p) => !onBoard.has(p.id))
  const isDefault = same(layout, tidy(defaults))
  const keep = (id: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(id, el)
    else { nodes.current.delete(id); boxes.current.delete(id) } // a new placeholder starts where it appears
  }
  const outline = "grid place-items-center rounded-2xl border-2 border-dashed border-primary/45 bg-primary/[0.06]"

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-2 print:hidden">
        {toolbar}
        {(draft || saving || status) && (
          <span role="status" title={!draft && status?.ok === false ? status.message : undefined}
            className={cn("text-xs", !draft && status?.ok === false && !saving ? "text-destructive" : "text-muted-foreground")}>
            {draft ? "Unsaved change" : saving ? "Saving layout…" : status?.ok ? "Layout saved" : "Layout saved on this PC only"}
          </span>
        )}
        {!isDefault && <Button size="sm" variant="ghost" onClick={() => commit(defaults)}>Reset layout</Button>}
      </div>

      <div ref={board} className={cn("flex flex-col gap-4", (drag || resize) && "select-none")}>
        {AREAS.map(({ key, name: sectionName }) => {
          const inArea = (p?: Panel) => !!p && areaOf(p.section) === key
          const list = shown.filter(([id]) => inArea(byId.get(id)))
          const missing = notShown.filter(inArea)
          const { cells: placed, gaps } = arrange(list, cols)
          const cells = new Map(list.map(([id], i) => [id, placed[i]]))
          const spot = (c: Cell) => ({ gridColumn: `${c.x + 1} / span ${c.span}`, gridRow: c.y + 1 })
          const area = (id: string) => spot(cells.get(id)!)
          // Gaps that some missing panel fits offer it.
          // Each gap offers the missing panels that fit it, and widening the panel just before it (on its row) to fill it,
          // when that panel can take that width; a gap with neither stays blank.
          const open = drag || resize ? [] : gaps.map((g) => {
            const [beside] = list[g.after], grown = cells.get(beside)!.span + g.span
            return { g, beside, grown: byId.get(beside)!.widths.includes(grown) ? grown : null, fits: missing.filter((p) => fitting(p.widths, g.span) !== undefined) }
          }).filter((o) => o.fits.length || o.grown)
          if (!list.length) return null
          return (
            <section key={key} aria-label={sectionName}>
                <div className="relative grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                  {/* Saved order, not screen order: grid lines place each cell, and a dragged panel's node must never move in the DOM (that drops the pointer). */}
                  {layout.filter(([id]) => cells.has(id)).flatMap(([id]) => {
                    const p = byId.get(id)!, width = list.find(([x]) => x === id)![1], height = p.tall ? TALL : HEIGHT[key]
                    const lifted = drag?.id === id, held = resize?.id === id
                    const pending = !!draft && focus?.id === id && !drag && !resize
                    const i = base.findIndex(([x]) => x === id)
                    const canResize = p.widths.length > 1 && cols > 1
                    const setWidth = (w: number) => setDraft((d) => (d ?? layout).map((e) => (e[0] === id ? [id, w] : e)))
                    const pick = (other: string) => {
                      // Picking a panel shown elsewhere swaps the two; each keeps the slot's width if it can.
                      const j = base.findIndex(([x]) => x === other)
                      const fits = (pid: string, w: number) => (byId.get(pid)!.widths.includes(w) ? w : byId.get(pid)!.widths[0])
                      commit(base.map((e, n) => (n === i ? [other, fits(other, e[1])] : n === j ? [id, fits(id, e[1])] : e)))
                    }
                    const placeholder = (k: string, label?: React.ReactNode) => (
                      <div key={k} ref={keep(k)} aria-hidden="true" className={outline} style={{ ...area(id), height }}>
                        {label && <span className="flex items-center gap-2 rounded-full bg-background px-3 py-1.5 text-sm font-medium text-primary shadow-md">{label}</span>}
                      </div>
                    )
                    return [
                      ...(lifted ? [placeholder(`slot:${id}`)] : []),
                      ...(held ? [placeholder(`ghost:${id}`, <><WidthBars width={width} />{WIDTH_NAMES[width]}</>)] : []),
                      <div key={id} ref={keep(id)} className="group/panel relative min-w-0 rounded-2xl"
                        style={lifted && drag ? {
                          position: "fixed", left: 0, top: 0, width: drag.w, height: drag.h, zIndex: 40,
                          transform: `translate3d(${drag.px - drag.offX}px, ${drag.py - drag.offY}px, 0) scale(1.02)`,
                        } : held && resize ? {
                          position: "absolute", left: resize.x, top: resize.y, width: resize.w, height: resize.h, zIndex: 30,
                        } : { ...area(id), height }}>
                        <Card size={key === "figures" ? "sm" : "default"}
                          className={cn(PANEL, "h-full min-w-0", key === "figures" && "gap-1 px-1", (pending || held) && "border-transparent ring-2 ring-primary")}
                          style={lifted || held ? { boxShadow: LIFT } : undefined}>
                          <CardHeader className="flex items-start gap-1">
                            <button type="button" aria-label={`Move ${p.title}: drag, or use the arrow keys`} title="Drag to move"
                              className={cn(QUIET, "-ml-1.5 grid h-7 w-5 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                                lifted && "cursor-grabbing opacity-100")}
                              onPointerDown={(e) => {
                                if (e.button !== 0) return
                                const r = nodes.current.get(id)!.getBoundingClientRect()
                                press.current = { id, offX: e.clientX - r.left, offY: e.clientY - r.top, w: r.width, h: r.height, px: e.clientX, py: e.clientY }
                                e.currentTarget.setPointerCapture(e.pointerId)
                              }}
                              onPointerMove={(e) => {
                                const s = press.current
                                if (!s) return
                                if (!drag) {
                                  if (Math.hypot(e.clientX - s.px, e.clientY - s.py) < 4) return // a click, not a drag yet
                                  setDrag({ ...s, px: e.clientX, py: e.clientY, order: base, hover: null })
                                  return
                                }
                                if (e.clientY < 72) scrollBy(0, -18)
                                else if (e.clientY > innerHeight - 72) scrollBy(0, 18)
                                follow(e.clientX, e.clientY)
                              }}
                              onPointerUp={() => {
                                press.current = null
                                if (!drag) return
                                landing.current = { id, rect: nodes.current.get(id)!.getBoundingClientRect() }
                                hold(drag.order, id, "move")
                                setDrag(null)
                              }}
                              onPointerCancel={() => { press.current = null; setDrag(null) }}
                              onKeyDown={(e) => {
                                const step = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : 0
                                const to = base[i + step]
                                if (!step || !to || !inArea(byId.get(to[0]))) return
                                e.preventDefault()
                                hold(moved(base, i, i + step), id, "move")
                              }}>
                              <GripVerticalIcon className="size-4" />
                            </button>
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                              <DropdownMenu>
                                <DropdownMenuTrigger render={
                                  <button type="button" className={cn("-ml-1 inline-flex max-w-full items-center gap-1 self-start rounded-md px-1 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring print:pointer-events-none",
                                    key === "figures" ? "text-sm text-muted-foreground" : "font-heading text-base leading-snug font-medium")} />
                                }>
                                  <span className="min-w-0 truncate">{p.title}</span>
                                  <ChevronDownIcon aria-hidden="true" className={cn("size-3.5 shrink-0 text-muted-foreground", QUIET)} />
                                  <span className="sr-only">, change what this panel shows</span>
                                </DropdownMenuTrigger>
                                <PanelMenu groups={bySection(panels.filter(inArea))} current={id} onBoard={onBoard} onPick={pick} />
                              </DropdownMenu>
                              {p.description && <CardDescription className="line-clamp-2">{p.description}</CardDescription>}
                            </div>
                            <div className={cn(QUIET, "flex shrink-0 items-center")}>
                              {p.href && (
                                <Button size="icon-sm" variant="ghost" className="size-7" title={p.action ?? "Open"} aria-label={`${p.action ?? "Open"}: ${p.title}`}
                                  render={<Link href={p.href} />} nativeButton={false}>
                                  <ArrowRightIcon />
                                </Button>
                              )}
                              <Button size="icon-sm" variant="ghost" className="size-7" title="Remove" aria-label={`Remove ${p.title}`}
                                onClick={() => commit(base.filter((_, n) => n !== i), { entry: base[i], at: i })}>
                                <Trash2Icon />
                              </Button>
                            </div>
                          </CardHeader>
                          <PanelBody>{p.children}</PanelBody>
                        </Card>

                        {canResize && !lifted && (
                          // The corner handle, like an iOS widget's: drag sideways to change the width; arrow keys too.
                          <button type="button" title="Drag sideways to resize"
                            aria-label={`Resize ${p.title}: now ${WIDTH_NAMES[width].toLowerCase()}. Drag sideways, or use the left and right arrow keys.`}
                            className={cn(QUIET, "absolute right-1 bottom-1 z-10 grid size-9 cursor-ew-resize touch-none place-items-center rounded-br-2xl text-foreground/60 outline-none transition-[opacity,transform] hover:scale-110 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                              held && "opacity-100")}
                            onPointerDown={(e) => {
                              if (e.button !== 0) return
                              e.preventDefault()
                              const handle = e.currentTarget
                              const cell = nodes.current.get(id)!, grid = cell.parentElement!.getBoundingClientRect(), r = cell.getBoundingClientRect()
                              const col = (grid.width - GAP * (cols - 1)) / cols, px = (n: number) => n * col + (n - 1) * GAP
                              setResize({
                                id, x: r.left - grid.left, y: r.top - grid.top, w: r.width, h: r.height, x0: e.clientX, w0: r.width, col, gridLeft: grid.left,
                                min: px(p.widths[0]), max: Math.min(grid.right - r.left, px(p.widths.at(-1)!)),
                              })
                              setDraft((d) => d ?? layout)
                              handle.setPointerCapture(e.pointerId)
                            }}
                            onPointerMove={(e) => {
                              if (!resize || resize.id !== id) return
                              // Follow the pointer, with rubber-band resistance past the narrowest and widest sizes.
                              const raw = resize.w0 + e.clientX - resize.x0
                              const w = raw < resize.min ? resize.min - (resize.min - raw) * 0.2 : raw > resize.max ? resize.max + (raw - resize.max) * 0.2 : raw
                              setResize({ ...resize, w: Math.max(80, w) })
                              const snapped = nearest(p.widths, (e.clientX - resize.gridLeft - resize.x + GAP / 2) / (resize.col + GAP))
                              if (snapped !== width) setWidth(snapped)
                            }}
                            onPointerUp={() => {
                              if (!resize || resize.id !== id) return
                              landing.current = { id, rect: nodes.current.get(id)!.getBoundingClientRect() }
                              setResize(null)
                              hold(draft ?? layout, id, "resize")
                            }}
                            onPointerCancel={() => { setResize(null); setDraft(null); setFocus(null) }}
                            onKeyDown={(e) => {
                              const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
                              const w = p.widths[p.widths.indexOf(width) + step]
                              if (!step || w === undefined) return
                              e.preventDefault()
                              hold(base.map((x) => (x[0] === id ? [id, w] : x)), id, "resize")
                            }}>
                            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6"><path d="M19 6c0 7.2-5.8 13-13 13" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" /></svg>
                          </button>
                        )}

                        {pending && focus && (
                          <div role="group" aria-label="Keep this change?"
                            className="absolute -top-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-background p-1 shadow-lg ring-1 ring-foreground/10 print:hidden">
                            <Button size="icon-sm" variant="secondary" className="rounded-full" aria-label="Undo this change" title="Undo (Esc)"
                              onClick={() => { setDraft(null); setFocus(null) }}>
                              <XIcon />
                            </Button>
                            <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">{focus.kind === "resize" ? "Keep this size?" : "Keep it here?"}</span>
                            <Button size="icon-sm" className="rounded-full" aria-label="Keep this change" title="Keep" onClick={() => commit(draft!)}>
                              <CheckIcon />
                            </Button>
                          </div>
                        )}
                      </div>,
                    ]
                  })}
                  {/* The empty end of a short row stays blank; pointed at (or focused), it offers the panels that fit it,
                      or to widen the panel beside it (a resize, so it waits for ✓ / ✕ like one). */}
                  {open.map(({ g, beside, grown, fits }) => {
                    const after = base.findIndex(([id]) => id === beside)
                    const widen = grown ? {
                      title: byId.get(beside)!.title, width: grown,
                      run: () => hold(base.map((e) => (e[0] === beside ? [beside, grown] : e)), beside, "resize"),
                    } : undefined
                    return (
                      <AddSpace key={`gap:${g.x},${g.y}`} label={fits.length ? `Add a panel to this space in ${sectionName.toLowerCase()}` : `Widen ${widen!.title} to fill this space`}
                        style={{ ...spot(g), height: HEIGHT[key] }} widen={widen}
                        heading="Add to this space" note={`Panels that fit ${g.span} of ${cols} columns`}
                        groups={bySection(fits)} width={(x) => fitting(x.widths, g.span)!}
                        onPick={(id) => commit([...base.slice(0, after + 1), [id, fitting(byId.get(id)!.widths, g.span)!], ...base.slice(after + 1)])} />
                    )
                  })}
                </div>
            </section>
          )
        })}
        {/* Panels not shown can always be added here: a thin strip after the last panel, blank until pointed at, so the
            sections above stay joined. A panel goes to the end of its own section. */}
        {!drag && !resize && notShown.length > 0 && (
          <AddSpace thin label="Add a panel to the dashboard" heading="Add a panel" note="It goes at the end of its section. Drag it to move it."
            width={(x) => x.widths[0]} onPick={(id) => commit([...base, [id, byId.get(id)!.widths[0]]])}
            groups={bySection(notShown)} />
        )}
      </div>

      {removed && byId.get(removed.entry[0]) && (
        <div role="status" className="sticky bottom-4 z-20 mx-auto flex items-center gap-3 rounded-lg bg-foreground py-1.5 pr-1.5 pl-4 text-sm text-background shadow-lg print:hidden">
          Removed “{byId.get(removed.entry[0])!.title}”
          <Button size="sm" variant="secondary" onClick={() => commit([...layout.slice(0, removed.at), removed.entry, ...layout.slice(removed.at)])}>Undo</Button>
        </div>
      )}
    </>
  )
}

/**
 * Empty space that offers panels: invisible at rest, it shows as a dashed outline with "Add +" when pointed at,
 * focused or open (always faintly on touch screens, which can't point). thin: the strip ending the dashboard.
 * Clicked, it opens a picker card under "Add +": a heading, then each panel as a tile with a sketch of what it shows
 * and the width it will take. width: that width for a panel (what fits the space, or its first width).
 * widen: the panel beside the space can grow to fill it; offered at the foot of the card, or on its own (pointed at,
 * the space shows "Widen ↔" and a click widens it) when no panel fits.
 */
function AddSpace({ label, heading, note, groups, width, onPick, style, thin, widen }: {
  label: string; heading: string; note: string; groups: { label?: string; panels: Panel[] }[]; width: (p: Panel) => number
  onPick: (id: string) => void; style?: React.CSSProperties; thin?: boolean; widen?: { title: string; width: number; run: () => void }
}) {
  const text = useRef<HTMLSpanElement>(null) // the card opens centred under "Add +", not at the space's left edge
  const look = cn("flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-transparent font-medium text-transparent outline-none transition-[color,border-color,background-color] duration-200 ease-out",
    "hover:border-primary/45 hover:bg-primary/[0.04] hover:text-primary focus-visible:border-primary/45 focus-visible:text-primary data-[popup-open]:border-primary/45 data-[popup-open]:bg-primary/[0.04] data-[popup-open]:text-primary",
    "[@media(hover:none)]:border-border [@media(hover:none)]:text-muted-foreground print:hidden",
    thin ? "h-14 text-sm" : "text-xl")
  if (widen && !groups.some((g) => g.panels.length)) return (
    <button type="button" aria-label={label} style={style} className={cn(look, "flex-col gap-1")} onClick={widen.run}>
      <span className="flex items-center gap-2">Widen<MoveHorizontalIcon className="size-6" /></span>
      <span className="text-sm font-normal">{widen.title} to {WIDTH_NAMES[widen.width].toLowerCase()}</span>
    </button>
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" aria-label={label} style={style} className={look} />}>
        <span ref={text} className="flex items-center gap-2">Add<PlusIcon className={thin ? "size-4" : "size-6"} /></span>
      </DropdownMenuTrigger>
      <DropdownMenuContent anchor={text} align="center" sideOffset={12}
        className="w-[min(23rem,calc(100vw-2rem))] gap-0 overflow-visible rounded-2xl border-t-[3px] border-t-primary p-0 shadow-[0_24px_48px_-16px_rgb(28_25_23/0.28),0_8px_18px_-10px_rgb(28_25_23/0.16)]">
        <MenuPrimitive.Arrow className="size-3 rotate-45 rounded-[2px] bg-primary data-[side=bottom]:-top-[7px] data-[side=top]:-bottom-[7px]" />
        <div className="flex flex-col gap-0.5 px-4 pt-3.5 pb-2.5">
          <span className="text-sm font-semibold">{heading}</span>
          <span className="text-xs text-muted-foreground">{note}</span>
        </div>
        <div className="flex max-h-[min(26rem,var(--available-height))] flex-col gap-3 overflow-y-auto overscroll-contain px-3 pb-3">
          {groups.map((g, n) => (
            <DropdownMenuGroup key={g.label ?? n} className="flex flex-col gap-1.5">
              {g.label && <DropdownMenuLabel className="px-1 text-xs font-semibold text-foreground/70">{g.label}</DropdownMenuLabel>}
              <div className="grid grid-cols-2 gap-2">
                {g.panels.map((p) => (
                  <DropdownMenuItem key={p.id} onClick={() => onPick(p.id)}
                    className="flex-col items-stretch gap-2 rounded-xl border bg-card p-2 transition-colors focus:border-primary/50 focus:bg-primary/[0.05] focus:text-foreground">
                    <Sketch panel={p} />
                    <span className="line-clamp-2 min-h-8 text-[13px] leading-4 font-medium">{p.title}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <WidthBars width={width(p)} small />{WIDTH_NAMES[width(p)]}
                    </span>
                  </DropdownMenuItem>
                ))}
              </div>
            </DropdownMenuGroup>
          ))}
          {widen && (
            <DropdownMenuItem onClick={widen.run} className="gap-2 rounded-xl border border-dashed px-3 py-2.5 text-[13px] focus:border-primary/50 focus:bg-primary/[0.05] focus:text-foreground">
              <MoveHorizontalIcon className="text-primary" />Or widen {widen.title} to {WIDTH_NAMES[widen.width].toLowerCase()}
            </DropdownMenuItem>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A grey thumbnail of what a panel shows: a big figure, a line chart, a summary list, or ranked bars. */
function Sketch({ panel }: { panel: Panel }) {
  const ink = "bg-foreground/15", accent = "bg-primary/45"
  return (
    <span aria-hidden="true" className="flex h-12 flex-col justify-center gap-1.5 overflow-hidden rounded-lg bg-muted/70 px-2.5">
      {panel.section === "figures" ? (
        <>
          <span className={cn("h-1.5 w-10 rounded-full", ink)} />
          <span className="h-3.5 w-20 rounded-[3px] bg-foreground/35" />
        </>
      ) : panel.section === "charts" && panel.tall ? (
        <span className="flex items-center gap-2">
          <span className="flex flex-col gap-1">{[0, 1, 2].map((i) => <span key={i} className={cn("h-1.5 w-8 rounded-full", i ? ink : accent)} />)}</span>
          <span className="flex flex-1 flex-col gap-1"><span className="h-3 rounded-[3px] bg-foreground/10" /><span className="h-3 rounded-[3px] bg-foreground/10" /></span>
        </span>
      ) : panel.section === "charts" ? (
        <span className="block h-8 w-full">
          <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="size-full text-primary/60">
            <path d="M0 26 C14 24 18 12 32 14 S52 22 62 12 S84 4 100 8 L100 32 L0 32 Z" className="fill-primary/10" />
            <path d="M0 26 C14 24 18 12 32 14 S52 22 62 12 S84 4 100 8" fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </svg>
        </span>
      ) : (
        [92, 64, 40].map((w) => <span key={w} className={cn("h-1.5 rounded-full", accent)} style={{ width: `${w}%` }} />)
      )}
    </span>
  )
}

/**
 * A panel's content. It scrolls only when it is clearly taller than the panel (a long list); a few pixels over is
 * trimmed instead, because a browser gives a whole wheel gesture to whatever starts scrolling, so a barely scrollable
 * panel would keep the page from scrolling under the pointer. @container/panel lets a figure scale with its panel.
 */
function PanelBody({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scrolls, setScrolls] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const watch = new ResizeObserver(() => setScrolls(el.scrollHeight - el.clientHeight > 24)) // also runs once on observe
    watch.observe(el)
    for (const child of el.children) watch.observe(child)
    return () => watch.disconnect()
  }, [])
  return <CardContent ref={ref} className={cn("@container/panel min-h-0 flex-1", scrolls ? "overflow-y-auto" : "overflow-hidden")}>{children}</CardContent>
}

/** A width drawn as filled quarters. */
function WidthBars({ width, small }: { width: number; small?: boolean }) {
  return (
    <span aria-hidden="true" className="flex gap-0.5">
      {[0, 1, 2, 3].map((c) => <span key={c} className={cn("rounded-[2px]", small ? "h-2.5 w-1" : "h-4 w-1.5", c < width ? "bg-primary" : small ? "bg-foreground/15" : "bg-muted")} />)}
    </span>
  )
}

/** A section's panels; a tick on the current one, and a note on those already shown (picking one swaps). */
function PanelMenu({ groups, current, onBoard, onPick }: {
  groups: { label: string; panels: Panel[] }[]; current?: string; onBoard?: Set<string>; onPick: (id: string) => void
}) {
  return (
    <DropdownMenuContent className="max-h-96 w-72">
      {groups.map((g) => (
        <DropdownMenuGroup key={g.label}>
          <DropdownMenuLabel>{g.label}</DropdownMenuLabel>
          {g.panels.map((p) => (
            <DropdownMenuItem key={p.id} className="items-start gap-2 py-1.5" onClick={() => p.id !== current && onPick(p.id)}>
              <CheckIcon className={cn("mt-0.5 text-primary", p.id !== current && "invisible")} />
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{p.title}</span>
                {p.id !== current && onBoard?.has(p.id) && <span className="text-xs text-muted-foreground">Shown in another panel · swaps places</span>}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      ))}
    </DropdownMenuContent>
  )
}
