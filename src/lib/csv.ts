const NUMBER = /^[-+]?[\d,]*\.?\d+%?$/ // "-1500.00", "12,500", "45%" stay numbers

/** One CSV cell (RFC 4180 quoting). Text Excel would run as a formula (=, +, -, @, tab, CR first) gets a leading ' so it opens as text. */
export function csvCell(v: string | number): string {
  const s = typeof v === "string" && /^[=+\-@\t\r]/.test(v) && !NUMBER.test(v) ? "'" + v : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

/** A CSV download response. */
export function csvResponse(filename: string, header: string[], lines: (string | number)[][]) {
  const body = [header, ...lines].map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n"
  return new Response(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
  })
}

/** 8902100 centavos -> "89021.00" (the legacy CSVs wrote plain decimals). */
export const decimal = (centavos: number) => (centavos / 100).toFixed(2)
