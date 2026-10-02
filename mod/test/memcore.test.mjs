// node --test mod/test — the pure memory core.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as m from '../lib/memcore.mjs'

const covers = (tiles, lo, hi) => {
  let a = lo
  for (const t of tiles) {
    assert.equal(t.lo, a, 'tiles are contiguous')
    assert.equal(t.hi - t.lo, 2 ** t.level, 'a tile is 2^level notes')
    assert.equal(t.lo % 2 ** t.level, 0, 'a tile is aligned')
    assert.equal(t.index, t.lo / 2 ** t.level)
    a = t.hi
  }
  assert.equal(a, hi, 'tiles cover the range')
}

test('records are fixed width, whole, and round-trip', () => {
  const r = m.encodeRecord({ text: 'P3 DONE+CONFIRMED; parked Q-2', tag: 'sub:P3', ts: Date.UTC(2026, 9, 2, 12, 0, 0) })
  assert.equal(r.length, m.RECORD_BYTES)
  assert.equal(r[m.RECORD_BYTES - 1], 0x0a)
  assert.ok(m.isWhole(r))
  assert.deepEqual(m.decodeRecord(r), { ts: '2026-10-02T12:00:00Z', tag: 'sub:P3', text: 'P3 DONE+CONFIRMED; parked Q-2' })
  const torn = r.slice()
  torn[318] = 0x20
  assert.equal(m.decodeRecord(torn), null, 'no sentinel, no record')
  assert.equal(m.decodeRecord(r.subarray(0, 100)), null)
})

test('notes are capped at 280 bytes on a code point boundary', () => {
  assert.deepEqual(m.clampBytes('a\n\tb   c'), { text: 'a b c', truncated: false })
  const long = 'é'.repeat(200) // 400 bytes
  const { text, truncated } = m.clampBytes(long)
  assert.ok(truncated)
  assert.ok(new TextEncoder().encode(text).length <= 280)
  assert.ok(text.endsWith('…'))
  assert.ok(!text.includes('�'))
  const exact = 'x'.repeat(280)
  assert.deepEqual(m.clampBytes(exact), { text: exact, truncated: false })
  const rec = m.decodeRecord(m.encodeRecord({ text: '🎼'.repeat(100) }))
  assert.ok(new TextEncoder().encode(rec.text).length <= 280)
})

test('tags are sanitized to 16 ASCII bytes', () => {
  assert.equal(m.cleanTag('sub-orchestrator:P12 extra!'), 'sub-orchestrator')
  assert.equal(m.cleanTag('a b/c'), 'abc')
  assert.equal(m.cleanTag(''), 'note')
})

test('tree math: aligned power-of-two blocks', () => {
  assert.deepEqual(m.blockRange(3, 2), [16, 24])
  assert.equal(m.isComplete(3, 2, 24), true)
  assert.equal(m.isComplete(3, 2, 23), false)
  assert.equal(m.maxLevel(1), 0)
  assert.equal(m.maxLevel(2), 1)
  assert.equal(m.maxLevel(1023), 9)
  assert.equal(m.maxLevel(1024), 10)
  assert.deepEqual(m.newlyComplete(8).map((b) => [b.level, b.index]), [[1, 3], [2, 1], [3, 0]])
  assert.deepEqual(m.newlyComplete(7), [])
  assert.deepEqual(m.newlyComplete(12).map((b) => [b.level, b.index]), [[1, 5], [2, 2]])
  // a full tree over n notes has n - popcount(n) summaries
  for (const n of [1, 2, 3, 7, 8, 100, 1000]) {
    const pop = n.toString(2).split('').filter((c) => c === '1').length
    assert.equal(m.fullTreeSize(n), n - pop, `n=${n}`)
  }
})

test('pending-merge queue: lowest level first, ready only when children exist', () => {
  const have = new Set()
  const has = (k, i) => have.has(`${k}:${i}`)
  let p = m.pendingMerges(8, has)
  assert.equal(p.length, 7)
  assert.deepEqual(p.filter((x) => x.ready).map((x) => `${x.level}:${x.index}`), ['1:0', '1:1', '1:2', '1:3'])
  have.add('1:0').add('1:1')
  p = m.pendingMerges(8, has)
  assert.deepEqual(p.filter((x) => x.ready).map((x) => `${x.level}:${x.index}`), ['1:2', '1:3', '2:0'])
  assert.deepEqual(p[0], { level: 1, index: 2, lo: 4, hi: 5, ready: true })
})

