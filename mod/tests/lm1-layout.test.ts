// claude plugin test — LM1 criterion 1 (run build-20261019T125436Z, phase P7; operator decision 2026-11-09): a layout
// mode the operator switches between, the strip or the side panel (_orch/plan/decisions/P7-CS-d1.md item 6).
//
//   - `/baton layout strip` and `/baton layout panel` switch the mode and say so in one plain line; `/baton layout`
//     alone prints the current mode and how to switch.
//   - The mode is kept in baton's own per-user store (`$.store`, key `layout`) and read back after a new session and a
//     restarted mod; no Claude Code setting is written (no config.set, no settings file, no /tui run by baton).
//   - The strip, in both modes, says the current mode and the switch command in plain words where it has the cells;
//     the panel's key hint says them too.
//   - When the mode does not match Claude Code's renderer (the strip under `/tui fullscreen`, the panel under
//     `/tui default`), one plain line under the strip says exactly what to type (`/tui default` or `/tui fullscreen`)
//     and that Claude Code restarts and resumes the session. On the first run (nothing saved: the strip, the default)
//     under the fullscreen renderer that line says `/tui default`; it goes once the renderer matches or the person
//     picks the panel.
//   - The default is the strip (DEFAULT_LAYOUT; the source pin is mod/test/lm1-default.test.mjs): nothing saved, or a
//     value that is no layout, reads as the strip.
//   - In both modes every agent row shows its exact model and effort at 60, 80, 120 and 200 columns.
//
// The renderer is what Claude Code stamps on every terminal drawing (types RenderViewport.isFullscreen); the test
// engine stamps no `presentation` on a command, so `/baton layout` is checked after the band has been drawn.
import { expect, test } from 'claude-code/testing'
import { dump, elements, rowOf, screen, PW1_AGENTS } from './pw1-a3/kit'
import { lmWorld, panelWidth, settingsTouched } from './lm1/kit'

const SLOW = { timeoutMs: 120000 }
const WIDTHS = [60, 80, 120, 200]
const STRIP_SAYS = /\bstrip\b.*\/baton layout panel/
const PANEL_SAYS = /\bpanel\b.*\/baton layout strip/
const TUI = /\/tui (default|fullscreen)/
const tuiLines = (lines: string[]) => lines.filter((l) => TUI.test(l))
const says = (l: string, cmd: string) => l.includes(cmd) && /restarts/.test(l) && /resumes/.test(l)

/** The saved store, handed from the persistence test to the restart test after it (one mod per test). */
let carried: Map<string, unknown> | null = null

test('LM1 1: /baton layout alone prints the current mode (the strip, the default) and how to switch', SLOW, async ($, on) => {
  const w = lmWorld(on)
  await w.begin($)
  const t = await w.baton($, 'layout')
  expect(t, t).toMatch(/\bstrip\b/)
  expect(t, t).toMatch(/default/)
  expect(t, t).toContain('/baton layout panel')
  expect(w.saved.has('layout'), 'reading the mode saves nothing').toBe(false)
})

test('LM1 1: /baton layout panel switches to the side panel, says so in one plain line, saves it and opens the panel; /baton layout strip switches back', SLOW, async ($, on) => {
  const w = lmWorld(on)
  await w.begin($)
  const before = w.opens.length
  const p = await w.baton($, 'layout panel')
  expect(p.split('\n').length, p).toBe(1)
  expect(p, p).toMatch(/\bpanel\b/)
  expect(p, p).toContain('/baton layout strip')
  expect(w.saved.get('layout'), 'saved in baton’s store').toBe('panel')
  expect(w.opens.length, 'the side panel opened: ' + JSON.stringify(w.opens)).toBeGreaterThan(before)
  const now = await w.baton($, 'layout')
  expect(now, now).toMatch(/\bpanel\b/)
  expect(now, now).toContain('/baton layout strip')
  const s = await w.baton($, 'layout strip')
  expect(s.split('\n').length, s).toBe(1)
  expect(s, s).toMatch(/\bstrip\b/)
  expect(s, s).toContain('/baton layout panel')
  expect(w.saved.get('layout')).toBe('strip')
  const after = await w.baton($, 'layout')
  expect(after, after).toMatch(/\bstrip\b/)
  expect(after, after).toContain('/baton layout panel')
})

test('LM1 1: /baton layout with a word that is no layout says how to use it, and changes nothing', SLOW, async ($, on) => {
  const w = lmWorld(on)
  await w.begin($)
  const t = await w.baton($, 'layout wide')
  expect(t, t).toMatch(/usage/)
  expect(t, t).toContain('strip')
  expect(t, t).toContain('panel')
  expect(w.saved.has('layout')).toBe(false)
  expect(await w.baton($, 'layout'), 'still the strip').toMatch(/\bstrip\b/)
})

