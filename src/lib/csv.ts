/** A CSV download response (RFC 4180 quoting). */
export function csvResponse(filename: string, header: string[], lines: (string | number)[][]) {
  const cell = (v: string | number) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v))
  const body = [header, ...lines].map((line) => line.map(cell).join(",")).join("\r\n") + "\r\n"
  return new Response(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
  })
}

/** 8902100 centavos -> "89021.00" (the legacy CSVs wrote plain decimals). */
export const decimal = (centavos: number) => (centavos / 100).toFixed(2)