test('canonical tiling is the fewest aligned blocks', () => {
  const t = m.canonicalTiling(0, 13)
  assert.deepEqual(t.map((x) => x.hi - x.lo), [8, 4, 1])
  covers(t, 0, 13)
  const z = m.canonicalTiling(3, 17)
  covers(z, 3, 17)
  assert.deepEqual(z.map((x) => x.hi - x.lo), [1, 4, 8, 1])
})

test('wake budget: at most N blocks, covering, finest near the end', () => {
  for (let n = 1; n <= 700; n += 3) {
    for (const budget of [1, 4, 8, 16, 33, 96]) {
      const t = m.wakeTiling(0, n, budget)
      covers(t, 0, n)
      const floor = m.canonicalTiling(0, n).length
      assert.ok(t.length <= Math.max(budget, floor), `n=${n} budget=${budget} got ${t.length}`)
      if (n <= budget) assert.ok(t.every((x) => x.level === 0), 'a log within budget is shown verbatim')
      else assert.ok(t.length === Math.max(budget, floor), 'the budget is spent')
      for (let j = 1; j < t.length; j++) assert.ok(t[j].hi - t[j].lo <= t[j - 1].hi - t[j - 1].lo, 'sizes never grow toward the end')
    }
  }
})

test('wake decays with age: with budget 96 over 10,000 notes the newest are verbatim', () => {
  const t = m.wakeTiling(0, 10000, 96)
  assert.equal(t.length, 96)
  const tail = t.slice(-8)
  assert.ok(tail.every((x) => x.level === 0), 'the last eight are single notes')
  assert.ok(t[0].level >= 8, 'the oldest block is large')
})

test('wake splits a block with no summary before any other', () => {
  const missing = new Set(['3:0'])
  const t = m.wakeTiling(0, 13, 4, (k, i) => !missing.has(`${k}:${i}`))
  assert.ok(!t.some((x) => x.level === 3 && x.index === 0), 'the unmerged block was opened')
  covers(t, 0, 13)
})

test('zoom ranges: inclusive, clamped, either order', () => {
  assert.deepEqual(m.parseRange('2-5', 13), [2, 6])
  assert.deepEqual(m.parseRange('#5..#2', 13), [2, 6])
  assert.deepEqual(m.parseRange('7', 13), [7, 8])
  assert.deepEqual(m.parseRange('10-99', 13), [10, 13])
  assert.throws(() => m.parseRange('20-30', 13), /past the last note/)
  assert.throws(() => m.parseRange('abc', 13), /not lo-hi/)
  const t = m.wakeTiling(2, 6, 96)
  assert.deepEqual(t.map((x) => x.lo), [2, 3, 4, 5])
})

test('recall regex: case-insensitive, invalid patterns match literally', () => {
  assert.ok(m.toRegex('p3 done').test('P3 DONE'))
  assert.ok(m.toRegex('Q-(2').test('waiting on Q-(2'))
})

test('render: notes verbatim, blocks with their summary or their edges', () => {
  const notes = Array.from({ length: 4 }, (_, i) => ({ ts: 'T', tag: 'x', text: `n${i}` }))
  const tiles = [{ level: 1, index: 0, lo: 0, hi: 2 }, { level: 0, index: 2, lo: 2, hi: 3 }, { level: 0, index: 3, lo: 3, hi: 4 }]
  const lines = m.renderTiles(tiles, (i) => notes[i], () => 'merged 0-1')
  assert.deepEqual(lines, ['#0-1 (2 notes) merged 0-1', '#2 T [x] n2', '#3 T [x] n3'])
  const bare = m.renderTiles(tiles.slice(0, 1), (i) => notes[i], () => null)
  assert.equal(bare[0], '#0-1 (2 notes) (not merged yet) n0 … n1')
})

test('fallback merge is deterministic and within 280 bytes', () => {
  const a = 'x'.repeat(280)
  const s = m.fallbackMerge([a, a])
  assert.ok(new TextEncoder().encode(s).length <= 280)
  assert.equal(s, m.fallbackMerge([a, a]))
})
