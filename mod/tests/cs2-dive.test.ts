// claude plugin test — CS2 criterion 1 (run build-20261019T125436Z, phase P7): dive into Work or Memory from the strip,
// and back (operator decision 2026-11-09, _orch/inbox/compact-strip.md CS2, CS4, CS5; details
// _orch/plan/decisions/P7-CS-d1.md items 1, 3, 4, 5; Q-CS2-1 A).
//
//   - With the strip focused (ctrl+x tab: the band's Buttons take their hotkeys, which the kit models as a press of the
//     Button), `w` opens the pane on Work and `m` on Memory, focused, with `columns: PANE_COLUMNS` (999) and a `rows`
//     request the view fits in: the agent list whole (placeList draws no more line) and the Memory table whole.
//   - Not focused, nothing typed in the prompt opens anything: the dive-in keys are letters, and a band Button's letter
//     never presses from the composer (only a bare digit in an empty one does: types ButtonProps.hotkey).
//   - Esc closes the pane (closeOnEscape: the person's close) and the strip stays.
//   - Every dive-in view says its way back on its first lines: `Esc: back to the strip` in the strip layout,
//     `Esc: close` in the panel layout; a detail view (an agent, a phase, a question's brief, a blocked brief) keeps
//     `b: ‹ back` there too.
//   - Approvals stay on 1 and 2 while one waits.
//   - CS4: in the strip layout (the default) the pane never opens by itself; in the panel layout the T5 auto-open stays.
//
// The world is PW1's (mod/tests/cs2/kit.ts diveWorld over pw1-a3/kit.ts pw1World); the layout is the store's
// `layout` key, the internal flag CS2 adds until LM1's `/baton layout`.
import { expect, test } from 'claude-code/testing'
import { agentRows, dump, elements, screen, type El } from './pw1-a3/kit'
import { buttons, diveWorld } from './cs2/kit'

const SLOW = { timeoutMs: 60000 }
const PANE_COLUMNS = 999
const MORE = /[↑↓]\s*\d+\s+more/
const STRIP_BACK = 'Esc: back to the strip'
const PANEL_BACK = 'Esc: close'
const BACK = /b: ‹ back/
const HINT = /ctrl\+x tab/
/** The first lines of a view: its keys row (up to two lines at 60 columns), the read line, a detail's title line. */
const FIRST = 5

async function drawn(ui: any, width: number) {
  const els = elements(await ui.drawn(), width)
  return { els, lines: screen(els) }
}

for (const width of [80, 120]) {
  test('CS2 1: with the strip focused, w opens the pane on Work, focused, at PANE_COLUMNS, as tall as the Work view: the agent list is drawn whole (' + width + ' columns)', SLOW, async ($, on) => {
    const w = diveWorld(on)
    await w.begin($)
    const o = await w.dive($, width, 'band-work')
    expect(o, 'w opened the pane: ' + JSON.stringify(w.opens)).toBeDefined()
    expect(o, JSON.stringify(o)).toMatchObject({ id: 'baton', focus: true, closeOnEscape: true, columns: PANE_COLUMNS })
    expect(Number.isInteger(o.rows) && o.rows >= 8, 'rows on ' + JSON.stringify(o)).toBe(true)
    // the whole Work view, as tall as it wants
    const tall = await w.pane($, width, 400)
    const all = await drawn(tall, width)
    await tall.unmount()
    // at the rows asked for: every agent row the whole view draws, and no more line
    const ui = await w.pane($, width, o.rows)
    const { els, lines } = await drawn(ui, width)
    await ui.unmount()
    const say = dump(els)
    expect(lines.slice(0, 2).join(' '), say).toMatch(/1: Work/)
    expect(lines.filter((l) => MORE.test(l)), 'the list fits the rows asked for' + say).toEqual([])
    expect(agentRows(els).length, say).toBe(agentRows(all.els).length)
    expect(agentRows(els).length, say).toBeGreaterThan(0)
    expect(lines.length, say).toBeLessThanOrEqual(o.rows)
  })

  test('CS2 1: with the strip focused, m opens the pane on Memory, focused, at PANE_COLUMNS, as tall as the Memory view: the table is drawn whole (' + width + ' columns)', SLOW, async ($, on) => {
    const w = diveWorld(on)
    await w.begin($)
    const o = await w.dive($, width, 'band-memory')
    expect(o, 'm opened the pane: ' + JSON.stringify(w.opens)).toBeDefined()
    expect(o, JSON.stringify(o)).toMatchObject({ id: 'baton', focus: true, closeOnEscape: true, columns: PANE_COLUMNS })
    expect(Number.isInteger(o.rows) && o.rows >= 8, 'rows on ' + JSON.stringify(o)).toBe(true)
    const ui = await w.pane($, width, o.rows)
    const { els, lines } = await drawn(ui, width)
    await ui.unmount()
    const say = dump(els)
    // the Memory tab is the one shown: its own keys are drawn
    expect(lines.slice(0, 3).join(' '), say).toMatch(/2: Memory/)
    expect(lines.some((l) => /^\s*memory\b/.test(l)), 'the memory table' + say).toBe(true)
    // every row of the wake view (pw1World: #0-3, #4-5, #6, #7), and the rulings
    for (const t of ['#0-3', '#4-5', '#6', '#7']) expect(lines.some((l) => l.includes(t)), t + ' drawn' + say).toBe(true)
    expect(lines.some((l) => /stage files by name only/.test(l)), 'a ruling' + say).toBe(true)
    expect(lines.filter((l) => MORE.test(l)), say).toEqual([])
    expect(lines.length, say).toBeLessThanOrEqual(o.rows)
  })
}

