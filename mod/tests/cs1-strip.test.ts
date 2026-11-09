// claude plugin test — CS1 criterion 1 (run build-20261019T125436Z, phase P7): the band above the prompt is a strip of
// exactly two lines (operator decision 2026-11-09, _orch/inbox/compact-strip.md; details _orch/plan/decisions/P7-CS-d1.md
// items 2, 4 and 7).
//
//   line 1: the gauges: the prime's context against rotate-at, the 5-hour and the weekly limit with their reset times
//           when known, and any other window the API reports, at the widths that hold them;
//   line 2: the plain way to open each view (`open: ctrl+x tab, then w work · m memory`, shortened to
//           `ctrl+x tab: w work · m memory`, never dropped at any width from 40), then the goal's state, the live count,
//           the waiting-on-you flag (WT1's items) and the cost, cut to the width.
//
// The gauges are fed through the real paths: `$.session.usage()` (register.js readUsage) and the `session.measure` hook.
// A figure the input does not hold is never drawn: no reading at all reads `n/a (no reading yet)`; a reading with no
// window at all `n/a (not on a subscription)`; a window the others came without `n/a (not reported)`. While an approval
// waits, `1: approve` and `2: send back…` are drawn and work as before (P7-CS-d1 item 4), within the strip's two lines
// (CS1 red 2, Q-98 A). The drawing model is PW1's (mod/tests/pw1-a3/kit.ts), the world CS1's (mod/tests/cs1/kit.ts).
import { expect, test } from 'claude-code/testing'
// amended by verifier (XTFL1): the kit's default budget of 5000 ms per test is wall time. With four suites run at once
// (each runs all its files at once) the tests here ran 6-10x slower than alone and timed out under that load
// (_orch/nodes/XTFL1/work/repro.md, cause.md), so every test in this file gets an explicit budget. No step or assertion
// is changed by it.
const LOADED = { timeoutMs: 60000 }
import { cellW, dump, elements, screen, type El } from './pw1-a3/kit'
import { stripWorld, type Opts } from './cs1/kit'

const WIDTHS = [40, 60, 80, 120, 200]
const FIVE = { kind: 'five_hour', percentUsed: 41, resetsAt: '2026-11-06T14:20:00Z' } // fixture: Friday 2026-11-06, 14:20Z
const WEEK = { kind: 'seven_day', percentUsed: 62, resetsAt: '2026-11-12T09:00:00Z' } // fixture: Thursday 09:00Z
const OPUS = { kind: 'seven_day_opus', percentUsed: 22, resetsAt: '2026-11-12T09:00:00Z' } // fixture: a per-model window
const READ = { limits: [FIVE, WEEK, OPUS], ctx: 23, usd: 9.94 } // every figure the band may show, below
const FIGURES = new Set(['23', '35', '41', '62', '22']) // the input's percentages and the rotate-at threshold (config 35)
const HINT_LONG = 'open: ctrl+x tab, then w work · m memory'
const HINT_SHORT = 'ctrl+x tab: w work · m memory'
const keyOf = (n: any) => String(n?.key ?? n?.props?.key ?? '')

