// claude plugin test — CS1 criterion 3 (run build-20261019T125436Z, phase P7): the band drawn at 40, 60, 80, 120 and
// 200 columns with and without a usage reading, with an approval, a question, a blocked agent waiting, each drawn the way
// the CS1 tests read it (mod/tests/pw1-a3/kit.ts, mod/tests/cs1/kit.ts). Each render is asserted to fit its width and to
// hold the strip's two lines; with SHOW set the renders are printed, `@@RENDER <name>` then the lines, as saved under
// _orch/nodes/CS1/work/renders/.
import { expect, test } from 'claude-code/testing'
// amended by verifier (XTFL1): the kit's default budget of 5000 ms per test is wall time. With four suites run at once
// (each runs all its files at once) the tests here ran 6-10x slower than alone and timed out under that load
// (_orch/nodes/XTFL1/work/repro.md, cause.md), so every test in this file gets an explicit budget. No step or assertion
// is changed by it.
const LOADED = { timeoutMs: 60000 }
import { cellW, elements, screen, type El } from './pw1-a3/kit'
import { stripWorld, type Opts } from './cs1/kit'

const FIVE = { kind: 'five_hour', percentUsed: 41, resetsAt: '2026-11-06T14:20:00Z' }
const WEEK = { kind: 'seven_day', percentUsed: 62, resetsAt: '2026-11-12T09:00:00Z' }
const OPUS = { kind: 'seven_day_opus', percentUsed: 22, resetsAt: '2026-11-12T09:00:00Z' }
const keyOf = (n: any) => String(n?.key ?? n?.props?.key ?? '')
const SHOW = false // true prints the renders: the harness passes no environment to a test file, so it is a constant

const CASES: { name: string; read: boolean; o: Opts }[] = [
  { name: 'reading', read: true, o: {} },
  { name: 'no-reading', read: false, o: {} },
  { name: 'approval', read: true, o: { approval: true } },
  { name: 'question', read: true, o: { question: true } },
  // CS1 red 2: every state, the approval in its two lines (Q-98 A)
  { name: 'approval-no-reading', read: false, o: { approval: true } },
  { name: 'blocked', read: true, o: { blocked: true } },
  { name: 'all-waiting', read: true, o: { approval: true, question: true, blocked: true } },
]

for (const c of CASES) {
  test('CS1 renders: the band ' + c.name + ' at 40, 60, 80, 120 and 200 columns', LOADED, async ($, on) => {
    const w = stripWorld(on, { ...c.o, usage: c.read ? { rateLimits: [FIVE, WEEK, OPUS], cost: { usd: 9.94 } } : { rateLimits: [] } })
    await w.begin($)
    if (c.read) await $.session.measure({ context: { tokens: 230000, window: 1000000, percent: 23 }, rateLimits: [FIVE, WEEK, OPUS], changed: ['context', 'rateLimits'] } as any)
    await w.settle(31000)
    const out: string[] = []
    for (const width of [40, 60, 80, 120, 200]) {
      const ui = await w.band($, width)
      const els = elements(await ui.drawn(), width).filter((e: El) => keyOf(e.node) !== 'engine')
      const lines = screen(els)
      await ui.unmount()
      out.push('@@RENDER band-' + c.name + '-' + width + '\n' + lines.join('\n'))
      expect(lines.filter((l) => cellW(l) > width), c.name + ' at ' + width).toEqual([])
      expect(lines.length, c.name + ' at ' + width + '\n' + lines.join('\n')).toBe(2)
      expect(lines[1], c.name + ' at ' + width).toMatch(/ctrl\+x tab/)
    }
    if (SHOW) (globalThis as any).console.log(out.join('\n'))
  })
}
