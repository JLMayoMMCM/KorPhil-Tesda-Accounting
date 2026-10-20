"use client"

// Workspace review queue: duplicate-DV pairs, the compare drawer that renumbers one of them, and the other checks.
import { Dialog } from "@base-ui/react/dialog"
import { cn } from "cn"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, CopyIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import * as React from "react"

import { renumberVoucher, type Result } from "@/app/actions"
import { useUI } from "@/components/app-ui"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { toast } from "@/components/ui/toast"
import { DV_FORMAT, label, nextDvNo, peso, shortDate, type Issue, type Voucher } from "@/lib/ledger"

export type Pair = { dv: string; a: Voucher; b: Voucher }
type Key = "a" | "b"
type Done = { dv: string; sheetRow: number; newNo: string; key: Key; payee: string; amount: number }
type Same = Record<"payee" | "particulars" | "date" | "area" | "ref" | "amount", boolean>

const GRID = "grid grid-cols-[16px_20px_60px_minmax(240px,1fr)_64px_200px_120px_84px] items-center gap-3 px-3"
const PRIMARY = "bg-[#232a7c] text-white hover:bg-[#181e62] disabled:opacity-45"

const refType = (ref: string) => (/^\d{7}$/.test(ref.trim()) ? "Check" : "ADA")
const refText = (v: Voucher) => (v.check_number.trim() ? `${refType(v.check_number)} ${v.check_number.trim()}` : "—")
const and = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] ?? "")
const longish = (v: Voucher) => (v.dv ? `${shortDate(v.dv)}, ${v.dv.slice(0, 4)}` : "No date")
const same = (x: string, y: string) => x.trim() === y.trim()
/** Diff highlight: the padding is always there so highlighted and plain text line up. */
const mark = (ok?: boolean) => cn("-mx-1 rounded-[4px] px-1 py-px", ok === false && "bg-[#fbf0dc]")

function analyze({ a, b }: Pair) {
  const s: Same = {
    payee: same(a.payee, b.payee), particulars: same(a.particulars, b.particulars), date: a.dv === b.dv,
    area: same(a.trade_area, b.trade_area), ref: same(a.check_number, b.check_number), amount: a.amount === b.amount,
  }
  const ref = refType(a.check_number) === "Check" ? "check #" : "ADA #"
  const twice = s.payee && s.amount && s.ref
  const differs = ([["payee", s.payee], ["amount", s.amount], ["check / ADA #", s.ref], ["date", s.date], ["area", s.area]] as const)
    .filter(([, ok]) => !ok).map(([name]) => name as string)
  if (!twice) return {
    s, twice,
    summary: `Differs in ${and(differs)}`,
    explain: `These are separate disbursements that were given the same DV #. They differ in ${and(differs)}. Keep the number on one voucher and give the other the next available DV #.`,
  }
  const odd = [!s.particulars && "particulars", ...differs].filter(Boolean) as string[]
  const matching = ["Payee", s.particulars && "particulars", s.date && "date", "amount", ref].filter(Boolean) as string[]
  const values = odd.length !== 1 ? "" : odd[0] === "area" ? ` (${label(a, "trade_area")} vs ${label(b, "trade_area")})`
    : odd[0] === "date" ? ` (${longish(a)} vs ${longish(b)})` : ""
  return {
    s, twice,
    summary: `Same payee, amount and ${ref}; ` + (odd.length ? `only the ${and(odd)} differs` : "every field matches"),
    explain: `${and(matching)} all match.` + (odd.length ? ` Only the ${and(odd)} differ${odd.length > 1 ? "" : "s"}${values}, so` : " So")
      + " this is most likely one voucher recorded twice. Open it in Vouchers to correct the extra entry, or give one of them a new DV #.",
  }
}

function DvNo({ dv, prefix }: { dv: string; prefix?: string }) {
  const cut = dv.lastIndexOf("-") + 1
  return <span className="whitespace-nowrap"><span className={cn("text-[#676b86]", prefix)}>{dv.slice(0, cut)}</span><span className="font-bold">{dv.slice(cut)}</span></span>
}

