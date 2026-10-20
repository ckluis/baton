// claude plugin test — T11 "Every level shows its steps" (cluster C11), the red step for F111 (node T111).
//
// Spec, docs/designs/v7.6-tuning.md L148-156:
//   L153 "- Every level of agent row (prime, sub-orchestrator, worker, verifier) shows its measured steps, as
//   L154  the Track tab promises."
//   L155 "- Acceptance: a plugin test per level, failing with its fix removed, plus a live check through cmux."
// Requirements (_orch/plan/traceability.yaml): R-C11-01 (L153), R-C11-02 (L155).
//
// What a step is (H26, _orch/plan/spec-questions.md:46): "the stepper of the agent's node or phase", the
// steppers the Track tab draws (mod/README.md:114-121 at da5910c: node "red → green → blue → verified"
// ("working → verified" when exempt), phase "briefed → dispatched → verified → approved", goal "queued →
// planned → building → reviewing → ready → merged"; "The Track tab draws each level as a stepper").
// Q-15 answer (_orch/inbox/Q-15.answer.md, option 1): "Match the label's tokens against the run's real node
// ids (`_orch/nodes/*`, `graph.yaml`) and phase ids. A verifier row shows the stepper of the node it
// verifies. A row that matches nothing shows its own lifecycle stepper (spawned → working → returned →
// verdict), so every row has steps."
// Q-11 answer (_orch/inbox/Q-11.answer.md): "A: model, steps, agent and state never drop."
// Q-16 answer (_orch/inbox/Q-16.answer.md): F111 needs F11's 'dir' fix, so node directories are listed the
// way the engine lists them: FsEntry.kind 'dir' (types index.d.ts:5066, quoted in E1 §m, probes.md:429).
//
// Hazard H28 (roadmap): rows of C8-C11 all change, so these tests only look for the steps cell's stepper
// inside a row, never at a whole row string. The stepper's drawn form, dots in ladder order joined by `─`
// (`●` reached, `◉` current, `○` ahead, `✗` flagged), is the one E1 saw on the live pane:
// `●─●─◉─○─○─○ building` for the prime and `●─●─◉─○ blue` for a node (E1 §m, probes.md:417, :421).
// Labels use this run's ids (F17, XT17, LV7, G1, PLANV, V1.R-C7-01), which `workOf` does not match
// (lib/ledger.mjs:135-140), per the T111 handoff and roadmap.md:69.
import { expect, mock, test } from 'claude-code/testing'

// An active prime run (the tracker only observes during a run).
const MANIFEST = { run_id: 'build-20261019T125436Z', mode: 'BUILD', target: './mod', prime: true, phase: 'P2' }

// The plan: each node's phase, in the graph.yaml schema (CONTRACT §4; this run's _orch/plan/graph.yaml).
const GRAPH = [
  ['G1', 1],
  ['PLAN', 1],
  ['V1', 1],
  ['F17', 2],
  ['XT17', 2],
  ['LV7', 2],
  ['T17', 2],
]
  .map(([id, p]) => '- id: ' + id + '\n  kind: task\n  phase: ' + p + '\n')
  .join('\n')

