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
import { activeRulings, enforcedHit, fallbackRuling, isOperatorPrompt, parseEnforce, parseRuling, RULING_SYSTEM, rulingLine, rulingPrompt, RULINGS_HEAD } from '../lib/rulings.mjs'
import { addSpawn, addToolCall, chain, finishAgent, newTree, PRIME, treeRows } from '../lib/agents.mjs'
import { langOf } from '../lib/codeidx.mjs'
import { quietText } from '../lib/quiet.mjs'
import { contextNudge, contextOf, costOf, ctxTone, shortUsd, windowFor } from '../lib/ledger.mjs'
import { addUsage, boardColumn, budgetCheck, FORBIDDEN_DEFAULT, forbiddenHits, gitAddPaths, goalLabel, isRoundSpawn, LABEL_COLORS, LABEL_PREFIX, parseBlockedBy, shortTokens, spendMarkdown, workOf } from '../lib/ledger.mjs'
import { stepperMini, stepperMiniText } from '../lib/track.mjs'
import { agentTable, tableText } from '../lib/table.mjs'
import { shortModel } from '../lib/agents.mjs'
import { checksLine, goalState, graphPhases, latestReview, LADDERS, mergeReady, nodeState, parseCommands, phaseState, prState, stepper, stepperText, timeline, transitions } from '../lib/track.mjs'
import { alwaysLabel, APPROVE, claimsDone, GATES, commandQuestion, gateFor, phaseQuestion, readCommandAnswer, readPhaseAnswer, REFUSE, SEND_BACK } from '../lib/approve.mjs'
import { bindModel, CHEAP, FRONTIER, MECH } from '../lib/binding.mjs'
import { usageSegs } from '../lib/view.mjs'
import { byId, gaugeColor, gaugeLine, ledgerLine, parseLedger, spinnerSuffix, summarizeNodes } from '../lib/view.mjs'

// ------------------------------------------------------------------ state

const run = {
  checkedAt: -1e12, // when the manifest was last read (ms)
  active: false, // the cached answer
  manifest: null, // the parsed manifest, when active
  startedHere: false, // /baton start ran in this module's lifetime
  kickoff: null, // the prime's first prompt, submitted by the ticker after /baton start
  lastKickoff: null, // that prompt's text, so prompt.submit does not note it as the operator's
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
const config = { rotateAtPercent: 35, wakeBudgetLines: 96, memoryDir: '.baton/memory', autoRotate: true, approvals: true, phaseGate: true, prPollSeconds: 120,
  autoPane: true,
  tokensPerGoal: 0, agentContextWarnPercent: 50, prices: {}, quietOutputLines: 400, readHintLines: 300, forbiddenFiles: FORBIDDEN_DEFAULT, labels: true, boardProject: 0, boardOwner: '', boardStatusMap: {} }

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
  { id: 'track', label: 'Track', hotkey: '1' },
  { id: 'agents', label: 'Agents', hotkey: '2' },
  { id: 'memory', label: 'Memory', hotkey: '3' },
  { id: 'rulings', label: 'Rulings', hotkey: '4' },
  { id: 'ledger', label: 'Ledger', hotkey: '5' },
  { id: 'run', label: 'Run', hotkey: '6' },
]
const pane = {
  open: false,
  tab: 'track',
  timer: null,
  refreshedAt: null,
  data: { track: ['(not read yet)'], run: ['(not read yet)'], memory: ['(not read yet)'], rulings: ['(not read yet)'], ledger: ['(not read yet)'] },
  memoryNotes: null, // run-memory note count, for the band
  memTiles: [], // the memory tab's blocks, parallel to its view lines
  memLines: [],
  rulings: [], // the standing rulings, for the Rulings tab
  target: null, // the agent the Agents tab's message field writes to
}

// What the prime is doing now, for the spinner: its live dispatches.
const live = new Map() // agentId -> label

// The whole tree under the prime, for the Agents tab and the approval questions.
let tree = newTree()

// Approvals: command gates remembered for this run, and phases waiting on the operator.
const approvals = {
  always: new Set(), // gate ids the operator approved for the rest of the run
  asked: 0,
  approved: 0,
  refused: 0,
  queue: [], // sub-orchestrator returns that claim DONE: { agentId, label, line, at }
  approvedPhases: new Set(), // P<n> the operator approved, here or on the PR
  sentBack: new Set(), // P<n> sent back and not yet re-approved
}

// The memory browser: a stack of opened ranges ("lo-hi"), or a search.
const browse = { stack: [], search: null }

// GitHub: the run's goal (an issue), its PR as `gh` last reported it, the
// reviewer's latest verdict, merge-ready, and the issue queue (/baton watch).
const gh = {
  pr: null, // gh pr view --json …
  review: null, // latestReview(pr.comments)
  ready: null, // mergeReady(pr, review)
  polledAt: null,
  error: null,
  polling: false,
  seen: null, // comment ids already handled (Set), loaded per run from $.store
  noted: { review: null, ready: false, merged: false, checks: null },
  queue: [], // open issues labeled baton
  timer: null,
}

// Spend: every model request's usage, metered at turn.step by the agent that made it.
const spend = { total: {}, byRole: {}, byPhase: {}, byNode: {}, warned: false, savedAt: 0, loadedFor: null }
const SPEND_SAVE_MS = 5000

// The goal on GitHub: the label last set, labels ensured, the board's ids.
const mirror = { label: null, labelsEnsured: false, board: null, boardWarned: false, column: null }

// The tracker: the last computed state of every entity, and the rows measured so far.
const track = { snap: {}, rows: [], loadedFor: null, at: 0, view: null }
const TRACK_TTL_MS = 10000

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
      "baton run memory: append ONE line (≤280 bytes; longer is cut) — a decision, a parked node, what you are waiting on, a route you chose. The operator's prompts, sub-orchestrator returns and the first line of each of your replies are noted automatically; do not repeat them.",
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
      "baton project memory (spans runs): decisions, criteria fixtures, what failed before. Fixed-budget view like memory_wake. An optional namespace selects a separate memory inside it (\"rulings\" holds the operator's standing rulings).",
    inputSchema: { type: 'object', properties: { namespace: { type: 'string' }, budget: { type: 'integer', minimum: 4, maximum: 400 } } },
  },
  {
    name: 'project_note',
    description:
      'baton project memory (spans runs): append ONE line (≤280 bytes) worth knowing in the next run — a decision and its reason, a criterion that proved vacuous, a route that failed. Optional namespace as in project_wake.',
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

// ------------------------------------------------------------------ the code index
//
// baton's own index of the code (codemunch's idea, MIT; bin/code.mjs, lib/codeidx.mjs),
// served as tools to the agents that read: built in the background when the session
// starts, refreshed before every query, never set up or updated by hand.

const CODE_TOOLS = [
  {
    name: 'code_search',
    description: 'baton code index: find a function, class, type or module by name (exact, prefix, substring, fuzzy). Returns file:lines for each match, nothing else. Use it before reading a file.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, kind: { type: 'string', enum: ['function', 'class', 'type', 'method', 'module', 'impl'] }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, required: ['query'] },
  },
  {
    name: 'code_fetch',
    description: 'baton code index: the source of one symbol by name, of a line range "path:A-B", or the outline of a file given its path. Reads only those lines, not the whole file.',
    inputSchema: { type: 'object', properties: { target: { type: 'string', description: 'a symbol name, a path, or path:A-B' }, max: { type: 'integer', minimum: 10, maximum: 2000 } }, required: ['target'] },
  },
  {
    name: 'code_refs',
    description: 'baton code index: every whole-word reference to a name across the code, file:line and the line, definitions marked *. Cheaper than grep plus reading files.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 1000 } }, required: ['name'] },
  },
  {
    name: 'code_explore',
    description: 'baton code index: the shape of a directory — subdirectories with file, symbol and line counts, and each file with its symbol names. Start here in an unfamiliar codebase.',
    inputSchema: { type: 'object', properties: { dir: { type: 'string', description: 'a directory relative to the project root; empty for the root' } } },
  },
]

// Plan usage: the rate-limit windows the last response reported, and the session's cost.
const usage = { limits: [], cost: null, at: null }

async function readUsage($) {
  try {
    const u = await $.session.usage()
    if (u && Array.isArray(u.rateLimits) && u.rateLimits.length) usage.limits = u.rateLimits
    if (u && u.cost) usage.cost = u.cost
    usage.at = Date.now()
  } catch {}
}

/** Open the pane by itself (unfocused): in every interactive session, the mod is simply there. */
async function autoOpenPane($) {
  if (pane.open || !config.autoPane || !(await interactive($))) return
  pane.tab = (await runActive($)) ? 'track' : 'agents'
  try {
    const r = await $.ui.open({ id: PANE, title: 'baton', focus: false, closeOnEscape: true })
    pane.open = !r || r.isPlaced !== false
  } catch {
    return
  }
  await refreshPane($, 30)
  try {
    if (!pane.timer) pane.timer = $.clock.every(5000, () => (pane.open ? refreshPane($, 30) : null))
  } catch {}
}

// What the code tools and quiet output did, for /baton status and the experiment (#48).
const kit = { codeCalls: 0, codeOut: 0, bigReads: 0, bigReadLines: 0, quieted: 0, quietLinesKept: 0, quietLinesTotal: 0, toolsRegistered: false }

async function codeRun($, args) {
  const root = await $.session.root()
  const r = await $.process.run(['node', $.plugin.root + '/bin/code.mjs', '--root', root, ...args], { timeoutMs: 120000 })
  if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout || 'code exited ' + r.exitCode).trim())
  return r.stdout
}

async function registerCodeTools($) {
  if (kit.toolsRegistered) return
  for (const t of CODE_TOOLS) await $.tool.register(t)
  kit.toolsRegistered = true
}

async function serveCodeTool($, e) {
  const name = String(e.tool).slice('mcp__baton__'.length)
  const lim = (k, d) => (Number.isInteger(e[k]) ? String(e[k]) : d)
  let args
  if (name === 'code_search') args = ['search', ...(e.kind ? ['--kind', String(e.kind)] : []), '--limit', lim('limit', '20'), '--', String(e.query ?? '')]
  else if (name === 'code_fetch') args = ['fetch', '--max', lim('max', '400'), '--', String(e.target ?? '')]
  else if (name === 'code_refs') args = ['refs', '--limit', lim('limit', '200'), '--', String(e.name ?? '')]
  else if (name === 'code_explore') args = ['explore', '--', String(e.dir ?? '')]
  else return { result: 'baton: no code tool named ' + name }
  try {
    const out = await codeRun($, args)
    kit.codeCalls++
    kit.codeOut += out.length
    return { result: out }
  } catch (err) {
    return { result: 'baton code index error: ' + (err && err.message ? err.message : String(err)) + ' — fall back to Read/Grep' }
  }
}

// ------------------------------------------------------------------ quiet output
//
// A shell result longer than quietOutputLines is cut to its head, the lines that
// look like failures, and its tail; the whole of it goes to a file whose path is
// in the result. Off with quietOutputLines 0 or BATON_QUIET=0.

// ------------------------------------------------------------------ notifications
//
// Something waits for the operator: a toast now, and a desktop notification (OSC
// 9 / 99 / 777, or a bell) the next time Claude Code hands a hook a chance to
// emit one. Each event notifies once.

const notices = { pending: [], sent: new Set(), term: null }

async function notify($, key, text) {
  if (notices.sent.has(key)) return
  notices.sent.add(key)
  try {
    $.ui.toast(text)
  } catch {}
  notices.pending.push(text)
}

