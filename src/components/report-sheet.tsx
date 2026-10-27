// The printed report's parts: paper sizes and page packing, letterhead, contents, schedules, sign-off.
// Server-rendered; each <article> the page draws is one printed sheet.
import Image from "next/image"

import { Table as T, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { paginate } from "@/lib/ledger"
import { fmtCell, type Cell, type Col, type Table } from "@/lib/reports"

/** Paper sizes: label, CSS width, CSS height, height and width in px (96 dpi). "Long" is PH long bond (8.5 × 13 in). */
export const PAPERS = {
  short: ["Short (8.5 × 11 in)", "8.5in", "11in", 1056, 816],
  long: ["Long (8.5 × 13 in)", "8.5in", "13in", 1248, 816],
  a4: ["A4 (210 × 297 mm)", "210mm", "297mm", 1123, 794],
} as const
export type Paper = keyof typeof PAPERS

// Fixed heights (px) the pages are packed by. A row is 28px plus 16px per extra wrapped line.
// ponytail: estimated, not measured; measure in the browser if pages start spilling over.
// A two-line register row is 8px of padding plus 20px per line, wrapping as above; its heading gets a second line too.
const H = { pad: 96, foot: 32, start: 236, contents: 44, line: 20, carry: 50, head: 64, row: 28, wrap: 16, gap: 24, end: 150, pair: 8, sub: 20, head2: 28 }
const CHAR = 6.2 // average px per character at text-xs

export type Block = Table & { body: string[][]; foot?: string[]; heights: number[] }

/** Cells as printed, each row's height, and the pages they pack into. */
export function layout(tables: Table[], paper: Paper, contents: boolean) {
  const textW = PAPERS[paper][4] - 96
  const lines = (text: string, w = 1) => Math.max(1, Math.ceil(text.length / Math.max(4, Math.floor((w * textW) / CHAR) - 2)))
  const blocks = tables.map((t): Block => {
    const show = (cells: Cell[]) => cells.map((v, i) => fmtCell(v, t.cols[i].fmt))
    const body = t.rows.map(show), foot = t.foot && show(t.foot)
    const extra = (cells: string[], idx: number[]) => H.wrap * Math.max(0, ...idx.map((i) => (t.cols[i].fmt === "text" ? lines(cells[i], t.cols[i].w) - 1 : 0)))
    const heights = [...body, ...(foot ? [foot] : [])].map((cells) => t.lines
      ? H.pair + t.lines.filter((idx) => idx.some((i) => cells[i])).reduce((s, idx) => s + H.sub + extra(cells, idx), 0)
      : H.row + extra(cells, cells.map((_, i) => i)))
    // The basis line rides with the first row and the notes with the last, so neither is stranded on its own page.
    if (heights.length && t.basis) heights[0] += H.wrap * lines(t.basis)
    if (heights.length) heights[heights.length - 1] += t.notes.reduce((s, n) => s + 4 + H.wrap * lines(n), 0)
    return { ...t, body, foot, heights }
  })
  const clusters = new Set(blocks.flatMap((b) => b.cluster ?? [])).size
  const pages = paginate(blocks.map((b) => b.heights), {
    ...H, heads: blocks.map((b) => H.head + (b.lines ? H.head2 : 0)), cap: PAPERS[paper][3] - H.pad - H.foot, start: H.start + (contents ? H.contents + H.line * (blocks.length + clusters) : 0),
  })
  return { blocks, pages }
}

const right = (c: Col) => (c.fmt === "text" ? "" : "text-right")
const name = (b: Table) => (b.no ? `Schedule ${b.no}. ${b.title}` : b.title)

/** Page 1: the office letterhead, as on its printed forms, then the report's title block. */
export function Letterhead({ title, period, area }: { title: string; period: string; area: string }) {
  return (
    <>
      <header className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-[#1b2a6b]">
        <div className="flex items-center gap-1.5">
          <Image src="/bagong_pilipinas_logo.png" alt="Bagong Pilipinas" width={86} height={80} className="h-20 w-auto" />
          <Image src="/tesda_logo.png" alt="TESDA" width={80} height={80} className="size-20" />
        </div>
        <div className="text-center leading-tight">
          <div className="text-[15px]">Technical Education and Skills Development Authority XI</div>
          <div className="text-[15px] font-bold">REGIONAL TRAINING CENTER – KOREA PHILIPPINES</div>
          <div className="text-[15px] font-bold">VOCATIONAL TRAINING CENTER</div>
          <div className="text-[15px]">Buhisan Tibungco, Davao City, Philippines</div>
        </div>
        <Image src="/tesda_korphil_logo.png" alt="Korea-Philippines Vocational Training Center" width={80} height={80} className="size-20" />
      </header>
      <div className="flex flex-col items-center gap-0.5 border-y-2 border-double border-foreground/70 py-2 text-center">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Accounting Office · Disbursement report</p>
        <h2 className="font-heading text-lg font-bold tracking-tight text-balance">{title}</h2>
        <p className="text-sm">{period}</p>
        <p className="text-xs text-muted-foreground">{area} · Amounts in Philippine pesos (₱)</p>
      </div>
    </>
  )
}

/** Later pages: one line naming the office, report and period. */
export function RunningHeader({ title, period, area }: { title: string; period: string; area: string }) {
  return (
    <header className="flex justify-between gap-4 border-b pb-2 text-xs text-muted-foreground">
      <strong className="text-foreground">RTC – KorPhil VTC · {title}</strong>
      <span>{period} · {area}</span>
    </header>
  )
}

/** The full report's contents: numbered schedules under their cluster, the basis last, each with its page. */
export function Contents({ blocks, startsOn }: { blocks: Block[]; startsOn: (i: number) => number }) {
  const clusters = [...new Set(blocks.flatMap((b) => b.cluster ?? []))]
  const entry = (b: Block, i: number) => (
    <li key={b.kind} className="flex h-5 gap-2 pl-3">
      <span>{name(b)}</span>
      <span className="flex-1 -translate-y-1 border-b border-dotted border-foreground/30" />
      <span className="tabular-nums">{startsOn(i)}</span>
    </li>
  )
  return (
    <nav aria-label="Contents" className="flex flex-col gap-2 text-sm">
      <h3 className="font-heading font-bold">Contents</h3>
      <ol className="flex flex-col">
        {clusters.map((c) => (
          <li key={c}>
            <span className="block h-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{c}</span>
            <ol>{blocks.map((b, i) => b.cluster === c && entry(b, i))}</ol>
          </li>
        ))}
        {blocks.map((b, i) => !b.cluster && entry(b, i))}
      </ol>
    </nav>
  )
}

/** One row of a two-line table: each line a grid of its columns, the second indented under the first column. Empty lines are left out. */
function Lines({ b, cells, className = "" }: { b: Block; cells: React.ReactNode[]; className?: string }) {
  return b.lines!.map((idx, li) => idx.some((i) => cells[i]) && (
    <div key={li} className="grid gap-x-2" style={{ gridTemplateColumns: idx.map((i) => `minmax(0, ${b.cols[i].w}fr)`).join(" "), paddingLeft: li ? `${b.cols[0].w * 100}%` : 0 }}>
      {idx.map((i) => <div key={i} className={`break-words ${className} ${right(b.cols[i])}`}>{cells[i]}</div>)}
    </div>
  ))
}

/** Rows [from, to) of one schedule: title (and cluster in the full report), basis, table, total row, notes. */
export function Schedule({ b, from, to, cluster }: { b: Block; from: number; to: number; cluster: boolean }) {
  const foot = b.foot && to > b.body.length
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="flex items-baseline justify-between gap-4 font-heading text-sm font-bold">
          <span>{name(b)}{from > 0 && <span className="font-normal text-muted-foreground"> (continued)</span>}</span>
          {cluster && <span className="text-xs font-normal text-muted-foreground">{b.cluster}</span>}
        </h3>
        {from === 0 && b.basis && <p className="text-xs text-muted-foreground">{b.basis}</p>}
      </div>
      {b.lines ? (
        <T className="table-fixed border-y border-foreground/70 text-xs">
          <TableHeader>
            <TableRow className="border-foreground/70 bg-muted/60 hover:bg-muted/60">
              <TableHead className="h-auto py-1.5 whitespace-normal"><Lines b={b} cells={b.cols.map((c) => c.head)} className="font-semibold" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {b.body.slice(from, to).map((cells, ri) => (
              <TableRow key={from + ri} className="hover:bg-transparent">
                <TableCell className="py-1 whitespace-normal tabular-nums"><Lines b={b} cells={cells} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
          {foot && (
            <TableFooter className="border-foreground/70 bg-transparent">
              <TableRow className="border-b-[3px] border-double border-foreground/70 hover:bg-transparent">
                <TableCell className="py-1.5 whitespace-normal tabular-nums"><Lines b={b} cells={b.foot!} className="font-bold" /></TableCell>
              </TableRow>
            </TableFooter>
          )}
        </T>
      ) : (
        <T className="table-fixed border-y border-foreground/70 text-xs">
          <colgroup>{b.cols.map((c) => <col key={c.head} style={{ width: `${c.w * 100}%` }} />)}</colgroup>
          <TableHeader>
            <TableRow className="border-foreground/70 bg-muted/60 hover:bg-muted/60">
              {b.cols.map((c) => <TableHead key={c.head} className={`h-8 font-semibold whitespace-normal ${right(c)}`}>{c.head}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {b.body.slice(from, to).map((cells, ri) => (
              <TableRow key={from + ri} className="h-7 hover:bg-transparent">
                {cells.map((v, ci) => (
                  <TableCell key={ci} className={`py-1.5 align-top tabular-nums ${b.cols[ci].fmt === "text" ? "whitespace-normal break-words" : right(b.cols[ci])}`}>{v}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
          {foot && (
            <TableFooter className="border-foreground/70 bg-transparent">
              {/* Accounting rule: a single line above the total, a double line below. */}
              <TableRow className="h-7 border-b-[3px] border-double border-foreground/70 hover:bg-transparent">
                {b.foot!.map((v, ci) => <TableCell key={ci} className={`py-1.5 font-bold tabular-nums ${right(b.cols[ci])}`}>{v}</TableCell>)}
              </TableRow>
            </TableFooter>
          )}
        </T>
      )}
      {to === b.heights.length && b.notes.length > 0 && (
        <ol className="flex flex-col gap-1 text-xs text-muted-foreground">
          {b.notes.map((n, i) => <li key={i}>{b.notes.length > 1 ? `Note ${i + 1}. ` : "Note. "}{n}</li>)}
        </ol>
      )}
    </section>
  )
}

/** Three signatories, the preparer's name filled in; each signs and dates by hand. */
export function SignOff({ preparer }: { preparer: string }) {
  return (
    <section aria-label="Sign-off" className="mt-auto grid grid-cols-3 gap-8 pt-6 text-sm break-inside-avoid">
      {([["Prepared by", preparer], ["Reviewed by", ""], ["Approved by", ""]] as const).map(([k, v]) => (
        <div key={k} className="flex flex-col gap-8">
          <span className="text-muted-foreground">{k}:</span>
          <div className="flex flex-col gap-3">
            <div className="border-t border-foreground/60 pt-1 text-center">
              <div className="min-h-5 font-medium">{v}</div>
              <div className="text-xs text-muted-foreground">Signature over printed name</div>
            </div>
            <div className="text-xs text-muted-foreground">Date: <span className="inline-block w-24 border-b border-foreground/60" /></div>
          </div>
        </div>
      ))}
    </section>
  )
}

export function PageFooter({ source, generated, page, of, push }: { source: string; generated: string; page: number; of: number; push: boolean }) {
  return (
    <footer className={`flex justify-between gap-2 text-xs text-muted-foreground ${push ? "mt-auto" : ""}`}>
      <span>System-generated from {source || "Google Sheet"} · {generated}</span>
      <span className="tabular-nums">Page {page} of {of}</span>
    </footer>
  )
}
