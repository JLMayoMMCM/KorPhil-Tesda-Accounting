// Run: node --experimental-strip-types --test src/lib/dashboard.test.ts
import assert from "node:assert/strict"
import { test } from "node:test"

import { arrange, cleanLayout, fitting, moved, nearest, type DashLayout } from "./dashboard.ts"

test("cleanLayout keeps valid layouts, drops repeats, and reads the earlier columns-x-rows sizes", () => {
  assert.deepEqual(cleanLayout([["ytd", 2], ["by.x:Funding source", 4], ["ytd", 1]]), [["ytd", 2], ["by.x:Funding source", 4]])
  assert.deepEqual(cleanLayout([["ytd", "2x1"], ["trend", "4x3"], ["a", "1x2"]]), [["ytd", 2], ["trend", 4], ["a", 1]])
  assert.deepEqual(cleanLayout([]), [])
})

test("cleanLayout refuses anything else", () => {
  for (const bad of [null, "ytd", {}, [["ytd", 3]], [["ytd", 6]], [["ytd", "3x1"]], [["ytd"]], [["", 1]], [[1, 1]], [["a\nb", 1]], Array(41).fill(["a", 1])])
    assert.equal(cleanLayout(bad), null, JSON.stringify(bad))
})

test("moved moves one item and ignores bad positions", () => {
  const l = ["a", "b", "c"]
  assert.deepEqual(moved(l, 0, 2), ["b", "c", "a"])
  assert.deepEqual(moved(l, 2, 0), ["c", "a", "b"])
  assert.equal(moved(l, 0, 3), l)
  assert.equal(moved(l, -1, 0), l)
})

const l = (...ws: number[]): DashLayout => ws.map((w, i) => [`p${i}`, w])
const at = ({ x, y, span }: { x: number; y: number; span: number }) => [x, y, span]

test("arrange keeps widths and reports the empty end of each short row", () => {
  let r = arrange(l(2, 2), 4)
  assert.deepEqual(r.cells.map(at), [[0, 0, 2], [2, 0, 2]])
  assert.deepEqual(r.gaps, [])
  r = arrange(l(1, 1, 1), 4)
  assert.deepEqual(r.cells.map(at), [[0, 0, 1], [1, 0, 1], [2, 0, 1]])
  assert.deepEqual(r.gaps, [{ x: 3, y: 0, span: 1, after: 2 }])
  r = arrange(l(2, 1, 2), 4) // the second 2 doesn't fit beside 2+1: one column is left empty, and it starts row 2
  assert.deepEqual(r.cells.map(at), [[0, 0, 2], [2, 0, 1], [0, 1, 2]])
  assert.deepEqual(r.gaps, [{ x: 3, y: 0, span: 1, after: 1 }, { x: 2, y: 1, span: 2, after: 2 }])
  assert.deepEqual(arrange(l(4, 1), 4).gaps, [{ x: 1, y: 1, span: 3, after: 1 }])
  assert.deepEqual(arrange(l(), 4), { cells: [], gaps: [] })
})

test("arrange shrinks wide panels on narrow grids", () => {
  assert.deepEqual(arrange(l(4, 1, 2), 2).cells.map(at), [[0, 0, 2], [0, 1, 1], [0, 2, 2]])
  assert.deepEqual(arrange(l(4, 1, 2), 1).gaps, [])
})

test("arrange covers every row exactly once with panels and gaps", () => {
  let seed = 11
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
  for (let run = 0; run < 500; run++) {
    const layout = l(...Array.from({ length: 1 + Math.floor(rand() * 9) }, () => [1, 2, 4][Math.floor(rand() * 3)]))
    for (const cols of [4, 2, 1]) {
      const { cells, gaps } = arrange(layout, cols)
      const taken = new Set<string>()
      for (const c of [...cells, ...gaps]) for (let x = c.x; x < c.x + c.span; x++) {
        assert.ok(x < cols && !taken.has(`${x},${c.y}`), "overlap or spill")
        taken.add(`${x},${c.y}`)
      }
      const rows = Math.max(...cells.map((c) => c.y)) + 1
      assert.equal(taken.size, rows * cols, "a cell is neither a panel nor a gap")
    }
  }
})

test("fitting picks the widest width that fits a gap", () => {
  assert.equal(fitting([1, 2, 4], 3), 2)
  assert.equal(fitting([1, 2], 1), 1)
  assert.equal(fitting([2, 4], 1), undefined)
})

test("nearest picks the closest allowed width", () => {
  assert.equal(nearest([1, 2, 4], 1.4), 1)
  assert.equal(nearest([1, 2, 4], 2.9), 2)
  assert.equal(nearest([1, 2, 4], 3.2), 4)
  assert.equal(nearest([2, 4], 0.3), 2)
})