// Each node's record puts it at a distinct step of its ladder (README.md:116-117: "node `red → green → blue →
// verified` (`working → verified` when exempt)", computed from work/red.txt, green.txt, blue.txt and the verdict).
const FILES: Record<string, string> = {
  '_orch/manifest.json': JSON.stringify(MANIFEST),
  '_orch/plan/graph.yaml': GRAPH,
  '_orch/phases/P1/brief.md': '# P1',
  '_orch/phases/P2/brief.md': '# P2',
  // F17: red and green written -> at `green` (2nd of 4)
  '_orch/nodes/F17/handoff.md': '# F17',
  '_orch/nodes/F17/work/red.txt': 'red',
  '_orch/nodes/F17/work/green.txt': 'green',
  // XT17: red, green, blue -> at `blue` (3rd of 4)
  '_orch/nodes/XT17/handoff.md': '# XT17',
  '_orch/nodes/XT17/work/red.txt': 'red',
  '_orch/nodes/XT17/work/green.txt': 'green',
  '_orch/nodes/XT17/work/blue.txt': 'blue',
  // T17: red, green, blue -> at `blue` (3rd of 4)
  '_orch/nodes/T17/handoff.md': '# T17',
  '_orch/nodes/T17/work/red.txt': 'red',
  '_orch/nodes/T17/work/green.txt': 'green',
  '_orch/nodes/T17/work/blue.txt': 'blue',
  // LV7: red only -> at `red` (1st of 4)
  '_orch/nodes/LV7/handoff.md': '# LV7',
  '_orch/nodes/LV7/work/red.txt': 'red',
  // G1: rgb exempt and started -> `working` (1st of 2)
  '_orch/nodes/G1/handoff.md': '# G1\nrgb: exempt\n',
  '_orch/nodes/G1/work/applied.md': 'x',
  // V1: verified (a CONFIRMED verdict) -> every step reached
  '_orch/nodes/V1/handoff.md': '# V1',
  '_orch/nodes/V1/work/red.txt': 'red',
  '_orch/nodes/V1/work/green.txt': 'green',
  '_orch/nodes/V1/work/blue.txt': 'blue',
  '_orch/verify/V1-verdict.json': JSON.stringify({ verdict: 'CONFIRMED', criteria: [] }),
  // PLAN: red, green, blue -> at `blue` (3rd of 4). A real node id that no id-shaped pattern (letters then
  // digits) would guess; at `blue` so a guessed-but-missing node (nothing written) can never draw its stepper.
  // No flag: a BLOCKED node would flag the goal, and the prime's guard reads the goal.
  '_orch/nodes/PLAN/handoff.md': '# PLAN',
  '_orch/nodes/PLAN/work/red.txt': 'red',
  '_orch/nodes/PLAN/work/green.txt': 'green',
  '_orch/nodes/PLAN/work/blue.txt': 'blue',
}
const NODE_IDS = ['F17', 'G1', 'LV7', 'PLAN', 'T17', 'V1', 'XT17']
const DIRS: Record<string, any[]> = {
  // FsEntry.kind is 'file' | 'dir' | 'other' (engine types index.d.ts:5066, quoted in E1 §m, probes.md:429)
  '_orch/nodes': NODE_IDS.map((name) => ({ name, kind: 'dir' })),
  '_orch/phases': [{ name: 'P1', kind: 'dir' }, { name: 'P2', kind: 'dir' }],
  '_orch/inbox': [],
  '_orch/track': [],
  '_orch/ledger': [],
}

// The stepper of each fixture node, as the steps cell draws it (dots only; E1 §m form, README ladders above).
const STEPS = {
  F17: '●─◉─○─○', // node ladder, at green (2 of 4) — README.md:116
  XT17: '●─●─◉─○', // node ladder, at blue (3 of 4) — README.md:116; E1 §m: `●─●─◉─○ blue`
  T17: '●─●─◉─○', // node ladder, at blue (3 of 4) — E1 §m probes.md:421, :424
  LV7: '◉─○─○─○', // node ladder, at red (1 of 4) — README.md:116
  G1: '◉─○', // exempt ladder `working → verified`, at working — README.md:117
  PLAN: '●─●─◉─○', // node ladder, at blue (3 of 4) — README.md:116
}
// Any stepper: two or more steps joined by `─` (E1 §m form).
const ANY_STEPPER = /[●◉○✗](─[●◉○✗])+/
// The lifecycle stepper of Q-15: four steps, spawned → working → returned → verdict.
const LIFECYCLE = /(?<![●◉○✗─])[●◉○✗]─[●◉○✗]─[●◉○✗]─[●◉○✗](?![─●◉○✗])/
// The prime's: the goal ladder's six steps, at building (E1 §m probes.md:417: `●─●─◉─○─○─○ building`).
const PRIME_STEPS = '●─●─◉─○─○─○'

function world(on: any, files: Record<string, string> = FILES, dirs: Record<string, any[]> = DIRS) {
  const find = (table: Record<string, any>, p: string) => Object.keys(table).find((k) => p === k || p.endsWith('/' + k))
  on('fs.read', (_$: any, e: any) => {
    const k = find(files, e.path)
    return k ? { value: files[k] } : { deny: 'ENOENT' }
  })
  on('fs.list', (_$: any, e: any) => {
    const k = find(dirs, e.path)
    return k ? { value: dirs[k] } : { deny: 'ENOENT' }
  })
  on('fs.exists', (_$: any, e: any) => {
    const p = String(e.path)
    const hit = Object.keys(files).some((k) => p === k || p.endsWith('/' + k) || k.startsWith(p.replace(/^.*?(_orch\/)/, '$1') + '/'))
    return { value: hit }
  })
  on('fs.write', () => ({ value: undefined }))
  mock.clock(on)
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return Text({ key: 'engine', children: ['engine ' + JSON.stringify(e.props.suffix ?? e.component)] })
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [{ id: 'baton', title: 'baton', isShown: true, isFocused: true, isPlaced: true }] }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify({}), stderr: '' } }))
  on('command.run', () => ({ text: 'core' }))
  on('tool.call', () => ({ result: 'ran' }))
  on('agent.spawn', (_$: any, e: any) => ({ model: e.model ?? 'claude-opus-5-5', agentId: e.prompt }))
}

