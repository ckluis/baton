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
// Criterion 25 (c): the matchers that refuted c25 in verdicts r1-r4 (_orch/verify/T111-verdict.r{1,2,3,4}.json), as
// test-only fixtures beside this file; each must fail the two-list differential check below.
import * as C25_R1 from './t11-steps-mutants/r1.mjs'
import * as C25_R2 from './t11-steps-mutants/r2.mjs'
import * as C25_R3 from './t11-steps-mutants/r3.mjs'
import * as C25_R4 from './t11-steps-mutants/r4.mjs'
const C25_MUTANTS = [C25_R1, C25_R2, C25_R3, C25_R4]

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
  const clock = mock.clock(on)
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
  return clock
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
// `graph.yaml`) and phase ids."; criterion 25 as rewritten under _orch/inbox/Q-T111-3.answer.md (option D): "the
// same row labels run through the matcher twice, with node lists L1 and L2 — labels that are nodes in L1 but not L2
// (and the reverse) must give different results in the two runs, each agreeing with list membership; labels in both
// lists or in neither must give the same answer in both runs; the four refuting matchers (r1-r4) are fixtures that
// must fail."
//
// One fixed label set (C25_LABELS) is drawn twice: once over fixture run L1, once over fixture run L2, each with its
// own graph.yaml and _orch/nodes/*. L1-only ids: PLAN, alpha. L2-only ids: F99, fix-xt17. In both: F17, CONSOLIDATE.
// In neither: T999, Q-NODE-X, P9 (no phase either: both runs hold P1 and P2), XX, TODO. Four labels carry an L1-only
// id and an L2-only id together ('F99 for PLAN', 'PLAN for F99', 'alpha fix-xt17', 'fix-xt17 alpha'): the right
// answer swaps between the runs, so any matcher that picks its token without reading the run's node list (by
// shape, position or length) is wrong in one of the two runs, whatever token it picks.
// Each node sits at a step whose drawn stepper is unique within its run and is not the lifecycle stepper of a live
// row (`●─◉─○─○`, spawned reached, working current: Q-15 ladder order), so the steps cell names the matched node.
// Labels stay within 17 characters, so the agent column draws each one whole.
const C25_LABELS = [
  'rerun PLAN', // L1 only
  'F99 after T999', // L2 only (T999 in neither)
  'F99 for PLAN', // L2 only + L1 only: swaps
  'PLAN for F99', // L1 only + L2 only: swaps
  'alpha fix-xt17', // L1 only + L2 only: swaps (lower-case, hyphenated)
  'fix-xt17 alpha', // L2 only + L1 only: swaps
  'F17 after T999', // both (T999 in neither)
  'T999 CONSOLIDATE', // both (T999 in neither)
  'T999 sweep', // neither
  'Q-NODE-X P9', // neither (P9 is no node and no phase)
  'XX for TODO', // neither
]
type C25Run = { name: string; nodes: string[]; phases: string[]; steps: Record<string, string>; files: Record<string, string>; dirs: Record<string, any[]> }
function c25Run(name: string, nodes: [string, number, Record<string, string>, string][]): C25Run {
  const files: Record<string, string> = {
    '_orch/manifest.json': JSON.stringify(MANIFEST),
    '_orch/plan/graph.yaml': nodes.map(([id, p]) => '- id: ' + id + '\n  kind: task\n  phase: ' + p + '\n').join('\n'),
    '_orch/phases/P1/brief.md': '# P1',
    '_orch/phases/P2/brief.md': '# P2',
  }
  for (const [, , f] of nodes) Object.assign(files, f)
  return {
    name,
    nodes: nodes.map(([id]) => id),
    phases: ['P1', 'P2'],
    steps: Object.fromEntries(nodes.map(([id, , , s]) => [id, s])),
    files,
    dirs: {
      // FsEntry.kind 'dir' (engine types index.d.ts:5066, quoted in E1 §m, probes.md:429)
      '_orch/nodes': nodes.map(([id]) => ({ name: id, kind: 'dir' })),
      '_orch/phases': [{ name: 'P1', kind: 'dir' }, { name: 'P2', kind: 'dir' }],
      '_orch/inbox': [],
      '_orch/track': [],
      '_orch/ledger': [],
    },
  }
}
// Node records (README.md:116-117: node `red → green → blue → verified`, `working → verified` when exempt; computed
// from work/red.txt, green.txt, blue.txt, rgb: exempt and the verdict; CONTRACT rule 2 status.json for BLOCKED).
// The nodes in both lists have the same record in both runs, so a correct matcher draws the same stepper twice.
const C25_F17: [string, number, Record<string, string>, string] = ['F17', 2, {
  '_orch/nodes/F17/handoff.md': '# F17',
  '_orch/nodes/F17/work/red.txt': 'red',
  '_orch/nodes/F17/work/green.txt': 'green',
  '_orch/nodes/F17/work/blue.txt': 'blue',
  '_orch/verify/F17-verdict.json': JSON.stringify({ verdict: 'CONFIRMED', criteria: [] }),
}, '●─●─●─●'] // expected: CONFIRMED -> verified, every step reached (README.md:116)
const C25_CONSOLIDATE: [string, number, Record<string, string>, string] = ['CONSOLIDATE', 2, {
  '_orch/nodes/CONSOLIDATE/handoff.md': '# CONSOLIDATE',
  '_orch/nodes/CONSOLIDATE/work/red.txt': 'red',
  '_orch/nodes/CONSOLIDATE/status.json': JSON.stringify({ node: 'CONSOLIDATE', verdict: 'BLOCKED' }),
}, '✗─○─○─○'] // expected: at red and BLOCKED, the current step flagged `✗` (E1 §m form; README.md:116)
const C25_L1 = c25Run('L1', [
  ['PLAN', 1, {
    '_orch/nodes/PLAN/handoff.md': '# PLAN',
    '_orch/nodes/PLAN/work/red.txt': 'red',
  }, '◉─○─○─○'], // expected: red only -> at red (README.md:116)
  ['alpha', 1, {
    '_orch/nodes/alpha/handoff.md': '# alpha\nrgb: exempt\n',
    '_orch/nodes/alpha/work/applied.md': 'x',
    '_orch/verify/alpha-verdict.json': JSON.stringify({ verdict: 'CONFIRMED', criteria: [] }),
  }, '●─●'], // expected: exempt and CONFIRMED -> `working → verified`, both reached (README.md:117)
  C25_F17,
  C25_CONSOLIDATE,
])
const C25_L2 = c25Run('L2', [
  ['F99', 1, {
    '_orch/nodes/F99/handoff.md': '# F99\nrgb: exempt\n',
    '_orch/nodes/F99/work/applied.md': 'x',
  }, '◉─○'], // expected: exempt and started -> at working (README.md:117)
  ['fix-xt17', 1, {
    '_orch/nodes/fix-xt17/handoff.md': '# fix-xt17',
    '_orch/nodes/fix-xt17/work/red.txt': 'red',
    '_orch/nodes/fix-xt17/work/green.txt': 'green',
    '_orch/nodes/fix-xt17/work/blue.txt': 'blue',
  }, '●─●─◉─○'], // expected: red, green, blue -> at blue (README.md:116; E1 §m `●─●─◉─○ blue`)
  C25_F17,
  C25_CONSOLIDATE,
])
const NO_NODE = 'no node'

