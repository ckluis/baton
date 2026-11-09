// claude plugin test — CS1 criterion 6 (run build-20261019T125436Z, phase P7; operator Q-CS1-1 = B,
// _orch/inbox/Q-CS1-1.answer.md): "The strip is two lines normally. A third line is allowed ONLY while a notice shows
// (baton paused, a baton update available, a doctor warning), and it goes away when the notice clears."
//
// At 40, 60, 80, 120 and 200 columns the band is drawn the way the CS1 tests read it (mod/tests/pw1-a3/kit.ts, the
// engine's own empty Text left out) and must be: exactly two lines with no notice; exactly three while the notice
// shows, the third line being that notice; exactly two again once it clears. Each notice is raised and cleared through
// the product's own path:
//   - pause: `/baton pause`, then `/baton resume`;
//   - a doctor warning: `/baton doctor` while `node --version` fails, then `/baton doctor` once it answers again.
// The third notice, a baton update available, is not reachable under `claude plugin test`: the band shows it only when
// `installedCopy($.plugin.root)` holds (register.js checkUpdate), and the test harness loads the mod from its folder
// (`$.plugin.root` is the checkout), so no test can raise it without a product change. That gap is reported, not
// papered over here (_orch/nodes/CS1/status.json, criterion6).
import { expect, test } from 'claude-code/testing'
import { cellW, dump, elements, screen, type El } from './pw1-a3/kit'
import { stripWorld } from './cs1/kit'

const SLOW = { timeoutMs: 900000 }
const WIDTHS = [40, 60, 80, 120, 200]
const FIVE = { kind: 'five_hour', percentUsed: 41, resetsAt: '2026-11-06T14:20:00Z' }
const WEEK = { kind: 'seven_day', percentUsed: 62, resetsAt: '2026-11-12T09:00:00Z' }
const keyOf = (n: any) => String(n?.key ?? n?.props?.key ?? '')

/** stripWorld, with `node --version` failing while `nodeDown.on` is set (the doctor's first check). */
function noticeWorld(on: any) {
  const nodeDown = { on: false }
  const wrap = (name: string, ...rest: any[]) => {
    if (name !== 'process.run') return on(name, ...rest)
    const h = rest[rest.length - 1]
    return on(name, ...rest.slice(0, -1), (_$: any, e: any) => {
      const argv = [...e.argv]
      if (nodeDown.on && argv[0] === 'node' && argv[1] === '--version') return { value: { exitCode: 127, stdout: '', stderr: 'node: command not found' } }
      return h(_$, e)
    })
  }
  const w = stripWorld(wrap, { usage: { rateLimits: [FIVE, WEEK], cost: { usd: 9.94 } } })
  return { ...w, nodeDown }
}

async function linesAt($: any, w: ReturnType<typeof noticeWorld>, width: number) {
  const ui = await w.band($, width)
  const els = elements(await ui.drawn(), width).filter((e: El) => keyOf(e.node) !== 'engine')
  await ui.unmount()
  return { lines: screen(els), say: width + ': ' + dump(els) }
}

type Notice = { name: string; prefix: string; raise: ($: any, w: ReturnType<typeof noticeWorld>) => Promise<void>; clear: ($: any, w: ReturnType<typeof noticeWorld>) => Promise<void> }
const baton = ($: any, args: string) => $.command.run({ command: 'baton', args } as any)
const NOTICES: Notice[] = [
  {
    name: 'baton paused (/baton pause, then /baton resume)',
    prefix: '⏸ baton paused since',
    raise: async ($) => { await baton($, 'pause') },
    clear: async ($) => { await baton($, 'resume') },
  },
  {
    name: 'a doctor warning (node missing, then back)',
    prefix: 'baton doctor: node',
    raise: async ($, w) => { w.nodeDown.on = true; await baton($, 'doctor') },
    clear: async ($, w) => { w.nodeDown.on = false; await baton($, 'doctor') },
  },
]

for (const n of NOTICES) {
  test('CS1 6: with ' + n.name + ', the strip is 2 lines, then 3 with the notice third, then 2 again, at 40-200', SLOW, async ($, on) => {
    const w = noticeWorld(on)
    await w.begin($)
    await $.session.measure({ context: { tokens: 230000, window: 1000000, percent: 23 }, rateLimits: [FIVE, WEEK], changed: ['context', 'rateLimits'] } as any)
    await w.settle(31000)
    const bad: string[] = []
    const check = async (stage: string, want: number) => {
      for (const width of WIDTHS) {
        const { lines, say } = await linesAt($, w, width)
        if (lines.length !== want) bad.push(stage + ': ' + lines.length + ' lines, not ' + want + ', at ' + say)
        lines.forEach((l, i) => { if (cellW(l) > width) bad.push(stage + ': line ' + i + ' is ' + cellW(l) + ' cells at ' + say) })
        const third = lines.findIndex((l) => l.startsWith(n.prefix.slice(0, Math.min(n.prefix.length, width))))
        if (want === 3 && third !== 2) bad.push(stage + ': the notice is not the third line at ' + say)
        if (want === 2 && third >= 0) bad.push(stage + ': the notice still shows at ' + say)
      }
    }
    await check('no notice', 2)
    await n.raise($, w)
    await w.settle(10)
    await check('notice showing', 3)
    await n.clear($, w)
    await w.settle(10)
    await check('notice cleared', 2)
    expect(bad.slice(0, 4), bad.length + ' faults').toEqual([])
  })
}
