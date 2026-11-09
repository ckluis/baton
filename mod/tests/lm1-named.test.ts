// claude plugin test — LM1 criterion 1, red 3 (run build-20261019T125436Z, phase P7; Q-LM1-2 A). The attempt-2 verdict
// (_orch/verify/LM1-verdict.json, row 1; _orch/nodes/LM1/verify-work-2/strip-every-width-40-200.txt) found the strip
// using `layout: /baton layout` and `/baton layout` over wide bands from 45 columns (80 with a full reading among
// them): forms that name neither the current layout nor the command that switches it.
//
// So, in both layouts and in every state (quiet with a full reading and with none; an approval waiting, with a reading
// and without; a question; a blocked agent; a question and a blocked agent; all three; LM1's busy world; a notice:
// baton paused, a doctor warning, the /tui line where the renderer does not match the layout), at every width from 45
// to 200 columns, step 1:
//   - the strip keeps CS1's line rule: two lines, three only while a notice shows; no line over the width; line 2
//     starts with the plain way to open each view; an approval's keys stay within the two lines;
//   - one of the two strip lines holds the current layout and its exact switch command (`strip · /baton layout panel`
//     or the richer `strip layout · /baton layout panel switches`; for the panel `panel · /baton layout strip`), and
//     neither the form `layout: /baton layout` nor a bare `/baton layout` is drawn; the other layout is never named
//     as the current one.
//
// One band is held out, an approval waiting at 45 to 54 columns: there the CS1 tests (unedited) leave no 30 cells on
// either line (mod/tests/cs1-two-lines.test.ts: the 29-cell hint first on line 2 and both keys within the strip at
// every width; mod/tests/cs1-strip.test.ts at 49: the 25-cell keys and the context gauge on line 1). There the strip
// says `/baton layout` (it prints the layout and how to switch); _orch/nodes/LM1/work/conflicts.md C3.
import { expect, test } from 'claude-code/testing'
import { cellW } from './pw1-a3/kit'
import { stripWorld, type Opts } from './cs1/kit'
import { lmWorld } from './lm1/kit'
import { bandAt, namedOf, run, wrongName, type Mode } from './lm1/every'

const SLOW = { timeoutMs: 900000 }
const FROM = 45
const HELD = 55 // an approval waiting: the named form from here (C3)
const FIVE = { kind: 'five_hour', percentUsed: 41, resetsAt: '2026-11-06T14:20:00Z' }
const WEEK = { kind: 'seven_day', percentUsed: 62, resetsAt: '2026-11-12T09:00:00Z' }
const OPUS = { kind: 'seven_day_opus', percentUsed: 22, resetsAt: '2026-11-12T09:00:00Z' }
const HINT_LONG = 'open: ctrl+x tab, then w work · m memory'
const HINT_SHORT = 'ctrl+x tab: w work · m memory'

type Feed = { limits?: any[]; ctx?: number; usd?: number }
const READ: Feed = { limits: [FIVE, WEEK, OPUS], ctx: 23, usd: 9.94 }
type W = { settle: (ms?: number) => Promise<void> }
type State = { name: string; approval?: boolean; notice?: 'pause' | 'tui' | 'doctor'; make: ($: any, on: any) => Promise<W> }

/** `on`, with `node --version` failing (the doctor's first check), as mod/tests/cs1-notice-line.test.ts raises it. */
const nodeDown = (on: any) => (name: string, ...rest: any[]) => {
  if (name !== 'process.run') return on(name, ...rest)
  const h = rest[rest.length - 1]
  return on(name, ...rest.slice(0, -1), (_$: any, e: any) => {
    const argv = [...e.argv]
    if (argv[0] === 'node' && argv[1] === '--version') return { value: { exitCode: 127, stdout: '', stderr: 'node: command not found' } }
    return h(_$, e)
  })
}