/** What a label should match in a run, from that run's node list only: the label's token that is a listed node. */
function c25Expected(run: C25Run, label: string): string {
  const hits = label.split(/\s+/).filter((t) => run.nodes.includes(t))
  if (hits.length > 1) throw new Error('fixture: ' + label + ' names two nodes of ' + run.name)
  return hits[0] ?? NO_NODE // Q-15: "A row that matches nothing" -> no node's stepper
}

/**
 * The differential check of criterion 25 over the two runs' match results (label -> node id, or anything else for
 * "no node"). Returns every violation; [] when the matcher follows each run's own node list.
 */
function c25Differential(r1: Record<string, string>, r2: Record<string, string>): string[] {
  const bad: string[] = []
  const asNode = (run: C25Run, r: string) => (run.nodes.includes(r) ? r : NO_NODE)
  for (const label of C25_LABELS) {
    const e1 = c25Expected(C25_L1, label)
    const e2 = c25Expected(C25_L2, label)
    const toks = label.split(/\s+/)
    const oneList = toks.some((t) => C25_L1.nodes.includes(t) !== C25_L2.nodes.includes(t))
    const got = 'L1=' + r1[label] + ' L2=' + r2[label]
    if (oneList) {
      // (a) a label naming a node in exactly one list: a different result in each run, each agreeing with membership
      if (r1[label] === r2[label]) bad.push('(a) same result in both runs for "' + label + '": ' + got)
      if (asNode(C25_L1, r1[label]) !== e1) bad.push('(a) L1 "' + label + '": expected ' + e1 + ', ' + got)
      if (asNode(C25_L2, r2[label]) !== e2) bad.push('(a) L2 "' + label + '": expected ' + e2 + ', ' + got)
    } else {
      // (b) every id-shaped token in both lists or in neither: the same result in both runs
      if (r1[label] !== r2[label]) bad.push('(b) different results for "' + label + '": ' + got)
      if (asNode(C25_L1, r1[label]) !== e1 || asNode(C25_L2, r2[label]) !== e2) bad.push('(b) "' + label + '": expected L1=' + e1 + ' L2=' + e2 + ', ' + got)
    }
  }
  return bad
}