type Feed = { limits?: any[]; ctx?: number; usd?: number; measure?: boolean }
/** The world, begun, with the plan usage fed through `$.session.usage()` and the `session.measure` hook. */
async function fed($: any, on: any, f: Feed, o: Opts = {}) {
  const w = stripWorld(on, { ...o, usage: { rateLimits: f.limits ?? [], ...(f.usd != null ? { cost: { usd: f.usd } } : {}) } })
  await w.begin($)
  if (f.measure !== false && (f.ctx != null || (f.limits ?? []).length)) {
    await $.session.measure({ ...(f.ctx != null ? { context: { tokens: f.ctx * 10000, window: 1000000, percent: f.ctx } } : {}), rateLimits: f.limits ?? [], changed: ['context', 'rateLimits'] } as any)
  }
  await w.settle(31000) // past the 30 s usage read
  return w
}
/** The band at `width`: its elements and its lines, the engine's own (empty) drawing left out. */
async function strip($: any, w: any, width: number) {
  const ui = await w.band($, width)
  const els = elements(await ui.drawn(), width).filter((e: El) => keyOf(e.node) !== 'engine')
  return { ui, els, lines: screen(els) }
}
/** What is wrong with a drawn band: a line over the width, a Text the terminal has to cut. */
function overs(els: El[], width: number): string[] {
  const bad: string[] = []
  screen(els).forEach((l, i) => { if (cellW(l) > width) bad.push('line ' + i + ' is ' + cellW(l) + ' cells') })
  for (const e of els) for (const l of e.leaves) if (l.kind === 'text' && !l.boxed && l.drawn !== l.text) bad.push('the terminal cut |' + l.text + '|')
  return bad
}
const percents = (s: string) => [...s.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => m[1]!)
const dollars = (s: string) => [...s.matchAll(/\$(\d+(?:\.\d+)?)/g)].map((m) => m[1]!)

