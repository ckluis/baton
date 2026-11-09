// LM1 attempt 2 (run build-20261019T125436Z, phase P7): the kit the "LM1 red 2" tests share, not a test file itself.
//
// The worlds are CS1's (mod/tests/cs1/kit.ts stripWorld: the usage fed through `$.session.usage()` and the
// `session.measure` hook, whether a phase waits, a question is asked, an agent is blocked) and LM1's busy one
// (mod/tests/lm1/kit.ts lmWorld over PW1's: fourteen agents, a phase waiting, an asked and a queued question, a
// blocked worker, no usage reading), imported unchanged. Here: drawing the band and the pane with the renderer
// Claude Code reports (`viewport.isFullscreen`), diving in from the strip, and what each layout must say.
import { elements, screen, type El } from '../pw1-a3/kit'

export type Mode = 'strip' | 'panel'
const keyOf = (n: any) => String(n?.key ?? n?.props?.key ?? '')

/**
 * What the strip may say of the layout, richest first (the documented order, mod/lib/view.mjs layoutForms): the
 * layout and the command that switches it, then the shorter `strip · /baton layout panel`, then
 * `layout: /baton layout`, then `/baton layout` alone (it prints the layout and how to switch).
 */
export function formsOf(mode: Mode): string[] {
  const other = mode === 'strip' ? 'panel' : 'strip'
  return [mode + ' layout · /baton layout ' + other + ' switches', mode + ' · /baton layout ' + other, 'layout: /baton layout', '/baton layout']
}
/** The forms that name the layout (the first two). */
export const namedOf = (mode: Mode) => formsOf(mode).slice(0, 2)
/** The richest form of `mode` that `line` holds whole, else null. */
export function formIn(line: string, mode: Mode): string | null {
  for (const f of formsOf(mode)) if (line.includes(f)) return f
  return null
}
/** Words that name the other layout as the current one (`panel ·`, `panel layout ·`), wrong in `mode`. */
export const wrongName = (line: string, mode: Mode) => {
  const other = mode === 'strip' ? 'panel' : 'strip'
  return line.includes(other + ' · /baton') || line.includes(other + ' layout · /baton')
}

export async function run($: any, args: string, settle: (ms?: number) => Promise<void>) {
  const r = await $.command.run({ command: 'baton', args } as any)
  await settle(100)
  return String(r?.text ?? '')
}

/** The band's lines at `width`, drawn under the renderer `full`, the engine's own (empty) drawing left out. */
export async function bandAt($: any, width: number, full?: boolean) {
  const ui = await $.ui.mount({
    plugin: 'baton',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: width, scroll: {} } as any,
    ...(full === undefined ? {} : { viewport: { columns: width, rows: 50, isFullscreen: full } }),
  } as any)
  const lines = screen(elements(await ui.drawn(), width).filter((e: El) => keyOf(e.node) !== 'engine'))
  await ui.unmount()
  return lines
}

/** Dive in from the strip (CS2): its Button pressed as its hotkey does while the strip has the focus; the open it made. */
export async function diveAt($: any, w: { opens: any[]; settle: (ms?: number) => Promise<void> }, width: number, key: 'band-work' | 'band-memory') {
  const ui = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: width, scroll: {} } as any } as any)
  await ui.press({ key })
  await w.settle(100)
  await ui.unmount()
  return w.opens.at(-1)
}

/** The pane's lines, placed inline above the prompt or docked, `width` cells wide and `rows` high. */
export async function paneAt($: any, w: { settle: (ms?: number) => Promise<void> }, width: number, rows: number, placement: 'inline' | 'dock', full: boolean) {
  const props = { title: 'baton', isFocused: true, bodyColumns: width, placement, scroll: { bodyRows: rows, offset: 0 } }
  const ui = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: props as any, viewport: { columns: width, rows: 50, isFullscreen: full } } as any)
  await w.settle()
  await ui.redraw(props as any)
  const lines = screen(elements(await ui.drawn(), width))
  await ui.unmount()
  return lines
}