// The drawn tree's text, one entry per Box that holds text directly or through its descendants.
function texts(el: any): string {
  if (el == null) return ''
  if (typeof el === 'string' || typeof el === 'number') return String(el)
  if (Array.isArray(el)) return el.map(texts).join('')
  if (typeof el === 'object') {
    const p = el.props || {}
    const own = el.type === 'Button' || el.type === 'Link' ? String(p.label ?? '') : ''
    return own + texts(p.children ?? el.children)
  }
  return ''
}
function boxes(el: any, out: string[] = []): string[] {
  if (el && typeof el === 'object' && !Array.isArray(el)) {
    if (el.type === 'Box') out.push(texts(el))
    const kids = (el.props && el.props.children) ?? el.children
    for (const k of [].concat(kids ?? [])) boxes(k, out)
  } else if (Array.isArray(el)) for (const k of el) boxes(k, out)
  return out
}

/** The innermost drawn row (Box) whose text carries `label`; its text, or a failure naming what was drawn. */
async function row(ui: any, label: RegExp): Promise<string> {
  const all = boxes(await ui.drawn())
  const hits = all.filter((t) => label.test(t)).sort((a, b) => a.length - b.length)
  if (!hits.length) throw new Error('no row drawn for ' + label + ' in: ' + JSON.stringify(all.filter((t) => t.length < 400)).slice(0, 3000))
  return hits[0]
}

async function pane($: any, bodyColumns = 146) {
  await $.command.run({ command: 'baton', args: '' } as any)
  return $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns, placement: 'dock', scroll: { bodyRows: 60 } } as any })
}

async function spawn($: any, id: string, label: string, type: string, parent?: string) {
  await $.agent.spawn({ prompt: id, description: label, subagentType: type, ...(parent ? { parentAgentId: parent } : {}) } as any)
}

// ------------------------------------------------------------------ guards (OQ7: exist at da5910c)

// R-C11-01 (L153 "Every level of agent row (prime, ...) shows its measured steps"). GUARD under
// _orch/inbox/OQ7.answer.md ("the prime row's steps"): E1 §m probes.md:417 shows it at da5910c; a deviation from
// spec L19-20 and L100, recorded in _orch/nodes/T111/work/guard-evidence.md.
test('guard: the prime row shows its measured steps (the goal stepper)', async ($, on) => {
  world(on)
  await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'd' } as any)
  const ui = await pane($)
  // expected: the goal ladder at building, E1 §m probes.md:417 `●─●─◉─○─○─○ building`
  expect(await row(ui, /◆ (prime|session)/)).toContain(PRIME_STEPS)
})

// ------------------------------------------------------------------ red pins

// R-C11-01 (L153 "... sub-orchestrator ... shows its measured steps"); R-C11-02 (L155 "a plugin test per level").
test('a sub-orchestrator row shows its measured steps', async ($, on) => {
  world(on)
  await spawn($, 's-g1', 'G1 gate', 'baton:sub-orchestrator')
  const ui = await pane($)
  // expected: G1's exempt stepper `working → verified` at working (README.md:117; fixture: rgb exempt, started)
  expect(await row(ui, /sub-orch G1 gate/)).toContain(STEPS.G1)
})

// R-C11-01 (L153 "... worker ... shows its measured steps"); R-C11-02 (L155 "a plugin test per level").
test('a worker row shows its measured steps', async ($, on) => {
  world(on)
  await spawn($, 's-p2', 'P2 phase', 'baton:sub-orchestrator')
  await spawn($, 'w-f17', 'F17 impl', 'baton:worker', 's-p2')
  const ui = await pane($)
  // expected: F17's node stepper at green (README.md:116; fixture: red.txt and green.txt written)
  expect(await row(ui, /worker F17 impl/)).toContain(STEPS.F17)
})

