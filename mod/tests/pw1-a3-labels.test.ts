// claude plugin test — PW1 attempt 3 (run build-20261019T125436Z, phase P7): what the verifier refuted in attempt 2
// (_orch/verify/PW1-verdict.json, criterion 3): at 49 columns, the narrowest dock (a 110-column terminal), an agent's
// label was cut to `worker T2…` / `verifier …`, shorter than at 40 (`worker T201 strea…`), so a wider pane showed less.
//
// What is asserted, for PW1's own world and the verifier's hostile one (mod/tests/pw1-a3/kit.ts), at EVERY width from
// 40 to 200 columns in steps of one (not a sample):
//   - a wider pane never draws less of an agent's label, nor less of its state, than a pane one column narrower;
//   - from 49 up, every agent's label reads its role and its node (`worker T201`, `verifier Z05 T204`, `sub-orch P2`),
//     and its state is drawn as it is at 200 columns;
//   - no drawn line is wider than the pane.
import { expect, test } from 'claude-code/testing'
import { cellW, dump, elements, hostileWorld, labelOf, pw1World, roleOf, rowOf, screen, stateOf, type El } from './pw1-a3/kit'

const SLOW = { timeoutMs: 600000 }
const FROM = 40
const TO = 200
const DOCKED_MIN = 49 // a 110-column terminal docks at 49 (_orch/inbox/pane-width.md)

for (const name of ['pw1', 'hostile'] as const) {
  test('PW1 attempt 3: in the ' + name + ' world, from ' + FROM + ' to ' + TO + ' columns a wider pane never draws less of a label or a state, and from 49 every label reads its role and node', SLOW, async ($, on) => {
    const w = name === 'pw1' ? pw1World(on) : hostileWorld(on, 6)
    await w.begin($)
    const ui = await w.pane($, TO, 600)
    const labels = new Map<string, string[]>()
    const states = new Map<string, string[]>()
    const bad: string[] = []
    const kept: Record<number, El[]> = {}
    for (let width = FROM; width <= TO; width++) {
      await ui.redraw(w.props(width, 600) as any)
      await w.settle(100)
      const els = elements(await ui.drawn(), width)
      if (width === 49 || width === 40 || width === 120) kept[width] = els
      screen(els).forEach((l, i) => { if (cellW(l) > width) bad.push(width + ': line ' + i + ' is ' + cellW(l) + ' cells') })
      for (const a of w.agents) {
        const e = rowOf(els, a)
        if (!e) { bad.push(width + ': no row for ' + a.id); continue }
        ;(labels.get(a.id) ?? labels.set(a.id, []).get(a.id)!)[width] = labelOf(e, a)
        ;(states.get(a.id) ?? states.set(a.id, []).get(a.id)!)[width] = stateOf(e)
      }
    }
    await ui.unmount()
    for (const a of w.agents) {
      const L = labels.get(a.id) ?? []
      const S = states.get(a.id) ?? []
      const want = roleOf(a) + ' ' + a.node
      for (let width = FROM + 1; width <= TO; width++) {
        if (L[width] == null || L[width - 1] == null) continue
        if (cellW(L[width]!) < cellW(L[width - 1]!)) bad.push(a.id + ' label shorter at ' + width + ' than at ' + (width - 1) + ': |' + L[width] + '| < |' + L[width - 1] + '|')
        if (cellW(S[width]!) < cellW(S[width - 1]!)) bad.push(a.id + ' state shorter at ' + width + ' than at ' + (width - 1) + ': |' + S[width] + '| < |' + S[width - 1] + '|')
      }
      for (let width = DOCKED_MIN; width <= TO; width++) {
        if (L[width] == null) continue
        if (!L[width]!.includes(want)) bad.push(a.id + ' label at ' + width + ' does not read ' + want + ': |' + L[width] + '|')
        if (S[width] !== S[TO]) bad.push(a.id + ' state at ' + width + ' is |' + S[width] + '|, at ' + TO + ' |' + S[TO] + '|')
      }
    }
    if (bad.length) (globalThis as any).console.log('@@RENDER ' + name + '-40' + dump(kept[40]!) + '\n@@RENDER ' + name + '-49' + dump(kept[49]!))
    expect(bad.slice(0, 40), bad.length + ' faults').toEqual([])
  })
}
