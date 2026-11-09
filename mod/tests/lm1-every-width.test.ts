// claude plugin test — LM1 criterion 1, red 2 (run build-20261019T125436Z, phase P7). The attempt-1 verdict
// (_orch/verify/LM1-verdict.json, row 1; _orch/nodes/LM1/verify-work/strip-busy-40-60-80.txt) found that in a busy run
// at 60 and 80 columns (and 40) the strip, in both layouts, said neither the layout nor how to switch it, and that the
// strip layout's dive-in views said it nowhere either. The operator's hard requirement is discoverability: the UI
// always shows, in plain words, how to open each view and how to switch layouts.
//
// So, in both layouts and in every state (quiet with a full reading and with none; an approval waiting; a question and
// a blocked agent; all three; LM1's busy world of fourteen agents; a notice: baton paused; the renderer not matching
// the layout, its /tui line a notice too), at every width from 45 to 200 columns, step 1:
//   - the strip keeps CS1's line rule: two lines, three only while a notice shows; no line over the width;
//   - line 2 starts with the plain way to open each view (CS1), and an approval's keys stay within the two lines;
//   - one of the two strip lines holds the layout and its switch command whole, in one of its documented forms, richest
//     first (lm1/every.ts formsOf: `strip layout · /baton layout panel switches`, `strip · /baton layout panel`,
//     `layout: /baton layout`, `/baton layout`), never naming the other layout as the current one; from 120 columns a
//     form that names the layout.
// And at every terminal width from 40 to 200, in both layouts, in a quiet and in the busy world: every dive-in view
// (Work, Memory, an agent's detail) says the layout and its switch command near its top, naming the layout.
//
// Below 45 columns the strip cannot hold even `/baton layout` beside what the CS1 tests pin at 40 columns (all three
// gauges on line 1 with a full reading, the short hint first on line 2, both approval keys, two lines): that conflict is
// stated in _orch/nodes/LM1/work/conflicts.md and put to the operator; it is not tested here.
import { expect, test } from 'claude-code/testing'
import { cellW } from './pw1-a3/kit'
import { stripWorld, type Opts } from './cs1/kit'
import { lmWorld, panelWidth } from './lm1/kit'
import { bandAt, diveAt, formIn, namedOf, paneAt, run, wrongName, type Mode } from './lm1/every'

const SLOW = { timeoutMs: 900000 }
const FROM = 45
const FIVE = { kind: 'five_hour', percentUsed: 41, resetsAt: '2026-11-06T14:20:00Z' }
const WEEK = { kind: 'seven_day', percentUsed: 62, resetsAt: '2026-11-12T09:00:00Z' }
const OPUS = { kind: 'seven_day_opus', percentUsed: 22, resetsAt: '2026-11-12T09:00:00Z' }
const HINT_LONG = 'open: ctrl+x tab, then w work · m memory'
const HINT_SHORT = 'ctrl+x tab: w work · m memory'

type Feed = { limits?: any[]; ctx?: number; usd?: number }
const READ: Feed = { limits: [FIVE, WEEK, OPUS], ctx: 23, usd: 9.94 }
type W = { settle: (ms?: number) => Promise<void>; opens: any[] }
type State = { name: string; approval?: boolean; notice?: 'pause' | 'tui'; make: ($: any, on: any) => Promise<W> }

/** CS1's world, begun, the usage fed through the real paths (as mod/tests/cs1-two-lines.test.ts feeds it). */
const fed = (f: Feed, o: Opts) => async ($: any, on: any): Promise<W> => {
  const w = stripWorld(on, { ...o, usage: { rateLimits: f.limits ?? [], ...(f.usd != null ? { cost: { usd: f.usd } } : {}) } })
  await w.begin($)
  if (f.ctx != null || (f.limits ?? []).length) {
    await $.session.measure({ ...(f.ctx != null ? { context: { tokens: f.ctx * 10000, window: 1000000, percent: f.ctx } } : {}), rateLimits: f.limits ?? [], changed: ['context', 'rateLimits'] } as any)
  }
  await w.settle(31000)
  return w
}
const busy = async ($: any, on: any): Promise<W> => {
  const w = lmWorld(on)
  await w.begin($)
  return w
}

const STATES: State[] = [
  { name: 'quiet, a full reading', make: fed(READ, {}) },
  { name: 'quiet, no reading', make: fed({}, {}) },
  { name: 'an approval waiting', approval: true, make: fed(READ, { approval: true }) },
  { name: 'an approval waiting, no reading', approval: true, make: fed({}, { approval: true }) },
  { name: 'a question and a blocked agent waiting', make: fed(READ, { question: true, blocked: true }) },
  { name: 'an approval, a question and a blocked agent waiting', approval: true, make: fed(READ, { approval: true, question: true, blocked: true }) },
  { name: 'the busy run (fourteen agents, an approval, two questions, a blocked agent, no reading)', approval: true, make: busy },
  { name: 'a notice (baton paused)', notice: 'pause', make: fed(READ, { question: true }) },
  { name: 'a notice (the renderer does not match the layout: the /tui line)', notice: 'tui', make: fed(READ, { approval: true }) },
]