/** CS1's world, begun, the usage fed through the real paths (as mod/tests/cs1-two-lines.test.ts feeds it). */
const fed = (f: Feed, o: Opts, doctor = false) => async ($: any, on: any): Promise<W> => {
  const w = stripWorld(doctor ? nodeDown(on) : on, { ...o, usage: { rateLimits: f.limits ?? [], ...(f.usd != null ? { cost: { usd: f.usd } } : {}) } })
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
  { name: 'quiet, no usage reading', make: fed({}, {}) },
  { name: 'an approval waiting', approval: true, make: fed(READ, { approval: true }) },
  { name: 'an approval waiting, no usage reading', approval: true, make: fed({}, { approval: true }) },
  { name: 'a question waiting', make: fed(READ, { question: true }) },
  { name: 'a blocked agent waiting', make: fed(READ, { blocked: true }) },
  { name: 'a question and a blocked agent waiting', make: fed(READ, { question: true, blocked: true }) },
  { name: 'an approval, a question and a blocked agent waiting', approval: true, make: fed(READ, { approval: true, question: true, blocked: true }) },
  { name: 'the busy run (fourteen agents, an approval, two questions, a blocked agent, no usage reading)', approval: true, make: busy },
  { name: 'a notice (baton paused)', notice: 'pause', make: fed(READ, { question: true }) },
  { name: 'a notice (a doctor warning)', notice: 'doctor', make: fed(READ, {}, true) },
  { name: 'a notice (the /tui line: the renderer does not match the layout)', notice: 'tui', make: fed(READ, { question: true }) },
]

const count = (s: string, x: string) => s.split(x).length - 1

for (const mode of ['strip', 'panel'] as Mode[]) {
  for (const st of STATES) {
    test('LM1 red 3: in the ' + mode + ' layout with ' + st.name + ', the strip names the layout and its exact switch command at every width from ' + FROM + ' to 200, never a short form', SLOW, async ($, on) => {
      const w = await st.make($, on)
      if (mode === 'panel') await run($, 'layout panel', w.settle)
      if (st.notice === 'pause') await run($, 'pause', w.settle)
      if (st.notice === 'doctor') await run($, 'doctor', w.settle)
      // the renderer that suits the layout (no /tui line), or, for that notice, the other one
      const full = st.notice === 'tui' ? mode !== 'panel' : mode === 'panel'
      const want = st.notice ? 3 : 2
      const named = namedOf(mode)
      const bad: string[] = []
      for (let width = FROM; width <= 200; width++) {
        const lines = await bandAt($, width, full)
        const say = width + ':\n' + lines.map((l) => '  |' + l + '|').join('\n')
        if (lines.length !== want) bad.push(lines.length + ' lines, not ' + want + ', at ' + say)
        lines.forEach((l, i) => { if (cellW(l) > width) bad.push('line ' + i + ' is ' + cellW(l) + ' cells at ' + say) })
        if (!(lines[1] ?? '').startsWith(width >= 80 ? HINT_LONG : HINT_SHORT)) bad.push('no way to open the views first on line 2 at ' + say)
        if (st.approval && !lines.slice(0, 2).some((l) => l.includes('1: approve') && l.includes('2: send back…'))) bad.push('no approval keys in the strip at ' + say)
        if (st.notice === 'tui' && !/\/tui (default|fullscreen)/.test(lines[2] ?? '')) bad.push('no /tui line third at ' + say)
        if (st.notice === 'doctor' && !(lines[2] ?? '').startsWith('baton doctor: node'.slice(0, width))) bad.push('no doctor warning third at ' + say)
        const strip = lines.slice(0, 2).join('\n')
        if (strip.split('\n').some((l) => wrongName(l, mode))) bad.push('the other layout named as the current one at ' + say)
        if (st.approval && width < HELD) {
          if (!strip.includes('/baton layout')) bad.push('not even `/baton layout` beside the approval keys at ' + say)
          continue
        }
        const whole = named.reduce((n, f) => n + count(strip, f), 0)
        if (whole !== 1) bad.push(whole + ' named forms (`' + named[1] + '` or richer), not 1, at ' + say)
        if (strip.includes('layout: /baton layout')) bad.push('the short form `layout: /baton layout` at ' + say)
        if (count(strip, '/baton layout') !== whole) bad.push('a bare `/baton layout` at ' + say)
      }
      expect(bad.slice(0, 4), bad.length + ' faults').toEqual([])
    })
  }
}
