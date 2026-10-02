// baton v7 — the hooks module.
//
// A prime orchestrator that never reads: during an active run the main
// session keeps an allowlist of tools (Agent, AskUserQuestion, SendMessage,
// ToolSearch, the mod's memory tools) and everything else is refused with the
// route. Subagents (sub-orchestrators, workers, verifiers) pass untouched.
//
// A run is active when the session's directory holds _orch/manifest.json with
// "prime": true (what /baton start writes), or /baton start ran here.

import { guardDecision, isPrimeCall, manifestIsPrime, VERIFIED_AGENTID_VERSION } from '../lib/guard.mjs'
import { clampBytes, fallbackMerge, MERGE_SYSTEM, mergePrompt } from '../lib/memcore.mjs'
import { bindModel, CHEAP, FRONTIER } from '../lib/binding.mjs'
import { byId, gaugeColor, gaugeLine, ledgerLine, parseLedger, spinnerSuffix, summarizeNodes } from '../lib/view.mjs'

// ------------------------------------------------------------------ state

const run = {
  checkedAt: -1e12, // when the manifest was last read (ms)
  active: false, // the cached answer
  manifest: null, // the parsed manifest, when active
  startedHere: false, // /baton start ran in this module's lifetime
}

// What the guard learned about agentId at run time.
const probe = {
  version: null, // the engine version at load
  verified: false, // a subagent's tool call carried its agentId
  notice: null, // set when agentId behaviour could not be confirmed
  spawned: new Set(), // agentIds agent.spawn handed back
  seen: new Set(), // agentIds seen on tool.call
  denied: 0, // prime denials so far
  deniedWhileLive: 0, // prime denials while a spawned subagent had not finished
}

const MANIFEST_TTL_MS = 1500

// The plugin's userConfig, with defaults (register() fills it).
const config = { rotateAtPercent: 35, wakeBudgetLines: 96, memoryDir: '.baton/memory', autoRotate: true }

// The cheap tier: merges are compressed here, never by a subagent.
const CHEAP_MODEL = CHEAP
const FRONTIER_MODEL = FRONTIER

// Subagents the prime spawned directly: agentId -> { type, description, name }.
// Their returns become run-memory notes.
const spawnedByPrime = new Map()
// Returns already noted from a SubagentHandback call, so turn.complete does not note them twice.
const handedBack = new Set()

const memory = {
  toolsRegistered: false,
  merging: false, // a merge pass is running
  again: false, // a note arrived during a merge pass
  notes: 0, // notes this module appended
  lastStats: null, // { run, project } from memo stats, for the pane
}

// Rotation: the prime compacts into its memory instead of carrying its context.
const rotation = {
  count: 0, // rotations (any compaction during a run) this session
  inFlight: false, // a plugin compaction is being attempted
  pendingWake: false, // the next prime turn must start with memory_wake
  lastPercent: null, // the last measured context percent
  window: null, // the context window, tokens
  tokens: null, // the last measured context tokens
  armed: true, // re-armed when the percent falls back under the threshold
  lastAt: null, // ISO time of the last rotation
  lastTrigger: null, // plugin | auto | manual
  lastError: null, // why the last compaction attempt was refused
  compacting: null, // the attempt in progress, so two callers share one
  owed: false, // interactive /baton rotate: the ticker compacts once the command returns
  owedTicks: 0,
  ticker: null, // the session.start timer that runs owed compactions
  awaitingCompact: false, // headless /baton rotate: the next /compact is this rotation
}

const WAKE_CONTEXT =
  'baton: this session was just rotated — the conversation was compacted and your context now holds only the summary. ' +
  'Before anything else, call mcp__baton__memory_wake and continue the run from what it shows (memory_zoom / memory_recall open older stretches). ' +
  'You still never read files or run commands: dispatch a sub-orchestrator for anything that needs reading.'

const COMPACT_INSTRUCTIONS =
  'This is a baton prime rotation. The run memory (mcp__baton__memory_wake) holds the run; keep only the run id, mode, target, ' +
  'the current phase, what the prime is waiting on, and the instruction to call memory_wake first. Drop file contents, tool output and narration.'

// The pane: which tab, and what the last refresh read (render hooks do no I/O).
const PANE = 'baton'
const TABS = [
  { id: 'run', label: 'Run', hotkey: '1' },
  { id: 'memory', label: 'Memory', hotkey: '2' },
  { id: 'ledger', label: 'Ledger', hotkey: '3' },
  { id: 'luminaries', label: 'Luminaries', hotkey: '4' },
]
const pane = {
  open: false,
  tab: 'run',
  timer: null,
  refreshedAt: null,
  data: { run: ['(not read yet)'], memory: ['(not read yet)'], ledger: ['(not read yet)'], luminaries: ['(not read yet)'] },
  memoryNotes: null, // run-memory note count, for the band
}

// What the prime is doing now, for the spinner: its live dispatches.
const live = new Map() // agentId -> label