async function terminalSequence($) {
  if (!notices.pending.length) return null
  const text = notices.pending.splice(0).join(' · ').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 240)
  if (notices.term == null) {
    try {
      notices.term = String((await $.env.get('TERM_PROGRAM')) || '') + ' ' + String((await $.env.get('TERM')) || '')
    } catch {
      notices.term = ''
    }
  }
  const t = notices.term.toLowerCase()
  if (/ghostty|warp|rxvt/.test(t)) return '\x1b]777;notify;baton;' + text + '\x07'
  if (/kitty/.test(t)) return '\x1b]99;;baton: ' + text + '\x1b\\'
  if (/iterm|wezterm|windows|conemu/.test(t)) return '\x1b]9;baton: ' + text + '\x07'
  return '\x07'
}

/** Stop and Notification: emit what is waiting as a desktop notification. */
async function withNotice($, e, next) {
  const r = await next(e)
  const seq = await terminalSequence($)
  return seq ? { ...(r || {}), terminalSequence: seq } : r
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

/** A run note that never throws (the caller has already decided). */
async function noteQuietly($, text, tag) {
  try {
    await appendNote($, 'run', text, tag)
  } catch (err) {
    $.ui.log('baton: could not note (' + tag + '): ' + err.message)
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

/** Is there a surface to draw on and ask in (not claude -p)? */
async function interactive($) {
  try {
    return (await $.session.surfaces()).length > 0
  } catch {
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

const MODES = ['BUILD', 'DOGFOOD', 'GENERIC', 'IMPROVE', 'MIGRATE', 'REVIEW', 'ROADMAP', 'TEST']

function kickoff(m) {
  const base =
    'baton v7 run ' + m.run_id + ' started — MODE ' + m.mode + ', TARGET ' + m.target + '. You are the PRIME orchestrator. ' +
    'Load the baton prime skill (Skill "baton:prime") for your standing orders. In short: you never read, run or edit anything — the mod refuses it; ' +
    'you dispatch. First dispatch one baton:sub-orchestrator to bootstrap the run (directive from the mode file, plan, plan verification) ' +
    'and return one line. Then dispatch one sub-orchestrator per phase. Note decisions with memory_note; after a rotation call memory_wake first.'
  if (!m.issue) return base
  return (
    base +
    '\n\nThe goal is GitHub issue #' + m.issue.number + ' (' + m.issue.url + '): "' + m.issue.title + '". TEAM: github. The bootstrap sub-orchestrator ' +
    'opens the run branch ' + m.branch + ' and a draft PR whose body starts "Closes #' + m.issue.number + '", and writes {"number":…,"url":…} to _orch/github/pr.json. ' +
    'After the last phase, dispatch baton:pr-reviewer (fresh) on that PR; on CHANGES dispatch a sub-orchestrator as the PR steward for a fix round, then the reviewer again, ' +
    'at most 3 rounds; on READY the steward marks the PR ready for review. Never merge. The issue, verbatim:\n\n' + String(m.issue.body || '(no body)').slice(0, 6000)
  )
}

/** "#12", "12" with a hint, or an issue URL → its number; null otherwise. */
function issueRef(t) {
  const s = String(t ?? '').trim()
  const m = /^#(\d+)$/.exec(s) || /github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/.exec(s)
  return m ? Number(m[1]) : null
}

async function batonStart($, args) {
  const words = String(args ?? '').trim().split(/\s+/).filter(Boolean)
  // /baton start #12 is /baton start BUILD #12
  if (words.length === 1 && issueRef(words[0])) words.unshift('BUILD')
  const [modeRaw, ...rest] = words
  const mode = String(modeRaw ?? '').toUpperCase()
  let target = rest.join(' ')
  if (!MODES.includes(mode) || !target) {
    return 'usage: /baton start <MODE> <TARGET>  — MODE is one of ' + MODES.join(', ') + '; TARGET a path, spec, URL, one-line goal, or a GitHub issue (#12 or its URL; /baton start #12 means BUILD)'
  }
  let issue = null
  const num = issueRef(target)
  if (num) {
    try {
      issue = await ghJson($, ['issue', 'view', String(num), '--json', 'number,title,body,url'])
    } catch (err) {
      return 'could not read issue #' + num + ' with gh: ' + err.message
    }
    target = 'issue #' + issue.number + ': ' + issue.title
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
  if (issue) {
    m.issue = { number: issue.number, title: issue.title, url: issue.url, body: issue.body }
    m.team = 'github'
    m.branch = 'baton/' + m.run_id
  }
  await $.fs.write('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  run.startedHere = true
  forgetRunCache()
  tree = newTree()
  approvals.always.clear()
  approvals.queue = []
  approvals.approvedPhases.clear()
  approvals.sentBack.clear()
  Object.assign(gh, { pr: null, review: null, ready: null, polledAt: null, error: null, seen: null, noted: { review: null, ready: false, merged: false, checks: null } })
  track.loadedFor = undefined
  track.at = 0
  spend.loadedFor = undefined
  Object.assign(spend, { total: {}, byRole: {}, byPhase: {}, byNode: {}, warned: false })
  Object.assign(mirror, { label: null, column: null, boardWarned: false })
  await registerMemoryTools($)
  await appendNote($, 'run', 'run ' + m.run_id + ' started: MODE ' + mode + ', TARGET ' + target, 'operator')
  $.ui.invalidate('ui.render')
  const started = 'baton run ' + m.run_id + ' started (MODE ' + mode + ', TARGET ' + target + '). The prime guard is armed: the main session may only dispatch, ask and use memory.'
  // A command hook may not submit a prompt (it would wait on the turn the hook
  // holds). Interactive: the session.start ticker submits the kickoff once this
  // returns. Headless: the kickoff rides in this text, which Claude reads with
  // the next prompt the driver sends.
  let surfaces = []
  try {
    surfaces = await $.session.surfaces()
  } catch {}
  const rulings = await rulingsBlock($)
  const first = kickoff(m) + (rulings ? '\n\n' + rulings.trim() : '')
  if (surfaces.length) {
    run.kickoff = first
    run.lastKickoff = first
    return started
  }
  return started + '\n\n' + first
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
  lines.push(usageSegs(usage.limits, usage.cost).map((x) => x.text).join(''))
  lines.push(
    'code tools ' + kit.codeCalls + ' calls · large reads ' + kit.bigReads + ' (' + kit.bigReadLines + ' lines) · quieted ' + kit.quieted + ' outputs (' + kit.quietLinesTotal + ' → ' + kit.quietLinesKept + ' lines)',
  )
  lines.push(
    'approvals ' + (config.approvals ? 'on' : 'off (BATON_APPROVALS=0)') + ' · asked ' + approvals.asked + ' · approved ' + approvals.approved + ' · refused ' + approvals.refused +
      (approvals.always.size ? ' · approved for the run: ' + [...approvals.always].join(', ') : '') + (approvals.queue.length ? ' · ' + approvals.queue.length + ' phase(s) waiting for your check' : ''),
  )
  if (active) {
    try {
      lines.push(...trackLines(await observe($, true)).slice(0, 4))
    } catch {}
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
  // Memory: the wake view, a zoomed range from the browse stack, or a search
  try {
    const args = await memoryArgs($, 'run')
    const s = JSON.parse(await memoRun($, [...args, '--json', 'stats']))
    pane.memoryNotes = s.notes
    const head = 'tree: ' + s.notes + ' notes · ' + s.summaries + '/' + s.treeCapacity + ' summaries · ' + s.levels + ' levels · ' + s.pending + ' merges pending'
    if (browse.search) {
      const r = JSON.parse(await memoRun($, [...args, '--json', 'recall', '--limit', String(budget), '--', browse.search]))
      d.memory = [head, 'search /' + browse.search + '/i: ' + r.total + ' note(s), ' + r.blocks.length + ' summary block(s)']
      pane.memTiles = [...r.blocks.map((b) => ({ level: b.level, lo: b.lo, hi: b.hi + 1 })), ...r.notes.map((x) => ({ level: 0, lo: x.index, hi: x.index + 1 }))]
      pane.memLines = [...r.blocks.map((b) => '#' + b.lo + '-' + b.hi + ' (L' + b.level + ') ' + b.text), ...r.notes.map((x) => '#' + x.index + ' ' + x.ts + ' [' + x.tag + '] ' + x.text)]
    } else {
      const range = browse.stack.at(-1)
      const w = JSON.parse(await memoRun($, [...args, '--json', ...(range ? ['zoom', '--budget', String(budget), '--', range] : ['wake', '--budget', String(budget)])]))
      d.memory = [head, (range ? 'notes #' + range + ' (' + w.tiles.length + ' blocks)' : 'wake view (' + w.tiles.length + ' blocks, budget ' + budget + ')') + ':']
      pane.memTiles = w.tiles
      pane.memLines = w.lines
    }
  } catch (err) {
    d.memory = ['run memory unreadable: ' + err.message]
    pane.memTiles = []
    pane.memLines = []
  }
  // Track
  d.track = trackLines(await observe($))
  // Rulings
  pane.rulings = await loadRulings($, true)
  d.rulings = pane.rulings.length ? pane.rulings.map(rulingLine) : ['no rulings yet — say one during a run, type one below, or /baton rule <text>']
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
  pane.data = d
  pane.refreshedAt = new Date(Date.now()).toISOString().slice(11, 19)
  $.ui.invalidate('ui.render')
}

// ------------------------------------------------------------------ pane tabs

const TONE = { done: 'green', current: 'cyan', flagged: 'red', future: undefined, rail: undefined }

/** One stepper as a row of colored Text segments. */
function stepperRow({ Box, Text }, key, label, st, tl, tail = '') {
  const segs = stepper(st, tl)
  if (tail) segs.push({ text: tail, tone: 'rail' })
  return Box({
    key,
    flexDirection: 'row',
    children: [
      Text({ key: key + '-l', bold: true, children: [label.padEnd(8).slice(0, 12) + ' '] }),
      ...segs.map((x, i) => Text({ key: key + '-' + i, wrap: 'truncate-end', ...(TONE[x.tone] ? { color: TONE[x.tone] } : { dimColor: x.tone === 'future' || x.tone === 'rail' }), children: [x.text] })),
    ],
  })
}

/** The goal's issue and its PR, as links to GitHub. */
function goalLinks({ Box, Text, Link }, key) {
  const v = track.view
  if (!v) return []
  const g = v.goal
  const kids = []
  if (g.issue) kids.push(Link({ key: key + '-i', href: g.issue.url, label: '#' + g.issue.number + ' ' + g.issue.title + ' ↗' }))
  else kids.push(Text({ key: key + '-t', bold: true, children: ['goal: ' + String(g.target || '').slice(0, 80)] }))
  if (v.pr) {
    kids.push(Text({ key: key + '-s', dimColor: true, children: ['·'] }))
    kids.push(Link({ key: key + '-p', href: v.pr.url, label: 'PR #' + v.pr.number + ' ↗' }))
    kids.push(Text({ key: key + '-c', dimColor: true, children: [v.pr.checks + (v.pr.review ? ' · review ' + v.pr.review.verdict + ' (' + v.pr.review.high + ' high, ' + v.pr.review.med + ' med)' : '')] }))
  }
  return [Box({ key, flexDirection: 'row', columnGap: 1, children: kids })]
}

/** Track: the goal, the PR (with the merge-ready rows), every phase and its nodes, each as measured steps. */
function usageRow({ Box, Text }, key) {
  return Box({ key, flexDirection: 'row', children: usageSegs(usage.limits, usage.cost).map((x, i) => Text({ key: key + i, wrap: 'truncate-end', ...(x.color ? { color: x.color } : { dimColor: true }), children: [x.text] })) })
}

function trackBody($, ui) {
  const { Box, Text, line } = ui
  const v = track.view
  if (!v) return [line('t-none', pane.data.track[0] ?? 'no run is active here', { dimColor: true })]
  const out = [usageRow(ui, 't-use'), ...goalLinks(ui, 't-links'), stepperRow(ui, 't-goal', 'goal', v.goal, v.goal.tl, spendTail(v.spend.total, v.spend.budget))]
  if (v.pr) {
    out.push(stepperRow(ui, 't-pr', 'PR', v.pr, v.pr.tl))
    if (v.pr.ready) v.pr.ready.rows.forEach((r, i) => out.push(line('t-mr' + i, '           ' + (r.ok ? '✓ ' : '✗ ') + r.row, { color: r.ok ? 'green' : undefined, dimColor: !r.ok })))
    if (v.pr.ready && v.pr.ready.diagnosis) out.push(line('t-diag', '           ⚠ ' + v.pr.ready.diagnosis, { color: 'yellow' }))
  } else out.push(line('t-nopr', 'PR       none yet' + (gh.error ? ' — ' + gh.error : ''), { dimColor: true }))
  for (const p of v.phases) {
    out.push(stepperRow(ui, 't-' + p.id, p.id, p, p.tl, spendTail(v.spend.byPhase[p.id])))
    p.nodes.slice(0, 12).forEach((x) => out.push(stepperRow(ui, 't-' + x.id, '  ' + x.id, x, x.tl, spendTail(v.spend.byNode[x.id]))))
    if (p.nodes.length > 12) out.push(line('t-more-' + p.id, '    … ' + (p.nodes.length - 12) + ' more nodes', { dimColor: true }))
  }
  ;(v.questions || []).forEach((q, i) => out.push(line('t-qq' + i, '? ' + questionLine(q), { color: q.blockedBy && q.blockedBy.kind === 'interpreted' ? 'yellow' : 'red' })))
  if (gh.queue.length) out.push(line('t-q', 'queue: ' + gh.queue.map((x) => '#' + x.number).join(' ') + ' — /baton next', { dimColor: true }))
  out.push(line('t-foot', 'states are computed from _orch/ and the PR; each change is a row in _orch/track/ · ' + (gh.polledAt ? 'PR read ' + gh.polledAt.slice(11, 19) : 'PR not read yet'), { dimColor: true }))
  return out
}

/** The computed state an agent's row shows: its node's, else its phase's; the goal's for the prime. */
function workState(agentId) {
  const v = track.view
  if (!v || !agentId) return null
  if (agentId === PRIME) return v.goal
  const n = tree.nodes.get(agentId)
  const w = workOf(n ? n.label : '')
  if (w.node) {
    for (const p of v.phases) {
      const x = p.nodes.find((y) => y.id === w.node)
      if (x) return x
    }
    const u = (v.unphased || []).find((y) => y.id === w.node)
    if (u) return u
  }
  if (w.phase) return v.phases.find((p) => p.id === w.phase) || null
  return null
}

/** One agent as a table row. */
function agentRow(r) {
  const n = r.id ? tree.nodes.get(r.id) : null
  if (!n) return { label: r.text.trim(), tone: 'rail' }
  const glyph = n.id === PRIME ? '◆' : r.live ? '●' : r.color === 'red' ? '✗' : '✓'
  const name = n.id === PRIME ? 'prime' : (n.role === 'sub-orchestrator' ? 'sub-orch' : n.role) + ' ' + n.label
  const st = workState(r.id)
  const mini = st ? stepperMini(st) : null
  const pct = ctxPct(n)
  const thr = thresholdFor(n)
  return {
    label: '  '.repeat(r.depth) + glyph + ' ' + name,
    tone: r.color,
    ctxPct: pct,
    ctxTone: ctxTone(pct, thr),
    threshold: thr,
    model: shortModel(n.served || n.model) || '',
    acc: n.spend || null,
    cost: n.spend ? shortUsd(costOf(n.spend, config.prices)) : '',
    steps: mini ? mini.slice(0, -1) : [],
    state: mini ? mini.at(-1).text.trim() : r.live ? (n.lastTool ? 'now ' + n.lastTool : 'starting') : String(n.verdict || '').toLowerCase(),
    stateTone: mini ? mini.at(-1).tone : r.live ? 'current' : r.color,
  }
}

/** Agents: phases waiting for a check, then the live tree; a message field for the selected agent. */
function agentsBody($, { Box, Text, Button, Input, Link, line, cols }) {
  const out = [usageRow({ Box, Text }, 'a-use'), ...goalLinks({ Box, Text, Link }, 'a-links')]
  approvals.queue.forEach((q, i) => {
    out.push(
      Box({
        key: 'q' + i,
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Button({ key: 'approve-' + i, label: 'approve', plain: true, onPress: () => resolveQueued($, i, 'approve') }),
          line('qt' + i, '⚑ ' + q.label + ': ' + q.line, { color: 'yellow' }),
        ],
      }),
    )
  })
  if (approvals.queue.length) {
    out.push(
      Input({
        key: 'send-back',
        label: 'Send back ' + approvals.queue[0].label,
        placeholder: 'what is wrong (Enter sends it to the prime)',
        value: '',
        submitLabel: 'send back',
        onSubmit: (v) => (String(v).trim() ? resolveQueued($, 0, { sendBack: String(v).trim() }) : null),
      }),
    )
  }
  // One row per agent: its own context against its own budget, its model, its tokens by kind, its cost,
  // and the parcel steps of what it works on (its node, else its phase; the goal for the prime).
  const rowsData = treeRows(tree)
  const t = agentTable(rowsData.map(agentRow), Math.max(60, (cols || 120) - 4))
  const tone = (x) => (x.tone in TONE ? (TONE[x.tone] ? { color: TONE[x.tone] } : { dimColor: true }) : x.tone ? { color: x.tone } : {})
  out.push(Box({ key: 'ah', flexDirection: 'row', children: t.header.map((x, j) => Text({ key: 'ah' + j, dimColor: true, children: [x.text] })) }))
  t.lines.forEach((segs, i) => {
    const r = rowsData[i]
    const children = segs.map((x, j) => Text({ key: 'a' + i + 'c' + j, wrap: 'truncate-end', ...tone(x), children: [x.text] }))
    if (r.live && r.id && r.id !== PRIME) children.push(Button({ key: 'msg-' + i, label: ' ✉', plain: true, onPress: () => ((pane.target = r.id), $.ui.invalidate('ui.render')) }))
    out.push(Box({ key: 'ar' + i, flexDirection: 'row', children }))
  })
  const tg = pane.target && tree.nodes.get(pane.target)
  if (tg && tg.endedAt == null) {
    out.push(
      Input({
        key: 'agent-msg',
        label: 'Message ' + tg.label,
        placeholder: 'steer this agent (it reads it at its next step)',
        value: '',
        submitLabel: 'send',
        autoFocus: true,
        onSubmit: async (v) => {
          const text = String(v).trim()
          if (!text) return
          let r = null
          try {
            r = await $.session.send({ to: { agentId: tg.id }, text })
          } catch (err) {
            r = { isDelivered: false, reason: err.message }
          }
          $.ui.toast(r && r.isDelivered ? 'sent to ' + tg.label : 'not delivered: ' + ((r && r.reason) || 'unknown'))
          if (r && r.isDelivered) await noteQuietly($, 'operator → ' + tg.label + ': ' + text, 'operator')
        },
      }),
    )
  } else {
    out.push(Text({ key: 'agents-hint', dimColor: true, children: ['✉ on a running agent opens a message field for it'] }))
  }
  return out
}

/** Settle a queued phase from the pane (the dialog's twin). */
async function resolveQueued($, i, how, who = 'operator') {
  const item = approvals.queue[i]
  if (!item) return
  approvals.queue.splice(i, 1)
  $.ui.invalidate('ui.render')
  const phase = phaseOf(item.label)
  if (how === 'approve') {
    approvals.approved++
    if (phase) {
      approvals.approvedPhases.add(phase)
      approvals.sentBack.delete(phase)
    }
    await noteQuietly($, who + ' approved ' + item.label + ': ' + item.line, 'approval')
    return
  }
  approvals.refused++
  if (phase) {
    approvals.sentBack.add(phase)
    approvals.approvedPhases.delete(phase)
  }
  await noteQuietly($, who + ' sent back ' + item.label + ': ' + how.sendBack, 'approval')
  $.prompt
    .submit({ text: 'The operator sent back ' + item.label + ': "' + how.sendBack + '". Re-dispatch that phase with this as its directive before anything else.' })
    .catch((err) => $.ui.log('baton: could not hand the send-back to the prime: ' + err.message))
}

/** Memory: open a block (+), go back (b), or search; notes and summaries as lines. */
function memoryBody($, { Box, Button, Input, line, rows }) {
  const out = (pane.data.memory ?? []).map((l, i) => line('mh' + i, l, i === 0 ? { dimColor: true } : {}))
  const reload = () => refreshPane($, rows)
  const nav = [
    Input({
      key: 'mem-search',
      label: 'Search',
      placeholder: browse.search ? '/' + browse.search + '/ — Enter on empty clears' : 'a node id, a word, a regex',
      value: '',
      submitLabel: 'search',
      onSubmit: (v) => {
        browse.search = String(v).trim() || null
        return reload()
      },
    }),
  ]
  if (browse.stack.length || browse.search) {
    nav.unshift(
      Button({
        key: 'mem-back',
        label: 'back',
        hotkey: 'b',
        plain: true,
        onPress: () => {
          if (browse.search) browse.search = null
          else browse.stack.pop()
          return reload()
        },
      }),
    )
  }
  out.push(Box({ key: 'mem-nav', flexDirection: 'row', columnGap: 2, children: nav }))
  pane.memLines.forEach((l, j) => {
    const t = pane.memTiles[j]
    const children = []
    if (t && t.level > 0)
      children.push(
        Button({
          key: 'mem-open-' + j,
          label: '+',
          plain: true,
          onPress: () => {
            browse.search = null
            browse.stack.push(t.lo + '-' + (t.hi - 1))
            return reload()
          },
        }),
      )
    children.push(line('m' + j, l))
    out.push(Box({ key: 'mr' + j, flexDirection: 'row', columnGap: 1, children }))
  })
  return out
}

/** Rulings: add one, retract one (x); enforcement shows on the line. */
function rulingsBody($, { Box, Button, Input, line, rows }) {
  const out = [
    Input({
      key: 'ruling-add',
      label: 'New ruling',
      placeholder: 'a standing instruction; the newest wins',
      value: '',
      submitLabel: 'add',
      onSubmit: async (v) => {
        const text = String(v).trim()
        if (!text) return
        await recordRuling($, text, 'ruling-hand')
        await refreshPane($, rows)
      },
    }),
  ]
  if (!pane.rulings.length) out.push(line('r-none', pane.data.rulings[0] ?? 'no rulings yet', { dimColor: true }))
  pane.rulings.forEach((r) => {
    out.push(
      Box({
        key: 'rr' + r.n,
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Button({
            key: 'retract-' + r.n,
            label: 'x',
            plain: true,
            onPress: async () => {
              await recordRuling($, 'retract #' + r.n + ': ' + r.text, 'retract')
              await refreshPane($, rows)
            },
          }),
          line('r' + r.n, rulingLine(r), r.enforce ? { color: 'magenta' } : {}),
        ],
      }),
    )
  })
  out.push(line('r-hint', 'x retracts · /baton enforce <#> <regex> makes a ruling refuse matching shell commands', { dimColor: true }))
  return out
}

/** Every tab as text, for `claude -p` and any surface that draws nothing. */
function paneText() {
  return TABS.map((t) => '## ' + t.label + '\n' + tabLines(t.id).join('\n')).join('\n\n')
}

/** A tab's text, for -p and for the tabs drawn as plain lines. */
function tabLines(id) {
  if (id === 'track') return trackLines(track.view)
  if (id === 'agents') return [usageSegs(usage.limits, usage.cost).map((x) => x.text).join(''), ...queueLines(), ...tableText(agentTable(treeRows(tree).map(agentRow), 160))]
  if (id === 'memory') return [...(pane.data.memory ?? []), ...pane.memLines]
  return pane.data[id] ?? []
}

function queueLines() {
  if (!approvals.queue.length) return []
  return ['waiting for your check (' + approvals.queue.length + '):', ...approvals.queue.map((q) => '  ⚑ ' + q.label + ': ' + q.line), '']
}

/** Serve one memory tool call. */
async function serveMemoryTool($, e) {
  const name = String(e.tool).slice('mcp__baton__'.length)
  const budget = Number.isInteger(e.budget) ? e.budget : config.wakeBudgetLines
  try {
    switch (name) {
      case 'memory_wake':
        return { result: (await rulingsBlock($)) + (await memoRun($, [...(await memoryArgs($, 'run')), 'wake', '--budget', String(budget)])) }
      case 'memory_note':
        return { result: await appendNote($, 'run', String(e.text ?? ''), e.agentId ? 'agent' : 'prime') }
      case 'memory_zoom':
        return { result: await memoRun($, [...(await memoryArgs($, 'run')), 'zoom', '--budget', String(budget), '--', String(e.range ?? '')]) }
      case 'memory_recall':
        return { result: await memoRun($, [...(await memoryArgs($, 'run')), 'recall', '--limit', String(e.limit ?? 20), '--', String(e.pattern ?? '')]) }
      case 'project_wake':
        return { result: await memoRun($, [...(await memoryArgs($, 'project', e.namespace)), 'wake', '--budget', String(budget)]) }
      case 'project_note':
        return { result: await appendNote($, 'project', String(e.text ?? ''), e.agentId ? 'agent' : 'prime', e.namespace) }
      case 'project_recall':
        return { result: await memoRun($, [...(await memoryArgs($, 'project', e.namespace)), 'recall', '--limit', String(e.limit ?? 20), '--', String(e.pattern ?? '')]) }
      default:
        return { result: 'baton: no memory tool named ' + name }
    }
  } catch (err) {
    return { result: 'baton memory error: ' + (err && err.message ? err.message : String(err)) }
  }
}

// ------------------------------------------------------------------ rulings
//
// The operator's standing instructions, kept so the newest one sticks: every
// operator prompt during a run is a run note (tag `operator`), and the cheap
// model lifts any standing rule out of it into the project memory's `rulings`
// namespace. memory_wake and the kickoff lead with the newest rulings, so a
// change of mind is one message, not an edit to CLAUDE.md. `/baton rule`
// records one by hand.

const RULINGS_NS = 'rulings'
const RULINGS_SHOWN = 12

/** Pull a standing rule out of an operator message: the rule's line, or null. */
async function extractRuling($, text) {
  try {
    const r = await $.model.complete({
      model: CHEAP_MODEL,
      system: RULING_SYSTEM,
      prompt: rulingPrompt(text),
      maxTokens: 160,
      effort: 'low',
      timeoutMs: 45000,
    })
    if (r.isAnswered) return parseRuling(r.text)
  } catch {}
  return fallbackRuling(text)
}

async function recordRuling($, text, tag = 'ruling') {
  const r = await appendNote($, 'project', text, tag, RULINGS_NS)
  forgetRulings()
  return r
}

const rulingsCache = { at: -1e12, list: [] }
const RULINGS_TTL_MS = 3000

/** The standing rulings, newest first (retracted ones dropped, enforcement attached). Cached briefly. */
async function loadRulings($, fresh = false) {
  if (!fresh && Date.now() - rulingsCache.at < RULINGS_TTL_MS) return rulingsCache.list
  try {
    const args = await memoryArgs($, 'project', RULINGS_NS)
    const r = JSON.parse(await memoRun($, [...args, '--json', 'recall', '--limit', '2000', '--', '.']))
    rulingsCache.list = activeRulings(r.notes ?? [])
  } catch {
    rulingsCache.list = []
  }
  rulingsCache.at = Date.now()
  return rulingsCache.list
}

function forgetRulings() {
  rulingsCache.at = -1e12
}

/** The newest rulings, newest first, as lines; [] when there are none or the memory is unreadable. */
async function rulingLines($, max = RULINGS_SHOWN) {
  return (await loadRulings($)).slice(0, max).map(rulingLine)
}

async function rulingsBlock($) {
  const lines = await rulingLines($)
  return lines.length ? RULINGS_HEAD + '\n' + lines.join('\n') + '\n\n' : ''
}

// ------------------------------------------------------------------ GitHub
//
// An issue is the goal, a draft PR is its output (one commit per node, the
// verdict as a check: TEAM, v4), the PR reviewer's comment is the verdict on
// the whole, and comments from allowed answerers are the remote gate. The mod
// reads PR state with `gh` as data — no model. Haiku turns new human comment
// text into one line for the memory; nothing else here calls a model.

async function ghJson($, args) {
  const r = await $.process.run(['gh', ...args], { timeoutMs: 30000 })
  if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout || 'gh exited ' + r.exitCode).trim().split('\n')[0])
  return JSON.parse(r.stdout || 'null')
}

async function ghRun($, args, stdin) {
  const r = await $.process.run(['gh', ...args], stdin === undefined ? { timeoutMs: 30000 } : { stdin, timeoutMs: 30000 })
  if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout || 'gh exited ' + r.exitCode).trim().split('\n')[0])
  return r.stdout
}

const PR_FIELDS = 'number,url,title,state,isDraft,mergeable,mergeStateStatus,statusCheckRollup,comments,assignees,headRefName,author,closingIssuesReferences,files'

/** The run's PR number: the manifest, then _orch/github/pr.json (the bootstrap writes it), then the run branch. */
async function prNumber($) {
  const m = run.manifest || {}
  if (m.pr && m.pr.number) return m.pr.number
  const f = await readJson($, '_orch/github/pr.json')
  if (f && f.number) return f.number
  if (m.branch) {
    try {
      const list = await ghJson($, ['pr', 'list', '--head', m.branch, '--state', 'all', '--json', 'number', '--limit', '1'])
      if (list && list[0]) return list[0].number
    } catch {}
  }
  return null
}

/** Who may answer on the thread: the PR's assignees and the manifest's answerers; if neither, the PR's author. */
function allowedAuthors(pr) {
  const m = run.manifest || {}
  const set = new Set([...(pr.assignees || []).map((a) => a.login), ...(m.answerers || [])])
  if (!set.size && pr.author && pr.author.login) set.add(pr.author.login)
  return set
}

async function seenComments($) {
  if (gh.seen) return gh.seen
  const key = 'gh-seen:' + ((run.manifest && run.manifest.run_id) || 'session')
  let ids = []
  try {
    ids = (await $.store.get(key)) || []
  } catch {}
  gh.seen = new Set(ids)
  gh.seenKey = key
  return gh.seen
}

async function saveSeen($) {
  try {
    await $.store.set(gh.seenKey, [...gh.seen].slice(-500))
  } catch {}
}

/** One poll: PR state, the reviewer's verdict, merge-ready, new comments (commands, then one-line notes). */
async function pollGithub($) {
  if (gh.polling || !(await runActive($))) return
  gh.polling = true
  try {
    const n = await prNumber($)
    if (!n) return
    const pr = await ghJson($, ['pr', 'view', String(n), '--json', PR_FIELDS])
    gh.pr = pr
    gh.review = latestReview(pr.comments)
    const issue = run.manifest && run.manifest.issue ? run.manifest.issue.number : null
    let otherPRs = null
    if (issue) {
      try {
        const open = await ghJson($, ['pr', 'list', '--state', 'open', '--search', String(issue), '--json', 'number,closingIssuesReferences', '--limit', '50'])
        otherPRs = (open || []).filter((x) => x.number !== pr.number && (x.closingIssuesReferences || []).some((c) => Number(c.number) === Number(issue))).length
      } catch {}
    }
    const forbidden = forbiddenHits((pr.files || []).map((f) => f.path), config.forbiddenFiles)
    gh.ready = mergeReady(pr, gh.review, { issue, otherPRs, forbidden, clean: await checkoutClean($) })
    if (gh.ready.diagnosis && gh.noted.diagnosis !== gh.ready.diagnosis) {
      gh.noted.diagnosis = gh.ready.diagnosis
      await noteQuietly($, 'PR #' + pr.number + ': ' + gh.ready.diagnosis, 'github')
    }
    gh.polledAt = new Date(Date.now()).toISOString()
    gh.error = null
    const tag = 'PR #' + pr.number
    if (gh.review && gh.noted.review !== gh.review.url + gh.review.verdict) {
      gh.noted.review = gh.review.url + gh.review.verdict
      await noteQuietly($, tag + ' review' + (gh.review.round ? ' round ' + gh.review.round : '') + ': ' + gh.review.verdict + ' (' + gh.review.high + ' high, ' + gh.review.med + ' med, ' + gh.review.low + ' low) ' + (gh.review.url || ''), 'review')
      await upsertSpendComment($, pr)
    }
    if (gh.ready.ok && !gh.noted.ready) {
      gh.noted.ready = true
      await noteQuietly($, tag + ' is merge-ready: every row holds. Waiting for the operator to merge.', 'github')
      await upsertSpendComment($, pr)
      await notify($, 'ready:' + pr.number, tag + ' is ready for you to merge')
    }
    if (pr.state === 'MERGED' && !gh.noted.merged) {
      gh.noted.merged = true
      await noteQuietly($, tag + ' merged.', 'github')
    }
    const cl = checksLine(pr)
    if (gh.noted.checks !== cl) gh.noted.checks = cl
    await readComments($, pr)
  } catch (err) {
    gh.error = err && err.message ? err.message : String(err)
  } finally {
    gh.polling = false
    $.ui.invalidate('ui.render')
  }
}

/** New comments: gate commands from allowed authors act; other human comments become one Haiku line each. */
async function readComments($, pr) {
  const seen = await seenComments($)
  const allowed = allowedAuthors(pr)
  let changed = false
  for (const c of pr.comments || []) {
    const id = c.id || c.url || c.createdAt + (c.author && c.author.login)
    if (!id || seen.has(id)) continue
    seen.add(id)
    changed = true
    const body = String(c.body || '')
    if (/<!--\s*baton:/.test(body)) continue // baton's own: reviews, gates, briefs
    const who = (c.author && c.author.login) || 'someone'
    const cmds = parseCommands(body)
    if (cmds.length) {
      for (const cmd of cmds) await remoteCommand($, cmd, who, allowed.has(who), pr)
      continue
    }
    let line = null
    try {
      const r = await $.model.complete({
        model: MECH,
        system: 'You condense one comment on a pull request into ONE line of at most 200 characters for an orchestrator: who wants what (approval, a change, a question, or just remarks). Plain text, no preamble.',
        prompt: 'PR #' + pr.number + ' comment by ' + who + ':\n' + body.slice(0, 4000),
        maxTokens: 120,
        effort: 'low',
        timeoutMs: 30000,
      })
      if (r.isAnswered) line = r.text.split('\n').map((x) => x.trim()).filter(Boolean).join(' ')
    } catch {}
    await noteQuietly($, 'PR #' + pr.number + ' ' + who + ': ' + (line || body.replace(/\s+/g, ' ').slice(0, 200)), 'github')
  }
  if (changed) await saveSeen($)
}

/** /approve P3 · /send-back P3 <reason> · /approve <gate> · /approve merge — from the PR thread. */
async function remoteCommand($, { cmd, target, reason }, who, allowed, pr) {
  const tag = 'PR #' + pr.number
  if (!allowed) {
    await noteQuietly($, tag + ': ignored /' + cmd + ' ' + target + ' from ' + who + ' (not an assignee or answerer)', 'github')
    return
  }
  const phase = /^P\d+$/i.test(target) ? target.toUpperCase() : null
  if (phase) {
    const i = approvals.queue.findIndex((q) => phaseOf(q.label) === phase)
    if (cmd === 'approve') {
      approvals.approvedPhases.add(phase)
      approvals.sentBack.delete(phase)
      if (i >= 0) await resolveQueued($, i, 'approve', who)
      else await noteQuietly($, tag + ': ' + who + ' approved ' + phase, 'approval')
    } else {
      approvals.sentBack.add(phase)
      approvals.approvedPhases.delete(phase)
      if (i >= 0) await resolveQueued($, i, { sendBack: reason || 'no reason given' }, who)
      else await noteQuietly($, tag + ': ' + who + ' sent back ' + phase + (reason ? ': ' + reason : ''), 'approval')
    }
    return
  }
  if (cmd === 'approve' && target.toLowerCase() === 'merge') {
    await noteQuietly($, tag + ': ' + who + ' said /approve merge. baton never merges; the operator merges.', 'github')
    return
  }
  const gate = GATES.find((g) => g.id === target.toLowerCase())
  if (cmd === 'approve' && gate) {
    approvals.always.add(gate.id)
    approvals.approved++
    await noteQuietly($, tag + ': ' + who + ' approved every "' + gate.label + '" for this run (remote). Re-dispatch what was BLOCKED on it.', 'approval')
    return
  }
  await noteQuietly($, tag + ': unknown command /' + cmd + ' ' + target + ' from ' + who, 'github')
}

/** "P3" from a queued label like "P3", "P3 phase", "phase P3 export". */
function phaseOf(label) {
  const m = /\bP(\d+)\b/i.exec(String(label ?? ''))
  return m ? 'P' + m[1] : null
}

/** Post a gate question on the PR thread when nobody can be asked here. Returns the PR number, or null. */
async function askOnThread($, text) {
  try {
    const n = await prNumber($)
    if (!n) return null
    await ghRun($, ['pr', 'comment', String(n), '--body-file', '-'], '<!-- baton:gate -->\n' + text + '\n')
    return n
  } catch {
    return null
  }
}

// ------------------------------------------------------------------ spend
//
// Metered, not reported: a turn.step hook sees every model request with its
// usage and the agent that made it. Fresh tokens (input + output + cache
// writes) are what the budget counts; cache reads are shown apart.

async function loadSpend($) {
  const id = (run.manifest && run.manifest.run_id) || null
  if (spend.loadedFor === id) return
  spend.loadedFor = id
  const saved = await readJson($, '_orch/spend.json')
  Object.assign(spend, { total: {}, byRole: {}, byPhase: {}, byNode: {}, warned: false }, saved && saved.run_id === id ? { total: saved.total || {}, byRole: saved.byRole || {}, byPhase: saved.byPhase || {}, byNode: saved.byNode || {} } : {})
}

async function saveSpend($, force = false) {
  if (!force && Date.now() - spend.savedAt < SPEND_SAVE_MS) return
  spend.savedAt = Date.now()
  try {
    await $.fs.write('_orch/spend.json', JSON.stringify({ run_id: run.manifest && run.manifest.run_id, total: spend.total, byRole: spend.byRole, byPhase: spend.byPhase, byNode: spend.byNode }, null, 1) + '\n')
  } catch {}
}

function meter(agentId, usage) {
  addUsage(spend.total, usage)
  const n = agentId ? tree.nodes.get(agentId) : tree.nodes.get(PRIME)
  if (n) {
    // Each agent's own meter: its spend, and how full its context was on its last request.
    addUsage((n.spend ??= {}), usage)
    n.ctx = contextOf(usage)
    if (usage.model) n.served = usage.model // the model that answered; n.model stays the short name for the row
    n.window = n.id === PRIME && rotation.window ? rotation.window : windowFor(n.served, rotation.window || 200_000)
  }
  const role = n ? n.role : 'agent'
  addUsage((spend.byRole[role] ??= {}), usage)
  const w = workOf(n ? n.label : '')
  if (w.node) addUsage((spend.byNode[w.node] ??= {}), usage)
  if (w.phase) addUsage((spend.byPhase[w.phase] ??= {}), usage)
}

/** An agent's context as a percent of its window, or null before its first request. */
function ctxPct(n) {
  return n && n.ctx && n.window ? Math.round((n.ctx / n.window) * 100) : null
}

/** Each row's own threshold: the prime rotates at rotateAtPercent; a subagent is nudged at agentContextWarnPercent. */
function thresholdFor(n) {
  return n && n.id === PRIME ? config.rotateAtPercent : config.agentContextWarnPercent
}

/** A subagent past its threshold gets one message from the mod: finish, or split. */
async function maybeNudge($, agentId) {
  const n = agentId && tree.nodes.get(agentId)
  if (!n || n.nudged || n.endedAt != null) return
  const pct = ctxPct(n)
  if (pct == null || pct < config.agentContextWarnPercent) return
  n.nudged = true
  let sent = null
  try {
    sent = await $.session.send({ to: { agentId }, text: contextNudge(pct) })
  } catch {}
  await noteQuietly($, (n.label || n.role) + ' reached ' + pct + '% context; ' + (sent && sent.isDelivered ? 'told to finish or split' : 'could not be messaged'), 'budget')
}

/** "ctx 38% · 412k · $1.84" for one agent's row, with the context tone. */
function meterSegs(n) {
  if (!n || !n.spend) return []
  const pct = ctxPct(n)
  const out = []
  if (pct != null) out.push({ text: 'ctx ' + pct + '%/' + thresholdFor(n) + '%', color: ctxTone(pct, thresholdFor(n)) })
  out.push({ text: shortTokens(n.spend.fresh) + (n.spend.cacheRead ? ' +' + shortTokens(n.spend.cacheRead) + ' cached' : ''), color: undefined })
  const c = shortUsd(costOf(n.spend, config.prices))
  if (c) out.push({ text: c, color: undefined })
  // Cache health: an agent that keeps paying for its whole prompt has a prefix that keeps changing.
  const reuse = n.spend.cacheRead / Math.max(1, n.spend.cacheRead + n.spend.fresh)
  if (n.spend.requests >= 8 && reuse < 0.5) out.push({ text: 'cache ' + Math.round(reuse * 100) + '%', color: 'yellow' })
  return out
}

function budgetNow() {
  return budgetCheck(spend.total.fresh || 0, config.tokensPerGoal)
}

/** Post or edit the PR's one spend comment (marker <!-- baton:spend -->). */
async function upsertSpendComment($, pr) {
  try {
    const repo = /github\.com\/([^/]+\/[^/]+)\/pull\//.exec(pr.url || '')
    if (!repo) return
    const body = spendMarkdown({ total: spend.total, budget: budgetNow(), byRole: spend.byRole, byPhase: spend.byPhase })
    const mine = (pr.comments || []).find((c) => /<!--\s*baton:spend\s*-->/.test(c.body || ''))
    const cid = mine && /issuecomment-(\d+)/.exec(mine.url || '')
    if (cid) await ghRun($, ['api', '-X', 'PATCH', 'repos/' + repo[1] + '/issues/comments/' + cid[1], '--input', '-'], JSON.stringify({ body }))
    else await ghRun($, ['pr', 'comment', String(pr.number), '--body-file', '-'], body + '\n')
  } catch (err) {
    $.ui.log('baton: could not post the spend comment: ' + err.message)
  }
}

// ------------------------------------------------------------------ the goal on GitHub
//
// The tracker's goal state, mirrored where everyone looks: a `baton:<state>`
// label on the issue, and (with boardProject set) the Status column of a
// GitHub Projects board. Done by the hook that sees the state change, so no
// agent has to remember it. A failure is a log line, never a stall.

async function ensureLabels($) {
  if (mirror.labelsEnsured) return
  mirror.labelsEnsured = true
  for (const [state, color] of Object.entries(LABEL_COLORS)) {
    try {
      await ghRun($, ['label', 'create', LABEL_PREFIX + state, '--color', color, '--description', 'baton goal state', '--force'])
    } catch {}
  }
}

async function boardIds($) {
  if (mirror.board) return mirror.board
  const P = String(config.boardProject)
  const owner = config.boardOwner || '@me'
  const proj = await ghJson($, ['project', 'view', P, '--owner', owner, '--format', 'json'])
  const fields = await ghJson($, ['project', 'field-list', P, '--owner', owner, '--format', 'json'])
  const status = ((fields && fields.fields) || []).find((f) => String(f.name).toLowerCase() === 'status')
  mirror.board = { projectId: proj.id, owner, number: P, fieldId: status ? status.id : null, options: new Map(((status && status.options) || []).map((o) => [String(o.name).toLowerCase(), o.id])) }
  return mirror.board
}

async function mirrorGoal($, state, flag) {
  const m = run.manifest || {}
  if (!m.issue) return
  const label = goalLabel(state, flag)
  if (config.labels && mirror.label !== label) {
    try {
      await ensureLabels($)
      const cur = await ghJson($, ['issue', 'view', String(m.issue.number), '--json', 'labels'])
      const stale = ((cur && cur.labels) || []).map((l) => l.name).filter((n) => n.startsWith(LABEL_PREFIX) && n !== label)
      const args = ['issue', 'edit', String(m.issue.number), '--add-label', label]
      for (const n of stale) args.push('--remove-label', n)
      await ghRun($, args)
      mirror.label = label
    } catch (err) {
      $.ui.log('baton: could not label issue #' + m.issue.number + ': ' + err.message)
    }
  }
  const column = boardColumn(state, flag, config.boardStatusMap)
  if (config.boardProject && column && mirror.column !== column) {
    try {
      const b = await boardIds($)
      const opt = b.options.get(column.toLowerCase())
      const item = await ghJson($, ['project', 'item-add', b.number, '--owner', b.owner, '--url', m.issue.url, '--format', 'json'])
      if (!b.fieldId || !opt) {
        if (!mirror.boardWarned) {
          mirror.boardWarned = true
          await noteQuietly($, 'board project ' + b.number + ' has no Status column "' + column + '": added the issue, left its column (map it with boardStatusMap)', 'github')
        }
      } else {
        await ghRun($, ['project', 'item-edit', '--id', item.id, '--project-id', b.projectId, '--field-id', b.fieldId, '--single-select-option-id', opt])
      }
      mirror.column = column
    } catch (err) {
      $.ui.log('baton: could not move the board card: ' + err.message)
    }
  }
}

/** Is the main checkout clean apart from baton's own state? (talos: a subagent's cd does not persist, so writes leak.) */
async function checkoutClean($) {
  try {
    const r = await $.process.run(['git', 'status', '--porcelain'], { timeoutMs: 15000 })
    if (r.exitCode !== 0) return null
    const dirty = r.stdout.split('\n').map((l) => l.slice(3).trim()).filter((f) => f && !/^(_orch|\.baton)(\/|$)/.test(f) && !/^"?(_orch|\.baton)\//.test(f))
    return dirty.length === 0
  } catch {
    return null
  }
}

// ------------------------------------------------------------------ the tracker

async function exists($, path) {
  try {
    return await $.fs.exists(path)
  } catch {
    return false
  }
}

/** Load the measured rows once per run: _orch/track/*.json, one file per transition (rule 6.3). */
async function loadTrackRows($) {
  const id = (run.manifest && run.manifest.run_id) || null
  if (track.loadedFor === id) return
  track.rows = []
  track.snap = {}
  track.loadedFor = id
  const files = ((await listDir($, '_orch/track')) ?? []).filter((x) => x.kind === 'file' && x.name.endsWith('.json')).map((x) => x.name).sort().slice(-5000)
  for (const f of files) {
    const r = await readJson($, '_orch/track/' + f)
    if (r && r.level && r.id && r.state) {
      track.rows.push(r)
      track.snap[r.level + ':' + r.id] = { level: r.level, id: r.id, state: r.state }
    }
  }
}

/**
 * Observe the record and recompute every entity's state: the goal, the PR,
 * each phase, each node. Changes are appended as rows. Cheap enough at a
 * 10-second cadence: a handful of reads per node.
 */
async function observe($, force = false) {
  if (!force && Date.now() - track.at < TRACK_TTL_MS) return track.view
  track.at = Date.now()
  if (!(await runActive($))) return (track.view = null)
  await loadTrackRows($)
  const m = run.manifest || {}
  const graphText = await (async () => {
    try {
      return await $.fs.read('_orch/plan/graph.yaml')
    } catch {
      return null
    }
  })()
  const phaseOfNode = graphPhases(graphText)
  const nodes = []
  const nodeDirs = ((await listDir($, '_orch/nodes')) ?? []).filter((x) => x.kind === 'directory').map((x) => x.name).sort(byId).slice(0, 400)
  for (const id of nodeDirs) {
    const base = '_orch/nodes/' + id
    const st = await readJson($, base + '/status.json')
    const vd = await readJson($, '_orch/verify/' + id + '-verdict.json')
    let handoff = ''
    try {
      handoff = await $.fs.read(base + '/handoff.md')
    } catch {}
    const facts = {
      exempt: /\brgb:\s*exempt\b/i.test(handoff),
      red: await exists($, base + '/work/red.txt'),
      green: await exists($, base + '/work/green.txt'),
      blue: await exists($, base + '/work/blue.txt'),
      started: !!st || (await exists($, base + '/work')),
      status: st && st.verdict,
      verdict: vd && vd.verdict,
    }
    nodes.push({ id, phase: phaseOfNode.get(id) ?? null, ...nodeState(facts), status: facts.status })
  }
  const phaseNums = new Set([...phaseOfNode.values()])
  for (const d of (await listDir($, '_orch/phases')) ?? []) {
    const mm = /^P(\d+)$/.exec(d.name)
    if (d.kind === 'directory' && mm && Number(mm[1]) > 0) phaseNums.add(Number(mm[1]))
  }
  const phases = []
  for (const n of [...phaseNums].sort((a, b) => a - b)) {
    const id = 'P' + n
    const env = await readJson($, '_orch/phases/' + id + '/envelope.json')
    const verdict = env ? env.verdict ?? null : null
    const mine = nodes.filter((x) => x.phase === n)
    const p = phaseState({
      brief: await exists($, '_orch/phases/' + id + '/brief.md'),
      dispatched: mine.some((x) => x.flag !== 'pending'),
      envelopeVerdict: verdict,
      approved: approvals.approvedPhases.has(id) || (!config.phaseGate && !!verdict && /^DONE/.test(verdict)),
      sentBack: approvals.sentBack.has(id),
    })
    phases.push({ id, ...p, nodes: mine })
  }
  const pr = prState(gh.pr, gh.review, gh.ready)
  const goal = goalState({
    planned: !!graphText,
    anyPhase: phases.some((x) => x.flag !== 'pending'),
    allPhasesDone: phases.length > 0 && phases.every((x) => x.state === 'verified' || x.state === 'approved'),
    review: gh.review && gh.review.verdict,
    ready: !!(gh.ready && gh.ready.ok),
    prState: pr && pr.state,
    blocked: nodes.some((x) => x.status === 'BLOCKED'),
  })
  // Measure: one row per entity whose computed state moved.
  const next = { ['goal:' + (m.run_id || 'run')]: { level: 'goal', id: m.run_id || 'run', state: goal.state } }
  if (pr) next['pr:' + gh.pr.number] = { level: 'pr', id: String(gh.pr.number), state: pr.state }
  for (const p of phases) if (p.flag !== 'pending') next['phase:' + p.id] = { level: 'phase', id: p.id, state: p.state }
  for (const x of nodes) if (x.flag !== 'pending') next['node:' + x.id] = { level: 'node', id: x.id, state: x.state }
  const ts = new Date(Date.now()).toISOString()
  for (const row of transitions(track.snap, next, ts)) {
    track.rows.push(row)
    try {
      // One file per row (rule 6.3): milliseconds and the state in the name, so two moves in one second never collide.
      await $.fs.write('_orch/track/' + ts.replace(/[-:]/g, '').replace('.', '') + '-' + row.level + '-' + String(row.id).replace(/[^A-Za-z0-9._-]/g, '_') + '-' + row.state + '.json', JSON.stringify(row) + '\n')
    } catch {}
  }
  track.snap = next
  await mirrorGoal($, goal.state, goal.flag)
  // Open questions, with the line each one rests on (explicit: a person fixes the cause; interpreted: a person may overrule it).
  const questions = []
  const inbox = ((await listDir($, '_orch/inbox')) ?? []).filter((x) => x.kind === 'file').map((x) => x.name)
  for (const f of inbox.filter((n) => /^Q-[^.]+\.md$/.test(n)).sort(byId)) {
    if (inbox.includes(f.replace(/\.md$/, '.answer.md'))) continue
    let text = ''
    try {
      text = await $.fs.read('_orch/inbox/' + f)
    } catch {}
    questions.push({ id: f.replace(/\.md$/, ''), first: firstLine(text), blockedBy: parseBlockedBy(text) })
    await notify($, 'q:' + (m.run_id || '') + f, 'a question waits for you: ' + firstLine(text).slice(0, 120))
  }
  await loadSpend($)
  const now = Date.now()
  const tl = (level, id, ladder) => timeline(track.rows.filter((r) => r.level === level && r.id === id), LADDERS[ladder], now)
  track.view = {
    goal: { ...goal, tl: tl('goal', m.run_id || 'run', 'goal'), issue: m.issue || null, target: m.target },
    pr: pr ? { ...pr, tl: tl('pr', String(gh.pr.number), 'pr'), number: gh.pr.number, url: gh.pr.url, checks: checksLine(gh.pr), review: gh.review, ready: gh.ready } : null,
    phases: phases.map((p) => ({ ...p, tl: tl('phase', p.id, 'phase'), nodes: p.nodes.map((x) => ({ ...x, tl: tl('node', x.id, x.ladder) })) })),
    unphased: nodes.filter((x) => x.phase == null).map((x) => ({ ...x, tl: tl('node', x.id, x.ladder) })),
    questions,
    spend: { total: spend.total, budget: budgetNow(), byPhase: spend.byPhase, byNode: spend.byNode },
  }
  return track.view
}

/** The tracker as plain lines: -p, /baton status, and the tests. */
/** " · 41k" (and the budget on the goal line). */
function spendTail(acc, budget) {
  if (!acc || !acc.fresh) return ''
  const c = shortUsd(costOf(acc, config.prices))
  return ' · ' + shortTokens(acc.fresh) + (budget && budget.status !== 'off' ? ' of ' + shortTokens(budget.limit) + ' (' + budget.pct + '%)' : '') + (c ? ' · ' + c : '')
}

function questionLine(q) {
  return q.id + ' ' + q.first + (q.blockedBy ? '  — blocked by ' + q.blockedBy.where + ' (' + q.blockedBy.kind + (q.blockedBy.kind === 'interpreted' ? ': you may overrule it' : ': fix the cause') + ')' : '')
}

function trackLines(v) {
  if (!v) return ['no run is active here']
  const out = []
  const g = v.goal
  out.push((g.issue ? 'goal #' + g.issue.number + ' ' + g.issue.title + ' ' + g.issue.url : 'goal ' + (g.target || '')) )
  out.push('  ' + stepperText(g, g.tl) + spendTail(v.spend.total, v.spend.budget))
  if (v.pr) {
    out.push('PR #' + v.pr.number + ' ' + v.pr.url + ' · ' + v.pr.checks + (v.pr.review ? ' · review ' + v.pr.review.verdict + ' (' + v.pr.review.high + ' high, ' + v.pr.review.med + ' med)' : ''))
    out.push('  ' + stepperText(v.pr, v.pr.tl))
    if (v.pr.ready) for (const r of v.pr.ready.rows) out.push('    ' + (r.ok ? '✓ ' : '✗ ') + r.row)
  } else out.push('PR: none yet' + (gh.error ? ' (' + gh.error + ')' : ''))
  for (const p of v.phases) {
    out.push(p.id + '  ' + stepperText(p, p.tl) + spendTail(v.spend.byPhase[p.id]))
    for (const x of p.nodes.slice(0, 16)) out.push('    ' + x.id + '  ' + stepperText(x, x.tl) + spendTail(v.spend.byNode[x.id]))
    if (p.nodes.length > 16) out.push('    … ' + (p.nodes.length - 16) + ' more')
  }
  for (const q of v.questions || []) out.push('? ' + questionLine(q))
  return out
}

export function register(on, options) {
  if (options) {
    if (Number.isFinite(Number(options.rotateAtPercent))) config.rotateAtPercent = Number(options.rotateAtPercent)
    if (Number.isFinite(Number(options.wakeBudgetLines))) config.wakeBudgetLines = Math.max(4, Math.floor(Number(options.wakeBudgetLines)))
    if (options.memoryDir) config.memoryDir = String(options.memoryDir)
    if (Number.isFinite(Number(options.prPollSeconds))) config.prPollSeconds = Number(options.prPollSeconds)
    if (Number.isFinite(Number(options.tokensPerGoal))) config.tokensPerGoal = Number(options.tokensPerGoal)
    if (Number.isFinite(Number(options.quietOutputLines))) config.quietOutputLines = Number(options.quietOutputLines)
    if (options.autoPane === false || options.autoPane === 'false') config.autoPane = false
    if (Number.isFinite(Number(options.readHintLines))) config.readHintLines = Number(options.readHintLines)
    if (Number.isFinite(Number(options.agentContextWarnPercent)) && Number(options.agentContextWarnPercent) > 0) config.agentContextWarnPercent = Number(options.agentContextWarnPercent)
    if (options.prices) {
      try {
        config.prices = typeof options.prices === 'string' ? JSON.parse(options.prices) : options.prices
      } catch {}
    }
    if (options.labels === false || options.labels === 'false') config.labels = false
    if (Number.isFinite(Number(options.boardProject))) config.boardProject = Number(options.boardProject)
    if (options.boardOwner) config.boardOwner = String(options.boardOwner)
    if (options.forbiddenFiles) {
      const extra = String(options.forbiddenFiles).split(',').map((x) => x.trim()).filter(Boolean)
      config.forbiddenFiles = Array.from(new Set([...FORBIDDEN_DEFAULT, ...extra]))
    }
    if (options.approvals === false || options.approvals === 'false') config.approvals = false
    if (options.phaseGate === false || options.phaseGate === 'false') config.phaseGate = false
  }

  // ---------------------------------------------------------------- load

  on('session.start', async ($, e, next) => {
    // BATON_AUTOROTATE=0: never rotate on the measured threshold; only /baton rotate does
    // (experiment E1 drives rotation at fixed indices to match its compaction arm).
    try {
      const auto = await $.env.get('BATON_AUTOROTATE')
      config.autoRotate = !(auto !== undefined && auto !== null && /^(0|false|off|no)$/i.test(String(auto).trim()))
    } catch {}
    // BATON_APPROVALS=0: no command gate and no phase gate (unattended runs that may push).
    try {
      const ap = await $.env.get('BATON_APPROVALS')
      if (ap !== undefined && ap !== null && /^(0|false|off|no)$/i.test(String(ap).trim())) {
        config.approvals = false
        config.phaseGate = false
      }
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
    // The code tools exist in every session the mod is loaded in, and the index
    // warms in the background so the first query is already fast.
    try {
      await registerCodeTools($)
      $.clock.after(0, () => codeRun($, ['index']).catch((err) => $.ui.log('baton: code index: ' + err.message)))
    } catch (err) {
      $.ui.log('baton: could not register the code tools: ' + err.message)
    }
    try {
      const q = await $.env.get('BATON_QUIET')
      if (q !== undefined && q !== null && /^(0|false|off|no)$/i.test(String(q).trim())) config.quietOutputLines = 0
    } catch {}
    // The memory tools exist for a run; a session with none sees no new tools.
    if (await runActive($)) {
      try {
        await registerMemoryTools($)
      } catch (err) {
        $.ui.log('baton: could not register the memory tools: ' + err.message)
      }
    }
    // The ticker: runs what a command hook may not — the compaction /baton
    // rotate owes, the kickoff prompt /baton start owes — from outside any
    // command's frame. Cheap when idle: two flag checks.
    // The pane opens by itself, and plan usage refreshes on the clock: no /baton needed.
    $.clock.after(500, () => autoOpenPane($).catch(() => {}))
    try {
      $.clock.every(30000, () => readUsage($).then(() => $.ui.invalidate('ui.render')))
    } catch {}
    // GitHub: poll the run's PR while a run is active (cheap when none is).
    if (!gh.timer) {
      try {
        gh.timer = $.clock.every(Math.max(30, config.prPollSeconds) * 1000, () => pollGithub($).then(() => observe($, true)))
      } catch {}
    }
    if (!rotation.ticker) {
      try {
        rotation.ticker = $.clock.every(150, async () => {
          if (run.kickoff) {
            const text = run.kickoff
            run.kickoff = null
            $.prompt.submit({ text }).catch((err) => $.ui.log('baton: could not start the prime: ' + err.message))
          }
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
        description: 'baton v7: start | stop | rotate | status | watch | next | rule | rulings | retract | enforce — or no argument for the run pane',
        argumentHint: '[start <MODE> <TARGET|#issue> | stop | rotate | status | watch [label] | next [#issue] | rule <text> | rulings | retract <#> | enforce <#> <regex>]',
        immediate: true,
      })
    } catch (err) {
      $.ui.log('baton: /baton not registered: ' + err.message)
    }
    return next(e)
  })

  // ---------------------------------------------------------------- the prime guard

  on('tool.call', async ($, e, next) => {
    addToolCall(tree, isPrimeCall(e) ? PRIME : e.agentId, e.tool)
    if (pane.open && pane.tab === 'agents') $.ui.invalidate('ui.render')
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

  // ---------------------------------------------------------------- approvals

  // Forbidden files: refuse a `git add` that names one, from any agent, run or no
  // run. Prevention at the moment it happens; the PR's merge-ready row catches
  // what a broad `git add -A` let through.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const hits = forbiddenHits(gitAddPaths(e.command), config.forbiddenFiles)
    if (!hits.length) return next(e)
    if (await runActive($)) await noteQuietly($, 'refused git add of ' + hits.join(', ') + ' for ' + chain(tree, isPrimeCall(e) ? PRIME : e.agentId), 'approval')
    return { deny: 'baton: ' + hits.join(', ') + ' matches a forbidden-file pattern (secrets, keys, env files) and is never committed. Leave it untracked; if the work needs it, return BLOCKED and say why.' }
  })

  // The command gate: an irreversible shell command from any agent, at any
  // depth, waits for the operator. Nobody to ask (claude -p) refuses it.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!config.approvals || !(await runActive($))) return next(e)
    const gate = gateFor(e.command)
    if (!gate || approvals.always.has(gate.id)) return next(e)
    const who = chain(tree, isPrimeCall(e) ? PRIME : e.agentId)
    approvals.asked++
    let answer = null
    try {
      const rulings = (await rulingLines($, 5))
      answer = await $.ui.ask(commandQuestion({ who, command: e.command, gate, rulings }), [APPROVE, alwaysLabel(gate), REFUSE])
    } catch {
      answer = null
    }
    const verdict = answer === null ? { refuse: '__nobody__' } : readCommandAnswer(answer, gate)
    if (verdict === 'approve' || verdict === 'always') {
      if (verdict === 'always') approvals.always.add(gate.id)
      approvals.approved++
      await noteQuietly($, 'operator approved (' + gate.id + (verdict === 'always' ? ', for the run' : '') + ') for ' + who + ': ' + e.command, 'approval')
      return next(e)
    }
    approvals.refused++
    const reason = verdict.refuse
    await noteQuietly($, 'operator refused (' + gate.id + ') for ' + who + ': ' + e.command + (reason && reason !== '__nobody__' ? ' — ' + reason : ''), 'approval')
    if (reason === '__nobody__') {
      // Nobody here: ask on the PR thread, where /approve <gate> answers it for the run.
      const n = await askOnThread($, '**baton:** `' + who + '` wants to ' + gate.label + ':\n\n```\n' + String(e.command).slice(0, 600) + '\n```\n\nReply `/approve ' + gate.id + '` to allow every "' + gate.label + '" for this run.')
      return {
        deny:
          'baton: "' + gate.label + '" needs the operator\'s approval, and nobody can be asked here' +
          (n ? '; it was asked on PR #' + n + ' (/approve ' + gate.id + ')' : ' (no interactive surface, no PR thread)') +
          '. Do not retry it another way: return BLOCKED with the exact command, and it is re-dispatched once approved.',
      }
    }
    return { deny: 'baton: the operator refused "' + gate.label + '"' + (reason ? ': ' + reason : '') + '. Do not retry it another way; carry on without it or return BLOCKED.' }
  })

  // The phase gate: once a sub-orchestrator reports DONE, the prime's next
  // dispatch waits until the operator approves that phase or sends it back.
  on('tool.call', { tool: /^(Agent|Task)$/ }, async ($, e, next) => {
    if (!isPrimeCall(e) || !config.phaseGate || !approvals.queue.length || !(await runActive($))) return next(e)
    while (approvals.queue.length) {
      const item = approvals.queue[0]
      let answer = null
      try {
        answer = await $.ui.ask(phaseQuestion(item, await rulingLines($, 5)), [APPROVE, SEND_BACK])
      } catch {
        answer = null
      }
      if (answer === null) return next(e) // dismissed: leave it queued, do not stall the run
      approvals.queue.shift()
      $.ui.invalidate('ui.render')
      const v = readPhaseAnswer(answer)
      const phase = phaseOf(item.label)
      if (v === 'approve') {
        approvals.approved++
        if (phase) {
          approvals.approvedPhases.add(phase)
          approvals.sentBack.delete(phase)
        }
        await noteQuietly($, 'operator approved ' + item.label + ': ' + item.line, 'approval')
        continue
      }
      approvals.refused++
      if (phase) {
        approvals.sentBack.add(phase)
        approvals.approvedPhases.delete(phase)
      }
      await noteQuietly($, 'operator sent back ' + item.label + (v.sendBack ? ': ' + v.sendBack : ''), 'approval')
      return {
        deny:
          'baton: the operator sent back ' + item.label + (v.sendBack ? ' — "' + v.sendBack + '"' : ' without a reason (ask what is wrong)') +
          '. Before dispatching anything else, re-dispatch that phase with the operator\'s reason as its directive.',
      }
    }
    return next(e)
  })

  // ---------------------------------------------------------------- the kit

  on('tool.call', { tool: /^mcp__baton__code_/ }, async ($, e) => serveCodeTool($, e))

  // A Read of a large source file runs as asked; its result carries a pointer to
  // code_fetch, and the mod counts it (the experiment in #48 decides whether this
  // ever becomes a redirect).
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const r = await next(e)
    try {
      if (r && !r.deny && config.readHintLines && langOf(e.file_path) && !e.offset && !e.limit) {
        const text = typeof r.result === 'string' ? r.result : ''
        const n = text ? text.split('\n').length : 0
        if (n > config.readHintLines) {
          kit.bigReads++
          kit.bigReadLines += n
          const hint = 'baton: that was all ' + n + ' lines of ' + e.file_path + '. Next time, mcp__baton__code_fetch with the symbol name (or the path, for its outline) returns only the part you need.'
          return { ...r, context: [...(r.context ?? []), hint] }
        }
      }
    } catch {}
    return r
  })

  // Quiet output: a long shell result is cut to head, failures and tail; the whole goes to a file.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const r = await next(e)
    try {
      if (!r || r.deny || !config.quietOutputLines || typeof r.result !== 'string' || /--json\b/.test(String(e.command)) || /^\s*[[{]/.test(r.result)) return r
      const n = r.result.split('\n').length
      if (n <= config.quietOutputLines) return r
      const dir = (await runActive($)) ? '_orch/out' : '.baton/out'
      const file = dir + '/' + new Date(Date.now()).toISOString().replace(/[-:.]/g, '') + '-' + (e.agentId ? String(e.agentId).slice(0, 8) : 'main') + '.log'
      await $.fs.write(file, r.result)
      if (dir === '.baton/out') {
        try {
          if (!(await $.fs.exists('.baton/out/.gitignore'))) await $.fs.write('.baton/out/.gitignore', '*\n')
        } catch {}
      }
      const q = quietText(r.result, config.quietOutputLines, file)
      if (!q) return r
      kit.quieted++
      kit.quietLinesTotal += n
      kit.quietLinesKept += q.split('\n').length
      return { ...r, result: q }
    } catch {
      return r
    }
  })

  // Notifications reach the desktop when Claude Code next lets a hook emit one.
  on('classic.Stop', withNotice)
  on('classic.Notification', withNotice)

  // Enforced rulings: a standing ruling with a pattern refuses matching shell
  // commands outright, run or no run, after the permission rules decide.
  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const decided = await next(e)
    const hit = enforcedHit(await loadRulings($), e.input && e.input.command)
    if (!hit) return decided
    return { decision: 'deny', reason: 'baton ruling #' + hit.n + ' (enforced): ' + hit.text }
  })

  // ---------------------------------------------------------------- rotation

  on('session.measure', async ($, e, next) => {
    if (Array.isArray(e.rateLimits) && e.rateLimits.length) {
      usage.limits = e.rateLimits
      $.ui.invalidate('ui.render')
    }
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

  // The operator's words become run notes, and any standing rule in them a
  // ruling (in the background: the turn does not wait on the cheap model).
  // After a rotation, the prompt also carries the wake.
  on('prompt.submit', async ($, e, next) => {
    if (!e.agentId && isOperatorPrompt(e.text, run.lastKickoff) && (await runActive($))) {
      const text = String(e.text)
      try {
        await appendNote($, 'run', text, 'operator')
      } catch (err) {
        $.ui.log('baton: could not note the operator prompt: ' + err.message)
      }
      $.clock.after(0, async () => {
        const rule = await extractRuling($, text)
        if (!rule) return
        try {
          await recordRuling($, rule)
          $.ui.log('baton: ruling recorded — ' + rule)
        } catch (err) {
          $.ui.log('baton: could not record a ruling: ' + err.message)
        }
      })
    }
    // Belt and braces for the wake: if no SessionStart carried it, this prompt does.
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
      case 'rule': {
        const text = rest.join(' ').trim()
        if (!text) return { text: 'usage: /baton rule <a standing instruction> — recorded in the project memory; the newest ruling wins' }
        return { text: 'baton: ruling ' + (await recordRuling($, text, 'ruling-hand')) }
      }
      case 'watch': {
        try {
          gh.queue = await ghJson($, ['issue', 'list', '--label', rest[0] || 'baton', '--state', 'open', '--json', 'number,title,url', '--limit', '50'])
        } catch (err) {
          return { text: 'could not list issues with gh: ' + err.message }
        }
        $.ui.invalidate('ui.render')
        return { text: gh.queue.length ? 'baton queue (label ' + (rest[0] || 'baton') + '):\n' + gh.queue.map((x) => '  #' + x.number + ' ' + x.title).join('\n') + '\n/baton next starts the first once this run is merged or stopped' : 'no open issues labeled ' + (rest[0] || 'baton') }
      }
      case 'next': {
        const m = run.manifest
        const v = await observe($, true)
        const done = !m || m.closed || (v && (v.goal.state === 'merged' || v.goal.state === 'ready'))
        if (!done) return { text: 'baton: this run is still ' + (v ? v.goal.state : 'active') + ' — /baton next starts the next goal once it is ready or merged, or after /baton stop' }
        const nextIssue = rest[0] ? { number: issueRef(rest[0]) || Number(rest[0]) } : gh.queue.find((x) => !m || !m.issue || x.number !== m.issue.number)
        if (!nextIssue || !nextIssue.number) return { text: 'no next goal: /baton watch fills the queue, or /baton next #<n>' }
        if (m) {
          if (!m.closed) await batonStop($)
          const dest = '.baton/runs/' + m.run_id
          const r = await $.process.run(['sh', '-c', 'mkdir -p .baton/runs && mv _orch "$1"', 'sh', dest], { timeoutMs: 30000 })
          if (r.exitCode !== 0) return { text: 'could not archive _orch to ' + dest + ': ' + (r.stderr || r.stdout) }
          forgetRunCache()
        }
        return { text: (m ? 'archived ' + m.run_id + ' to .baton/runs/. ' : '') + (await batonStart($, 'BUILD #' + nextIssue.number)) }
      }
      case 'retract': {
        const n = /^#?(\d+)$/.exec(rest.join(' ').trim())
        if (!n) return { text: 'usage: /baton retract <ruling #>' }
        const r = (await loadRulings($, true)).find((x) => x.n === Number(n[1]))
        if (!r) return { text: 'no standing ruling #' + n[1] + ' (/baton rulings lists them)' }
        await recordRuling($, 'retract #' + r.n + ': ' + r.text, 'retract')
        return { text: 'baton: ruling #' + r.n + ' retracted' }
      }
      case 'enforce': {
        const p = parseEnforce(rest.join(' '))
        if (typeof p === 'string') return { text: p }
        const r = (await loadRulings($, true)).find((x) => x.n === p.n)
        if (!r) return { text: 'no standing ruling #' + p.n + ' (/baton rulings lists them)' }
        await recordRuling($, 'enforce #' + p.n + ' /' + p.source + '/', 'enforce')
        return { text: 'baton: ruling #' + p.n + ' is enforced — shell commands matching /' + p.source + '/ are refused' }
      }
      case 'rulings': {
        const lines = await rulingLines($, 50)
        return { text: lines.length ? RULINGS_HEAD + '\n' + lines.join('\n') : 'no rulings yet (/baton rule <text>, or say it in a run)' }
      }
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
    const { Box, Text, Button, Input, Link } = $.ui.resolve(e)
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
          return refreshPane($, (e.props.scroll && e.props.scroll.bodyRows) || 30)
        },
      }),
    )
    const rows = (e.props.scroll && e.props.scroll.bodyRows) || 30
    tabs.push(Button({ key: 'refresh', label: 'refresh', hotkey: 'r', plain: true, dimColor: true, onPress: () => refreshPane($, rows) }))
    const line = (key, text, extra = {}) => Text({ key, wrap: 'truncate-end', ...extra, children: [String(text).slice(0, Math.max(20, cols * 2)) || ' '] })
    const ui = { Box, Text, Button, Input, Link, line, rows, cols }
    const body =
      pane.tab === 'track' ? trackBody($, ui) : pane.tab === 'agents' ? agentsBody($, ui) : pane.tab === 'memory' ? memoryBody($, ui) : pane.tab === 'rulings' ? rulingsBody($, ui) : (pane.data[pane.tab] ?? []).map((l, i) => line('l' + i, l))
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
    const { Box, Text } = $.ui.resolve(e)
    const theirs = await next(e)
    // Every session: plan usage. Then, in a run, the gauge, the goal and what waits for you.
    const use = Box({ key: 'usage', flexDirection: 'row', children: usageSegs(usage.limits, usage.cost).map((x, i) => Text({ key: 'u' + i, wrap: 'truncate-end', ...(x.color ? { color: x.color } : { dimColor: true }), children: [x.text] })) })
    if (!(run.active || run.startedHere)) {
      const ctx = typeof rotation.lastPercent === 'number' ? Text({ key: 'ctx', dimColor: true, children: ['context ' + rotation.lastPercent + '%' + (tree.nodes.size > 1 ? ' · ' + (tree.nodes.size - 1) + ' agents · /baton for the table' : '')] }) : null
      return Box({ flexDirection: 'column', children: [use, ...(ctx ? [ctx] : []), ...(theirs ? [theirs] : [])] })
    }
    const line = gaugeLine({
      percent: rotation.lastPercent,
      threshold: config.rotateAtPercent,
      rotations: rotation.count,
      notes: pane.memoryNotes,
      phase: run.manifest && run.manifest.phase,
      width: e.props.bodyColumns,
    })
    const color = gaugeColor(rotation.lastPercent, config.rotateAtPercent)
    const flag = approvals.queue.length
      ? [Text({ key: 'queue', wrap: 'truncate-end', color: 'yellow', children: ['baton ⚑ ' + approvals.queue.length + ' phase' + (approvals.queue.length === 1 ? '' : 's') + ' waiting for your check (' + approvals.queue.map((q) => q.label).join(', ') + ') — asked before the next dispatch · /baton → Agents'] })]
      : []
    const v = track.view
    const goal = v
      ? [Text({ key: 'goal', wrap: 'truncate-end', dimColor: true, children: [(v.goal.issue ? '#' + v.goal.issue.number + ' ' : 'goal ') + v.goal.state + (v.goal.flag ? ' (' + v.goal.flag + ')' : '') + spendTail(v.spend.total, v.spend.budget) + (v.pr ? ' · PR #' + v.pr.number + ' ' + v.pr.state + (v.pr.flag ? ' (' + v.pr.flag + ')' : '') + ' · ' + v.pr.checks : '') + (v.pr && v.pr.ready && v.pr.ready.ok ? ' · ready for you to merge' : '')] })]
      : []
    return Box({ flexDirection: 'column', children: [use, Text({ key: 'gauge', wrap: 'truncate-end', ...(color ? { color } : {}), children: [line] }), ...goal, ...flag, ...(theirs ? [theirs] : [])] })
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
    if (e.agentId) {
      finishAgent(tree, e.agentId, { line: firstLine(e.answer), aborted: e.isAborted })
      const who = spawnedByPrime.get(e.agentId)
      if (who && !e.isAborted && config.phaseGate && String(who.type ?? '').replace(/^baton:/, '') === 'sub-orchestrator' && claimsDone(firstLine(e.answer)) && (await interactive($))) {
        approvals.queue.push({ agentId: e.agentId, label: who.name || who.description || 'a phase', line: firstLine(e.answer), at: Date.now() })
        await notify($, 'phase:' + e.agentId, (who.name || who.description || 'a phase') + ' is done and waits for your check')
      }
      $.ui.invalidate('ui.render')
    }
    if (e.agentId && live.delete(e.agentId)) $.ui.invalidate('ui.render')
    if (!e.agentId && pane.open) $.clock.after(0, () => refreshPane($, 30))
    // A finished turn is a natural point to write the metered spend down.
    if (run.active || run.startedHere) await saveSpend($, true)
    // Any finished turn may have moved a state; the tracker's TTL keeps this cheap.
    $.clock.after(0, () => observe($).then(() => $.ui.invalidate('ui.render')).catch(() => {}))
    // A subagent the prime dispatched returned: its one line becomes a note
    // (unless its SubagentHandback call already carried it).
    // The prime's own reply: its first line is the decision it just made.
    if (!e.agentId && !e.isAborted && (await runActive($))) {
      const line = firstLine(e.answer)
      if (line) {
        try {
          await appendNote($, 'run', line, 'prime-reply')
        } catch (err) {
          $.ui.log('baton: could not note the prime reply: ' + err.message)
        }
      }
    }
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
  // Spend: every model request, metered by the agent that made it. The response
  // streams on untouched; only its usage is read.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    try {
      if (result && result.usage) {
        const inRun = run.active || run.startedHere
        if (inRun) await loadSpend($)
        meter(e.agentId, result.usage)
        if (e.agentId) await maybeNudge($, e.agentId)
        const b = budgetNow()
        if (inRun && b.status === 'warn' && !spend.warned) {
          spend.warned = true
          await noteQuietly($, 'spend at ' + b.pct + '% of the goal budget (' + shortTokens(b.used) + ' of ' + shortTokens(b.limit) + '); another fix round will need the operator at 100%', 'budget')
        }
        if (inRun) await saveSpend($)
        if (pane.open) $.ui.invalidate('ui.render')
      }
    } catch {}
    return result
  })

  on('agent.spawn', async ($, e, next) => {
    let input = e
    if (await runActive($)) {
      // The budget guards another round of reviewing or fixing (talos: "may it start another fix round?").
      if (isRoundSpawn(e)) {
        await loadSpend($)
        const b = budgetNow()
        if (b.status === 'exceeded') {
          await noteQuietly($, 'refused ' + (e.description || e.subagentType) + ': goal budget spent (' + shortTokens(b.used) + ' of ' + shortTokens(b.limit) + ')', 'budget')
          await notify($, 'budget:' + ((run.manifest && run.manifest.run_id) || ''), 'the goal budget is spent; the next round needs you')
          return { deny: 'baton: the goal budget is spent (' + shortTokens(b.used) + ' of ' + shortTokens(b.limit) + ' fresh tokens). Do not start another review or fix round: brief the operator with the open findings and ask whether to raise tokensPerGoal.' }
        }
      }
      // A reviewer on a PR that conflicts with its base reviews code that will change; resolve first.
      if (String(e.subagentType || '').replace(/^.*:/, '') === 'pr-reviewer' && gh.pr && gh.pr.mergeable === 'CONFLICTING') {
        return { deny: 'baton: PR #' + gh.pr.number + ' conflicts with its base. Dispatch a sub-orchestrator to merge the base into the branch (never rebase) and re-run the checks, then the reviewer.' }
      }
      const model = bindModel(e)
      if (model && e.model !== model) {
        input = { ...e, model }
        if (e.model) $.ui.log('baton: ' + (e.subagentType || 'agent') + ' bound to ' + model + ' (asked for ' + e.model + ')')
      }
    }
    const r = await next(input)
    if (r && r.agentId) {
      probe.spawned.add(r.agentId)
      addSpawn(tree, { id: r.agentId, parent: e.parentAgentId, type: e.subagentType, label: e.name || e.description, model: r.model || input.model })
      if (!pane.open) $.clock.after(0, () => autoOpenPane($).catch(() => {}))
      if (!e.parentAgentId) {
        spawnedByPrime.set(r.agentId, { type: e.subagentType, description: e.description, name: e.name })
        live.set(r.agentId, String(e.name || e.description || e.subagentType || 'agent').slice(0, 32))
        $.ui.invalidate('ui.render')
      }
    }
    return r
  })
}
