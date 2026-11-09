// claude plugin test — CS1 criterion 1, red 2 (run build-20261019T125436Z, phase P7): the strip is exactly two lines
// at every width from 40 to 200 columns, in every state, an approval waiting included. The CS1 attempt-1 verdict
// (_orch/verify/CS1-verdict.json, row 1) found the band three lines whenever an approval waited, at every width; Q-98 A
// folds `1: approve` / `2: send back…` into the strip's two lines (approvals unchanged on 1 and 2, P7-CS-d1 item 4).
//
// Each state is fed through the real paths (`$.session.usage()` and the `session.measure` hook, as
// mod/tests/cs1-strip.test.ts feeds them); at each width the band is drawn the way the CS1 tests read it
// (mod/tests/pw1-a3/kit.ts) and must be: two lines, none over the width, no Text the terminal cuts, line 2 starting
// with the plain way to open each view, and, while an approval waits, both keys within the two lines.
import { expect, test } from 'claude-code/testing'
import { cellW, dump, elements, screen, type El } from './pw1-a3/kit'
import { stripWorld, type Opts } from './cs1/kit'

const SLOW = { timeoutMs: 900000 }
const FIVE = { kind: 'five_hour', percentUsed: 41, resetsAt: '2026-11-06T14:20:00Z' }
const WEEK = { kind: 'seven_day', percentUsed: 62, resetsAt: '2026-11-12T09:00:00Z' }
const OPUS = { kind: 'seven_day_opus', percentUsed: 22, resetsAt: '2026-11-12T09:00:00Z' }
const HINT_LONG = 'open: ctrl+x tab, then w work · m memory'
const HINT_SHORT = 'ctrl+x tab: w work · m memory'
const keyOf = (n: any) => String(n?.key ?? n?.props?.key ?? '')

type Feed = { limits?: any[]; ctx?: number; usd?: number }
const READ: Feed = { limits: [FIVE, WEEK, OPUS], ctx: 23, usd: 9.94 }
const STATES: { name: string; f: Feed; o: Opts }[] = [
  { name: 'a full reading', f: READ, o: {} },
  { name: 'no reading', f: {}, o: {} },
  { name: 'a reading with no window', f: { limits: [], ctx: 23 }, o: {} },
  { name: 'only the 5-hour window', f: { limits: [FIVE], ctx: 23 }, o: {} },
  { name: 'no context reading', f: { limits: [FIVE, WEEK] }, o: {} },
  { name: 'an approval waiting', f: READ, o: { approval: true } },
  { name: 'an approval waiting, no reading', f: {}, o: { approval: true } },
  { name: 'a question waiting', f: READ, o: { question: true } },
  { name: 'a blocked agent waiting', f: READ, o: { blocked: true } },
  { name: 'an approval, a question and a blocked agent waiting', f: READ, o: { approval: true, question: true, blocked: true } },
]

for (const st of STATES) {
  test('CS1 1 (red 2): with ' + st.name + ', the strip is exactly two lines at every width from 40 to 200', SLOW, async ($, on) => {
    const f = st.f
    const w = stripWorld(on, { ...st.o, usage: { rateLimits: f.limits ?? [], ...(f.usd != null ? { cost: { usd: f.usd } } : {}) } })
    await w.begin($)
    if (f.ctx != null || (f.limits ?? []).length) {
      await $.session.measure({ ...(f.ctx != null ? { context: { tokens: f.ctx * 10000, window: 1000000, percent: f.ctx } } : {}), rateLimits: f.limits ?? [], changed: ['context', 'rateLimits'] } as any)
    }
    await w.settle(31000)
    const bad: string[] = []
    for (let width = 40; width <= 200; width++) {
      const ui = await w.band($, width)
      const els = elements(await ui.drawn(), width).filter((e: El) => keyOf(e.node) !== 'engine')
      const lines = screen(els)
      await ui.unmount()
      const say = width + ': ' + dump(els)
      if (lines.length !== 2) bad.push(lines.length + ' lines at ' + say)
      lines.forEach((l, i) => { if (cellW(l) > width) bad.push('line ' + i + ' is ' + cellW(l) + ' cells at ' + say) })
      for (const e of els) for (const l of e.leaves) if (l.kind === 'text' && !l.boxed && l.drawn !== l.text) bad.push('the terminal cut |' + l.text + '| at ' + say)
      if (!(lines[1] ?? '').startsWith(width >= 80 ? HINT_LONG : HINT_SHORT)) bad.push('no hint on line 2 at ' + say)
      if (st.o.approval && !lines.slice(0, 2).some((l) => l.includes('1: approve') && l.includes('2: send back…'))) bad.push('no keys in the strip at ' + say)
    }
    expect(bad.slice(0, 4), bad.length + ' faults').toEqual([])
  })
}
