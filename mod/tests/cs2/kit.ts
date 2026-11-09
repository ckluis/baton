// CS2 (run build-20261019T125436Z, phase P7): the kit the CS2 tests share, not a test file itself.
//
// The world is PW1's (mod/tests/pw1-a3/kit.ts pw1World, imported unchanged): two phases, fourteen agents, a
// sub-orchestrator that returned DONE so its phase waits for the operator's check, an asked question Q-7, a queued
// Q-8, a BLOCKED worker T203, four rulings and eight memory notes. Two hooks are added beneath it, each scoped by a
// matcher so the world's own stay as they are: every `$.ui.open` of the pane is recorded (`opens`), and `layout`
// answers the store's `layout` key ('panel'), the internal layout flag CS2 adds (P7-CS-d1 item 6; no key: the strip,
// the default). The drawing model is PW1's (pw1-a3/kit.ts elements, screen).
import { elements, pw1World, screen, type El } from '../pw1-a3/kit'

export type Opts = { layout?: 'panel' | 'strip' }
const keyOf = (n: any) => String(n?.key ?? n?.props?.key ?? '')

export function diveWorld(on: any, o: Opts = {}) {
  const opens: any[] = []
  on('ui.open', { id: 'baton' }, (_$: any, e: any) => (opens.push({ ...e }), { value: { id: 'baton', isPlaced: true } }))
  if (o.layout) on('store.get', { key: 'layout' }, () => ({ value: o.layout }))
  const w = pw1World(on)
  /** The band above the prompt, `width` cells wide. */
  async function band($: any, width: number) {
    return $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: width, scroll: {} } as any })
  }
  /** The band's lines at `width`, the engine's own (empty) drawing left out. */
  async function bandLines($: any, width: number) {
    const ui = await band($, width)
    const lines = screen(elements(await ui.drawn(), width).filter((e: El) => keyOf(e.node) !== 'engine'))
    await ui.unmount()
    return lines
  }
  /** Seated inline above the prompt (the strip layout's pane: full width, `rows` tall). */
  const inline = (width: number, rows: number) => ({ title: 'baton', isFocused: true, bodyColumns: width, placement: 'inline', scroll: { bodyRows: rows, offset: 0 } })
  /** The pane as the engine draws it after an open, `width` x `rows`, without a /baton. */
  async function pane($: any, width: number, rows: number) {
    const ui = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: inline(width, rows) as any })
    await w.settle()
    await ui.redraw(inline(width, rows) as any)
    return ui
  }
  /** Dive in from the strip: the band at `width`, its Button pressed as its hotkey does while the strip has the focus. */
  async function dive($: any, width: number, key: 'band-work' | 'band-memory') {
    const ui = await band($, width)
    await ui.press({ key })
    await w.settle(100)
    await ui.unmount()
    return opens.at(-1)
  }
  return { ...w, opens, band, bandLines, pane, inline, dive }
}

/** Every Button drawn in a tree: its key and props. */
export function buttons(n: any, out: { key: string; props: any }[] = []): { key: string; props: any }[] {
  if (Array.isArray(n)) {
    for (const c of n) buttons(c, out)
    return out
  }
  if (!n || typeof n !== 'object') return out
  if (n.type === 'Button') out.push({ key: keyOf(n), props: n.props ?? {} })
  const kids = n.children ?? n.props?.children
  if (kids) buttons(kids, out)
  return out
}
