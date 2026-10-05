// Plain SVG/CSS charts for reports: server-rendered, print-safe, no chart library.
// Every chart sits above the report's table, which is its accessible data view.
import { Bar } from "@/components/bar"
import { peso, total, type Voucher } from "@/lib/ledger"

export type Item = { label: string; value: number; color?: string }

const pct = (v: number, sum: number) => (sum ? (100 * Math.max(0, v)) / sum : 0)

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

/** Total · With check # · Needs review as a ledger strip, not cards: hairline columns, figures right where the eye lands. */
export function Totals({ rows }: { rows: Voucher[] }) {
  const checked = rows.filter((r) => r.check_number.trim()), review = rows.filter((r) => r.issues.length)
  const cells = [["Total", total(rows), rows.length], ["With check #", total(checked), checked.length],
    ["Needs review", total(review), review.length]] as const
  return (
    <dl aria-label="Totals" className="grid grid-cols-2 border-y break-inside-avoid sm:grid-cols-3 sm:divide-x">
      {cells.map(([k, v, n]) => (
        <div key={k} className="flex flex-col gap-0.5 px-4 py-3 first:pl-0 sm:first:pl-4">
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="text-lg font-bold tabular-nums">{peso(v)}</dd>
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
