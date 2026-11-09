// claude plugin test — CS1 criterion 0 (a), red 2 (run build-20261019T125436Z, phase P7): agent rows never drop as the
// pane gets taller. The CS1 attempt-1 verdict (_orch/verify/CS1-verdict.json, row 0) found a taller pane drawing fewer
// agent rows than a shorter one at the same width (120x24: 3 agent rows in 23 lines, 120x23: 7 in 22); the 0a test in
// mod/tests/cs1-pane.test.ts only looks where a detail line is drawn, so it could not see it.
//
// At 49, 60, 75, 90, 120 and 200 columns, for every height from 8 to 40, in PW1's world and the hostile one with three
// open questions (mod/tests/pw1-a3/kit.ts, its drawing model unchanged), the number of agent rows drawn is the most
// that fit:
//   - never fewer than at any shorter height of the same width;
//   - while the list scrolls (a `↓ N more` or `↑ N more` line is drawn), the pane's unused lines never hold another
//     agent row and the empty bottom row a scrolling list keeps;
//   - no more lines than the pane has.
import { expect, test } from 'claude-code/testing'
import { agentRows, dump, elements, hostileWorld, pw1World, screen } from './pw1-a3/kit'

const SLOW = { timeoutMs: 900000 }
const WIDTHS = [49, 60, 75, 90, 120, 200]
const SPARE = 1 // the empty bottom row a scrolling list keeps (Q-F115-1 A, register.js SPARE_ROWS)
const MORE = /^\s*(↑\/↓ |↑ |↓ )\d+ more/

const worldOf = (on: any, name: string): any => (name === 'pw1' ? pw1World(on) : hostileWorld(on, 3))

for (const name of ['pw1', 'q3']) {
  test('CS1 0a (red 2): agent rows never drop as the pane gets taller, and every height draws the most that fit (' + name + ', heights 8 to 40)', SLOW, async ($, on) => {
    const w = worldOf(on, name)
    await w.begin($)
    const bad: string[] = []
    for (const width of WIDTHS) {
      const ui = await w.pane($, width, 600)
      const tall = elements(await ui.drawn(), width)
      const rowLines = Math.max(...agentRows(tall).map((e) => e.lines.length))
      let best = 0
      let bestAt = 0
      for (let h = 8; h <= 40; h++) {
        await ui.redraw(w.props(width, h) as any)
        await w.settle(100)
        const els = elements(await ui.drawn(), width)
        const all = screen(els)
        const n = agentRows(els).length
        if (all.length > h) bad.push(width + 'x' + h + ': drew ' + all.length + ' lines')
        if (n < best) bad.push(width + 'x' + h + ': ' + n + ' agent rows, fewer than ' + best + ' at ' + width + 'x' + bestAt + dump(els))
        if (n > best) { best = n; bestAt = h }
        if (all.some((l) => MORE.test(l)) && h - all.length >= rowLines + SPARE) bad.push(width + 'x' + h + ': ' + n + ' agent rows in ' + all.length + ' lines while ' + (h - all.length) + ' unused lines would hold another (' + rowLines + ' lines a row)' + dump(els))
      }
      await ui.unmount()
    }
    expect(bad.slice(0, 4), bad.length + ' faults').toEqual([])
  })
}
