import { readFileSync } from "node:fs"
import { join } from "node:path"
import { crc32, deflateRawSync } from "node:zlib"

/** One schedule, already formatted as text: what the Word file prints. right: the columns set flush right (amounts). */
export type DocTable = {
  title: string; basis?: string; highlights: string[]
  head: string[]; width: number[]; right: boolean[]; rows: string[][]; foot?: string[]; notes: string[]
}
/** The report sheet's letterhead lines (see Letterhead in report-sheet.tsx). */
export const LETTERHEAD = [
  "Technical Education and Skills Development Authority XI",
  "REGIONAL TRAINING CENTER – KOREA PHILIPPINES VOCATIONAL TRAINING CENTER",
  "Buhisan Tibungco, Davao City, Philippines",
]
// Page width and height in twentieths of a point, for the report page's paper choices.
const PAGES = { short: [12240, 15840], long: [12240, 18720], a4: [11906, 16838] } as const
const MARGIN = 1080 // 0.75 in
// The letterhead's logos, as on the report sheet: file in public/ (next.config.ts ships them with the routes), name, width over height.
const LOGOS = [
  ["bagong_pilipinas_logo.png", "Bagong Pilipinas", 618 / 576],
  ["tesda_logo.png", "TESDA", 1],
  ["tesda_korphil_logo.png", "Korea-Philippines Vocational Training Center", 1],
] as const
const LOGO_HEIGHT = 640080 // EMUs: 0.7 in
const LOGO_REL = (i: number) => `rId${i + 2}` // rId1 is the styles part

// Control characters other than tab and newline are illegal in XML 1.0; one pasted from the sheet would stop Word opening the file.
const esc = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const run = (text: string, { bold = false, italic = false, size = 20, color = "" } = {}) =>
  `<w:r><w:rPr>${bold ? "<w:b/>" : ""}${italic ? "<w:i/>" : ""}${color ? `<w:color w:val="${color}"/>` : ""}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
const para = (runs: string, { align = "left", before = 0, after = 80, keep = false, border = "" } = {}) =>
  `<w:p><w:pPr>${keep ? "<w:keepNext/>" : ""}${border}<w:spacing w:before="${before}" w:after="${after}"/><w:jc w:val="${align}"/></w:pPr>${runs}</w:p>`

/** One logo as an inline picture. */
function picture(i: number) {
  const [, name, ratio] = LOGOS[i], cy = LOGO_HEIGHT, cx = Math.round(cy * ratio)
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${i + 1}" name="Logo ${i + 1}" descr="${esc(name)}"/>` +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${i + 1}" name="Logo ${i + 1}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${LOGO_REL(i)}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
    "</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>"
}

/** The letterhead as on the report sheet: two logos, the office's lines, one logo, with a double rule beneath. */
function letterhead(contentWidth: number) {
  const side = [2200, 1100], middle = contentWidth - side[0] - side[1]
  const cell = (width: number, content: string) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${content}</w:tc>`
  const lines = LETTERHEAD.map((l, i) => para(run(l, { bold: i === 1, size: 22, color: "1B2A6B" }), { align: "center", after: 0 })).join("")
  return `<w:tbl><w:tblPr><w:tblW w:w="${contentWidth}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` +
    '<w:tblBorders><w:bottom w:val="double" w:sz="6" w:space="0" w:color="1B2A6B"/></w:tblBorders>' +
    '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
    `<w:tblGrid><w:gridCol w:w="${side[0]}"/><w:gridCol w:w="${middle}"/><w:gridCol w:w="${side[1]}"/></w:tblGrid><w:tr>` +
    cell(side[0], para(picture(0) + picture(1), { after: 0 })) + cell(middle, lines) + cell(side[1], para(picture(2), { align: "right", after: 0 })) + "</w:tr></w:tbl>"
}