const MEMORY_TOOLS = [
  {
    name: 'memory_wake',
    description:
      "baton run memory: the run so far in a fixed budget of lines — recent notes verbatim, older ones merged into summaries, oldest most compressed. Call it FIRST after a rotation (a compaction), and whenever you need the run's state; it replaces reading files.",
    inputSchema: { type: 'object', properties: { budget: { type: 'integer', minimum: 4, maximum: 400, description: 'most lines to show (default from config)' } } },
  },
  {
    name: 'memory_note',
    description:
      "baton run memory: append ONE line (≤280 bytes; longer is cut) — a decision, a parked node, an operator answer, what you are waiting on, a route you chose. Sub-orchestrator returns are noted automatically; do not repeat them.",
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'one line, at most 280 bytes' } }, required: ['text'] },
  },
  {
    name: 'memory_zoom',
    description: 'baton run memory: open a stretch of notes back up, e.g. "40-71" (inclusive note numbers from memory_wake). A wide range is shown within the budget, finest at its end.',
    inputSchema: { type: 'object', properties: { range: { type: 'string', description: 'lo-hi, as the #lo-hi labels in memory_wake' }, budget: { type: 'integer', minimum: 4, maximum: 400 } }, required: ['range'] },
  },
  {
    name: 'memory_recall',
    description: 'baton run memory: every note and summary matching a regex (case-insensitive), newest notes last. Use it for a node id, a question id, a criterion, an operator decision.',
    inputSchema: { type: 'object', properties: { pattern: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 200 } }, required: ['pattern'] },
  },
  {
    name: 'project_wake',
    description:
      "baton project memory (spans runs): decisions, criteria fixtures, what failed before. Fixed-budget view like memory_wake. A luminary passes namespace \"luminary-<name>\" to read its own memory of past reviews.",
    inputSchema: { type: 'object', properties: { namespace: { type: 'string' }, budget: { type: 'integer', minimum: 4, maximum: 400 } } },
  },
  {
    name: 'project_note',
    description:
      'baton project memory (spans runs): append ONE line (≤280 bytes) worth knowing in the next run — a decision and its reason, a criterion that proved vacuous, a route that failed. A luminary passes namespace "luminary-<name>" for what it found, missed, or had overturned.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, namespace: { type: 'string' } }, required: ['text'] },
  },
  {
    name: 'project_recall',
    description: 'baton project memory (spans runs): notes and summaries matching a regex; optional namespace as in project_wake.',
    inputSchema: { type: 'object', properties: { pattern: { type: 'string' }, namespace: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 200 } }, required: ['pattern'] },
  },
]

/** Is a baton run active? Reads _orch/manifest.json at most every MANIFEST_TTL_MS. */
async function runActive($) {
  const now = Date.now()
  if (now - run.checkedAt < MANIFEST_TTL_MS) return run.active || run.startedHere
  run.checkedAt = now
  let text = null
  try {
    text = await $.fs.read('_orch/manifest.json')
  } catch {
    text = null
  }
  run.active = manifestIsPrime(text)
  try {
    run.manifest = run.active ? JSON.parse(text) : null
  } catch {
    run.manifest = null
  }
  return run.active || run.startedHere
}

function forgetRunCache() {
  run.checkedAt = -1e12
}

// ------------------------------------------------------------------ memory plumbing
//
// The hooks module has no Node file system, and $.fs has neither append nor
// an exclusive create (no lock), so the mod drives the store through the
// memo CLI the plugin ships: one implementation, one lock, for the mod, the
// CLI and any other session writing the same memory.

async function memoRun($, args, stdin) {
  const argv = ['node', $.plugin.root + '/bin/memo.mjs', ...args]
  const r = await $.process.run(argv, stdin === undefined ? { timeoutMs: 20000 } : { stdin, timeoutMs: 20000 })
  if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout || 'memo exited ' + r.exitCode).trim())
  return r.stdout
}

function cleanNamespace(ns) {
  const s = String(ns ?? '').replace(/[^A-Za-z0-9_.\-]/g, '').slice(0, 64)
  return s || null
}

/** The memo flags that select a memory: 'run' (this run's _orch/memory) or 'project'. */
async function memoryArgs($, which, namespace) {
  let dir
  if (which === 'run') {
    dir = (await $.session.cwd()) + '/_orch/memory'
  } else {
    const md = String(config.memoryDir || '.baton/memory')
    dir = md.startsWith('/') ? md : (await $.session.root()) + '/' + md
  }
  const ns = cleanNamespace(namespace)
  return ns ? ['--dir', dir, '--ns', ns] : ['--dir', dir]
}

async function registerMemoryTools($) {
  if (memory.toolsRegistered) return
  for (const t of MEMORY_TOOLS) await $.tool.register(t)
  memory.toolsRegistered = true
}

/** Append a note; schedule the merges it completed. Returns the CLI's line. */
async function appendNote($, which, text, tag, namespace) {
  const args = await memoryArgs($, which, namespace)
  const out = await memoRun($, [...args, '--json', 'note', '--tag', tag, '-'], text)
  const r = JSON.parse(out)
  memory.notes++
  if (which === 'run' && !namespace) pane.memoryNotes = r.index + 1
  if (r.merges && r.merges.length) scheduleMerge($, which, namespace)
  $.ui.invalidate('ui.render')
  return 'noted #' + r.index + (r.truncated ? ' (cut to 280 bytes: ' + r.text.length + ' chars kept)' : '')
}

const mergeQueue = new Map() // key -> { which, namespace }

function scheduleMerge($, which, namespace) {
  mergeQueue.set(which + '|' + (namespace ?? ''), { which, namespace })
  if (memory.merging) {
    memory.again = true
    return
  }
  memory.merging = true
  $.clock.after(0, () => mergePass($))
}

/**
 * Run the ready merges of every queued memory, in the background: each one is
 * compressed by the cheap model with a strict ≤280-byte prompt; a call that
 * does not answer falls back to the deterministic merge so the tree never
 * stalls. Loops until nothing is ready (a merge can make its parent ready).
 */
