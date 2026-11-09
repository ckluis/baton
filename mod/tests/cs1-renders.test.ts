// claude plugin test — CS1 criterion 3 (run build-20261019T125436Z, phase P7): the band drawn at 60, 80, 120 and 200
// columns with and without a usage reading, with an approval waiting and with a question waiting, each drawn the way
// the CS1 tests read it (mod/tests/pw1-a3/kit.ts, mod/tests/cs1/kit.ts). Each render is asserted to fit its width and to
// hold the strip's two lines; with SHOW set the renders are printed, `@@RENDER <name>` then the lines, as saved under
// _orch/nodes/CS1/work/renders/.
import { expect, test } from 'claude-code/testing'
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
]

for (const c of CASES) {
  test('CS1 renders: the band ' + c.name + ' at 60, 80, 120 and 200 columns', async ($, on) => {
    const w = stripWorld(on, { ...c.o, usage: c.read ? { rateLimits: [FIVE, WEEK, OPUS], cost: { usd: 9.94 } } : { rateLimits: [] } })
    await w.begin($)
    if (c.read) await $.session.measure({ context: { tokens: 230000, window: 1000000, percent: 23 }, rateLimits: [FIVE, WEEK, OPUS], changed: ['context', 'rateLimits'] } as any)
    await w.settle(31000)
    const out: string[] = []
    for (const width of [60, 80, 120, 200]) {
      const ui = await w.band($, width)
      const els = elements(await ui.drawn(), width).filter((e: El) => keyOf(e.node) !== 'engine' && !(e.node?.type === 'Text' && e.text === ''))
      const lines = screen(els)
      await ui.unmount()
      out.push('@@RENDER band-' + c.name + '-' + width + '\n' + lines.join('\n'))
      expect(lines.filter((l) => cellW(l) > width), c.name + ' at ' + width).toEqual([])
      expect(lines.length, c.name + ' at ' + width + '\n' + lines.join('\n')).toBe(c.name === 'approval' ? 3 : 2)
      expect(lines[1], c.name + ' at ' + width).toMatch(/ctrl\+x tab/)
    }
    if (SHOW) (globalThis as any).console.log(out.join('\n'))
  })
}
