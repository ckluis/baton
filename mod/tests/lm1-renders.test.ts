// claude plugin test — LM1 criterion 3 (run build-20261019T125436Z, phase P7): the strip, Work, Memory and an agent's
// detail drawn in each layout at 60, 80, 120 and 200 columns. The strip layout: the strip under the main-screen
// renderer (`/tui default`), each view inline above the prompt at the full width and the rows its dive-in asked for.
// The panel layout: the strip under the fullscreen renderer, each view at the width Claude Code gives the pane for that
// terminal (lm1/kit.ts panelWidth: inline at 60 and 80, docked at 54 for 120 and at 90 for 200). Each render is
// asserted to fit its width and to say the layout; with SHOW set the renders are printed, `@@RENDER <mode>-<view>-<width>`
// then the lines, as saved under _orch/nodes/LM1/work/renders/. The strip under the other renderer (the line saying
// what to type) is printed as `<mode>-strip-mismatch-<width>`.
import { expect, test } from 'claude-code/testing'
import { cellW, elements, screen } from './pw1-a3/kit'
import { lmWorld, panelWidth } from './lm1/kit'

const SHOW = false // true prints the renders: the harness passes no environment to a test file, so it is a constant
const SLOW = { timeoutMs: 120000 }

type W = ReturnType<typeof lmWorld>
const VIEWS: { name: string; key: 'band-work' | 'band-memory'; tab: string; go: ($: any, w: W) => Promise<void> }[] = [
  { name: 'work', key: 'band-work', tab: '1', go: async () => {} },
  { name: 'memory', key: 'band-memory', tab: '2', go: async () => {} },
  { name: 'agent', key: 'band-work', tab: '1', go: async ($, w) => { await w.baton($, 'show T201 streaming') } },
]

for (const mode of ['strip', 'panel'] as const) {
  for (const cols of [60, 80, 120, 200]) {
    test('LM1 renders: the ' + mode + ' layout at ' + cols + ' columns: the strip, Work, Memory and an agent', SLOW, async ($, on) => {
      const w = lmWorld(on)
      await w.begin($)
      if (mode === 'panel') await w.baton($, 'layout panel')
      const full = mode === 'panel'
      const out: string[] = []
      const strip = await w.bandLines($, cols, full)
      out.push('@@RENDER ' + mode + '-strip-' + cols + '\n' + strip.join('\n'))
      expect(strip.length, strip.join('\n')).toBe(2)
      expect(strip.filter((l) => cellW(l) > cols)).toEqual([])
      const other = await w.bandLines($, cols, !full)
      out.push('@@RENDER ' + mode + '-strip-mismatch-' + cols + '\n' + other.join('\n'))
      expect(other.length, other.join('\n')).toBe(3)
      const { width, placement } = mode === 'panel' ? panelWidth(cols) : { width: cols, placement: 'inline' as const }
      for (const v of VIEWS) {
        let rows = 60
        if (mode === 'strip') rows = (await w.dive($, cols, v.key)).rows
        else {
          await w.baton($, '')
          if (v.key === 'band-memory') await w.dive($, cols, v.key)
        }
        await v.go($, w)
        const ui = await w.pane($, width, rows, placement, full)
        const lines = screen(elements(await ui.drawn(), width))
        await ui.unmount()
        out.push('@@RENDER ' + mode + '-' + v.name + '-' + cols + ' (' + placement + ' ' + width + 'x' + rows + ')\n' + lines.join('\n'))
        expect(lines.filter((l) => cellW(l) > width), v.name).toEqual([])
        expect(lines.slice(0, 5).some((l) => l.includes(v.tab + ': ')), v.name + '\n' + lines.join('\n')).toBe(true)
        if (mode === 'panel') expect(lines.slice(0, 6).some((l) => /\bpanel\b.*\/baton layout strip/.test(l)), v.name + '\n' + lines.join('\n')).toBe(true)
      }
      if (SHOW) (globalThis as any).console.log(out.join('\n'))
    })
  }
}