async function mergePass($) {
  try {
    for (let round = 0; round < 64; round++) {
      memory.again = false
      const jobs = [...mergeQueue.values()]
      mergeQueue.clear()
      let did = 0
      for (const job of jobs) {
        const args = await memoryArgs($, job.which, job.namespace)
        const ready = JSON.parse(await memoRun($, [...args, '--json', 'pending', '--ready', '--texts']))
        if (!ready.length) continue
        const lines = []
        for (const item of ready.slice(0, 16)) {
          let summary = null
          try {
            const r = await $.model.complete({
              model: CHEAP_MODEL,
              system: MERGE_SYSTEM,
              prompt: mergePrompt(item, item.texts),
              maxTokens: 200,
              effort: 'low',
              timeoutMs: 45000,
            })
            if (r.isAnswered) summary = clampBytes(r.text.split('\n').map((x) => x.trim()).filter(Boolean).join(' ')).text
          } catch {}
          if (!summary) summary = fallbackMerge(item.texts)
          lines.push(JSON.stringify({ level: item.level, index: item.index, summary }))
        }
        await memoRun($, [...args, '--json', 'merge', '--summarize'], lines.join('\n') + '\n')
        did += lines.length
        mergeQueue.set(job.which + '|' + (job.namespace ?? ''), job) // its parents may be ready now
      }
      if (!did && !memory.again) break
    }
  } catch (err) {
    $.ui.log('baton: memory merge failed: ' + (err && err.message ? err.message : String(err)))
  } finally {
    memory.merging = false
    $.ui.invalidate('ui.render')
  }
}

/** Note the one-line return of a subagent the prime dispatched. True when a note was written. */
async function noteReturn($, agentId, text) {
  if (!(await runActive($))) return false
  const who = spawnedByPrime.get(agentId)
  const line = firstLine(text)
  if (!who || !line) return false
  const role = String(who.type ?? 'agent').replace(/^baton:/, '')
  const tag = role === 'sub-orchestrator' ? 'sub' : role.slice(0, 16)
  const label = who.name || who.description
  try {
    await appendNote($, 'run', (label ? label + ': ' : '') + line, tag)
    return true
  } catch (err) {
    $.ui.log('baton: could not note a return: ' + err.message)
    return false
  }
}

function firstLine(text) {
  for (const l of String(text ?? '').split('\n')) {
    const t = l.replace(/^[#>*\-\s`]+/, '').trim()
    if (t) return t
  }
  return ''
}

// ------------------------------------------------------------------ rotation

/** One ≤280-byte line the prime would hand itself, from a fork of its own conversation. */
async function handoffLine($, percent) {
  try {
    const r = await $.model.fork({
      prompt:
        'baton rotation: your context is about to be compacted. Reply with ONE line of at most 280 bytes for your future self: ' +
        'current phase, what you are waiting on, and your next step. The line only.',
    })
    if (r.isAnswered && r.text.trim()) return firstLine(r.text)
  } catch {}
  return 'rotation at ' + (percent ?? '?') + '% — no handoff line; memory_wake for the state'
}

/**
 * Rotate the prime: a handoff note, then a compaction, then (on the next
 * prime turn) memory_wake. Compaction is refused while a turn runs, so it is
 * retried on the clock until the session is idle (up to ~60 s).
 */
async function writeHandoff($, why) {
  try {
    const line = await handoffLine($, rotation.lastPercent)
    await appendNote($, 'run', 'handoff (' + why + '): ' + line, 'handoff')
  } catch (err) {
    $.ui.log('baton: handoff note failed: ' + err.message)
  }
}

/** One compaction attempt (joined, if one is already running). Resolves { ok, text }; never throws. */
async function compactOnce($) {
  if (rotation.compacting) return rotation.compacting
  rotation.compacting = compactAttempt($)
  try {
    return await rotation.compacting
  } finally {
    rotation.compacting = null
  }
}

async function compactAttempt($) {
  try {
    const before = rotation.count
    const r = await $.session.compact({ instructions: COMPACT_INSTRUCTIONS })
    if (r && r.skip) {
      $.ui.log('baton: rotation skipped: ' + r.skip)
      return { ok: true, text: 'skipped: ' + r.skip }
    }
    // The session.compact hook counts it; a plugin's own call may skip this
    // module's hooks (the engine's recursion guard), so count it here then.
    if (rotation.count === before) await countRotation($, 'plugin')
    return { ok: true, text: 'rotated (#' + rotation.count + ')' }
  } catch (err) {
    rotation.lastError = err && err.message ? err.message : String(err)
    return { ok: false, text: rotation.lastError }
  }
}

/**
 * Retry a compaction on the clock until the session is idle (~60 s): the
 * threshold's rotation is scheduled right after a turn, which may still be
 * closing when the clock fires.
 */
async function compactWhenIdle($) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const r = await compactOnce($)
    if (r.ok) {
      rotation.inFlight = false
      return r.text
    }
    if (/headless/.test(r.text)) {
      rotation.inFlight = false
      $.ui.log('baton: automatic rotation needs an interactive session on this build (' + r.text + '); the handoff note is written — a /compact now completes the rotation')
      return 'headless: ' + r.text
    }
    await $.clock.sleep(2000)
  }
  rotation.inFlight = false
  $.ui.log('baton: rotation gave up — compaction kept refusing: ' + rotation.lastError)
  return 'gave up: compaction kept refusing (' + rotation.lastError + ')'
}

/** The threshold's rotation, off the clock: handoff note, then compaction when idle. */
async function rotate($, why) {
  if (rotation.inFlight) return 'a rotation is already in flight'
  rotation.inFlight = true
  await writeHandoff($, why)
  return compactWhenIdle($)
}