// R-C11-01 (L153); T111 handoff c4: a worker label carrying an id outside `T\d+[a-z]?`/`P\d+` (lib/ledger.mjs:135-140).
test('a worker row labelled with this run ids (XT17, LV7) shows its measured steps', async ($, on) => {
  world(on)
  await spawn($, 'w-xt17', 'XT17 tests', 'baton:worker')
  await spawn($, 'w-lv7', 'LV7 live', 'baton:worker-cheap')
  const ui = await pane($)
  // expected: XT17 at blue, LV7 at red (README.md:116; fixture work/*.txt files)
  expect(await row(ui, /XT17 tests/)).toContain(STEPS.XT17)
  expect(await row(ui, /LV7 live/)).toContain(STEPS.LV7)
})

// R-C11-01 (L153); T111 handoff c5: a sub-orchestrator label carrying such an id.
test('a sub-orchestrator row labelled with this run id (LV7) shows its measured steps', async ($, on) => {
  world(on)
  await spawn($, 's-lv7', 'LV7 run', 'baton:sub-orchestrator')
  const ui = await pane($)
  // expected: LV7's node stepper at red (README.md:116; fixture: red.txt only)
  expect(await row(ui, /sub-orch LV7 run/)).toContain(STEPS.LV7)
})

// R-C11-01 (L153 "... verifier ... shows its measured steps"); T111 handoff c6: this run's verifier ids.
test('a verifier row labelled with this run ids (PLANV, V1.R-C7-01) shows its measured steps', async ($, on) => {
  world(on)
  await spawn($, 'v-planv', 'PLANV', 'baton:verifier')
  await spawn($, 'v-v1r', 'V1.R-C7-01', 'baton:verifier')
  const ui = await pane($)
  // expected: a stepper in the steps cell (L153 "shows its measured steps"; Q-15 "so every row has steps")
  expect(await row(ui, /verifier PLANV/)).toMatch(ANY_STEPPER)
  expect(await row(ui, /verifier V1\.R-C7-01/)).toMatch(ANY_STEPPER)
})

// R-C11-01 (L153 "... verifier ..."); T111 handoff c10: a T-labelled verifier. Classed red, not guard:
// E1 §m probes.md:424 "verifier | T17 verifier probe | **no**" at da5910c (work/guard-evidence.md).
test('a verifier row with a T-style label (T17) shows its measured steps', async ($, on) => {
  world(on)
  await spawn($, 'v-t17', 'T17 check', 'baton:verifier')
  const ui = await pane($)
  // expected: T17's node stepper at blue (E1 §m probes.md:424 after the 'dir' patch: `●─●─◉─○ blue`)
  expect(await row(ui, /verifier T17 check/)).toContain(STEPS.T17)
})

// R-C11-01 (L153); Q-11 answer "A: model, steps, agent and state never drop."
test('the steps column is never dropped, at any pane width rendered', async ($, on) => {
  world(on)
  await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'd' } as any)
  // 146 body columns is the full 142-column table (table.mjs widths, spec-questions.md:335) plus the pane's 4.
  for (const cols of [146, 130, 110, 90, 72, 60]) {
    const ui = await pane($, cols)
    // expected: the `steps` header (README.md:162 "... cost · steps · state") is drawn at every width
    const header = await ui.findAll({ type: 'Text', text: /^\s*steps\s*$/ })
    expect({ cols, header: header.length > 0 }).toEqual({ cols, header: true })
    // expected: the prime's goal stepper (E1 §m probes.md:417) is still drawn at every width
    expect({ cols, steps: (await row(ui, /◆ (prime|session)/)).includes(PRIME_STEPS) }).toEqual({ cols, steps: true })
    await ui.unmount()
  }
})