function table(t: DocTable, contentWidth: number) {
  const sum = t.width.reduce((a, b) => a + b, 0)
  const widths = t.width.map((w) => Math.round(contentWidth * (sum ? w / sum : 1 / t.width.length)))
  const cell = (text: string, i: number, o: { bold?: boolean; shade?: boolean; top?: boolean } = {}) =>
    `<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/>${o.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F1EF"/>' : ""}` +
    `${o.top ? '<w:tcBorders><w:top w:val="single" w:sz="12" w:color="1C1917"/></w:tcBorders>' : ""}</w:tcPr>` +
    para(run(text, { bold: o.bold, size: 18 }), { align: t.right[i] ? "right" : "left", after: 0 }) + "</w:tc>"
  const row = (cells: string[], o: { bold?: boolean; shade?: boolean; top?: boolean; header?: boolean } = {}) =>
    `<w:tr>${o.header ? "<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>" : "<w:trPr><w:cantSplit/></w:trPr>"}${cells.map((c, i) => cell(c, i, o)).join("")}</w:tr>`
  return `<w:tbl><w:tblPr><w:tblW w:w="${contentWidth}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` +
    '<w:tblBorders><w:insideH w:val="single" w:sz="4" w:color="E7E5E4"/><w:bottom w:val="single" w:sz="4" w:color="E7E5E4"/></w:tblBorders>' +
    '<w:tblCellMar><w:top w:w="50" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="50" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
    row(t.head, { bold: true, shade: true, header: true }) + t.rows.map((r) => row(r)).join("") + (t.foot ? row(t.foot, { bold: true, top: true }) : "") + "</w:tbl>"
}

/** The Word document's body: letterhead, report title and scope, then each schedule with its basis, table and notes. */
export function documentXml(title: string, subtitle: string, office: string, tables: DocTable[], paper: keyof typeof PAGES = "short") {
  const [w, h] = PAGES[paper], contentWidth = w - 2 * MARGIN
  const head = letterhead(contentWidth) +
    para(run(`ACCOUNTING OFFICE · ${office.toUpperCase()}`, { size: 16, color: "78716C" }), { align: "center", before: 160, after: 40 }) +
    para(run(title, { bold: true, size: 28 }), { align: "center", after: 40 }) +
    para(run(subtitle, { size: 20, color: "57534E" }), { align: "center", after: 240 })
  const body = tables.map((t) =>
    para(run(t.title, { bold: true, size: 24 }), { before: 240, after: 60, keep: true }) +
    (t.basis ? para(run(t.basis, { italic: true, size: 18, color: "57534E" }), { after: 120, keep: true }) : "") +
    t.highlights.map((l) => para(run(l, { size: 18 }), { after: 40, keep: true })).join("") +
    table(t, contentWidth) +
    t.notes.map((n) => para(run(`Note: ${n}`, { size: 16, color: "57534E" }), { before: 60, after: 0 })).join("")).join("")
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>' + head + body +
    `<w:sectPr><w:pgSz w:w="${w}" w:h="${h}"/><w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>` +
    "</w:body></w:document>"
}

const PARTS = {
  "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
  "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  "word/_rels/document.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    LOGOS.map(([file], i) => `<Relationship Id="${LOGO_REL(i)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${file}"/>`).join("") + "</Relationships>",
  // Calibri ships with Word on every office PC; the app's own font may not be installed.
  "word/styles.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:color w:val="1C1917"/><w:sz w:val="20"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>',
}

/** A zip of files (text as UTF-8), deflated. ponytail: no zip64, so each file and the whole archive stay under 4 GB (reports are kilobytes). */
export function zip(files: [string, string | Buffer][]): Buffer {
  const parts: Buffer[] = [], dir: Buffer[] = []
  let offset = 0
  for (const [path, content] of files) {
    const data = typeof content === "string" ? Buffer.from(content, "utf8") : content, body = deflateRawSync(data), name = Buffer.from(path, "utf8"), crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8)
    local.writeUInt16LE(0, 10); local.writeUInt16LE(33, 12) // 1980-01-01, 00:00
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10)
    central.writeUInt16LE(0, 12); central.writeUInt16LE(33, 14)
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    parts.push(local, name, body); dir.push(central, name)
    offset += 30 + name.length + body.length
  }
  const cd = Buffer.concat(dir), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, cd, end])
}

/** A .docx download response: the report as a Word document with editable tables. */
export function docxResponse(filename: string, title: string, subtitle: string, office: string, tables: DocTable[], paper?: string) {
  const size = paper && paper in PAGES ? (paper as keyof typeof PAGES) : "short"
  const logos = LOGOS.map(([name]): [string, Buffer] => [`word/media/${name}`, readFileSync(join(process.cwd(), "public", name))])
  const file = zip([...Object.entries(PARTS), ...logos, ["word/document.xml", documentXml(title, subtitle, office, tables, size)]])
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