/** Record one rotation: count it, arm the wake, persist the count per run. */
async function countRotation($, trigger) {
  rotation.count++
  rotation.pendingWake = true
  rotation.lastAt = new Date(Date.now()).toISOString()
  rotation.lastTrigger = trigger
  rotation.lastPercent = null
  $.ui.log('baton: rotation #' + rotation.count + ' (' + trigger + ') — the prime wakes from memory next turn')
  $.ui.invalidate('ui.render')
  try {
    const key = 'rotations:' + ((run.manifest && run.manifest.run_id) || 'session')
    const prev = Number((await $.store.get(key)) ?? 0)
    await $.store.set(key, prev + 1)
  } catch {}
}

/** Text that tells the prime to wake, once. */
function takeWake() {
  if (!rotation.pendingWake) return null
  rotation.pendingWake = false
  return WAKE_CONTEXT + ' (rotation #' + rotation.count + ')'
}

// ------------------------------------------------------------------ /baton

function makeRunId(mode, iso) {
  return String(mode).toLowerCase() + '-' + iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
}

const MODES = ['BUILD', 'CRAFT', 'DOGFOOD', 'GENERIC', 'IMPROVE', 'MIGRATE', 'POSITION', 'REVIEW', 'ROADMAP', 'TEST']

function kickoff(m) {
  return (
    'baton v7 run ' + m.run_id + ' started — MODE ' + m.mode + ', TARGET ' + m.target + '. You are the PRIME orchestrator. ' +
    'Load the baton skill (Skill "baton:baton") for your standing orders. In short: you never read, run or edit anything — the mod refuses it; ' +
    'you dispatch. First dispatch one baton:sub-orchestrator to bootstrap the run (directive from the mode file, cast, plan, plan verification) ' +
    'and return one line. Then dispatch one sub-orchestrator per phase. Note decisions with memory_note; after a rotation call memory_wake first.'
  )
}

