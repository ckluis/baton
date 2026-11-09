// claude plugin test — CS2 criterion 3 (run build-20261019T125436Z, phase P7): the strip and each dive-in view (Work,
// Memory, an agent, a phase, a question's brief, a blocked brief) drawn at 60, 80, 120 and 200 columns in the strip
// layout: the pane inline above the prompt, full width, at the rows its dive-in asked for. Each render is asserted to
// fit its width and to say its way back on its first lines; with SHOW set the renders are printed, `@@RENDER <name>`
// then the lines, as saved under _orch/nodes/CS2/work/renders/.
import { expect, test } from 'claude-code/testing'
import { cellW, elements, screen, type El } from './pw1-a3/kit'
import { diveWorld } from './cs2/kit'

const SHOW = false // true prints the renders: the harness passes no environment to a test file, so it is a constant
const SLOW = { timeoutMs: 60000 }
const keyOf = (n: any) => String(n?.key ?? n?.props?.key ?? '')

type W = ReturnType<typeof diveWorld>
const show = (what: string) => async ($: any, w: W) => {
  await $.command.run({ command: 'baton', args: 'show ' + what } as any)
  await w.settle(100)
}
const VIEWS: { name: string; key: 'band-work' | 'band-memory'; go: ($: any, w: W, ui: any) => Promise<void> }[] = [
  { name: 'work', key: 'band-work', go: async () => {} },
  { name: 'memory', key: 'band-memory', go: async () => {} },
  { name: 'agent', key: 'band-work', go: show('T201 streaming') },
  { name: 'phase', key: 'band-work', go: show('P2') },
  { name: 'question', key: 'band-work', go: async (_$, w, ui) => { await ui.press({ key: 'open-q-Q-7' }); await w.settle(100) } },
  { name: 'blocked', key: 'band-work', go: show('T203 streaming') },
]

for (const width of [60, 80, 120, 200]) {
  test('CS2 renders: the strip and every dive-in view at ' + width + ' columns, inline, full width', SLOW, async ($, on) => {
    const w = diveWorld(on)
    await w.begin($)
    const out: string[] = []
    const band = await w.band($, width)
    const strip = screen(elements(await band.drawn(), width).filter((e: El) => keyOf(e.node) !== 'engine'))
    await band.unmount()
    out.push('@@RENDER strip-' + width + '\n' + strip.join('\n'))
    expect(strip.length).toBe(2)
    for (const v of VIEWS) {
      const o = await w.dive($, width, v.key)
      const ui = await w.pane($, width, o.rows)
      await v.go($, w, ui)
      await ui.redraw(w.inline(width, o.rows) as any)
      await w.settle(100)
      const lines = screen(elements(await ui.drawn(), width))
      await ui.unmount()
      out.push('@@RENDER ' + v.name + '-' + width + ' (rows ' + o.rows + ')\n' + lines.join('\n'))
      expect(lines.filter((l) => cellW(l) > width), v.name + ' at ' + width).toEqual([])
      expect(lines.slice(0, 5).some((l) => l.includes('Esc: back to the strip')), v.name + ' at ' + width + '\n' + lines.join('\n')).toBe(true)
    }
    if (SHOW) (globalThis as any).console.log(out.join('\n'))
  })
}