// R-C11-01 (L153); Q-15 answer: "Match the label's tokens against the run's real node ids (`_orch/nodes/*`,
// `graph.yaml`) and phase ids."; criterion 25 as rewritten under _orch/inbox/Q-T111-2.answer.md (option B):
// "id-shaped labels that are NOT in the list (e.g. T999, P9, Q-NODE-X) must be rejected, and real ids from the
// list that break the usual id pattern (lowercase, digits-first, long or hyphenated) must be accepted, so any
// matcher that does not read the node list fails whatever its heuristic."
// The fixture run below has its own node list (graph.yaml and _orch/nodes/*) and phases (P1, P2). Its listed ids
// break every id pattern: `alpha` (lower-case), `9lives` (digits first), `CONSOLIDATE` (11 characters, longer
// than 8), `fix-xt17` (hyphenated); XT17 is listed too, so a case-folding or sub-token guess at `fix-xt17` shows
// XT17's stepper, not fix-xt17's. Each listed node sits at a stepper no lifecycle stepper (Q-15) can draw, and
// the listed ids share their labels with unlisted id-shaped tokens (T999, Q-NODE-X) placed before and after them,
// so a pick by position or shape lands on a token that is not in the list. Labels stay within 17 characters, so
// the agent column draws each one whole.
const C25_GRAPH = [
  ['alpha', 1],
  ['9lives', 1],
  ['CONSOLIDATE', 2],
  ['fix-xt17', 2],
  ['XT17', 2],
]
  .map(([id, p]) => '- id: ' + id + '\n  kind: task\n  phase: ' + p + '\n')
  .join('\n')
const C25_FILES: Record<string, string> = {
  '_orch/manifest.json': JSON.stringify(MANIFEST),
  '_orch/plan/graph.yaml': C25_GRAPH,
  '_orch/phases/P1/brief.md': '# P1',
  '_orch/phases/P2/brief.md': '# P2',
  // alpha: red only -> at `red` (1st of 4)
  '_orch/nodes/alpha/handoff.md': '# alpha',
  '_orch/nodes/alpha/work/red.txt': 'red',
  // 9lives: rgb exempt and started -> `working` (1st of 2)
  '_orch/nodes/9lives/handoff.md': '# 9lives\nrgb: exempt\n',
  '_orch/nodes/9lives/work/applied.md': 'x',
  // CONSOLIDATE: red only and BLOCKED (status.json, CONTRACT rule 2) -> at `red`, flagged
  '_orch/nodes/CONSOLIDATE/handoff.md': '# CONSOLIDATE',
  '_orch/nodes/CONSOLIDATE/work/red.txt': 'red',
  '_orch/nodes/CONSOLIDATE/status.json': JSON.stringify({ node: 'CONSOLIDATE', verdict: 'BLOCKED' }),
  // fix-xt17: rgb exempt and CONFIRMED -> `verified` (2nd of 2, every step reached)
  '_orch/nodes/fix-xt17/handoff.md': '# fix-xt17\nrgb: exempt\n',
  '_orch/nodes/fix-xt17/work/applied.md': 'x',
  '_orch/verify/fix-xt17-verdict.json': JSON.stringify({ verdict: 'CONFIRMED', criteria: [] }),
  // XT17: red and green -> at `green` (2nd of 4)
  '_orch/nodes/XT17/handoff.md': '# XT17',
  '_orch/nodes/XT17/work/red.txt': 'red',
  '_orch/nodes/XT17/work/green.txt': 'green',
}
const C25_DIRS: Record<string, any[]> = {
  // FsEntry.kind 'dir' (engine types index.d.ts:5066, quoted in E1 §m, probes.md:429)
  '_orch/nodes': ['alpha', '9lives', 'CONSOLIDATE', 'fix-xt17', 'XT17'].map((name) => ({ name, kind: 'dir' })),
  '_orch/phases': [{ name: 'P1', kind: 'dir' }, { name: 'P2', kind: 'dir' }],
  '_orch/inbox': [],
  '_orch/track': [],
  '_orch/ledger': [],
}