function Verdict({ twice }: { twice: boolean }) {
  return (
    <span className={cn("flex items-center gap-1 text-[12.5px] font-semibold whitespace-nowrap", twice ? "text-[#b42318]" : "text-[#4a4e6a]")}>
      <CopyIcon className="size-3.5" />{twice ? "Likely entered twice" : "Two different vouchers"}
    </span>
  )
}

/** One voucher line. In a pair it carries a key chip and diff highlights; alone, its DV # and an action. */
function Line({ v, k, s, action }: { v: Voucher; k?: string; s?: Same; action?: React.ReactNode }) {
  return (
    <div className={cn(GRID, "py-1.5")}>
      <span />
      {k ? <span className="flex size-5 items-center justify-center rounded-[4px] bg-[#eef0f7] text-[11px] font-bold text-[#4a4e6a]">{k}</span> : <span />}
      <span className={cn("justify-self-start text-[13px] whitespace-nowrap text-[#4a4e6a]", mark(s?.date))}>{v.dv ? shortDate(v.dv) : "No date"}</span>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium">
          {!k && <span className="font-bold">{v.dv_no.trim() || "No DV #"} · </span>}
          <span className={mark(s?.payee)}>{v.payee || "—"}</span>
        </div>
        <div className="mt-px truncate text-xs text-[#676b86]" title={v.particulars}>{v.particulars || "—"}</div>
      </div>
      <span className={cn("justify-self-start text-[12.5px] font-medium text-[#4a4e6a]", mark(s?.area))}>{v.trade_area || "—"}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="w-9 flex-none text-[11px] font-semibold text-[#676b86]">{v.check_number.trim() && refType(v.check_number)}</span>
        <span className={cn("truncate text-[13px]", mark(s?.ref))}>{v.check_number.trim() || "—"}</span>
      </div>
      <span className={cn("justify-self-end text-[13px] font-semibold whitespace-nowrap", mark(s?.amount))}>{peso(v.amount)}</span>
      {action ?? <span />}
    </div>
  )
}

type Props = { pairs: Pair[]; others: [string, Issue, Voucher[]][]; areas: string[]; dvNos: string[]; today: string }

