// claude plugin test — CS1 criterion 0 (run build-20261019T125436Z, phase P7): the three pane faults the PW1 attempt-3
// verifier named (_orch/verify/PW1-verdict.json, its renders _orch/nodes/PW1/verify-work-3/renders.txt), each asserted in
// PW1's own world and the hostile one with three open questions (mod/tests/pw1-a3/kit.ts, its drawing model unchanged):
//
// (a) "a 24-row pane shows only the prime's row although agents fit". While the list scrolls (a `↓ N more` or `↑ N more`
//     line is drawn), no line that only adds detail is drawn where giving it up would let one more agent row in: the
//     goal's links (`#57 … ↗`, `PR #58 ↗ …`), the reviewer's findings, the merge-ready detail rows and diagnosis, the
//     queue line and the tree's legend. The lines PW1 keeps stay: the keys row, the read line, the goal, PR and merge
//     rows, the approvals, the waiting rows, the table's header, the key hint, the questions, the rulings and the message
//     field (Q-68 "the lines above and below it stay drawn", guarded by t15-scroll G5-G7, fx4 R-C16-24 and
//     fx3-short-narrow). At heights 8 to 40, at 49, 60, 75, 90, 120 and 200 columns.
// (b) "the more line runs its letters into its text (`↓ 17 morec: d:`)": every more line reads `↓ N more`, `↑ N more` or
//     `↑/↓ N more`, with ` · +K running` after it when it says so, and nothing else; its rows' letters stay bound on it
//     (a Button for each), drawn in no cells. At heights 3 to 40.
// (c) "the prime's state is cut at 18 cells (`reviewing (blocke…`) where the width has room": a state is drawn whole
//     wherever its line has the cells for it; at 300 columns every state is whole.
import { expect, test } from 'claude-code/testing'
import { agentRows, cellW, dump, elements, hostileWorld, pw1World, screen, stateOf, type El } from './pw1-a3/kit'

const SLOW = { timeoutMs: 900000 }
const WIDTHS = [49, 60, 75, 90, 120, 200]
const SPARE = 1 // the empty bottom row a scrolling list keeps (Q-F115-1 A, register.js SPARE_ROWS)
const MORE = /^\s*(↑\/↓ |↑ |↓ )\d+ more/
const CLEAN_MORE = /^\s*(↑\/↓ |↑ |↓ )\d+ more( · \+\d+ running)?$/
const keyOf = (n: any) => String(n?.key ?? n?.props?.key ?? '')
// the lines that only add detail (register.js DROP_RANK findings, detail, queue, links, legend)
const DETAIL_KEY = /^(w-links|w-f\d|w-ft\d|t-mr\d|w-diag|t-q$)/
const isDetail = (e: El) => DETAIL_KEY.test(keyOf(e.node)) || /^the tree: prime ›/.test(e.text)

const worldOf = (on: any, name: string): any => (name === 'pw1' ? pw1World(on) : hostileWorld(on, 3))

for (const name of ['pw1', 'q3']) {
  test('CS1 0a: while the agent list scrolls, no detail line is drawn where one more agent row would fit in its place (' + name + ', heights 8 to 40)', SLOW, async ($, on) => {
    const w = worldOf(on, name)
    await w.begin($)
    const bad: string[] = []
    for (const width of WIDTHS) {
      const ui = await w.pane($, width, 600)
      const tall = elements(await ui.drawn(), width)
      const rowLines = Math.max(...agentRows(tall).map((e) => e.lines.length))
      for (let h = 40; h >= 8; h--) {
        await ui.redraw(w.props(width, h) as any)
        await w.settle(100)
        const els = elements(await ui.drawn(), width)
        const all = screen(els)
        if (all.length > h) bad.push(width + 'x' + h + ': drew ' + all.length + ' lines')
        if (!all.some((l) => MORE.test(l))) continue
        const detail = els.filter(isDetail).reduce((n, e) => n + e.lines.length, 0)
        const free = h - all.length
        if (detail > 0 && free + detail >= rowLines + SPARE) bad.push(width + 'x' + h + ': ' + agentRows(els).length + ' agent rows while ' + detail + ' detail lines and ' + free + ' free lines would hold another (' + rowLines + ' lines a row)' + dump(els))
      }
      await ui.unmount()
    }
    expect(bad.slice(0, 4), bad.length + ' faults').toEqual([])
  })

  test('CS1 0b: every more line reads cleanly, its rows\' letters bound on it but drawn in no cells (' + name + ', heights 3 to 40)', SLOW, async ($, on) => {
    const w = worldOf(on, name)
    await w.begin($)
    const bad: string[] = []
    let bound = 0
    for (const width of WIDTHS) {
      const ui = await w.pane($, width, 600)
      for (let h = 40; h >= 3; h--) {
        await ui.redraw(w.props(width, h) as any)
        await w.settle(100)
        const els = elements(await ui.drawn(), width)
        for (const e of els) {
          if (!e.lines.some((l) => MORE.test(l))) continue
          const l = e.lines.find((x) => MORE.test(x))!
          if (!CLEAN_MORE.test(l.trimEnd())) bad.push(width + 'x' + h + ': |' + l + '|')
          if (e.leaves.some((x) => x.kind === 'button')) bound++
        }
      }
      await ui.unmount()
    }
    expect(bad.slice(0, 6), bad.length + ' faults').toEqual([])
    expect(bound, 'more lines that carry their rows\' letters').toBeGreaterThan(0)
  })

  test('CS1 0c: an agent\'s state is drawn whole wherever its line has the cells for it (' + name + ')', SLOW, async ($, on) => {
    const w = worldOf(on, name)
    await w.begin($)
    const draw = async (width: number) => {
      const ui = await w.pane($, width, 600)
      const els = elements(await ui.drawn(), width)
      await ui.unmount()
      return els
    }
    const wide = agentRows(await draw(300))
    const whole = wide.map((e) => stateOf(e))
    const bad: string[] = whole.filter((s) => s.endsWith('…')).map((s) => '300: |' + s + '| cut')
    for (const width of WIDTHS) {
      const els = await draw(width)
      const rows = agentRows(els)
      if (rows.length !== wide.length) bad.push(width + ': ' + rows.length + ' rows, not ' + wide.length)
      rows.forEach((e, i) => {
        const s = stateOf(e)
        if (!s.endsWith('…')) return
        const line = [...e.lines].reverse().find((x) => x.includes(s))!.replace(/✉/g, '').trimEnd()
        const want = whole[i] ?? ''
        if (width - cellW(line) >= cellW(want) - cellW(s)) bad.push(width + ': |' + s + '| cut, its line ' + cellW(line) + ' cells, whole |' + want + '|' + dump([e]))
      })
    }
    expect(bad.slice(0, 6), bad.length + ' faults').toEqual([])
  })
}