test("a row label is matched only to the fixture run's listed node ids, whatever their shape", async ($, on) => {
  world(on, C25_FILES, C25_DIRS)
  // (a) labels whose only id-shaped tokens are in no list: T999 and Q-NODE-X are no node (absent from graph.yaml
  // and _orch/nodes), P9 is no phase (_orch/phases holds P1 and P2 only) and no node.
  await spawn($, 'w-t999', 'T999 sweep', 'baton:worker')
  await spawn($, 'w-p9', 'P9 sweep', 'baton:worker')
  await spawn($, 'w-qnx', 'Q-NODE-X triage', 'baton:worker')
  // (b) labels carrying a listed id that breaks the id pattern, beside unlisted id-shaped tokens.
  await spawn($, 'w-alpha', 'rerun alpha', 'baton:worker')
  await spawn($, 'w-9lives', '9lives after T999', 'baton:worker')
  await spawn($, 'w-consol', 'CONSOLIDATE T999', 'baton:worker')
  await spawn($, 'w-fixxt', 'Q-NODE-X fix-xt17', 'baton:worker')
  // The (a) rows return, the (b) rows stay live: a (b) row's own lifecycle would be at `working` (`●─◉─○─○`),
  // which is none of the listed nodes' steppers; an (a) row's at `returned` (`●─●─◉─○`), which is none either.
  for (const agentId of ['w-t999', 'w-p9', 'w-qnx'])
    await $.turn.complete({ agentId, answer: 'done', durationMs: 5, isAborted: false, turnId: 't-' + agentId, reason: 'answer' } as any)
  const ui = await pane($)
  // A stepper drawn exactly so: not part of a longer one (E1 §m form, dots joined by `─`).
  const exactly = (dots: string) => new RegExp('(?<![●◉○✗─])' + dots + '(?![─●◉○✗])')

  // (b) expected: each row shows its listed node's stepper (Q-15 "Match the label's tokens against the run's real
  // node ids"; Q-T111-2 B "real ids from the list that break the usual id pattern ... must be accepted"):
  // alpha (lower-case) at red, node ladder `red → green → blue → verified` (README.md:116)
  expect(await row(ui, /worker rerun alpha/)).toMatch(exactly('◉─○─○─○'))
  // 9lives (digits first), rgb exempt and started: `working → verified` at working (README.md:117)
  expect(await row(ui, /worker 9lives after T999/)).toMatch(exactly('◉─○'))
  // CONSOLIDATE (11 characters), at red and BLOCKED: the current step drawn flagged, `✗` (E1 §m form; README.md:116)
  expect(await row(ui, /worker CONSOLIDATE T999/)).toMatch(exactly('✗─○─○─○'))
  // fix-xt17 (hyphenated), rgb exempt and CONFIRMED: `working → verified` with every step reached (README.md:117)
  expect(await row(ui, /worker Q-NODE-X fix-xt17/)).toMatch(exactly('●─●'))

  // (a) expected: matched to no node or phase, so each row shows its own lifecycle stepper (Q-15 "A row that
  // matches nothing shows its own lifecycle stepper (spawned → working → returned → verdict)"); returned, so
  // spawned and working are behind it (Q-15 ladder order). No listed node's stepper starts with two reached steps
  // and has four steps (alpha `◉─○─○─○`, CONSOLIDATE `✗─○─○─○`, XT17 `●─◉─○─○`; 9lives and fix-xt17 have two).
  for (const label of [/worker T999 sweep/, /worker P9 sweep/, /worker Q-NODE-X triage/]) {
    const r = await row(ui, label)
    expect({ label: String(label), lifecycle: LIFECYCLE.test(r), returned: /●─●─[●◉✗]─[●◉○✗]/.test(r) }).toEqual({ label: String(label), lifecycle: true, returned: true })
  }
})

// R-C11-01 (L153 "... verifier ..."); Q-15 answer: "A verifier row shows the stepper of the node it verifies."
test('a verifier row shows the stepper of the node it verifies', async ($, on) => {
  world(on)
  await spawn($, 'v-f17', 'verify F17', 'baton:verifier')
  await spawn($, 'v-xt17', 'verify XT17', 'baton:verifier')
  const ui = await pane($)
  // expected: F17's stepper at green and XT17's at blue (README.md:116; fixture work/*.txt)
  expect(await row(ui, /verifier verify F17/)).toContain(STEPS.F17)
  expect(await row(ui, /verifier verify XT17/)).toContain(STEPS.XT17)
})

// R-C11-01 (L153); Q-15 answer: "A row that matches nothing shows its own lifecycle stepper (spawned → working →
// returned → verdict), so every row has steps."
test('a row whose label matches no node or phase shows its own lifecycle stepper', async ($, on) => {
  world(on)
  await spawn($, 'h-live', 'scanx', 'general-purpose')
  await spawn($, 'h-done', 'docsx', 'general-purpose')
  await $.turn.complete({ agentId: 'h-done', answer: 'done', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  const ui = await pane($)
  // expected: four steps (Q-15: spawned → working → returned → verdict) on the live row
  expect(await row(ui, / scanx/)).toMatch(LIFECYCLE)
  // expected: the returned row has spawned and working behind it (Q-15 ladder order)
  const done = await row(ui, / docsx/)
  expect(done).toMatch(LIFECYCLE)
  expect(done).toMatch(/●─●─[●◉✗]─[●◉○✗]/)
})
