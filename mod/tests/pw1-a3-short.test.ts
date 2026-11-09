// claude plugin test — PW1 attempt 3 (run build-20261019T125436Z, phase P7): what the verifier refuted in attempt 2
// (_orch/verify/PW1-verdict.json, criterion 3): a pane of 16 rows or fewer (49x16, 49x14, 75x13, 60x12) still drew
// the whole agent list, so its key hint fell out of the pane.
//
// The smallest pane the engine gives: the types set no floor for a pane's body. PaneOpenArgs.rows is "a positive whole
// number" (types-2.1.316 claude-code/index.d.ts L7697-7705), the dock ignores it and takes the terminal's height, and
// Pane's `scroll.bodyRows` is "the room's rows ... less the engine's" (L11018-11024) with no minimum: so 1 row.
//
// What is asserted, for PW1's own world (two questions, a phase waiting for its check, four rulings) and the hostile
// one with 0, 3 and 6 open questions and six rulings (mod/tests/pw1-a3/kit.ts), at 49, 60, 75 and 90 columns and at
// EVERY height from that minimum to 24 rows:
//   - the Work view draws inside the pane: no more lines than its height, none wider than it;
//   - the key hint is drawn with every key whole, at every height (it wins when the pane is too short for both it and
//     an agent row: register.js placeList says why);
//   - from the height that holds the keys row, the hint's one line, one agent row and the line that says there are
//     more, at least one agent row is drawn whole (with its model);
//   - the questions and the other lines give way first: wherever a question is drawn, the hint and an agent row are too.
import { expect, test } from 'claude-code/testing'
import { agentRows, cellW, dump, elements, hostileWorld, pw1World, screen } from './pw1-a3/kit'

const SLOW = { timeoutMs: 600000 }
const MIN_ROWS = 1 // the smallest body the engine gives a pane (above)
const MAX_ROWS = 24
// Work's key hint, each key with its first word on one line (register.js messageField: its long, short and one-line
// forms; a hint flowed onto two lines keeps a key with its first word, lib/detail.mjs fitLine)
const HINT = [/↑\/↓ (then|Enter)/, /Enter (on|opens)/, /✉ messages/, /p (shows|nodes)/, /b (goes|back)/]

for (const width of [49, 60, 75, 90]) {
  for (const name of ['pw1', 'q0', 'q3', 'q6'] as const) {
    test('PW1 attempt 3: the Work view at ' + width + ' columns (' + name + ') keeps its key hint, and an agent row where one fits, at every height from ' + MIN_ROWS + ' to ' + MAX_ROWS, SLOW, async ($, on) => {
      const w = name === 'pw1' ? pw1World(on) : hostileWorld(on, Number(name.slice(1)))
      await w.begin($)
      const ui = await w.pane($, width, 600)
      // the lines one agent row takes at this width, from the whole list
      const tall = elements(await ui.drawn(), width)
      const rowLines = Math.max(...agentRows(tall).map((e) => e.lines.length))
      const floor = 1 + 1 + rowLines + 1 // the keys row, the hint's one line, the row, the more line
      const bad: string[] = []
      const dumps: string[] = []
      for (let h = MAX_ROWS; h >= MIN_ROWS; h--) {
        await ui.redraw(w.props(width, h) as any)
        await w.settle(100)
        const els = elements(await ui.drawn(), width)
        const all = screen(els)
        const before = bad.length
        if (all.length > h) bad.push(h + ': drew ' + all.length + ' lines')
        all.forEach((l, i) => { if (cellW(l) > width) bad.push(h + ': line ' + i + ' is ' + cellW(l) + ' cells') })
        const miss = HINT.filter((re) => !all.some((l) => re.test(l)))
        if (miss.length) bad.push(h + ': hint keys missing ' + miss.join(' '))
        const rows = agentRows(els).length
        if (h >= floor && rows < 1) bad.push(h + ': no agent row (one takes ' + rowLines + ' lines)')
        if (all.some((l) => /\? (Q-\d+|\d+ open questions)/.test(l)) && (rows < 1 || miss.length)) bad.push(h + ': a question is drawn while the hint or the list is not')
        if (bad.length > before) dumps.push('@@RENDER work-' + width + 'x' + h + '-' + name + dump(els))
      }
      await ui.unmount()
      if (bad.length) (globalThis as any).console.log(dumps.slice(0, 4).join('\n'))
      expect(rowLines).toBeGreaterThan(0)
      expect(bad.slice(0, 30), bad.length + ' faults').toEqual([])
    })
  }
}