/** A refuting matcher's results in a run: its picked token, looked up in that run's node list, then phases (da5910c
 * workOf's /\b(P\d+)\b/ phase pick, ledger.mjs:138, kept beside the mutated node pick); else its fallback. */
function c25ViaPick(m: { pick: (s: string) => string | null; fallback: boolean }, run: C25Run): Record<string, string> {
  return Object.fromEntries(
    C25_LABELS.map((label) => {
      const tok = m.pick(label)
      const ph = /\b(P\d+)\b/.exec(label)
      const r = tok && run.nodes.includes(tok) ? tok : ph && run.phases.includes(ph[1]) ? 'phase ' + ph[1] : m.fallback ? 'lifecycle' : 'nothing'
      return [label, r]
    }),
  )
}

/** The node a drawn row's steps cell names in a run: the one node whose stepper it draws exactly, else what it draws. */
function c25Decode(run: C25Run, text: string): string {
  const exactly = (dots: string) => new RegExp('(?<![●◉○✗─])' + dots + '(?![─●◉○✗])')
  const ids = run.nodes.filter((id) => exactly(run.steps[id]).test(text))
  if (ids.length === 1) return ids[0]
  if (ids.length > 1) return 'ambiguous ' + ids.join('+')
  const any = /(?<![●◉○✗─])[●◉○✗](─[●◉○✗])+(?![─●◉○✗])/.exec(text)
  return any ? (LIFECYCLE.test(text) ? 'lifecycle ' : 'stepper ') + any[0] : 'nothing'
}

test("two node lists: a row label's match follows each run's own node list (differential)", async ($, on) => {
  // (c) each refuting matcher of verdicts r1-r4, committed beside this test, fails the differential check: it picks
  // its token without reading the node list, so a swapping label is wrong in one of the two runs.
  for (const m of C25_MUTANTS) {
    const bad = c25Differential(c25ViaPick(m, C25_L1), c25ViaPick(m, C25_L2))
    expect({ mutant: m.id, verdict: m.verdict, fails: bad.length > 0 }).toEqual({ mutant: m.id, verdict: m.verdict, fails: true })
  }

  // The plugin's own matcher, drawn over L1 and then over L2 (the same agents, the same labels).
  const files: Record<string, string> = { ...C25_L1.files }
  const dirs: Record<string, any[]> = { ...C25_L1.dirs }
  const clock = world(on, files, dirs)
  for (const [i, label] of C25_LABELS.entries()) await spawn($, 'w-c25-' + i, label, 'baton:worker')
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const results: Record<string, Record<string, string>> = {}
  for (const run of [C25_L1, C25_L2]) {
    for (const k of Object.keys(files)) delete files[k]
    for (const k of Object.keys(dirs)) delete dirs[k]
    Object.assign(files, run.files)
    Object.assign(dirs, run.dirs)
    // Re-read the run's record before drawing: `/baton status` makes the tracker observe afresh (how to drive it:
    // register.js statusText calls observe($, true) at da5910c; no expected value comes from it).
    await clock.advance(61000)
    await $.command.run({ command: 'baton', args: 'status' } as any)
    const ui = await pane($)
    results[run.name] = {}
    for (const label of C25_LABELS) results[run.name][label] = c25Decode(run, await row(ui, new RegExp('worker ' + esc(label) + '(?!\\S)')))
    await ui.unmount()
  }
  // (a) and (b): expected, every label's result follows its run's node list (Q-15; Q-T111-3 D)
  expect(c25Differential(results.L1, results.L2)).toEqual([])
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
