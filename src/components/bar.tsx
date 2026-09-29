/** Horizontal share bar, 0–100%. Navy unless a status colour is passed; non-zero values keep a visible sliver. */
export function Bar({ pct, color }: { pct: number; color?: string }) {
  const width = pct > 0 ? `max(3px, ${Math.min(100, pct)}%)` : "0"
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <span className="block h-full rounded-full bg-primary" style={{ width, background: color }} />
    </span>
  )
}