test('LM1 1: the mode persists across a new session (baton’s per-user store, key layout)', SLOW, async ($, on) => {
  const w = lmWorld(on)
  await w.begin($)
  await w.baton($, 'layout panel')
  // a new session in the same mod: the session starts again and reads the store
  await $.session.start({ cwd: '/proj/run', surface: 'terminal', isInteractive: true } as any)
  await w.settle(2000)
  const t = await w.baton($, 'layout')
  expect(t, t).toMatch(/\bpanel\b/)
  carried = new Map(w.saved)
})

test('LM1 1: the mode persists across a mod restart: a new mod on the same store starts in the panel layout', SLOW, async ($, on) => {
  expect(carried?.get('layout'), 'the test before saved the panel layout').toBe('panel')
  const w = lmWorld(on, { saved: new Map(carried!) })
  await w.begin($)
  const t = await w.baton($, 'layout')
  expect(t, t).toMatch(/\bpanel\b/)
  // the panel layout's own behaviour: the pane opened by itself (CS4)
  expect(w.opens.length, JSON.stringify(w.opens)).toBeGreaterThanOrEqual(1)
  const lines = await w.bandLines($, 200)
  expect(lines.some((l) => PANEL_SAYS.test(l)), lines.join('\n')).toBe(true)
})

test('LM1 1: no Claude Code setting is written: switching both ways and drawing under both renderers touches no settings file, runs no /tui, sets nothing', SLOW, async ($, on) => {
  const w = lmWorld(on)
  await w.begin($)
  for (const full of [true, false]) await w.bandLines($, 120, full)
  await w.baton($, 'layout panel')
  for (const full of [true, false]) await w.bandLines($, 120, full)
  await w.baton($, 'layout strip')
  await w.baton($, 'layout')
  await w.settle(61000)
  expect(settingsTouched(w.touched), JSON.stringify(w.touched.map((t) => t.name))).toEqual([])
  // what was saved went to baton's own store, under its own key, and nowhere else
  const sets = w.touched.filter((t) => t.name === 'store.set' && t.e?.key === 'layout').map((t) => t.e.value)
  expect(sets, JSON.stringify(sets)).toEqual(['panel', 'strip'])
})

for (const width of [120, 200]) {
  test('LM1 1: the strip says the current mode and the switch command in plain words, in both modes (' + width + ' columns)', SLOW, async ($, on) => {
    const w = lmWorld(on)
    await w.begin($)
    const s = await w.bandLines($, width)
    expect(s.length, s.join('\n')).toBe(2)
    expect(s.some((l) => STRIP_SAYS.test(l)), s.join('\n')).toBe(true)
    await w.baton($, 'layout panel')
    const p = await w.bandLines($, width)
    expect(p.length, p.join('\n')).toBe(2)
    expect(p.some((l) => PANEL_SAYS.test(l)), p.join('\n')).toBe(true)
    expect(p.some((l) => STRIP_SAYS.test(l)), p.join('\n')).toBe(false)
  })
}

for (const cols of WIDTHS) {
  test('LM1 1: the panel’s key hint says the current mode and the switch command, near its top (' + cols + '-column terminal)', SLOW, async ($, on) => {
    const w = lmWorld(on)
    await w.begin($)
    await w.baton($, 'layout panel')
    await w.baton($, '')
    const { width, placement } = panelWidth(cols)
    const ui = await w.pane($, width, 60, placement, true)
    const els = elements(await ui.drawn(), width)
    await ui.unmount()
    const lines = screen(els)
    expect(lines.slice(0, 6).some((l) => PANEL_SAYS.test(l)), dump(els.slice(0, 8))).toBe(true)
  })
}