test('CS2 1: the dive-in keys are the band Buttons w (Work) and m (Memory): letters, so typing w, m or any text in the prompt opens nothing; the strip still reads as the hint', SLOW, async ($, on) => {
  const w = diveWorld(on)
  await w.begin($)
  const ui = await w.band($, 120)
  const bs = buttons(await ui.drawn())
  await ui.unmount()
  const work = bs.find((b) => b.key === 'band-work')
  const mem = bs.find((b) => b.key === 'band-memory')
  expect([work?.props.hotkey, mem?.props.hotkey], JSON.stringify(bs.map((b) => [b.key, b.props.hotkey]))).toEqual(['w', 'm'])
  // a bare digit in an empty prompt presses a band Button; only the approval keys hold one
  expect(bs.filter((b) => /^\d$/.test(String(b.props.hotkey ?? ''))).map((b) => b.key).sort()).toEqual(['band-approve', 'band-sendback'])
  // the strip not focused: what is typed is the prompt's
  for (const text of ['w', 'm', 'work on the memory export', 'make the memory view wider']) {
    await $.prompt.submit({ text } as any)
    await w.settle(100)
  }
  expect(w.opens, JSON.stringify(w.opens)).toEqual([])
  const lines = await w.bandLines($, 120)
  expect(lines.length, lines.join('\n')).toBe(2)
  expect(lines[1], lines.join('\n')).toMatch(/^open: ctrl\+x tab, then w work · m memory/)
})

// The kit raises no person's close (its engine `$.ui` carries render, resolve, scroll and focus: types EventCalls
// `ui`), so Esc is read where the engine takes it: every dive-in open asks `closeOnEscape`, which makes Escape in the
// pane the person's close. The strip is its own site, drawn while the pane is up and after the pane is gone.
test('CS2 1: Esc closes the dived-in pane and the strip stays; w and m dive in again', SLOW, async ($, on) => {
  const w = diveWorld(on)
  await w.begin($)
  const before = await w.bandLines($, 120)
  await w.dive($, 120, 'band-work')
  expect(w.opens.length).toBe(1)
  // Esc while the pane holds the keyboard: the person's close (closeOnEscape)
  expect(w.opens[0].closeOnEscape).toBe(true)
  const up = await w.bandLines($, 120)
  expect(up, 'the strip while the pane is up').toEqual(before)
  const p = await w.pane($, 120, w.opens[0].rows)
  await p.unmount()
  const after = await w.bandLines($, 120)
  expect(after.length, after.join('\n')).toBe(2)
  expect(after[1], after.join('\n')).toMatch(HINT)
  expect(after, 'the strip as it was').toEqual(before)
  const o = await w.dive($, 120, 'band-memory')
  expect(w.opens.length).toBe(2)
  expect(o).toMatchObject({ id: 'baton', focus: true, closeOnEscape: true, columns: PANE_COLUMNS })
})

type View = { name: string; detail: boolean; go: ($: any, w: ReturnType<typeof diveWorld>, ui: any) => Promise<void> }
const show = (what: string) => async ($: any, w: ReturnType<typeof diveWorld>) => {
  await $.command.run({ command: 'baton', args: 'show ' + what } as any)
  await w.settle(100)
}
const VIEWS: View[] = [
  { name: 'work', detail: false, go: async () => {} },
  { name: 'memory', detail: false, go: async () => {} },
  { name: 'agent', detail: true, go: show('T201 streaming') },
  { name: 'phase', detail: true, go: show('P2') },
  { name: 'question', detail: true, go: async (_$, w, ui) => { await ui.press({ key: 'open-q-Q-7' }); await w.settle(100) } },
  { name: 'blocked', detail: true, go: show('T203 streaming') },
]