for (const width of WIDTHS) {
  test('CS1 1: with a full reading, the band at ' + width + ' columns is two lines: the gauges, then the way to open each view, the goal, the live count and the cost', LOADED, async ($, on) => {
    const w = await fed($, on, READ)
    const { els, lines } = await strip($, w, width)
    const say = dump(els)
    expect(lines.length, 'two lines' + say).toBe(2)
    expect(overs(els, width), say).toEqual([])
    const [g, s] = lines as [string, string]
    // line 1: the context against rotate-at, the 5-hour and the weekly window, each with the input's figure
    // (anywhere on line 1, Q-98 A: the existing hooks smoke puts it after the windows, mod/test/fixtures/hooks-smoke.mjs:211)
    expect(g, say).toMatch(/ctx .*23%\/35%/)
    expect(g, say).toMatch(/5h [^·]*41%/)
    expect(g, say).toMatch(/(week|wk) [^·]*62%/)
    if (width >= 80) expect(g, say).toContain('14:20Z') // the 5-hour reset
    // (with or without its day, Q-98 A: the label is read against the wall clock, `14:20Z` on the day, `Fri 14:20Z` after)
    if (width >= 120) expect([/resets (Fri )?14:20Z/.test(g), g.includes('Thu 09:00Z')], say).toEqual([true, true])
    if (width >= 200) expect(g, say).toMatch(/Opus[^·]*22%/) // the per-model window, where it fits
    // no figure the input did not hold
    expect(percents(g).filter((p) => !FIGURES.has(p)), say).toEqual([])
    expect(dollars(lines.join(' ')).filter((d) => d !== '9.94'), say).toEqual([])
    // line 2: the way to open each view first, never dropped
    expect(s.startsWith(width >= 80 ? HINT_LONG : HINT_SHORT), say).toBe(true)
    if (width >= 80) {
      expect(s, say).toMatch(/#57 /) // the goal's state
      expect(s, say).toContain(w.running + ' live')
      expect(s, say).toContain('$9.94')
    }
  })

  test('CS1 1: with no reading at all, the band at ' + width + ' columns is two lines and says n/a with why, never a figure', LOADED, async ($, on) => {
    const w = await fed($, on, {})
    const { els, lines } = await strip($, w, width)
    const say = dump(els)
    expect(lines.length, 'two lines' + say).toBe(2)
    expect(overs(els, width), say).toEqual([])
    const [g, s] = lines as [string, string]
    expect(percents(g), say).toEqual([])
    expect(dollars(lines.join(' ')), say).toEqual([])
    expect([/ctx n\/a/.test(g), /5h n\/a/.test(g), /(week|wk) n\/a/.test(g)], say).toEqual([true, true, true])
    if (width >= 60) expect(g, say).toContain('(no reading yet)')
    if (width >= 120) expect([g.includes('5h n/a (no reading yet)'), g.includes('week n/a (no reading yet)')], say).toEqual([true, true])
    expect(s.startsWith(width >= 80 ? HINT_LONG : HINT_SHORT), say).toBe(true)
  })
}

test('CS1 1: a reading with no window at all says the 5-hour and the weekly limit are n/a, not on a subscription', LOADED, async ($, on) => {
  const w = await fed($, on, { limits: [], ctx: 23 })
  const { els, lines } = await strip($, w, 120)
  expect([lines[0]!.includes('5h n/a (not on a subscription)'), lines[0]!.includes('week n/a (not on a subscription)'), /ctx .*23%\/35%/.test(lines[0]!)], dump(els)).toEqual([true, true, true])
})

test('CS1 1: with only the 5-hour window reported, the weekly limit reads n/a (not reported)', LOADED, async ($, on) => {
  const w = await fed($, on, { limits: [FIVE], ctx: 23 })
  const { els, lines } = await strip($, w, 120)
  expect([/5h [^·]*41%/.test(lines[0]!), lines[0]!.includes('week n/a (not reported)')], dump(els)).toEqual([true, true])
  expect(percents(lines[0]!).filter((p) => !FIGURES.has(p)), dump(els)).toEqual([])
})

test('CS1 1: with no context reading, the context gauge reads n/a', LOADED, async ($, on) => {
  const w = await fed($, on, { limits: [FIVE, WEEK] })
  const { els, lines } = await strip($, w, 120)
  expect([/ctx n\/a/.test(lines[0]!), /5h [^·]*41%/.test(lines[0]!), /week [^·]*62%/.test(lines[0]!)], dump(els)).toEqual([true, true, true])
})

for (const width of [40, 49, 60, 80, 120, 200]) {
  test('CS1 1: while a phase waits for its check, the band at ' + width + ' columns keeps its strip and `1: approve` / `2: send back…`, and 1 approves', LOADED, async ($, on) => {
    const w = await fed($, on, READ, { approval: true })
    const { ui, els, lines } = await strip($, w, width)
    const say = dump(els)
    expect(overs(els, width), say).toEqual([])
    expect(lines[0], say).toMatch(/ctx /)
    expect(lines[1]!.startsWith(width >= 80 ? HINT_LONG : HINT_SHORT), say).toBe(true)
    // the keys within the strip's two lines (Q-98 A): on line 2 after the hint wherever it has the cells (from 60
    // columns), on line 1 where it has not (40 and 49: the short hint and both keys need 54 cells)
    const keyed = (l: string) => l.includes('1: approve') && l.includes('2: send back…')
    expect(keyed(lines[width >= 60 ? 1 : 0] ?? ''), say).toBe(true)
    expect(lines.length, 'the strip, the keys within it' + say).toBe(2)
    const one = (await ui.findAll({ type: 'Button' })).find((b: any) => b.props?.hotkey === '1')
    expect(!!one, say).toBe(true)
    await ui.press({ key: keyOf(one) })
    await w.settle(100)
    await ui.unmount()
    const after = await strip($, w, width)
    expect([after.lines.length, after.lines.some((l) => l.includes('1: approve'))], 'after 1' + dump(after.els)).toEqual([2, false])
  })

  test('CS1 1: with a question and a blocked agent waiting, the band at ' + width + ' columns folds the ⚑ flag into its second line', LOADED, async ($, on) => {
    const w = await fed($, on, READ, { question: true, blocked: true })
    const { els, lines } = await strip($, w, width)
    const say = dump(els)
    expect(lines.length, 'two lines' + say).toBe(2)
    expect(overs(els, width), say).toEqual([])
    expect(lines[1]!.startsWith(HINT_SHORT) || lines[1]!.startsWith(HINT_LONG), say).toBe(true)
    expect(lines[1], say).toContain('⚑')
    if (width >= 60) expect([/\b1 question\b/.test(lines[1]!), /\b1 blocked\b/.test(lines[1]!)], say).toEqual([true, true])
  })
}