for (const width of WIDTHS) {
  test('LM1 1: when the mode does not match the renderer, one plain line says exactly what to type, and that Claude Code restarts and resumes the session (' + width + ' columns)', SLOW, async ($, on) => {
    const w = lmWorld(on)
    await w.begin($)
    // the strip under the fullscreen renderer: /tui default
    const sf = await w.bandLines($, width, true)
    expect(tuiLines(sf).length, sf.join('\n')).toBe(1)
    expect(says(tuiLines(sf)[0]!, '/tui default'), sf.join('\n')).toBe(true)
    expect(sf.length, 'the strip, then the line' + '\n' + sf.join('\n')).toBe(3)
    expect(sf.indexOf(tuiLines(sf)[0]!), sf.join('\n')).toBe(2)
    expect(await w.baton($, 'layout'), 'the command says it too').toContain('/tui default')
    // the strip under the main-screen renderer: matched, no line
    const sd = await w.bandLines($, width, false)
    expect([sd.length, tuiLines(sd)], sd.join('\n')).toEqual([2, []])
    // the panel under the main-screen renderer: /tui fullscreen
    await w.baton($, 'layout panel')
    const pd = await w.bandLines($, width, false)
    expect(tuiLines(pd).length, pd.join('\n')).toBe(1)
    expect(says(tuiLines(pd)[0]!, '/tui fullscreen'), pd.join('\n')).toBe(true)
    expect(pd.length, pd.join('\n')).toBe(3)
    // the panel under the fullscreen renderer: matched, no line
    const pf = await w.bandLines($, width, true)
    expect([pf.length, tuiLines(pf)], pf.join('\n')).toEqual([2, []])
    // not measured (a renderer not reported): no line
    const pn = await w.bandLines($, width)
    expect(tuiLines(pn), pn.join('\n')).toEqual([])
  })
}

test('LM1 1: on the first run (nothing saved) under the fullscreen renderer, the strip says to type /tui default and that Claude Code restarts and resumes; not again once the renderer matches or the person picks the panel', SLOW, async ($, on) => {
  const w = lmWorld(on)
  await w.begin($)
  expect(w.saved.has('layout'), 'a first run: nothing saved').toBe(false)
  expect(w.opens, 'the strip is the default: no pane by itself').toEqual([])
  const first = await w.bandLines($, 120, true)
  expect(tuiLines(first).length, first.join('\n')).toBe(1)
  expect(says(tuiLines(first)[0]!, '/tui default'), first.join('\n')).toBe(true)
  // the renderer matches (Claude Code restarted under /tui default): gone
  const matched = await w.bandLines($, 120, false)
  expect(tuiLines(matched), matched.join('\n')).toEqual([])
  // the person picks the panel, under the fullscreen renderer: gone
  await w.baton($, 'layout panel')
  const panel = await w.bandLines($, 120, true)
  expect(tuiLines(panel), panel.join('\n')).toEqual([])
})

test('LM1 1: the default is the strip: a saved value that is no layout reads as the strip', SLOW, async ($, on) => {
  const w = lmWorld(on, { saved: new Map([['layout', 'sideways']]) })
  await w.begin($)
  expect(await w.baton($, 'layout')).toMatch(/\bstrip\b/)
  expect(w.opens, 'the strip: no pane by itself').toEqual([])
  const lines = await w.bandLines($, 200)
  expect(lines.some((l) => STRIP_SAYS.test(l)), lines.join('\n')).toBe(true)
})

// Every agent of the world whose row says its effort (PW1_AGENTS: the sub-orchestrators at high, the workers at high
// or medium), and the prime, which says its model.
const WITH_EFFORT = PW1_AGENTS.filter((a) => a.effort)
for (const mode of ['strip', 'panel'] as const) {
  for (const cols of WIDTHS) {
    test('guard: LM1 1: in the ' + mode + ' layout every agent row shows its exact model and effort (' + cols + '-column terminal)', SLOW, async ($, on) => {
      const w = lmWorld(on)
      await w.begin($)
      let width = cols
      let placement: 'inline' | 'dock' = 'inline'
      if (mode === 'panel') {
        await w.baton($, 'layout panel')
        await w.baton($, '')
        ;({ width, placement } = panelWidth(cols))
      } else {
        await w.dive($, cols, 'band-work')
      }
      const ui = await w.pane($, width, 400, placement, mode === 'panel')
      const els = elements(await ui.drawn(), width)
      await ui.unmount()
      const bad: string[] = []
      for (const a of WITH_EFFORT) {
        const row = rowOf(els, a)
        if (!row) { bad.push(a.node + ': no row'); continue }
        const t = row.lines.join(' ')
        if (!t.includes(a.short)) bad.push(a.node + ': no ' + a.short + ' in |' + t + '|')
        if (!new RegExp('\\b' + a.effort + '\\b').test(t)) bad.push(a.node + ': no ' + a.effort + ' in |' + t + '|')
      }
      const prime = els.find((x) => /›\s*◆ prime/.test(x.lines[0] ?? ''))
      if (!prime || !prime.lines.join(' ').includes('opus 5.5')) bad.push('prime: no opus 5.5')
      expect(bad, bad.join('\n') + dump(els.slice(0, 40))).toEqual([])
    })
  }
}