export function ReviewQueue({ pairs, others, areas, dvNos, today }: Props) {
  const router = useRouter()
  const { run } = useUI()
  const q = (useSearchParams().get("q") ?? "").trim().toLowerCase()
  const [area, setArea] = React.useState("All")
  const [selected, setSelected] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [checked, setChecked] = React.useState<Set<string>>(new Set())
  const [target, setTarget] = React.useState<Record<string, Key>>({})
  const [typed, setTyped] = React.useState<Record<string, string>>({})
  const [done, setDone] = React.useState<Done[]>([])

  const matches = (r: Voucher) => (area === "All" || label(r, "trade_area") === area)
    && (!q || `${r.dv_no} ${r.payee} ${r.particulars} ${r.check_number}`.toLowerCase().includes(q))
  // A pair still holding a number we just changed is the pre-refresh copy; hide it until the sheet catches up.
  const stale = (p: Pair) => done.some((d) => d.dv === p.dv && (p.a.sheet_row === d.sheetRow || p.b.sheet_row === d.sheetRow))
  const live = pairs.filter((p) => !stale(p))
  const visible = live.filter((p) => matches(p.a) || matches(p.b))
  const sel = visible.find((p) => p.dv === selected) ?? null
  const picked = live.filter((p) => checked.has(p.dv))
  const taken = done.map((d) => d.newNo)
  const total = live.length + done.length

  const targetOf = (p: Pair): Key => target[p.dv] ?? ((p.a.dv ?? "") > (p.b.dv ?? "") ? "a" : "b")
  const autoNo = (p: Pair, extra: string[] = []) => nextDvNo(dvNos, p[targetOf(p)].dv ?? today, [...taken, ...extra])
  const problem = (no: string) => !DV_FORMAT.test(no) ? "Use the format 06-YYYY-MM-00000."
    : dvNos.includes(no) || taken.includes(no) ? `${no} is already used.` : ""

  const move = (dir: number) => {
    if (!visible.length) return
    const i = visible.findIndex((p) => p.dv === selected)
    const next = visible[i < 0 ? (dir > 0 ? 0 : visible.length - 1) : Math.max(0, Math.min(visible.length - 1, i + dir))]
    setSelected(next.dv)
    document.querySelector(`[data-dv="${CSS.escape(next.dv)}"]`)?.scrollIntoView({ block: "nearest" })
  }
  const show = (dv: string) => { setSelected(dv); setOpen(true) }
  const toggle = (dv: string, on = !checked.has(dv)) => setChecked((c) => {
    const next = new Set(c)
    if (on) next.add(dv)
    else next.delete(dv)
    return next
  })

  async function undo(list: Done[]) {
    const back: Done[] = []
    const result = await run("Saving to the sheet…", async (): Promise<Result> => {
      for (const d of list) {
        const r = await renumberVoucher(d.sheetRow, d.newNo, d.dv, true)
        if (!r.ok) return r
        back.push(d)
      }
      return { ok: true, message: "" }
    })
    setDone((all) => all.filter((d) => !back.includes(d)))
    if (back.length) setSelected(back[0].dv)
    if (result.ok) toast.add({ title: list.length === 1 ? `${list[0].key.toUpperCase()} is back to ${list[0].dv}` : `Put back ${list.length} DV #s`, type: "success" })
  }
  const notify = (title: string, list: Done[]) => {
    const id = toast.add({
      title, type: "success", timeout: 12_000,
      actionProps: { children: "Undo", onClick: () => { toast.close(id); undo(list) } },
    })
  }

  async function give(p: Pair) {
    const key = targetOf(p), v = p[key], no = typed[p.dv] ?? autoNo(p)
    if (problem(no)) return
    const r = await run("Saving to the sheet…", () => renumberVoucher(v.sheet_row, p.dv, no))
    if (!r.ok || !r.dvNo) return
    const entry: Done = { dv: p.dv, sheetRow: v.sheet_row, newNo: r.dvNo, key, payee: v.payee, amount: v.amount }
    setDone((d) => [entry, ...d])
    notify((r.dvNo === no ? "" : `${no} was just taken; used ${r.dvNo}. `) + `${key.toUpperCase()} is now ${r.dvNo}`, [entry])
    const rest = visible.filter((x) => x.dv !== p.dv)
    const next = rest.find((x) => visible.indexOf(x) > visible.indexOf(p)) ?? rest[0]
    setSelected(next?.dv ?? null)
    if (!next) setOpen(false)
  }

  async function giveEach() {
    const made: Done[] = []
    const result = await run("Saving to the sheet…", async (): Promise<Result> => {
      for (const p of picked) {
        const key = targetOf(p), v = p[key], own = typed[p.dv], extra = made.map((m) => m.newNo)
        const no = own && !problem(own) && !extra.includes(own) ? own : autoNo(p, extra)
        const r = await renumberVoucher(v.sheet_row, p.dv, no)
        if (!r.ok || !r.dvNo) return r
        made.push({ dv: p.dv, sheetRow: v.sheet_row, newNo: r.dvNo, key, payee: v.payee, amount: v.amount })
      }
      return { ok: true, message: "" }
    })
    if (made.length) {
      setDone((d) => [...[...made].reverse(), ...d])
      notify(`Resolved ${made.length} pair${made.length === 1 ? "" : "s"}`, made)
    }
    if (result.ok) setChecked(new Set())
  }

  // Page keys; the drawer handles its own (AppUI already steps aside while a dialog is open).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector("[role=dialog], [role=alertdialog]")) return
      const t = e.target as Element
      if (t.closest?.("input, textarea, select, [contenteditable]")) return
      const k = e.key.toLowerCase()
      if (k === "j" || k === "arrowdown") move(1)
      else if (k === "k" || k === "arrowup") move(-1)
      else if (k === "enter" && sel && !t.closest?.("a, button, summary, [role=checkbox]")) show(sel.dv)
      else if (k === "x" && sel) toggle(sel.dv)
      else if (k === "z" && done.length) undo([done[0]])
      else return
      e.preventDefault()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  })

  const pct = total ? Math.round((done.length / total) * 100) : 0

  return (
    <div className="flex min-w-0 flex-col px-2 text-[#161830] tabular-nums">
      <div className="flex items-end gap-6 pt-1 pb-3.5">
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-[-0.005em]">Needs review</h2>
          {live.length > 0 && (
            <p className="mt-0.5 text-[13px] whitespace-nowrap text-[#4a4e6a]">
              Duplicate DV # · {live.length} pair{live.length === 1 ? "" : "s"} · {live.length * 2} vouchers share a DV #
            </p>
          )}
        </div>
        {total > 0 && (
          <div className="ml-auto w-[220px] flex-none">
            <div className="mb-1.5 flex justify-between text-xs font-semibold text-[#4a4e6a]"><span>{done.length} of {total} resolved</span><span>{pct}%</span></div>
            <div className="h-1.5 overflow-hidden rounded-[3px] bg-[#eef0f7]" role="progressbar" aria-valuenow={pct} aria-label="Duplicate pairs resolved">
              <div className="h-full rounded-[3px] bg-[#232a7c] transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pb-3">
        <div role="group" aria-label="Trade area" className="flex gap-0.5 rounded-md border border-[#cfd2e0] p-0.5">
          {["All", ...areas].map((a) => (
            <button key={a} type="button" aria-pressed={area === a} onClick={() => setArea(a)}
              className={cn("h-6 rounded-[4px] px-2.5 text-[12.5px] font-medium", area === a ? "bg-[#232a7c] text-white" : "text-[#4a4e6a] hover:bg-[#eef0f7]")}>
              {a}
            </button>
          ))}
        </div>
        {live.length > 0 && <span className="ml-auto text-xs text-[#676b86]">Grouped by DV # · newest first · click a pair to compare</span>}
      </div>

      <div className="max-xl:overflow-x-auto">
        <div className="min-w-[920px]">
          <div className={cn(GRID, "sticky top-[49px] z-[5] h-8 rounded-md bg-[#f6f7fb] text-xs font-semibold text-[#4a4e6a]")}>
            <span /><span /><span>Date</span><span>Payee · particulars</span><span>Area</span><span>Check / ADA #</span><span className="text-right">Amount</span><span />
          </div>

          {visible.map((p) => {
            const an = analyze(p)
            const on = p.dv === selected || checked.has(p.dv)
            return (
              <div key={p.dv} data-dv={p.dv} onClick={() => show(p.dv)}
                className={cn("cursor-pointer border-b border-[#e3e5ee] pb-2", on ? "bg-[#e7e9f8]" : "hover:bg-[#f6f7fb]")}>
                <div className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-3 px-3 pt-3 pb-1">
                  <span className="flex" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={checked.has(p.dv)} onCheckedChange={(c) => toggle(p.dv, c)} aria-label={`Select ${p.dv}`}
                      className="data-checked:border-[#232a7c] data-checked:bg-[#232a7c]" />
                  </span>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="text-[13px]"><DvNo dv={p.dv} /></span>
                    <Verdict twice={an.twice} />
                    <span className="min-w-0 truncate text-[12.5px] text-[#4a4e6a]">{an.summary}</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); show(p.dv) }}>Compare</Button>
                </div>
                <Line v={p.a} k="A" s={an.s} />
                <Line v={p.b} k="B" s={an.s} />
              </div>
            )
          })}

          {live.length > 0 && !visible.length && (
            <p className="py-10 text-center text-[13px] text-[#4a4e6a]">
              No open pairs match this filter.{" "}
              <button type="button" className="font-semibold text-[#232a7c]" onClick={() => { setArea("All"); if (q) router.replace("/workspace/") }}>Clear filters</button>
            </p>
          )}

          {done.length > 0 && (
            <section className="pt-6">
              <h3 className="mb-2 text-xs font-semibold text-[#4a4e6a]">Resolved this session · {done.length}</h3>
              <ul className="border-t border-[#e3e5ee]">
                {done.map((d) => (
                  <li key={`${d.sheetRow}-${d.newNo}`} className="flex h-[38px] items-center gap-3 border-b border-[#e3e5ee] px-3 text-[13px]">
                    <CheckIcon className="size-3.5 flex-none text-[#1b7a45]" />
                    <span className="font-semibold">{d.dv}</span>
                    <span className="min-w-0 truncate text-[#4a4e6a]">Renumbered to {d.newNo} · {d.key.toUpperCase()} · {d.payee || "—"} · {peso(d.amount)}</span>
                    <button type="button" className="ml-auto font-semibold text-[#232a7c] hover:underline" onClick={() => undo([d])}>Undo</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {others.map(([title, issue, list]) => {
            const rows = list.filter(matches)
            if (!rows.length) return null
            return (
              <details key={title} open={rows.length <= 10} className="pt-6">
                <summary className="flex cursor-pointer items-center gap-2 px-3 pb-2 text-[13px] font-semibold">
                  {title}<span className="font-normal text-[#4a4e6a]">{rows.length}</span>
                  <Link href={`/vouchers/?issue=${issue}`} className="ml-auto text-[12.5px] font-normal text-[#232a7c] hover:underline">Open in Vouchers</Link>
                </summary>
                <div className="border-t border-[#e3e5ee]">
                  {rows.map((v) => (
                    <div key={v.sheet_row} className="border-b border-[#e3e5ee] hover:bg-[#f6f7fb]">
                      <Line v={v} action={
                        <Button variant="outline" size="sm" className="justify-self-end" title="Open in Vouchers"
                          render={<Link href={`/vouchers/?open=${v.sheet_row}`} />} nativeButton={false}>Open</Button>
                      } />
                    </div>
                  ))}
                </div>
              </details>
            )
          })}
        </div>
      </div>

      {picked.length > 0 && (
        <div className="pointer-events-none sticky bottom-4 z-10 mt-4 flex justify-center">
          <div role="region" aria-label="Selection"
            className="pointer-events-auto flex items-center gap-2 rounded-lg bg-[#232a7c] py-2 pr-2 pl-4 text-[13px] text-white shadow-[0_10px_30px_rgb(22_24_48/.25)]">
            <span className="mr-2 font-semibold">{picked.length} pair{picked.length === 1 ? "" : "s"} selected</span>
            <Button size="sm" className="bg-white text-[#232a7c] hover:bg-white/90" onClick={giveEach}>Give each a new DV #</Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setChecked(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      <Dialog.Root open={open && !!sel} onOpenChange={(o) => { if (!o) setOpen(false) }}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-[rgb(22_24_48/.32)] backdrop-blur-[3px] transition-opacity duration-200 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <Dialog.Popup
            className="fixed inset-y-0 right-0 z-50 flex w-[540px] max-w-full flex-col bg-white text-[#161830] tabular-nums shadow-[0_20px_50px_rgb(22_24_48/.3)] outline-none transition-transform duration-[240ms] ease-[cubic-bezier(.2,.8,.2,1)] data-ending-style:translate-x-full data-starting-style:translate-x-full"
            onKeyDown={(e) => {
              if (!sel || e.ctrlKey || e.metaKey || e.altKey || (e.target as Element).closest("input")) return
              const k = e.key.toLowerCase()
              if (k === "a" || k === "b") setTarget((t) => ({ ...t, [sel.dv]: k }))
              else if (k === "r") give(sel)
              else if (k === "o") router.push(`/vouchers/?open=${sel[targetOf(sel)].sheet_row}`)
              else if (k === "j") move(1)
              else if (k === "k") move(-1)
              else return
              e.preventDefault()
            }}>
            {sel && <Compare pair={sel} pos={visible.indexOf(sel) + 1} count={visible.length} target={targetOf(sel)}
              auto={autoNo(sel)} typed={typed[sel.dv]} problem={problem} today={today}
              onTarget={(k) => setTarget((t) => ({ ...t, [sel.dv]: k }))}
              onType={(no) => setTyped((t) => {
                const next = { ...t }
                if (no === null) delete next[sel.dv]
                else next[sel.dv] = no
                return next
              })}
              onMove={move} onGive={() => give(sel)} />}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

type CompareProps = {
  pair: Pair; pos: number; count: number; target: Key; auto: string; typed?: string; today: string
  problem: (no: string) => string
  onTarget: (k: Key) => void; onType: (no: string | null) => void; onMove: (dir: number) => void; onGive: () => void
}

function Compare({ pair: p, pos, count, target, auto, typed, today, problem, onTarget, onType, onMove, onGive }: CompareProps) {
  const an = analyze(p)
  const K = target.toUpperCase()
  const v = p[target]
  const no = typed ?? auto
  const err = problem(no)
  const edited = typed !== undefined && typed !== auto
  const mm = (v.dv ?? today).slice(5, 7)
  const help = edited ? "Edited by you. Checked again when you save."
    : `Next in sequence after ${String(Number(auto.slice(-5)) - 1).padStart(5, "0")}. `
      + (v.dv ? `Month ${mm} comes from ${K}'s DV date.` : `${K} has no DV date, so month ${mm} is this month.`) + " Checked again when you save."
  const fields: [string, boolean, string, string][] = [
    ["Payee", an.s.payee, p.a.payee || "—", p.b.payee || "—"],
    ["Particulars", an.s.particulars, p.a.particulars || "—", p.b.particulars || "—"],
    ["DV date", an.s.date, longish(p.a), longish(p.b)],
    ["Trade area", an.s.area, label(p.a, "trade_area"), label(p.b, "trade_area")],
    ["Check / ADA #", an.s.ref, refText(p.a), refText(p.b)],
    ["Amount", an.s.amount, peso(p.a.amount), peso(p.b.amount)],
  ]
  const cmpRow = "grid grid-cols-[96px_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-[#e3e5ee] px-3 py-[9px] text-[13px]"

  return (
    <>
      <div className="flex h-14 flex-none items-center gap-2 border-b border-[#e3e5ee] pr-3 pl-6">
        <span className="text-xs font-semibold whitespace-nowrap text-[#4a4e6a]">Duplicate DV # · pair {pos} of {count}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous pair" title="Previous (K)" onClick={() => onMove(-1)}><ChevronUpIcon /></Button>
          <Button variant="ghost" size="icon" aria-label="Next pair" title="Next (J)" onClick={() => onMove(1)}><ChevronDownIcon /></Button>
          <span className="mx-1 h-5 w-px bg-[#e3e5ee]" />
          <Dialog.Close render={<Button variant="ghost" aria-label="Close" title="Close (Esc)" />}><Kbd>Esc</Kbd><XIcon /></Dialog.Close>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-6 pt-5 pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Dialog.Title className="text-[22px] font-bold tracking-[-0.01em]"><DvNo dv={p.dv} prefix="font-semibold" /></Dialog.Title>
            <Verdict twice={an.twice} />
          </div>
          <Dialog.Description className="mt-2 text-sm leading-normal text-pretty text-[#4a4e6a]">{an.explain}</Dialog.Description>
        </div>

        <div>
          <div className="grid h-8 grid-cols-[96px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 rounded-md bg-[#f6f7fb] px-3 text-xs font-semibold text-[#4a4e6a]">
            <span /><span>A · {p.a.dv ? shortDate(p.a.dv) : "No date"}</span><span>B · {p.b.dv ? shortDate(p.b.dv) : "No date"}</span>
          </div>
          <div className={cmpRow}>
            <span className="flex flex-col gap-px"><span className="text-[12.5px] font-medium text-[#4a4e6a]">DV #</span><span className="text-[11px] font-semibold text-[#232a7c]">{K} will change</span></span>
            {(["a", "b"] as Key[]).map((k) => (
              <span key={k} className="flex flex-col">
                <span className={k === target ? "text-[#676b86] line-through" : ""}>{p.dv}</span>
                {k === target && !err && <span className="font-bold text-[#232a7c]">{no}</span>}
              </span>
            ))}
          </div>
          {fields.map(([name, ok, x, y]) => (
            <div key={name} className={cn(cmpRow, !ok && "bg-[#fbf0dc] font-semibold")}>
              <span className="flex flex-col gap-px">
                <span className="text-[12.5px] font-medium text-[#4a4e6a]">{name}</span>
                <span className={cn("text-[11px] font-semibold", ok ? "text-[#676b86]" : "text-[#8a5200]")}>{ok ? "Same" : "Differs"}</span>
              </span>
              <span className="break-words">{x}</span>
              <span className="break-words">{y}</span>
            </div>
          ))}
        </div>

        <div>
          <p id="target-q" className="mb-2 text-[12.5px] font-semibold">Which voucher gets the new DV #?</p>
          <div role="radiogroup" aria-labelledby="target-q" className="grid grid-cols-2 gap-2">
            {(["a", "b"] as Key[]).map((k) => {
              const on = target === k, w = p[k]
              return (
                <button key={k} type="button" role="radio" aria-checked={on} onClick={() => onTarget(k)}
                  className={cn("flex min-w-0 items-center gap-2.5 rounded-md border px-3 py-2.5 text-left", on ? "border-[#232a7c] bg-[#e7e9f8]" : "border-[#cfd2e0] hover:bg-[#f6f7fb]")}>
                  <span className={cn("flex size-4 flex-none items-center justify-center rounded-full border", on ? "border-[#232a7c]" : "border-[#cfd2e0]")}>
                    {on && <span className="size-2 rounded-full bg-[#232a7c]" />}
                  </span>
                  <span className="flex min-w-0 flex-col gap-px">
                    <span className={cn("text-xs font-bold", on ? "text-[#232a7c]" : "text-[#4a4e6a]")}>
                      {k.toUpperCase()} · {w.dv ? shortDate(w.dv) : "No date"} · {label(w, "trade_area")}
                    </span>
                    <span className="truncate text-[13px]">{w.payee || "—"}</span>
                  </span>
                  <Kbd className="ml-auto">{k.toUpperCase()}</Kbd>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <label htmlFor="new-dv" className="text-[12.5px] font-medium text-[#4a4e6a]">New DV # for {K}</label>
            {edited && (
              <button type="button" className="ml-auto text-[12.5px] font-semibold text-[#232a7c]" onClick={() => onType(null)}>Use next available ({auto})</button>
            )}
          </div>
          <Input id="new-dv" value={no} spellCheck={false} autoComplete="off" aria-invalid={!!err} aria-describedby="new-dv-note"
            className="h-9 text-sm font-semibold" onChange={(e) => onType(e.target.value.trim())}
            onKeyDown={(e) => { if (e.key === "Enter" && !err) onGive() }} />
          <p id="new-dv-note" className={cn("text-[12.5px]", err ? "font-medium text-[#b42318]" : "text-[#676b86]")}>{err || help}</p>
        </div>
      </div>

      <div className="flex flex-none items-center gap-2 border-t border-[#e3e5ee] px-6 py-3">
        <Button variant="ghost" onClick={() => onMove(1)}>Skip</Button>
        <Button variant="outline" className="ml-auto" render={<Link href={`/vouchers/?open=${v.sheet_row}`} />} nativeButton={false}>
          Open {K} in Vouchers<Kbd>O</Kbd>
        </Button>
        <Button className={PRIMARY} disabled={!!err} onClick={onGive}>
          Give {K} {err ? "a new DV #" : no}<Kbd className="bg-white/15 text-white">R</Kbd>
        </Button>
      </div>
    </>
  )
}