for (const mode of ['strip', 'panel'] as Mode[]) {
  for (const st of STATES) {
    test('LM1 red 2: in the ' + mode + ' layout with ' + st.name + ', the strip says the layout and its switch command at every width from ' + FROM + ' to 200', SLOW, async ($, on) => {
      const w = await st.make($, on)
      if (mode === 'panel') await run($, 'layout panel', w.settle)
      if (st.notice === 'pause') await run($, 'pause', w.settle)
      // the renderer that suits the layout (no /tui line), or, for that notice, the other one
      const full = st.notice === 'tui' ? mode !== 'panel' : mode === 'panel'
      const want = st.notice ? 3 : 2
      const bad: string[] = []
      for (let width = FROM; width <= 200; width++) {
        const lines = await bandAt($, width, full)
        const say = width + ':\n' + lines.map((l) => '  |' + l + '|').join('\n')
        if (lines.length !== want) bad.push(lines.length + ' lines, not ' + want + ', at ' + say)
        lines.forEach((l, i) => { if (cellW(l) > width) bad.push('line ' + i + ' is ' + cellW(l) + ' cells at ' + say) })
        if (!(lines[1] ?? '').startsWith(width >= 80 ? HINT_LONG : HINT_SHORT)) bad.push('no way to open the views first on line 2 at ' + say)
        if (st.approval && !lines.slice(0, 2).some((l) => l.includes('1: approve') && l.includes('2: send back…'))) bad.push('no approval keys in the strip at ' + say)
        const strip = lines.slice(0, 2)
        const form = strip.map((l) => formIn(l, mode)).find(Boolean)
        if (!form) bad.push('no layout and switch command on the strip at ' + say)
        if (strip.some((l) => wrongName(l, mode))) bad.push('the other layout named as the current one at ' + say)
        if (width >= 120 && !strip.some((l) => namedOf(mode).some((f) => l.includes(f)))) bad.push('the layout not named at ' + say)
        if (st.notice === 'tui' && !/\/tui (default|fullscreen)/.test(lines[2] ?? '')) bad.push('no /tui line third at ' + say)
      }
      expect(bad.slice(0, 4), bad.length + ' faults').toEqual([])
    })
  }
}

// The dive-in views, at every terminal width from 40 to 200. The strip layout: each view inline above the prompt at
// the terminal's width and the rows its dive-in asked for. The panel layout: each view at the width Claude Code gives
// the pane for that terminal (lm1/kit.ts panelWidth), 60 rows.
const WORLDS: { name: string; make: ($: any, on: any) => Promise<W> }[] = [
  { name: 'a quiet run with a full reading', make: fed(READ, {}) },
  { name: 'the busy run', make: busy },
]
const VIEWS: { name: string; key: 'band-work' | 'band-memory'; show?: string }[] = [
  { name: 'Work', key: 'band-work' },
  { name: 'Memory', key: 'band-memory' },
  { name: 'an agent', key: 'band-work', show: 'show T201 streaming' },
]

for (const mode of ['strip', 'panel'] as Mode[]) {
  for (const wd of WORLDS) {
    test('LM1 red 2: in the ' + mode + ' layout, in ' + wd.name + ', every dive-in view says the layout and its switch command near its top, at every terminal width from 40 to 200', SLOW, async ($, on) => {
      const w = await wd.make($, on)
      if (mode === 'panel') await run($, 'layout panel', w.settle)
      const bad: string[] = []
      for (let cols = 40; cols <= 200; cols++) {
        for (const v of VIEWS) {
          const open = await diveAt($, w, cols, v.key)
          if (v.show) await run($, v.show, w.settle)
          const { width, placement } = mode === 'panel' ? panelWidth(cols) : { width: cols, placement: 'inline' as const }
          const rows = mode === 'panel' ? 60 : Number(open?.rows) || 30
          const lines = await paneAt($, w, width, rows, placement, mode === 'panel')
          const top = lines.slice(0, 6)
          if (!top.some((l) => namedOf(mode).some((f) => l.includes(f)))) bad.push(v.name + ' at ' + cols + ' (' + placement + ' ' + width + 'x' + rows + '):\n' + top.map((l) => '  |' + l + '|').join('\n'))
          if (top.some((l) => wrongName(l, mode))) bad.push(v.name + ' names the other layout at ' + cols)
          if (lines.some((l) => cellW(l) > width)) bad.push(v.name + ' has a line over ' + width + ' at ' + cols)
        }
      }
      expect(bad.slice(0, 4), bad.length + ' faults').toEqual([])
    })
  }
}