async function batonStart($, args) {
  const [modeRaw, ...rest] = String(args ?? '').trim().split(/\s+/).filter(Boolean)
  const mode = String(modeRaw ?? '').toUpperCase()
  const target = rest.join(' ')
  if (!MODES.includes(mode) || !target) {
    return 'usage: /baton start <MODE> <TARGET>  — MODE is one of ' + MODES.join(', ') + '; TARGET a path, spec, URL or one-line goal'
  }
  let existing = null
  try {
    existing = JSON.parse(await $.fs.read('_orch/manifest.json'))
  } catch {}
  if (existing && existing.prime === true && existing.closed !== true) {
    return 'a baton run is already active here: ' + existing.run_id + ' (/baton stop closes it)'
  }
  if (existing && !existing.prime) {
    return '_orch/ here holds another run (' + (existing.run_id ?? 'unknown') + '); archive it first (tar czf baton-run.tar.gz _orch && rm -rf _orch)'
  }
  const now = new Date(Date.now()).toISOString()
  // Where baton's prompts and rules live: the checkout this plugin sits in, else the published main.
  const local = $.plugin.root.replace(/\/mod\/?$/, '')
  let batonBase = 'https://raw.githubusercontent.com/ckluis/baton/main'
  try {
    if (local !== $.plugin.root && (await $.fs.exists(local + '/prompt/baton.md'))) batonBase = local
  } catch {}
  const m = {
    run_id: makeRunId(mode, now),
    mode,
    target,
    prime: true,
    baton: '7.0.0-dev',
    baton_base: batonBase,
    started_at: now,
    models: { frontier: FRONTIER_MODEL, cheap: CHEAP_MODEL },
    memory: { run: '_orch/memory', project: config.memoryDir },
    rotate_at_percent: config.rotateAtPercent,
    wake_budget_lines: config.wakeBudgetLines,
    phase: 'bootstrap',
  }
  await $.fs.write('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  run.startedHere = true
  forgetRunCache()
  await registerMemoryTools($)
  await appendNote($, 'run', 'run ' + m.run_id + ' started: MODE ' + mode + ', TARGET ' + target, 'operator')
  $.ui.invalidate('ui.render')
  // Start the prime's first turn once the command returns (not awaited: it resolves when the turn starts).
  $.prompt.submit({ text: kickoff(m) }).catch(() => {})
  return 'baton run ' + m.run_id + ' started (MODE ' + mode + ', TARGET ' + target + '). The prime guard is armed: the main session may only dispatch, ask and use memory.'
}

async function batonStop($) {
  let m = null
  try {
    m = JSON.parse(await $.fs.read('_orch/manifest.json'))
  } catch {}
  run.startedHere = false
  forgetRunCache()
  if (!m || m.prime !== true) return 'no baton v7 run is active here'
  m.closed = true
  m.closed_at = new Date(Date.now()).toISOString()
  await $.fs.write('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  try {
    await appendNote($, 'run', 'run closed by the operator (/baton stop)', 'operator')
  } catch {}
  $.ui.invalidate('ui.render')
  return 'baton run ' + m.run_id + ' closed; the prime guard is off. _orch/ stays as the record.'
}

/** The text form of the run's state: `/baton status`, and the pane where nothing draws. */
async function statusText($) {
  const active = await runActive($)
  const m = run.manifest
  const lines = []
  lines.push(active && m ? 'baton run ' + m.run_id + ' — MODE ' + m.mode + ', TARGET ' + m.target + ', phase ' + (m.phase ?? '?') : 'no baton v7 run is active here')
  lines.push(
    'context ' + (rotation.lastPercent ?? '?') + '% (' + (config.autoRotate ? 'rotate at ' + config.rotateAtPercent + '%' : 'auto-rotation off: BATON_AUTOROTATE=0') + ') · rotations ' + rotation.count +
      (rotation.lastAt ? ' (last ' + rotation.lastAt + ', ' + rotation.lastTrigger + ')' : ''),
  )
  lines.push('guard ' + (active ? 'armed' : 'off') + ' · prime denials ' + probe.denied + ' · agentId ' + (probe.verified ? 'verified' : 'unverified') + (probe.notice ? ' — ' + probe.notice : ''))
  if (active) {
    try {
      const s = JSON.parse(await memoRun($, [...(await memoryArgs($, 'run')), '--json', 'stats']))
      lines.push('run memory: ' + s.notes + ' notes, ' + s.summaries + '/' + s.treeCapacity + ' summaries, ' + s.pending + ' merges pending')
    } catch (err) {
      lines.push('run memory: unreadable (' + err.message + ')')
    }
  }
  return lines.join('\n')
}

// ------------------------------------------------------------------ the pane

async function readJson($, path) {
  try {
    return JSON.parse(await $.fs.read(path))
  } catch {
    return null
  }
}

async function listDir($, path) {
  try {
    return await $.fs.list(path)
  } catch {
    return null
  }
}

/** Read _orch and the memories once, into pane.data. Every read is allowed to fail. */
async function refreshPane($, paneRows) {
  const budget = Math.max(8, Math.min(200, (paneRows ?? 30) - 4))
  const d = {}
  // Run
  const m = await readJson($, '_orch/manifest.json')
  if (!m) {
    d.run = ['no _orch/ here — /baton start <MODE> <TARGET> begins a run']
  } else {
    const lines = [
      (m.prime ? (m.closed ? 'closed' : 'active') : 'v5 run (no prime guard)') + ' · ' + (m.run_id ?? '?') + ' · ' + (m.mode ?? '?') + ' · ' + (m.target ?? ''),
      'phase ' + (m.phase ?? '?') + ' · rotations ' + rotation.count + ' · context ' + (rotation.lastPercent ?? '—') + '%' + ' · guard ' + (run.active || run.startedHere ? 'armed' : 'off'),
    ]
    if (live.size) lines.push('dispatched now: ' + [...live.values()].join(', '))
    const phases = (await listDir($, '_orch/phases')) ?? []
    const phaseRows = []
    for (const p of phases.filter((x) => x.kind === 'directory').map((x) => x.name).sort(byId).slice(-12)) {
      const env = await readJson($, '_orch/phases/' + p + '/envelope.json')
      phaseRows.push(p + ' ' + (env ? env.verdict ?? '?' : 'open') + (env && env.summary ? ' — ' + env.summary : ''))
    }
    if (phaseRows.length) lines.push('', 'phases:', ...phaseRows.map((x) => '  ' + x))
    const nodeDirs = ((await listDir($, '_orch/nodes')) ?? []).filter((x) => x.kind === 'directory').map((x) => x.name).sort(byId).slice(0, 300)
    const nodes = []
    for (const id of nodeDirs) {
      const st = await readJson($, '_orch/nodes/' + id + '/status.json')
      nodes.push({ id, verdict: st ? st.verdict ?? '?' : 'pending' })
    }
    const sum = summarizeNodes(nodes)
    lines.push('', sum.line)
    for (const n of sum.open.slice(0, 20)) lines.push('  ' + n.id + ' ' + n.verdict)
    d.run = lines
  }
  // Memory
  try {
    const w = JSON.parse(await memoRun($, [...(await memoryArgs($, 'run')), '--json', 'wake', '--budget', String(budget)]))
    const s = JSON.parse(await memoRun($, [...(await memoryArgs($, 'run')), '--json', 'stats']))
    pane.memoryNotes = s.notes
    d.memory = [
      'tree: ' + s.notes + ' notes · ' + s.summaries + '/' + s.treeCapacity + ' summaries · ' + s.levels + ' levels · ' + s.pending + ' merges pending',
      'wake view (' + w.tiles.length + ' blocks, budget ' + budget + '):',
      ...w.lines,
    ]
  } catch (err) {
    d.memory = ['run memory unreadable: ' + err.message]
  }
  // Ledger: row files (rule 6.3), then the v4/v5 single file
  const rows = []
  const files = ((await listDir($, '_orch/ledger')) ?? []).filter((x) => x.kind === 'file' && x.name.endsWith('.csv')).map((x) => x.name).sort().slice(-15)
  for (const f of files) {
    try {
      rows.push(...parseLedger(await $.fs.read('_orch/ledger/' + f)))
    } catch {}
  }
  try {
    rows.push(...parseLedger(await $.fs.read('_orch/ledger.csv')).slice(-15))
  } catch {}
  rows.sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
  d.ledger = rows.length ? rows.slice(-15).map(ledgerLine) : ['no ledger rows yet']
  // Luminaries: namespaces luminary-* of the project memory
  try {
    const args = await memoryArgs($, 'project')
    const nsDir = args[1] + '/ns'
    const lum = ((await listDir($, nsDir)) ?? []).filter((x) => x.kind === 'directory' && x.name.startsWith('luminary-')).map((x) => x.name).sort().slice(0, 12)
    const out = []
    for (const ns of lum) {
      try {
        const st = JSON.parse(await memoRun($, [...args, '--ns', ns, '--json', 'stats']))
        const last = JSON.parse(await memoRun($, [...args, '--ns', ns, '--json', 'wake', '--budget', '1']))
        out.push(ns.slice('luminary-'.length) + ' · ' + st.notes + ' notes', '  ' + (last.lines.at(-1) ?? ''))
      } catch {}
    }
    d.luminaries = out.length ? out : ['no luminary has a memory yet (project memory ' + args[1] + ')']
  } catch (err) {
    d.luminaries = ['project memory unreadable: ' + err.message]
  }
  pane.data = d
  pane.refreshedAt = new Date(Date.now()).toISOString().slice(11, 19)
  $.ui.invalidate('ui.render')
}

/** Every tab as text, for `claude -p` and any surface that draws nothing. */
function paneText() {
  return TABS.map((t) => '## ' + t.label + '\n' + pane.data[t.id].join('\n')).join('\n\n')
}

/** Serve one memory tool call. */
async function serveMemoryTool($, e) {
  const name = String(e.tool).slice('mcp__baton__'.length)
  const budget = Number.isInteger(e.budget) ? e.budget : config.wakeBudgetLines
  try {
    switch (name) {
      case 'memory_wake':
        return { result: await memoRun($, [...(await memoryArgs($, 'run')), 'wake', '--budget', String(budget)]) }
      case 'memory_note':
        return { result: await appendNote($, 'run', String(e.text ?? ''), e.agentId ? 'agent' : 'prime') }
      case 'memory_zoom':
        return { result: await memoRun($, [...(await memoryArgs($, 'run')), 'zoom', '--budget', String(budget), '--', String(e.range ?? '')]) }
      case 'memory_recall':
        return { result: await memoRun($, [...(await memoryArgs($, 'run')), 'recall', '--limit', String(e.limit ?? 20), '--', String(e.pattern ?? '')]) }
      case 'project_wake':
        return { result: await memoRun($, [...(await memoryArgs($, 'project', e.namespace)), 'wake', '--budget', String(budget)]) }
      case 'project_note':
        return { result: await appendNote($, 'project', String(e.text ?? ''), e.namespace ? 'luminary' : e.agentId ? 'agent' : 'prime', e.namespace) }
      case 'project_recall':
        return { result: await memoRun($, [...(await memoryArgs($, 'project', e.namespace)), 'recall', '--limit', String(e.limit ?? 20), '--', String(e.pattern ?? '')]) }
      default:
        return { result: 'baton: no memory tool named ' + name }
    }
  } catch (err) {
    return { result: 'baton memory error: ' + (err && err.message ? err.message : String(err)) }
  }
}

export function register(on, options) {
  if (options) {
    if (Number.isFinite(Number(options.rotateAtPercent))) config.rotateAtPercent = Number(options.rotateAtPercent)
    if (Number.isFinite(Number(options.wakeBudgetLines))) config.wakeBudgetLines = Math.max(4, Math.floor(Number(options.wakeBudgetLines)))
    if (options.memoryDir) config.memoryDir = String(options.memoryDir)
  }

  // ---------------------------------------------------------------- load

  on('session.start', async ($, e, next) => {
    // BATON_AUTOROTATE=0: never rotate on the measured threshold; only /baton rotate does
    // (experiment E1 drives rotation at fixed indices to match its compaction arm).
    try {
      const auto = await $.env.get('BATON_AUTOROTATE')
      config.autoRotate = !(auto !== undefined && auto !== null && /^(0|false|off|no)$/i.test(String(auto).trim()))
    } catch {}
    try {
      const v = await $.session.version()
      probe.version = v.base ?? v.version
      if (!String(probe.version).startsWith(VERIFIED_AGENTID_VERSION)) {
        probe.notice =
          `baton: the prime guard tells the prime from a subagent by tool.call's agentId, verified on Claude Code ` +
          `${VERIFIED_AGENTID_VERSION}; this is ${probe.version}. The guard fails closed: a call without agentId ` +
          `is treated as the prime's. If subagents report "is not a prime tool", agentId has changed — /baton stop.`
        $.ui.log(probe.notice)
      }
    } catch {
      probe.notice = 'baton: could not read the engine version; the prime guard fails closed (no agentId = prime).'
      $.ui.log(probe.notice)
    }
    // The memory tools exist for a run; a session with none sees no new tools.
    if (await runActive($)) {
      try {
        await registerMemoryTools($)
      } catch (err) {
        $.ui.log('baton: could not register the memory tools: ' + err.message)
      }
    }
    // The rotation ticker: runs a compaction /baton rotate owes, from outside
    // any command's frame (see the command). Cheap when idle: one flag check.
    if (!rotation.ticker) {
      try {
        rotation.ticker = $.clock.every(150, async () => {
          if (!rotation.owed || rotation.compacting) return
          const r = await compactOnce($)
          rotation.owedTicks++
          if (r.ok || /headless/.test(r.text) || rotation.owedTicks > 400) {
            rotation.owed = false
            rotation.inFlight = false
            if (!r.ok) $.ui.log('baton: /baton rotate could not compact: ' + r.text)
          }
        })
      } catch {}
    }
    // Registered last: a refused name throws, and nothing after it would run.
    try {
      await $.command.register({
        name: 'baton',
        description: 'baton v7: start | stop | rotate | status — or no argument for the run pane',
        argumentHint: '[start <MODE> <TARGET> | stop | rotate | status]',
        immediate: true,
      })
    } catch (err) {
      $.ui.log('baton: /baton not registered: ' + err.message)
    }
    return next(e)
  })

  // ---------------------------------------------------------------- the prime guard

  on('tool.call', async ($, e, next) => {
    if (!isPrimeCall(e)) {
      if (!probe.seen.has(e.agentId)) {
        probe.seen.add(e.agentId)
        if (probe.spawned.has(e.agentId) && !probe.verified) probe.verified = true
      }
      // Where subagents report through a SubagentHandback tool, that call carries the return.
      if (e.tool === 'SubagentHandback' && spawnedByPrime.has(e.agentId)) {
        const r = await next(e)
        if (!r.deny && (await noteReturn($, e.agentId, e.message))) handedBack.add(e.agentId)
        return r
      }
      return next(e)
    }
    const active = await runActive($)
    const verdict = guardDecision(e, active)
    if (!verdict) {
      // Third path for the wake: if neither SessionStart nor a prompt carried
      // it, the prime's first tool call after a rotation does.
      const wake = active && rotation.pendingWake ? takeWake() : null
      if (!wake) return next(e)
      const r = await next(e)
      return r && !r.deny ? { ...r, context: [...(r.context ?? []), wake] } : r
    }
    probe.denied++
    const live = [...probe.spawned].some((id) => !probe.seen.has(id))
    if (live) probe.deniedWhileLive++
    $.ui.log('prime denied ' + e.tool + ' → dispatch a sub-orchestrator')
    return verdict
  }).catch(async ($, e, next) => {
    // Fail closed during a run: a guard that broke must not wave the prime through.
    if (isPrimeCall(e) && (run.active || run.startedHere)) {
      return { deny: 'baton: the prime guard failed (' + next.error.kind + '), so this call was refused. Dispatch a sub-orchestrator.' }
    }
    return next(e)
  })

  // ---------------------------------------------------------------- memory tools

  on('tool.call', { tool: /^mcp__baton__(memory|project)_/ }, async ($, e) => serveMemoryTool($, e))

  // ---------------------------------------------------------------- rotation

  on('session.measure', async ($, e, next) => {
    const ctx = e.context || {}
    if (typeof ctx.percent === 'number') {
      rotation.lastPercent = ctx.percent
      rotation.tokens = ctx.tokens ?? null
      rotation.window = ctx.window ?? null
      $.ui.invalidate('ui.render')
    }
    const pct = rotation.lastPercent
    if (typeof pct === 'number' && pct < config.rotateAtPercent) rotation.armed = true
    if (config.autoRotate && typeof pct === 'number' && pct >= config.rotateAtPercent && rotation.armed && !rotation.inFlight && (await runActive($))) {
      rotation.armed = false
      $.ui.log('baton: context at ' + pct + '% (≥ ' + config.rotateAtPercent + '%) — rotating the prime into memory')
      $.clock.after(250, () => rotate($, pct + '%'))
    }
    return next(e)
  })

  // Every compaction of the main conversation during a run is a rotation:
  // count it, and arm the wake for the prime's next turn.
  on('session.compact', async ($, e, next) => {
    if (e.agentId || e.trigger === 'precompute' || !(await runActive($))) return next(e)
    if (e.trigger !== 'plugin' && !rotation.awaitingCompact) {
      try {
        await appendNote($, 'run', 'compaction (' + e.trigger + ') at ' + (rotation.lastPercent ?? '?') + '% — memory_wake for the state', 'handoff')
      } catch {}
    }
    const r = await next(e)
    const asked = rotation.awaitingCompact
    rotation.awaitingCompact = false
    if (r && !r.skip) await countRotation($, asked ? 'baton rotate + /compact' : e.trigger)
    return r
  })

  // After a compaction the engine raises SessionStart with source "compact":
  // hand the prime the wake instruction there.
  on('classic.SessionStart', { source: 'compact' }, async ($, e, next) => {
    const r = await next(e)
    const wake = (await runActive($)) ? takeWake() : null
    if (!wake) return r
    return { ...(r || {}), additionalContext: [...((r && r.additionalContext) || []), wake] }
  })

  // Belt and braces for the wake: if no SessionStart carried it, this prompt does.
  on('prompt.submit', async ($, e, next) => {
    const wake = rotation.pendingWake && (await runActive($)) ? takeWake() : null
    if (!wake) return next(e)
    return next({ ...e, context: [...(e.context ?? []), wake] })
  })

  // ---------------------------------------------------------------- /baton

  on('command.run', { command: 'baton' }, async ($, e) => {
    const [sub, ...rest] = String(e.args ?? '').trim().split(/\s+/)
    switch ((sub || '').toLowerCase()) {
      case 'start':
        return { text: await batonStart($, rest.join(' ')) }
      case 'stop':
        return { text: await batonStop($) }
      case 'rotate': {
        if (!(await runActive($))) return { text: 'no baton run is active here; nothing to rotate' }
        if (rotation.inFlight || rotation.owed) return { text: 'baton: a rotation is already in flight' }
        await writeHandoff($, 'forced by /baton rotate')
        let surfaces = []
        try {
          surfaces = await $.session.surfaces()
        } catch {}
        if (!surfaces.length) {
          // Headless (-p / SDK): Claude Code 2.1.287 has no mod compaction here —
          // $.session.compact answers "not available in a headless session yet:
          // compaction here runs inside a turn (a /compact prompt)", and a command
          // hook may neither compact nor submit a prompt. The driver sends /compact;
          // the session.compact hook counts it as this rotation and arms the wake.
          rotation.awaitingCompact = true
          return {
            text:
              'baton: handoff noted; rotation #' + (rotation.count + 1) + ' armed. Headless session: a mod cannot compact here on this build, ' +
              'so send /compact next — baton counts that compaction as the rotation, and the prime calls memory_wake first.',
          }
        }
        // Interactive: a compaction started anywhere inside this hook is refused
        // ("it would compact under the turn this hook is holding"), so the
        // rotation ticker (started at session.start) runs it once this returns.
        rotation.owed = true
        rotation.owedTicks = 0
        rotation.inFlight = true
        return { text: 'baton: handoff noted; compacting as soon as this command returns (rotation #' + (rotation.count + 1) + ') — then the prime calls memory_wake first' }
      }
      case 'status':
        return { text: await statusText($) }
      default: {
        // No argument: the pane where something draws, its text where nothing does.
        let surfaces = []
        try {
          surfaces = await $.session.surfaces()
        } catch {}
        await refreshPane($, 30)
        if (!surfaces.length) return { text: (await statusText($)) + '\n\n' + paneText() }
        pane.open = true
        await $.ui.open({ id: PANE, title: 'baton', focus: true, closeOnEscape: true })
        try {
          if (!pane.timer) pane.timer = $.clock.every(5000, () => (pane.open ? refreshPane($, 30) : null))
        } catch {}
        return {}
      }
    }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) {
      pane.open = false
      if (pane.timer) {
        pane.timer.cancel()
        pane.timer = null
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const cols = e.props.bodyColumns ?? 80
    const tabs = TABS.map((t) =>
      Button({
        key: 'tab-' + t.id,
        label: t.label,
        hotkey: t.hotkey,
        plain: true,
        ...(pane.tab === t.id ? {} : { dimColor: true }),
        onPress: () => {
          pane.tab = t.id
          $.ui.invalidate('ui.render')
        },
      }),
    )
    tabs.push(Button({ key: 'refresh', label: 'refresh', hotkey: 'r', plain: true, dimColor: true, onPress: () => refreshPane($, (e.props.scroll && e.props.scroll.bodyRows) || 30) }))
    const body = (pane.data[pane.tab] ?? []).map((line, i) => Text({ key: 'l' + i, wrap: 'truncate-end', children: [String(line).slice(0, Math.max(20, cols * 2)) || ' '] }))
    return Box({
      flexDirection: 'column',
      children: [
        Box({ flexDirection: 'row', columnGap: 3, children: tabs }),
        Text({ dimColor: true, children: ['read ' + (pane.refreshedAt ?? 'never') + ' · Esc closes'] }),
        ...body,
      ],
    })
  })

  // The band above the prompt: the prime's context gauge and rotation count.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!(run.active || run.startedHere)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const theirs = await next(e)
    const line = gaugeLine({
      percent: rotation.lastPercent,
      threshold: config.rotateAtPercent,
      rotations: rotation.count,
      notes: pane.memoryNotes,
      phase: run.manifest && run.manifest.phase,
      width: e.props.bodyColumns,
    })
    const color = gaugeColor(rotation.lastPercent, config.rotateAtPercent)
    return Box({ flexDirection: 'column', children: [Text({ key: 'gauge', wrap: 'truncate-end', ...(color ? { color } : {}), children: [line] }), ...(theirs ? [theirs] : [])] })
  })

  // The spinner: which phase and node the prime is waiting on.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!(run.active || run.startedHere)) return next(e)
    const labels = [...live.values()]
    const node = labels.length > 1 ? labels.length + ' dispatched' : labels[0]
    return next({ ...e, props: { ...e.props, suffix: spinnerSuffix(e.props.suffix, run.manifest && run.manifest.phase, node) } })
  })

  // A subagent that finishes without one tool call carrying its id, while
  // prime-classified calls were being refused, is the signature of agentId
  // having gone missing: say so loudly (the guard stays closed).
  on('turn.complete', async ($, e, next) => {
    if (e.agentId && live.delete(e.agentId)) $.ui.invalidate('ui.render')
    if (!e.agentId && pane.open) $.clock.after(0, () => refreshPane($, 30))
    // A subagent the prime dispatched returned: its one line becomes a note
    // (unless its SubagentHandback call already carried it).
    if (e.agentId && spawnedByPrime.has(e.agentId) && !e.isAborted) {
      if (handedBack.has(e.agentId)) handedBack.delete(e.agentId)
      else await noteReturn($, e.agentId, e.answer)
    }
    if (e.agentId && probe.spawned.has(e.agentId) && !probe.seen.has(e.agentId) && probe.deniedWhileLive > 0 && !probe.verified) {
      probe.notice =
        'baton: a subagent finished with no tool call carrying its agentId while prime-classified calls were refused — ' +
        'agentId detection may be broken on this build. The guard fails closed; /baton stop to release the session.'
      $.ui.log(probe.notice)
    }
    return next(e)
  })

  // The binding: during a run every spawn runs on the model its role names,
  // whatever the caller asked for (opus for prime-side roles, sonnet for -cheap).
  on('agent.spawn', async ($, e, next) => {
    let input = e
    if (await runActive($)) {
      const model = bindModel(e)
      if (model && e.model !== model) {
        input = { ...e, model }
        if (e.model) $.ui.log('baton: ' + (e.subagentType || 'agent') + ' bound to ' + model + ' (asked for ' + e.model + ')')
      }
    }
    const r = await next(input)
    if (r && r.agentId) {
      probe.spawned.add(r.agentId)
      if (!e.parentAgentId) {
        spawnedByPrime.set(r.agentId, { type: e.subagentType, description: e.description, name: e.name })
        live.set(r.agentId, String(e.name || e.description || e.subagentType || 'agent').slice(0, 32))
        $.ui.invalidate('ui.render')
      }
    }
    return r
  })
}