for (const layout of ['strip', 'panel'] as const) {
  for (const width of [60, 120]) {
    test('CS2 1: in the ' + layout + ' layout every dive-in view says its way back on its first lines (' + (layout === 'strip' ? STRIP_BACK : PANEL_BACK) + '; b: ‹ back in a detail view) at ' + width + ' columns', SLOW, async ($, on) => {
      const w = diveWorld(on, layout === 'panel' ? { layout } : {})
      await w.begin($)
      const bad: string[] = []
      for (const v of VIEWS) {
        const o = await w.dive($, width, v.name === 'memory' ? 'band-memory' : 'band-work')
        const rows = Math.max(o?.rows ?? 30, 30)
        const ui = await w.pane($, width, rows)
        await v.go($, w, ui)
        await ui.redraw(w.inline(width, rows) as any)
        await w.settle(100)
        const { els, lines } = await drawn(ui, width)
        await ui.unmount()
        const head = lines.slice(0, FIRST)
        const want = layout === 'strip' ? STRIP_BACK : PANEL_BACK
        if (!head.some((l) => l.includes(want))) bad.push(v.name + ': no `' + want + '` in its first lines' + dump(els.slice(0, FIRST + 2)))
        if (layout === 'panel' && head.some((l) => l.includes(STRIP_BACK))) bad.push(v.name + ': says the strip way back in the panel layout')
        if (v.detail && !head.some((l) => BACK.test(l))) bad.push(v.name + ': no `b: ‹ back` in its first lines' + dump(els.slice(0, FIRST + 2)))
        if (!v.detail && head.some((l) => BACK.test(l))) bad.push(v.name + ': a detail view is open' + dump(els.slice(0, FIRST + 2)))
      }
      expect(bad, bad.join('\n')).toEqual([])
    })
  }
}

test('CS2 1: while an approval waits, 1 approves and 2 sends back as before, beside the dive-in keys', SLOW, async ($, on) => {
  const w = diveWorld(on)
  await w.begin($)
  const ui = await w.band($, 120)
  const bs = buttons(await ui.drawn())
  expect(bs.map((b) => [b.key, b.props.hotkey]).filter(([k]) => /^band-/.test(String(k)))).toEqual([
    ['band-approve', '1'],
    ['band-sendback', '2'],
    ['band-work', 'w'],
    ['band-memory', 'm'],
  ])
  await ui.unmount()
  const lines = await w.bandLines($, 120)
  expect(lines.join('\n')).toMatch(/1: approve/)
  // 2: the pane opens on Work to send it back, focused
  const b2 = await w.band($, 120)
  await b2.press({ key: 'band-sendback' })
  await w.settle(100)
  await b2.unmount()
  expect(w.opens.at(-1)).toMatchObject({ id: 'baton', focus: true, columns: PANE_COLUMNS })
  // 1: the phase is approved, its keys go
  const b1 = await w.band($, 120)
  await b1.press({ key: 'band-approve' })
  await w.settle(100)
  await b1.unmount()
  const later = await w.bandLines($, 120)
  expect(later.join('\n'), later.join('\n')).not.toMatch(/1: approve/)
  expect(later[1], later.join('\n')).toMatch(HINT)
})

test('CS4: in the strip layout (the default) the pane never opens by itself: not at session start, not at a spawn', SLOW, async ($, on) => {
  const w = diveWorld(on)
  await w.begin($) // session start, then fourteen spawns, settled past every timer
  await w.settle(120000)
  expect(w.opens, JSON.stringify(w.opens)).toEqual([])
  const lines = await w.bandLines($, 120)
  expect(lines.length, lines.join('\n')).toBe(2)
  expect(lines.join('\n')).not.toMatch(/\/baton opens the pane/)
})

test('guard: CS4: in the panel layout the T5 auto-open stays: the pane opens by itself, unfocused', SLOW, async ($, on) => {
  const w = diveWorld(on, { layout: 'panel' })
  await w.begin($)
  expect(w.opens.length, JSON.stringify(w.opens)).toBeGreaterThanOrEqual(1)
  expect(w.opens[0], JSON.stringify(w.opens[0])).toMatchObject({ id: 'baton', closeOnEscape: true, columns: PANE_COLUMNS })
  expect('focus' in w.opens[0], JSON.stringify(w.opens[0])).toBe(false)
})
