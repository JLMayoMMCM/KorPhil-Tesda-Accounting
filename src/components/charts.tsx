// Plain SVG/CSS charts for reports: server-rendered, print-safe, no chart library.
// Every chart sits above the report's table, which is its accessible data view.
import { Bar } from "@/components/bar"
import { peso, total, type State, type Voucher } from "@/lib/ledger"

export type Item = { label: string; value: number; color?: string; mark?: State }

const pct = (v: number, sum: number) => (sum ? (100 * Math.max(0, v)) / sum : 0)
const fmtPct = (p: number) => `${p > 0 && p < 1 ? p.toFixed(1) : Math.round(p)}%`

/** The voucher-status shape: filled square overdue, outlined square pending, dot paid. */
export function StatusMark({ state }: { state: State }) {
  const shape = { overdue: "rounded-[2px]", pending: "rounded-[2px] border-2 !bg-transparent", paid: "rounded-full" }[state]
  return (
    <span aria-hidden="true" className={`inline-block size-2.5 shrink-0 ${shape}`}
      style={{ background: `var(--chart-${state})`, borderColor: `var(--chart-${state})` }} />
  )
}

/** Share of total as a donut; the legend carries label, amount and share so colour is never alone. */
export function Donut({ slices, caption }: { slices: Item[]; caption: string }) {
  const sum = slices.reduce((s, x) => s + Math.max(0, x.value), 0)
  const r = 15.915 // circumference ≈ 100, so dash lengths read as percents
  const gap = slices.filter((s) => s.value > 0).length > 1 ? 0.8 : 0
  // Each arc starts where the previous ended, from 12 o'clock.
  const starts = slices.map((_, i) => 25 - slices.slice(0, i).reduce((s, x) => s + pct(x.value, sum), 0))
  return (
    <figure className="grid items-center gap-x-10 gap-y-6 sm:grid-cols-[10rem_1fr]">
      <svg viewBox="0 0 42 42" className="mx-auto size-40" role="img" aria-label={caption}>
        <circle cx="21" cy="21" r={r} fill="none" stroke="var(--muted)" strokeWidth="5" />
        {slices.map((s, i) => {
          const p = pct(s.value, sum)
          return p > 0 && (
            <circle key={s.label} cx="21" cy="21" r={r} fill="none" stroke={s.color ?? "var(--primary)"} strokeWidth="5"
              strokeDasharray={`${Math.max(0.1, p - gap)} ${100 - Math.max(0.1, p - gap)}`} strokeDashoffset={starts[i]}>
              <title>{`${s.label}: ${peso(s.value)} (${fmtPct(p)})`}</title>
            </circle>
          )
        })}
        <text x="21" y="19.5" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 2.8 }}>Total</text>
        <text x="21" y="24.2" textAnchor="middle" className="fill-foreground font-bold" style={{ fontSize: 4 }}>{compact(sum)}</text>
      </svg>
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="flex flex-col divide-y text-sm">
        {slices.map((s) => (
          <li key={s.label} className="grid grid-cols-[1fr_auto_3.5rem] items-center gap-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              {s.mark ? <StatusMark state={s.mark} /> : <span aria-hidden="true" className="size-2.5 rounded-[2px]" style={{ background: s.color }} />}
              <span className="truncate">{s.label}</span>
            </span>
            <span className="text-right font-medium tabular-nums">{peso(s.value)}</span>
            <span className="text-right text-muted-foreground tabular-nums">{fmtPct(pct(s.value, sum))}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

/** Ranked proportional bars (label · bar · amount), scaled to the largest value. */
export function BarList({ items, caption }: { items: Item[]; caption: string }) {
  const top = Math.max(1, ...items.map((i) => i.value))
  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="flex flex-col gap-2.5 text-sm">
        {items.map((i) => (
          <li key={i.label} className="grid grid-cols-[minmax(6rem,11rem)_1fr_7.5rem] items-center gap-3" title={`${i.label}: ${peso(i.value)}`}>
            <span className="truncate">{i.label}</span>
            <Bar pct={pct(i.value, top)} color={i.color} />
            <span className="text-right tabular-nums">{peso(i.value)}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

/** Vertical navy columns in the given order (oldest → newest for time), value on top. */
export function Columns({ items, caption }: { items: Item[]; caption: string }) {
  const top = Math.max(1, ...items.map((i) => i.value))
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="flex h-48 items-end gap-1.5 border-b-2 border-foreground" aria-hidden="true">
        {items.map((i) => (
          <div key={i.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`${i.label}: ${peso(i.value)}`}>
            <span className="mb-1 text-xs text-muted-foreground tabular-nums">{compact(i.value)}</span>
            <span className="w-full max-w-10 rounded-t-[3px] bg-primary transition-opacity hover:opacity-80"
              style={{ height: i.value > 0 ? `max(3px, ${pct(i.value, top)}%)` : 0, background: i.color }} />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 text-xs text-muted-foreground" aria-hidden="true">
        {items.map((i) => <span key={i.label} className="min-w-0 flex-1 truncate text-center">{i.label}</span>)}
      </div>
    </figure>
  )
}

/** Total · Paid · Outstanding · Overdue as a ledger strip, not cards: hairline columns, figures right where the eye lands. */
export function Totals({ rows }: { rows: Voucher[] }) {
  const paid = rows.filter((r) => r.state === "paid"), overdue = rows.filter((r) => r.state === "overdue")
  const cells = [["Total", total(rows), rows.length, null], ["Paid", total(paid), paid.length, "paid"],
    ["Outstanding", total(rows) - total(paid), rows.length - paid.length, null], ["Overdue", total(overdue), overdue.length, "overdue"]] as const
  return (
    <dl aria-label="Totals" className="grid grid-cols-2 border-y break-inside-avoid sm:grid-cols-4 sm:divide-x">
      {cells.map(([k, v, n, mark]) => (
        <div key={k} className="flex flex-col gap-0.5 px-4 py-3 first:pl-0 sm:first:pl-4">
          <dt className="flex items-center gap-2 text-xs text-muted-foreground">{mark && <StatusMark state={mark} />}{k}</dt>
          <dd className={`text-lg font-bold tabular-nums ${k === "Overdue" && v ? "text-destructive" : ""}`}>{peso(v)}</dd>
          <dd className="text-xs text-muted-foreground tabular-nums">{n} voucher{n === 1 ? "" : "s"}</dd>
        </div>
      ))}
    </dl>
  )
}

/** ₱1.2M / ₱350K for chart labels; tables keep full pesos. */
export function compact(centavos: number) {
  return "₱" + (centavos / 100).toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })
}
