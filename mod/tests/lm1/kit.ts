// LM1 (run build-20261019T125436Z, phase P7): the kit the LM1 tests share, not a test file itself.
//
// The world is PW1's (mod/tests/pw1-a3/kit.ts pw1World, imported unchanged): two phases, fourteen agents with their
// exact model and effort, a phase waiting for the operator's check, an asked question Q-7, a BLOCKED worker T203. Over
// it, each scoped by a matcher so the world's own hooks stay as they are:
//   - the store's `layout` key is kept in `saved`, a Map a test may hand to the next world: the plugin's own store
//     (`$.store`, a JSON file under the user's Claude Code configuration directory) as a restarted mod finds it;
//   - every `$.ui.open` of the pane is recorded (`opens`);
//   - everything that could write a setting is recorded (`touched`): every fs.write, process.run, env.set and
//     store.set the mod raises, and any config.set (refused: baton never changes a Claude Code setting).
// The band is drawn with the renderer Claude Code reports to every terminal drawing (`viewport.isFullscreen`:
// true under `/tui fullscreen`, false under `/tui default`, absent when not measured).
import { pw1World, elements, screen, type El } from '../pw1-a3/kit'

export type Touch = { name: string; e: any }
export type LmOpts = { saved?: Map<string, unknown> }
const keyOf = (n: any) => String(n?.key ?? n?.props?.key ?? '')
const SPIED = new Set(['fs.write', 'process.run', 'env.set', 'store.set'])

export function lmWorld(on: any, o: LmOpts = {}) {
  const saved = o.saved ?? new Map<string, unknown>()
  const touched: Touch[] = []
  const opens: any[] = []
  const spy = (name: string, ...rest: any[]) => {
    const h = rest[rest.length - 1]
    if (!SPIED.has(name) || typeof h !== 'function') return on(name, ...rest)
    return on(name, ...rest.slice(0, -1), (...a: any[]) => (touched.push({ name, e: a[1] }), h(...a)))
  }
  on('ui.open', { id: 'baton' }, (_$: any, e: any) => (opens.push({ ...e }), { value: { id: 'baton', isPlaced: true } }))
  on('store.get', { key: 'layout' }, () => ({ value: saved.get('layout') }))
  on('store.set', { key: 'layout' }, (_$: any, e: any) => (touched.push({ name: 'store.set', e }), saved.set('layout', e.value), { value: undefined }))
  on('config.set', (_$: any, e: any) => (touched.push({ name: 'config.set', e }), { deny: 'test: baton must not change a Claude Code setting' }))
  const w = pw1World(spy)
  /** `/baton <args>`: the text it answers. */
  async function baton($: any, args: string): Promise<string> {
    const r = await $.command.run({ command: 'baton', args } as any)
    await w.settle(100)
    return String(r?.text ?? '')
  }
  /** The band above the prompt, `width` cells wide, under the renderer `full` (undefined: not measured). */
  async function band($: any, width: number, full?: boolean) {
    return $.ui.mount({
      plugin: 'baton',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: width, scroll: {} } as any,
      ...(full === undefined ? {} : { viewport: { columns: width, rows: 50, isFullscreen: full } }),
    } as any)
  }
  /** The band's lines, the engine's own (empty) drawing left out. */
  async function bandLines($: any, width: number, full?: boolean) {
    const ui = await band($, width, full)
    const lines = screen(elements(await ui.drawn(), width).filter((e: El) => keyOf(e.node) !== 'engine'))
    await ui.unmount()
    return lines
  }
  /** The pane as Claude Code places it: inline above the prompt at `width`, or docked `width` cells wide. */
  const paneProps = (width: number, rows: number, placement: 'inline' | 'dock') => ({ title: 'baton', isFocused: true, bodyColumns: width, placement, scroll: { bodyRows: rows, offset: 0 } })
  async function pane($: any, width: number, rows: number, placement: 'inline' | 'dock', full?: boolean) {
    const ui = await $.ui.mount({
      plugin: 'baton',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'baton',
      props: paneProps(width, rows, placement) as any,
      ...(full === undefined ? {} : { viewport: { columns: width, rows: 50, isFullscreen: full } }),
    } as any)
    await w.settle()
    await ui.redraw(paneProps(width, rows, placement) as any)
    return ui
  }
  /** Dive in from the strip: its Button pressed as its hotkey does while the strip has the focus (CS2). */
  async function dive($: any, width: number, key: 'band-work' | 'band-memory') {
    const ui = await band($, width)
    await ui.press({ key })
    await w.settle(100)
    await ui.unmount()
    return opens.at(-1)
  }
  return { ...w, saved, touched, opens, baton, band, bandLines, pane, paneProps, dive }
}

/**
 * The pane's width in the panel layout at a terminal `cols` wide, as Claude Code 2.1.319 gives it (register.js
 * PANE_COLUMNS: an open asks for 999): below 110 columns the fullscreen layout does not dock, the pane is inline at the
 * terminal's width; from 110 it docks at min(floor(cols x 0.45), cols - 60), at least 24 (200 -> 90, 120 -> 54).
 */
export function panelWidth(cols: number): { width: number; placement: 'inline' | 'dock' } {
  if (cols < 110) return { width: cols, placement: 'inline' }
  return { width: Math.max(24, Math.min(Math.floor(cols * 0.45), cols - 60)), placement: 'dock' }
}

/** What could have changed a Claude Code setting, among what the mod raised: each a line saying what. */
export function settingsTouched(touched: Touch[]): string[] {
  const bad: string[] = []
  for (const t of touched) {
    if (t.name === 'config.set') bad.push('config.set ' + JSON.stringify(t.e))
    if (t.name === 'fs.write' && /settings(\.local)?\.json|(^|\/)\.claude(\/|$)|\.claude\.json/.test(String(t.e?.path))) bad.push('fs.write ' + t.e.path)
    if (t.name === 'process.run' && /settings(\.local)?\.json|\/tui\b|\btui\b|NO_FLICKER|\bclaude\b.*\bconfig\b/.test([...(t.e?.argv ?? [])].join(' '))) bad.push('process.run ' + [...t.e.argv].join(' '))
    if (t.name === 'env.set' && /CLAUDE_CODE|NO_FLICKER/.test(JSON.stringify(t.e))) bad.push('env.set ' + JSON.stringify(t.e))
  }
  return bad
}
