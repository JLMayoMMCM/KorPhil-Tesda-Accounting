/** Horizontal share bar, 0–100%. */
export function Bar({ pct }: { pct: number }) {
  return (
    <span className="block h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </span>
  )
}
