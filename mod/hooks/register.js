// baton v7 — the hooks module.
//
// A prime orchestrator that never reads: during an active run the main
// session keeps an allowlist of tools (Agent, AskUserQuestion, SendMessage,
// ToolSearch, the mod's memory tools) and everything else is refused with the
// route. Subagents (sub-orchestrators, workers, verifiers) pass untouched.
//
// A run is active when the session's directory holds _orch/manifest.json with
// "prime": true (what /baton start writes), or /baton start ran here. Which
// session is the run's own is recorded once, at session.start (spec T7): the
// directory it started in and the manifest's prime_session, never the current
// directory after a cd.

import { agentIdVerified, guardDecision, isPrimeCall, manifestIsPrime, VERIFIED_AGENTID_VERSION } from '../lib/guard.mjs'
import { clampBytes, cleanTag, currentMarks, cutBytes, fallbackMerge, idRange, isRejectedReply, lastMark, MARK_GLYPH, MARK_VALUES, MARK_WORD, markId, markLines, markOf, MERGE_STRICT, MERGE_SYSTEM, mergePrompt, rebuildReason, supersededLine, toRegex, voidsIn } from '../lib/memcore.mjs'
import { mightBeRuling } from '../lib/rulings.mjs'
import { lessonBlock, lessonNote, lessonsFromVerdict, parseLessonNote, relevantLessons } from '../lib/lessons.mjs'
import { activeRulings, enforcedHit, fallbackRuling, isOperatorPrompt, parseEnforce, parseRuling, RULING_SYSTEM, rulingLine, rulingPrompt, RULINGS_HEAD } from '../lib/rulings.mjs'
import { addSpawn, addToolCall, chain, effortOf, finishAgent, lifecycle, modelMismatch, newTree, phaseOfAgent, PRIME, subtree, treeRows } from '../lib/agents.mjs'
import { langOf } from '../lib/codeidx.mjs'
import { quietText } from '../lib/quiet.mjs'
import { contextNudge, contextOf, costOf, ctxTone, PRICES, shortUsd, windowFor } from '../lib/ledger.mjs'
import { addUsage, boardColumn, budgetCheck, FORBIDDEN_DEFAULT, forbiddenHits, gitAddPaths, goalLabel, isRoundSpawn, LABEL_COLORS, LABEL_PREFIX, parseBlockedBy, shortTokens, spendMarkdown, workOf } from '../lib/ledger.mjs'
import { stepperMini, stepperMiniText } from '../lib/track.mjs'
import { agentTable, components, sumAccounts, tableFloor, tokensIn } from '../lib/table.mjs'
import { shortModel, toolDetail } from '../lib/agents.mjs'
import { agentDetail, blockedBrief, blockedByLine, detailText, nodeDetail, nodesBlocked, phaseDetail, questionDefault, questionDetail, questionOptions, resolveTarget, rulingDetail, memDetail } from '../lib/detail.mjs'
import { checksLine, goalState, graphPhases, latestReview, LADDERS, mergeReady, nextGate, nodeState, parseCommands, phaseState, prState, questionColor, questionState, stepper, stepperText, timeline, transitions, unauthorizedAnswer } from '../lib/track.mjs'
import { alwaysLabel, answerRecord, APPROVE, askedRecord, blockGrant, claimsDone, GATES, commandQuestion, gateFor, phaseQuestion, readCommandAnswer, readPhaseAnswer, REFUSE, SEND_BACK } from '../lib/approve.mjs'
import { bindModel, CHEAP, FRONTIER, MECH } from '../lib/binding.mjs'
import { assignLetters, bandSegs, compareVersions, installedCopy, KEY_ACCENT, listEnd, listReveal, listWindow, memTableCells, memTableHeader, ROW_LETTERS, rowKeyIds, usageSegs } from '../lib/view.mjs'
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

// Run membership (spec T7, Q-7, Q-8, Q-29): recorded at session.start, keyed to the session id
// and the manifest's prime_session {id, heartbeat_at}. Recorded by whichever of session.start and the
// startup SessionStart runs first (ensureMembership); only if that fails does the manifest under the
// current directory decide, as before.
const membership = {
  recorded: false, // session.start, the startup SessionStart or /baton start recorded this session's membership
  member: false, // this session is the run's own: the guard arms and it writes run notes
  dir: null, // the run's directory, recorded with it
  id: null, // the session id this session last wrote to prime_session
  runId: null, // the run the start saw, member or not
  why: null, // why this session is not armed (Q-29), or why it was disarmed (Q-8); on the band
  once: null, // the one recording of this process, by session.start or the startup SessionStart, whichever runs first
  unasked: null, // {id, why, other}: left unarmed by a start that could not tell a person is at the prompt
  takeoverWake: null, // the pick-up text owed to the next prompt after a take-over (P4-d3), or null
}
// The session's own model ($.session.model()), read at session.start and on /baton: the prime's row
// shows it until a request of its own names what served, and a mismatch compares against it (T8, Q-22).
const sessionOwn = { model: null }
async function readSessionModel($) {
  try {
    const m = await $.session.model()
    if (m) sessionOwn.model = String(m)
  } catch {}
}
const PRIME_LIVE_MS = 90000 // Q-7: a prime whose heartbeat is under 90 s old is live
const TAKE_OVER = 'Take over as the prime'
const STAY_UNARMED = 'Stay unarmed'

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
// Two tabs: Work is everything happening (the goal, the PR, the agents, the plan, what waits for
// you); Memory is everything the run remembers (your rulings, then the memory itself).
const TABS = [
  { id: 'work', label: 'Work', hotkey: '1' },
  { id: 'memory', label: 'Memory', hotkey: '2' },
]
const pane = {
  open: false,
  waiting: false, // auto-opened but not placed: the terminal is too narrow for an unasked pane
  tab: 'work',
  planOpen: false, // Work: every node of every phase, not just one line per phase
  detail: null, // Work: { kind: agent|phase|node, id, view } opened with Enter on a row; b closes it
  mdetail: null, // Memory: a ruling's view, or a note's or summary's (with .mem, its row), opened with Enter on its row
  memStore: 'run', // Memory: the store the explorer shows, 'run' or 'project' (Q-92); the view opens on the run's
  memFilter: null, // Memory: null, 'ok' (confirmed only, 3) or 'void' (void only, 4)
  memHint: null, // Memory: the hint line, what the last mark key did or why it did nothing
  memFocusRow: null, // Memory: the row the focus ring is on (Q-71), kept while it is on the c, v, u keys
  memRowKeys: new Map(), // Memory: each drawn row Button's key -> its row
  memRows: [], // Memory: one row per table line { which, ns, id, lo, hi, level }
  memViews: {}, // Memory: 'run|' or 'project|<ns>' -> its marks (markView)
  timer: null,
  refreshedAt: null,
  data: { plan: ['(not read yet)'], memory: ['(not read yet)'], rulings: ['(not read yet)'], track: ['no run is active here'] },
  memoryNotes: null, // run-memory note count, for the band
  marksSeen: 0, // bumped by every mark and rebuild, so the Memory view reads its marks again
  memTiles: [], // the memory tab's blocks, parallel to its view lines
  memLines: [],
  rulings: [], // the standing rulings, for the Rulings tab
  target: null, // the agent the Agents tab's message field writes to
  letters: new Map(), // Work: each row's direct key ('agent:<id>', 'phase:<id>', 'q:<question id>' or 'blocked:<node id>' -> a letter of ROW_LETTERS), held while the row is listed
  lettersRun: null, // the run whose stored letters were read back (Q-82)
  lettersSaved: null, // stored letters of rows not listed again yet: identity -> letter
  lettersText: null, // what was last stored
  // Work: the agent list's window (T15): its top row by identity (Q-65) and index, and its last layout.
  // `alias`: the list keys Home and End swapped so the key the ring holds is drawn on the row it moves to (drawn <- natural).
  list: { top: 0, topKey: null, on: false, fits: true, n: 0, area: 0, size: 0, ids: [], pins: [], items: [], win: new Set(), keys: new Set(), first: new Set(), last: new Set(), ring: [], focus: null, alias: new Map() },
}

// What the prime is doing now, for the spinner: its live dispatches.
const live = new Map() // agentId -> label

// The whole tree under the prime, for the Agents tab and the approval questions.
let tree = newTree()

// Approvals: command gates remembered for this run, and phases waiting on the operator.
const approvals = {
  always: new Set(), // gate ids the operator approved for the rest of the run
  once: new Set(), // exact commands the operator approved once from a blocked row's brief (T13, Q-37); each lets one call through
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
const track = { snap: {}, rows: [], loadedFor: null, at: 0, view: null, dirty: true }
const TRACK_TTL_MS = 10000

// Tags the mod writes itself; a caller's memory_note may not take one (Q-3).
const RESERVED_TAGS = ['operator', 'prime-reply', 'ruling', 'ruling-hand', 'handoff', 'approval', 'budget', 'sub', 'prime']
const RESERVED_TAGS_TEXT = RESERVED_TAGS.join(', ') + ', L<k> (L followed by digits)'
const isReservedTag = (tag) => RESERVED_TAGS.includes(tag) || /^L\d+$/.test(tag)

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
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'one line, at most 280 bytes' },
        tag: { type: 'string', description: 'optional tag, e.g. decision ([A-Za-z0-9:_.-], 16 bytes); default your role. Reserved: ' + RESERVED_TAGS_TEXT },
      },
      required: ['text'],
    },
  },
  {
    name: 'memory_zoom',
    description: 'baton run memory: open a stretch of notes back up, e.g. "40-71" (inclusive note numbers from memory_wake). A wide range is shown within the budget, finest at its end.',
    inputSchema: {
      type: 'object',
      properties: { range: { type: 'string', description: 'lo-hi, as the #lo-hi labels in memory_wake' }, budget: { type: 'integer', minimum: 4, maximum: 400 }, include_void: { type: 'boolean', description: 'also show ❌ notes, with their reason (default false)' } },
      required: ['range'],
    },
  },
  {
    name: 'memory_recall',
    description: 'baton run memory: every note and summary matching a regex (case-insensitive), newest notes last. Use it for a node id, a question id, a criterion, an operator decision.',
    inputSchema: { type: 'object', properties: { pattern: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 200 }, include_void: { type: 'boolean', description: 'also return ❌ notes and the old text of rebuilt summaries (default false)' } }, required: ['pattern'] },
  },
  {
    name: 'memory_mark',
    description:
      'baton run memory: mark a note or a summary ✅ (ok: confirmed), ❌ (void) or clear it, with a one-line reason. A ❌ note leaves memory_wake, memory_recall and the summaries, which are rebuilt without it in the background; nothing is deleted. A mark the operator made cannot be replaced.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'a note number such as 48, or a summary range such as 48-51, as memory_wake prints them' },
        mark: { type: 'string', enum: MARK_VALUES },
        reason: { type: 'string', description: 'one line: why (the operator\'s words when you mark on their word)' },
      },
      required: ['id', 'mark', 'reason'],
    },
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
    inputSchema: { type: 'object', properties: { pattern: { type: 'string' }, namespace: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 200 }, include_void: { type: 'boolean', description: 'also return ❌ notes (default false)' } }, required: ['pattern'] },
  },
  {
    name: 'project_mark',
    description: "baton project memory (spans runs): mark a note or a summary ✅ (ok), ❌ (void) or clear it, as memory_mark does; optional namespace as in project_wake. Rulings are not marked: they are retracted.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'a note number, or a summary range lo-hi, as project_wake prints them' },
        mark: { type: 'string', enum: MARK_VALUES },
        reason: { type: 'string', description: 'one line: why' },
        namespace: { type: 'string' },
      },
      required: ['id', 'mark', 'reason'],
    },
  },
]

/** Is a baton run active? Reads _orch/manifest.json at most every MANIFEST_TTL_MS. */
async function runActive($) {
  const now = Date.now()
  if (now - run.checkedAt < MANIFEST_TTL_MS) return run.active || run.startedHere
  run.checkedAt = now
  if (membership.recorded && !membership.member) {
    // Not the run's own session: no cd and no manifest in the current directory arms it (T7).
    run.active = false
    run.manifest = null
    return false
  }
  let text = null
  try {
    text = await $.fs.read(manifestPath(membership.recorded ? membership.dir : null))
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

/** The manifest of the run in `dir` (absolute), or under the current directory when there is none. */
const manifestPath = (dir) => (dir ? dir + '/_orch/manifest.json' : '_orch/manifest.json')

async function readManifest($, dir) {
  try {
    return JSON.parse(await $.fs.read(manifestPath(dir)))
  } catch {
    return null
  }
}

async function writeManifest($, dir, m) {
  await $.fs.write(manifestPath(dir), JSON.stringify(m, null, 2) + '\n')
  forgetRunCache()
}

const isOpenPrime = (m) => !!m && m.prime === true && m.closed !== true

async function sessionId($) {
  try {
    const id = await $.session.id()
    return id ? String(id) : null
  } catch {
    return null
  }
}

/** When prime_session was last heard from (ms), or null. D-T17-heartbeat-format: an ISO string; a number is read too. */
function heardAt(ps) {
  const t = typeof ps.heartbeat_at === 'number' ? ps.heartbeat_at : Date.parse(String(ps.heartbeat_at))
  return Number.isFinite(t) ? t : null
}

/** The live prime of another session that the manifest names (Q-7: heard under 90 s ago), or null. */
function livePrimeElsewhere(m, id) {
  const ps = m && m.prime_session
  if (!ps || !ps.id || String(ps.id) === id) return null
  const t = heardAt(ps)
  if (t === null || Date.now() - t >= PRIME_LIVE_MS) return null
  return { id: String(ps.id), ago: Math.max(0, Math.round((Date.now() - t) / 1000)) }
}

/** Q-29's words for an unarmed second session. */
const notArmedLine = (runId, other) =>
  'baton: run ' + runId + ' has a live prime in another session (' + other.id.slice(0, 8) + ', heard ' + other.ago + 's ago); this session is not armed'

/** Write this session into the manifest's prime_session with a fresh heartbeat (Q-7). Needs the session id. */
async function writePrimeSession($, id) {
  if (!id) return
  const m = await readManifest($, membership.dir)
  if (!isOpenPrime(m)) return
  m.prime_session = { id, heartbeat_at: new Date(Date.now()).toISOString() }
  await writeManifest($, membership.dir, m)
  membership.id = id
}

/** This session is the run's prime: it arms, and writes its id (a manifest without prime_session is claimed, Q-7). */
async function claimRun($, id) {
  membership.member = true
  membership.why = null
  forgetRunCache()
  try {
    await writePrimeSession($, id)
  } catch (err) {
    $.ui.log('baton: could not record this session as the prime: ' + err.message)
  }
}

function stayUnarmed($, why) {
  membership.member = false
  membership.why = why
  run.active = false
  run.startedHere = false
  forgetRunCache()
  $.ui.log(why)
  $.ui.invalidate('ui.render')
}

/**
 * session.start: record whether this session is the run's own (spec T7). It is when it starts in
 * the run's directory and the manifest names no other live prime. With a live prime elsewhere it
 * stays unarmed and says why (Q-29); interactive, it is asked first whether to take over (Q-8).
 */
async function recordMembership($, e) {
  let dir = e && e.cwd ? String(e.cwd) : null
  if (!dir) {
    try {
      dir = await $.session.cwd()
    } catch {}
  }
  Object.assign(membership, { recorded: true, member: false, dir: dir || null, id: null, runId: null, why: null, unasked: null })
  run.active = false
  forgetRunCache()
  const m = await readManifest($, membership.dir)
  if (!isOpenPrime(m)) return
  membership.runId = String(m.run_id ?? '?')
  const id = await sessionId($)
  const other = livePrimeElsewhere(m, id)
  if (!other) return claimRun($, id)
  const why = notArmedLine(membership.runId, other)
  const known = !!e && typeof e.isInteractive === 'boolean'
  const ask = known ? e.isInteractive : await interactive($)
  if (!ask) {
    // The startup SessionStart has no isInteractive: session.start may still say a person is there, and ask.
    if (!known) membership.unasked = { id, why, other }
    return stayUnarmed($, why)
  }
  scheduleAsk($, id, why, other)
}

// Asked once the session is up, not inside its start; unarmed until the answer is yes.
function scheduleAsk($, id, why, other) {
  membership.unasked = null
  $.clock.after(0, () => askTakeover($, id, why, other).catch(() => stayUnarmed($, why)))
}

/**
 * Record run membership once per process, before anything reads it (T7). At Claude Code 2.1.316 the
 * startup SessionStart hook runs before session.start, so whichever comes first records it and the
 * other waits on the same recording: until then the manifest under the current directory would decide,
 * and a second session in the run's directory would be told it is the prime. A start that could not
 * tell a person is at the prompt left the session unarmed; session.start, which can, asks then (Q-8).
 */
async function ensureMembership($, e) {
  if (!membership.once) {
    membership.once = recordMembership($, e).catch((err) => {
      membership.recorded = false // could not record: the manifest under the current directory decides, as before
      membership.once = null
      throw err
    })
    return membership.once
  }
  await membership.once
  const u = membership.unasked
  if (u && e && e.isInteractive === true && membership.recorded && !membership.member) scheduleAsk($, u.id, u.why, u.other)
}

/** What a session that picks the run up (restart, resume, take-over) is told: it is the prime, and must wake. */
const pickUpContext = (m) =>
  'baton: this session is the prime of run ' + (m.run_id || '?') + ' (MODE ' + (m.mode || '?') + ', TARGET ' + (m.target || '?') + '), which an earlier session started. ' +
  'Load the baton prime skill, then call mcp__baton__memory_wake before anything else and continue the run from what it shows. You never read, run or edit anything yourself: dispatch.'

async function askTakeover($, id, why, other) {
  let answer = null
  try {
    answer = await $.ui.ask(
      'Run ' + membership.runId + ' has a live prime in another session (' + other.id.slice(0, 8) + ', heard ' + other.ago + 's ago), which disarms at its next tick if you take over. Take over as its prime in this session?',
      [TAKE_OVER, STAY_UNARMED],
    )
  } catch {}
  if (answer !== TAKE_OVER) return stayUnarmed($, why)
  await claimRun($, id)
  try {
    await registerMemoryTools($)
  } catch {}
  // The startup SessionStart has already run, unarmed: the next prompt carries the pick-up a restart gets (P4-d3).
  membership.takeoverWake = pickUpContext((await readManifest($, membership.dir)) || { run_id: membership.runId })
  $.ui.log('baton: this session took over as the prime of run ' + membership.runId)
  $.ui.invalidate('ui.render')
}

/**
 * The prime's heartbeat, on the 30 s usage tick (Q-7): refresh prime_session.heartbeat_at, and
 * after a /clear write the new session id. Another id there means another session took over:
 * this one disarms and says so on its band (Q-8).
 */
async function heartbeat($) {
  if (!membership.recorded || !membership.member || !membership.id) return
  const m = await readManifest($, membership.dir)
  if (!isOpenPrime(m)) return
  const ps = m.prime_session
  if (ps && ps.id && String(ps.id) !== membership.id) {
    return stayUnarmed($, 'baton: run ' + String(m.run_id ?? '?') + ' was taken over by another session (' + String(ps.id).slice(0, 8) + '); this session is disarmed')
  }
  await writePrimeSession($, (await sessionId($)) || membership.id)
}

/** session.end: the prime clears prime_session (Q-7). A /clear goes on under a new id, which the next tick writes. */
async function releaseRun($, e) {
  if (e.reason === 'clear' || !membership.member || !membership.id) return
  const m = await readManifest($, membership.dir)
  if (!isOpenPrime(m) || !m.prime_session || String(m.prime_session.id) !== membership.id) return
  m.prime_session = null
  await writeManifest($, membership.dir, m)
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
    // The run's own session writes to the run it started in, wherever it has cd'd since (T7).
    dir = (membership.recorded && membership.member && membership.dir ? membership.dir : await $.session.cwd()) + '/_orch/memory'
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
  pane.tab = 'work'
  try {
    const r = await $.ui.open({ id: PANE, title: 'baton', closeOnEscape: true }) // no focus: it opens beside the work, unfocused
    pane.open = !r || r.isPlaced !== false
    // Too narrow to place a pane nobody asked for: it waits, and the band says how to open it.
    pane.waiting = !pane.open
  } catch {
    return
  }
  await refreshPane($, 30)
  try {
    if (!pane.timer) pane.timer = $.clock.every(5000, () => (pane.open ? refreshPane($, 30) : null))
  } catch {}
}

// What the code tools and quiet output did, for /baton status and the experiment (#48).
const kit = { checkpoints: 0, codeCalls: 0, codeOut: 0, bigReads: 0, bigReadLines: 0, quieted: 0, quietLinesKept: 0, quietLinesTotal: 0, toolsRegistered: false }

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

const notices = { pending: [], sent: new Set() }

async function notify($, key, text) {
  if (notices.sent.has(key)) return
  notices.sent.add(key)
  try {
    $.ui.toast(text)
  } catch {}
  notices.pending.push(text)
}

/** What is waiting, as one line for a native notification; null when nothing waits. */
function pendingNotice() {
  if (!notices.pending.length) return null
  return notices.pending.splice(0).join(' · ').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 240)
}

// ------------------------------------------------------------------ doctor and pause
//
// /baton doctor, also run once in the background when a session starts: everything the mod
// leans on, checked, so a missing gh or an expired login says so instead of failing quietly.

const doctor = { checks: null, at: null }

async function runQuiet($, argv, timeoutMs = 10000) {
  try {
    const r = await $.process.run(argv, { timeoutMs })
    return { ok: r.exitCode === 0, out: String(r.stdout || r.stderr || '').trim().split('\n')[0] }
  } catch (err) {
    return { ok: false, out: err && err.message ? err.message : String(err) }
  }
}

async function runDoctor($) {
  const checks = []
  const add = (name, ok, detail, fix) => checks.push({ name, ok, detail, fix })
  const node = await runQuiet($, ['node', '--version'])
  add('node', node.ok, node.out, 'install Node 18 or later: the memory, the code index and the tests run on it')
  const git = await runQuiet($, ['git', 'rev-parse', '--show-toplevel'])
  add('git repository', git.ok, git.ok ? git.out : 'not a git repository here', 'the code index, checkpoints and the clean-checkout row want one')
  const ghv = await runQuiet($, ['gh', '--version'])
  add('gh', ghv.ok, ghv.out, 'install the GitHub CLI for issue goals, PR polling and labels (brew install gh)')
  if (ghv.ok) {
    const auth = await runQuiet($, ['gh', 'auth', 'status'], 15000)
    add('gh login', auth.ok, auth.ok ? 'logged in' : auth.out, 'run gh auth login')
  }
  const rg = await runQuiet($, ['rg', '--version'])
  add('ripgrep', rg.ok, rg.ok ? rg.out : 'not found (code_refs falls back to a slower scan)', 'optional: brew install ripgrep')
  const verified = agentIdVerified(probe.version)
  add('Claude Code version', verified, String(probe.version || 'unknown'), 'the prime guard needs Claude Code ' + VERIFIED_AGENTID_VERSION + ' or later; on an older version it fails closed')
  let memOk = true
  try {
    await memoRun($, [...(await memoryArgs($, 'project')), '--json', 'stats'])
  } catch {
    memOk = false
  }
  add('project memory', memOk, memOk ? config.memoryDir : 'unreadable', 'check that ' + config.memoryDir + ' is writable')
  await checkUpdate($).catch(() => {})
  if (!update.installed) add('baton version', true, (update.local || '?') + ' from a checkout (updates come with git pull)', '')
  else if (update.state === 'available') add('baton version', false, update.local + ' installed, ' + update.remote + ' published', 'press 9 in an empty prompt, or claude plugin update baton@baton')
  else add('baton version', true, (update.local || '?') + (update.remote ? ' (latest)' : ' (could not reach GitHub to compare)'), '')
  doctor.checks = checks
  doctor.at = Date.now()
  $.ui.invalidate('ui.render')
  return checks
}

function doctorText(checks) {
  return ['baton doctor:', ...checks.map((c) => (c.ok ? '  ✓ ' : '  ✗ ') + c.name + ' — ' + c.detail + (c.ok ? '' : '  → ' + c.fix))].join('\n')
}

/** The one band line a failed check earns (the optional ones never do). */
function doctorWarning() {
  const bad = (doctor.checks || []).filter((c) => !c.ok && c.name !== 'ripgrep' && c.name !== 'git repository' && c.name !== 'baton version')
  return bad.length ? 'baton doctor: ' + bad.map((c) => c.name).join(', ') + ' — /baton doctor' : null
}

// ------------------------------------------------------------------ lessons
//
// A refuted criterion becomes a lesson in the project memory's `lessons` namespace (lib/lessons.mjs),
// and a worker or sub-orchestrator later spawned on the same part of the code gets the relevant
// ones in its prompt. Recorded by the tracker as it reads verdicts; injected at agent.spawn.

const LESSONS_NS = 'lessons'
const lessons = { seen: null, notes: [], at: 0, recorded: 0, injected: 0, spawnsTaught: 0 }

async function lessonsSeen($) {
  if (lessons.seen) return lessons.seen
  let keys = []
  try {
    keys = (await $.store.get('lessons-seen')) || []
  } catch {}
  lessons.seen = new Set(keys)
  return lessons.seen
}

async function recordLessons($, node, verdict, handoff) {
  const found = lessonsFromVerdict(node, verdict, handoff)
  if (!found.length) return
  const seen = await lessonsSeen($)
  let added = 0
  for (const l of found) {
    if (seen.has(l.key)) continue
    seen.add(l.key)
    try {
      await appendNote($, 'project', lessonNote(l), 'lesson', LESSONS_NS)
      lessons.recorded++
      added++
    } catch {}
  }
  if (added) {
    lessons.at = 0
    try {
      await $.store.set('lessons-seen', [...seen].slice(-2000))
    } catch {}
  }
}

async function loadLessons($) {
  if (Date.now() - lessons.at < 15000) return lessons.notes
  lessons.at = Date.now()
  try {
    const r = JSON.parse(await memoRun($, [...(await memoryArgs($, 'project', LESSONS_NS)), '--json', 'recall', '--limit', '500', '--', '.']))
    lessons.notes = r.notes || []
  } catch {
    lessons.notes = []
  }
  return lessons.notes
}

// ------------------------------------------------------------------ checkpoints
//
// Before a command that discards work (reset --hard, clean -f, rm -r) runs, the whole working
// tree (tracked and untracked, ignored files aside) is committed to a hidden ref through a
// temporary index, so neither the branch, the index nor the files move. /baton restore <id>
// puts the files back.

const CHECKPOINT_REF = 'refs/baton/checkpoints/'

async function checkpoint($, why) {
  // Milliseconds in the id, and update-ref told the ref must not exist: two checkpoints in one
  // second (the one taken before a restore, and the one restored) never overwrite each other.
  const id = new Date(Date.now()).toISOString().replace(/[-:.]/g, '')
  const script =
    'set -e; git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 3; ' +
    // a path that does not exist yet: git rejects an empty file as an index
    'tmp=$(mktemp -u); trap "rm -f $tmp" EXIT; export GIT_INDEX_FILE=$tmp; ' +
    'git add -A . >/dev/null 2>&1; tree=$(git write-tree); ' +
    'parent=$(git rev-parse -q --verify HEAD || true); ' +
    'c=$(git -c user.name=baton -c user.email=baton@localhost commit-tree $tree ${parent:+-p $parent} -m "$1"); ' +
    'git update-ref "$2" "$c" ""; echo "$c"'
  try {
    const r = await $.process.run(['sh', '-c', script, 'sh', 'baton checkpoint: ' + String(why).slice(0, 200), CHECKPOINT_REF + id], { timeoutMs: 60000 })
    if (r.exitCode !== 0) return null
    kit.checkpoints++
    return id
  } catch {
    return null
  }
}

async function listCheckpoints($) {
  const r = await $.process.run(['git', 'for-each-ref', '--sort=-refname', '--format=%(refname:lstrip=3)\t%(subject)', CHECKPOINT_REF], { timeoutMs: 15000 })
  return r.exitCode === 0 ? r.stdout.split('\n').filter(Boolean).map((l) => l.split('\t')) : []
}

// ------------------------------------------------------------------ updates
//
// Claude Code auto-updates a third-party marketplace only if you turn that on. So the mod checks
// for itself: at most every six hours it reads the published version, and when a newer one is
// out the band says so; 9 runs `claude plugin update baton@baton`, then /reload-plugins loads it.

const UPDATE_SOURCE = 'https://raw.githubusercontent.com/ckluis/baton/main/mod/.claude-plugin/plugin.json'
const update = { local: null, remote: null, installed: false, state: null, message: null }

async function checkUpdate($, force = false) {
  try {
    update.local = JSON.parse(await $.fs.read($.plugin.root + '/.claude-plugin/plugin.json')).version || null
  } catch {}
  update.installed = installedCopy($.plugin.root)
  if (!update.installed) return update
  if (!force) {
    try {
      const last = Number((await $.store.get('update-checked-at')) || 0)
      if (Date.now() - last < 6 * 3600 * 1000) {
        update.remote = (await $.store.get('update-remote')) || null
        if (update.remote && update.local && compareVersions(update.remote, update.local) > 0) update.state = 'available'
        return update
      }
    } catch {}
  }
  try {
    const full = await $.process.run(['curl', '-fsSL', '--max-time', '8', UPDATE_SOURCE], { timeoutMs: 12000 })
    if (full.exitCode === 0) update.remote = JSON.parse(full.stdout).version || null
  } catch {}
  try {
    await $.store.set('update-checked-at', Date.now())
    await $.store.set('update-remote', update.remote)
  } catch {}
  if (update.remote && update.local && compareVersions(update.remote, update.local) > 0) {
    update.state = 'available'
    await notify($, 'update:' + update.remote, 'baton ' + update.remote + ' is out (you have ' + update.local + '): 9 updates it')
  }
  $.ui.invalidate('ui.render')
  return update
}

async function applyUpdate($) {
  if (update.state !== 'available') return
  update.state = 'updating'
  $.ui.invalidate('ui.render')
  const r = await $.process.run(['claude', 'plugin', 'update', 'baton@baton'], { timeoutMs: 180000 }).catch((err) => ({ exitCode: 1, stderr: err.message }))
  if (r.exitCode === 0) {
    update.state = 'installed'
    update.message = 'baton ' + update.remote + ' installed: /reload-plugins to use it now (new sessions load it on their own)'
  } else {
    update.state = 'available'
    update.message = 'could not update: ' + String(r.stderr || r.stdout || '').trim().split('\n')[0] + ' — /plugin → Installed → baton → Update now'
  }
  try {
    $.ui.toast(update.message)
  } catch {}
  $.ui.invalidate('ui.render')
}

// Pause: hold every new spawn and every gated command until /baton resume.
const pause = { on: false, since: null, held: 0 }

/** A Read result's text: the declared record's file.content (claude-code-tools Read), or a plain string. */
function readResultText(res) {
  if (typeof res === 'string') return res
  const c = res && res.file && res.file.content
  return typeof c === 'string' ? c : ''
}

/** A Bash result's output: the declared record's stdout (claude-code-tools Bash), or a plain string; null when neither. */
function bashText(res) {
  if (typeof res === 'string') return res
  return res && typeof res.stdout === 'string' ? res.stdout : null
}

/** Stop and Notification: raise what is waiting as a native notification ($.ui.notify). */
async function withNotice($, e, next) {
  servedEffort($, e) // a Stop input carries the turn's served effort too (C8E)
  const r = await next(e)
  const text = pendingNotice()
  if (text) {
    try {
      await $.ui.notify(text, { title: 'baton' })
    } catch {}
  }
  return r
}

// ------------------------------------------------------------------ failure handling
//
// Every gating hook carries a `.catch` (spec T2; the K2 table). Fail closed where a failure must
// not open a door: once the hook had called next, what ran stands; before that, refuse when `door()`
// says this call is one the hook guards (a door that cannot tell is shut). "During a run" is read
// afresh with runActive: the hook may have failed before it asked. Fail open everywhere
// else: the call goes on as if the hook were absent, but the hook's own handler answers.

/** Does this Bash command discard work (the gates a checkpoint snapshots before)? */
function discards(e) {
  const g = gateFor(e.command)
  return !!g && (g.id === 'reset' || g.id === 'rm')
}

async function failClosed(e, next, what, door, kind = next.error.kind, called = next.called) {
  if (called) return next(e)
  let shut = true
  try {
    shut = await door()
  } catch {}
  if (!shut) return next(e)
  return { deny: 'baton: ' + what + ' failed (' + kind + '), so this call was refused. Do not retry it another way: return BLOCKED with the exact command or dispatch.' }
}

async function failOpen($, e, next) {
  return next(e)
}

/** A baton tool's own hook failed: answer with why, so the caller carries on without it. */
async function failOpenTool($, e, next) {
  return toolFailed(e, next.error.kind, next.error.message)
}

function toolFailed(e, kind, message) {
  return { result: 'baton: ' + e.tool + ' failed (' + kind + (message ? ': ' + message : '') + '); carry on without it.' }
}

// The tool.call hooks' own failure handling (R-C2-03/04/05/10). Engine 2.1.316 answers a throw in
// ANY of baton's tool.call hooks with the `.catch` of baton's FIRST tool.call registration only, so
// a hook's own `.catch` cannot be relied on to be the one asked. Two layers, each enough alone:
//   1. Every tool.call hook handles its own throw in its body (closedOnThrow / openOnThrow below):
//      a throw never leaves a gating hook, so no engine `.catch` decides it.
//   2. Every tool.call registration carries the same `.catch`, toolCallCaught, which knows every
//      tool.call door: whichever registration's `.catch` the engine asks (for a throw, a misreturn
//      or an overrun), it refuses a call any gating hook guards.
// The doors: is this call one the hook named `what` guards? It may throw; a door that cannot tell is
// shut. Named, not passed as functions: the engine follows $ only into this file's own functions.
async function doorShut($, e, what) {
  switch (what) {
    case 'the prime guard':
      return isPrimeCall(e) && (await runActive($))
    case 'the pause check':
      return pause.on && !!gateFor(e.command)
    case 'the command gate': {
      const gate = gateFor(e.command)
      return config.approvals && !!gate && !approvals.always.has(gate.id) && (await runActive($))
    }
    case 'the forbidden-file check':
      try {
        return forbiddenHits(gitAddPaths(e.command), config.forbiddenFiles).length > 0
      } catch {
        return /\bgit\b[\s\S]*\badd\b/.test(String(e.command))
      }
    case 'the checkpoint':
      return discards(e) && (await runActive($))
    case 'the phase gate':
      return isPrimeCall(e) && config.phaseGate && approvals.queue.length > 0 && (await runActive($))
    default:
      return true
  }
}

/** Which gating tool.call hooks see a call of this tool, in their order. */
function doorsFor(tool) {
  if (tool === 'Bash') return ['the prime guard', 'the pause check', 'the command gate', 'the forbidden-file check', 'the checkpoint']
  if (tool === 'Agent' || tool === 'Task') return ['the prime guard', 'the phase gate']
  return ['the prime guard']
}

/**
 * A gating tool.call hook's body, failing closed by itself: a throw in `body` refuses the call when
 * the hook's door says it guards the call (or cannot tell); once the body had called on, what ran
 * stands. The hook stays a function literal at its `on(...)` (the engine reads it so) and calls this.
 */
async function closedOnThrow($, e, next, what, body) {
  let settled = null
  try {
    return await body((x) => (settled = next(x)))
  } catch {
    if (settled) return settled
    return failClosed(e, next, what, () => doorShut($, e, what), 'throw', false)
  }
}

/** A baton tool's hook body, failing open by itself: a throw answers why, and the caller carries on. */
async function openOnThrow(e, body) {
  try {
    return await body()
  } catch (err) {
    return toolFailed(e, 'throw', err && err.message)
  }
}

/** The one `.catch` of every tool.call registration: what any of them would answer (see above). */
async function toolCallCaught($, e, next) {
  if (next.called) return next(e)
  let tool = ''
  try {
    tool = String(e.tool)
  } catch {}
  if (/^mcp__baton__(memory|project|code)_/.test(tool)) return failOpenTool($, e, next)
  const kind = next.error ? next.error.kind : 'throw'
  for (const what of doorsFor(tool)) {
    let shut = true
    try {
      shut = await doorShut($, e, what)
    } catch {}
    if (shut) return failClosed(e, next, what, () => true, kind, false)
  }
  return next(e)
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
        for (const item of ready.slice(0, 16)) lines.push(JSON.stringify({ level: item.level, index: item.index, summary: await summarize($, item, item.texts) }))
        await memoRun($, [...args, '--json', 'merge', '--summarize'], lines.join('\n') + '\n')
        did += lines.length
        // A new summary over a ❌ note holds it: rebuild it without (spec L423).
        const view = await markView($, args)
        for (const item of ready.slice(0, 16)) for (const [id] of voidsIn(view.cur, item.lo, item.hi)) scheduleRebuild($, job.which, job.namespace, id)
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

/**
 * One summary from the cheap model, with the strict ≤280-byte prompt. A reply that talks about its
 * own input (Q-78's patterns) is retried once with a stricter prompt; a second one, or no answer,
 * stores the deterministic fallbackMerge of the inputs, so the tree never stalls.
 */
async function summarize($, item, texts) {
  for (const system of [MERGE_SYSTEM, MERGE_STRICT]) {
    let reply = null
    try {
      const r = await $.model.complete({ model: CHEAP_MODEL, system, prompt: mergePrompt(item, texts), maxTokens: 200, effort: 'low', timeoutMs: 45000 })
      if (r.isAnswered) reply = clampBytes(r.text.split('\n').map((x) => x.trim()).filter(Boolean).join(' ')).text
    } catch {}
    if (!reply) break
    if (!isRejectedReply(reply)) return reply
  }
  return fallbackMerge(texts)
}

// ------------------------------------------------------------------ marks (T14)
//
// A note or a summary is marked ✅ (ok), ❌ (void) or cleared, with a one-line reason and who
// marked it: an appended record in the store's mark log (memo mark/marks, Q-74). The mod applies
// the marks: memory_wake, memory_zoom, memory_recall and their project twins leave a ❌ note out,
// and a summary over one is rebuilt without it, bottom up, in the background (Q-75, Q-76), its old
// text kept in the superseded log (Q-84). Only the operator (from the pane) and the run's prime
// (memory_mark, project_mark) mark (Q-73); rulings are retracted, not marked (Q-86).

const MARK_REFUSED = {
  agent: 'refused: only the operator and the prime mark (Q-73)',
  operator: "refused: the operator's mark stands (Q-74)",
  rulings: 'refused: rulings are retracted, not marked',
}

/** A memo answer as JSON, or `fallback` when the store cannot give one. */
async function memoJson($, args, fallback) {
  try {
    const v = JSON.parse(await memoRun($, args))
    return v ?? fallback
  } catch {
    return fallback
  }
}

/** A store's mark records, its current marks and (when anything is marked) its superseded log. */
async function markView($, args) {
  const recs = await memoJson($, [...args, '--json', 'marks'], [])
  const records = Array.isArray(recs) ? recs : []
  const sup = records.length ? await memoJson($, [...args, '--json', 'superseded'], []) : []
  return { records, cur: currentMarks(records), superseded: Array.isArray(sup) ? sup : [] }
}

/** The refusal for a session that is not the run's own (T7, Q-80), or null. */
async function outsideRun($) {
  if (!(membership.recorded && !membership.member)) return null
  const here = membership.runId || ((await readManifest($, null)) || {}).run_id || '?'
  return 'refused: this session is not in run ' + here + ' (T7)'
}

/**
 * A hook that would have noted on its own, in a session that is not the run's own (Q-80): it
 * writes nothing and logs one line. Silent where no run is here at all.
 */
async function notNoted($, what) {
  if (!(membership.recorded && !membership.member)) return
  const why = await outsideRun($)
  if (!membership.runId && !isOpenPrime(await readManifest($, null))) return
  $.ui.log('baton: ' + what + ' was not noted: ' + why.replace(/^refused: /, ''))
}

/** Write one mark record: `who` is operator or prime. A ❌ queues the rebuilds above it. */
async function writeMark($, which, namespace, id, mark, reason, who, session) {
  const args = await memoryArgs($, which, namespace)
  await memoRun($, [...args, '--json', '--who', who, ...(session ? ['--session', String(session)] : []), 'mark', '--', id, mark, '-'], reason)
  pane.marksSeen++
  if (mark === 'void') scheduleRebuild($, which, namespace, id)
  $.ui.invalidate('ui.render')
}

/** memory_mark and project_mark: the prime's mark (Q-73), refused for anyone else. */
async function markTool($, e, which) {
  if (e.agentId) return { deny: MARK_REFUSED.agent }
  const outside = await outsideRun($)
  if (outside) return { deny: outside }
  const namespace = which === 'project' ? cleanNamespace(e.namespace) : null
  if (namespace === RULINGS_NS) return { deny: MARK_REFUSED.rulings }
  const id = markId(e.id)
  if (!id) return { deny: 'baton: "' + String(e.id ?? '') + '" is not a note number or a summary range lo-hi, as ' + (which === 'project' ? 'project_wake' : 'memory_wake') + ' prints them; no mark made' }
  const mark = String(e.mark ?? '')
  if (!MARK_VALUES.includes(mark)) return { deny: 'baton: mark is ' + MARK_VALUES.join(', ') + '; no mark made' }
  const reason = cutBytes(e.reason)
  if (!reason && mark !== 'clear') return { deny: 'baton: a mark needs a one-line reason; no mark made' }
  const args = await memoryArgs($, which, namespace)
  const last = lastMark(await memoJson($, [...args, '--json', 'marks'], []), id)
  if (last && last.who === 'operator' && last.mark !== 'clear') return { deny: MARK_REFUSED.operator }
  await writeMark($, which, namespace, id, mark, reason, 'prime', membership.id || (await sessionId($)))
  return { result: 'marked #' + id + ' ' + MARK_WORD[mark] + (mark === 'void' ? '; the summaries above it are rebuilt without it, in the background' : '') }
}

const rebuilds = { queue: [], running: false, inFlight: new Set() }

/** Queue the rebuild of every summary above `id` (a note, or a summary and those above it), bottom up (Q-76). */
function scheduleRebuild($, which, namespace, id) {
  const key = which + '|' + (namespace ?? '') + '|' + id
  if (rebuilds.inFlight.has(key)) return
  rebuilds.inFlight.add(key)
  rebuilds.queue.push({ key, which, namespace, id })
  if (rebuilds.running) return
  rebuilds.running = true
  $.clock.after(0, () => rebuildPass($))
}

/** A summary's text, or a note's, read back through memo zoom (one block, or its two halves). */
async function blockLines($, args, lo, hi, budget) {
  const z = await memoJson($, [...args, '--json', 'zoom', '--budget', String(budget), '--', lo + '-' + hi], null)
  return z && Array.isArray(z.lines) ? z.lines.map((l, j) => ({ tile: z.tiles && z.tiles[j], text: lineText(l) })) : []
}

/** The text of a memo line: a note's after its tag, a summary's after its count. */
function lineText(l) {
  const n = /^#\d+ \S+ \[[^\]]*\] ?(.*)$/.exec(l)
  if (n) return n[1]
  const b = /^#\d+-\d+ \(\d+ notes\) ?(.*)$/.exec(l)
  return b ? (b[1].startsWith('(not merged yet)') ? null : b[1]) : null
}

async function rebuildPass($) {
  try {
    while (rebuilds.queue.length) {
      const job = rebuilds.queue.shift()
      try {
        await rebuildAbove($, job)
      } catch (err) {
        $.ui.log('baton: memory rebuild failed: ' + (err && err.message ? err.message : String(err)))
      } finally {
        rebuilds.inFlight.delete(job.key)
      }
    }
  } finally {
    rebuilds.running = false
    pane.marksSeen++
    $.ui.invalidate('ui.render')
  }
}

/** Rebuild the summaries above one ❌, lowest first, each from its children without the ❌ notes. */
async function rebuildAbove($, { which, namespace, id }) {
  const args = await memoryArgs($, which, namespace)
  const n = Number((await memoJson($, [...args, '--json', 'stats'], {})).notes) || 0
  let [lo, hi] = idRange(id)
  let size = hi - lo + 1
  if (size === 1) [lo, hi, size] = [lo - (lo % 2), lo - (lo % 2) + 1, 2] // a note: from the L1 above it
  for (; hi < n; size *= 2, lo = lo - (lo % size), hi = lo + size - 1) {
    const level = Math.log2(size)
    const own = await blockLines($, args, lo, hi, 1)
    if (!own.length || own[0].text == null || !own[0].tile || own[0].tile.level !== level) continue // no summary there: nothing to rebuild
    const { cur } = await markView($, args)
    const halves = await blockLines($, args, lo, hi, 2)
    const texts = halves.filter((h) => h.text != null && !(h.tile && h.tile.level === 0 && (cur.get(String(h.tile.lo)) || {}).mark === 'void')).map((h) => h.text)
    const text = texts.length ? await summarize($, { level, index: lo / size, lo, hi, ready: true }, texts) : 'every note of #' + lo + '-' + hi + ' is ❌ void'
    await memoRun($, [...args, '--json', 'rebuild', lo + '-' + hi, '--reason', rebuildReason(id), '-'], text)
  }
}

/** memo's wake, zoom or recall text with the marks applied (Q-76, Q-77, Q-84, Q-90); unchanged when nothing is marked. */
async function withMarks($, args, out, { includeVoid = false, pattern = null, which = 'run', namespace = null } = {}) {
  if (namespace === RULINGS_NS) return out
  const view = await markView($, args)
  if (!view.records.length) return out
  const end = out.endsWith('\n') ? '\n' : ''
  const lines = markLines(out.replace(/\n$/, '').split('\n'), view.cur, view.superseded, includeVoid)
  if (pattern !== null) {
    const re = toRegex(pattern)
    const old = includeVoid ? view.superseded.filter((x) => x && re.test(String(x.text ?? ''))) : []
    lines.push(...old.map(supersededLine))
    // The header counts what is shown; it does not echo the pattern, which may be a ❌ note's words.
    if (/^recall \//.test(lines[0] ?? '')) {
      const shown = lines.slice(1).filter((l) => /^#\d+ /.test(l)).length
      const blocks = lines.slice(1).filter((l) => /^#\d+-\d+[ :]/.test(l) && !l.includes(') superseded · ')).length
      lines[0] = 'recall: ' + shown + ' note(s), ' + blocks + ' summary block(s)' + (includeVoid ? ', ' + old.length + ' superseded' : ', ❌ void left out')
    }
  }
  // A ❌ whose rebuilds are not done and not queued (a session ended mid-rebuild): queue them now.
  if (!includeVoid) for (const [id, r] of view.cur) if (r.mark === 'void' && lines.some((l) => l.endsWith(': rebuilding (a note was voided)'))) scheduleRebuild($, which, namespace, id)
  return lines.join('\n') + end
}

// ------------------------------------------------------------------ approval notes (T14, Q-81)
//
// The note at approval records what the shell would run, parsed so that a heredoc body and a quoted
// string are data: `cat > f <<EOF … git push … EOF` reads `writes f`, not a push. The command gate's
// own matching is unchanged (Q-87). The note after the command records its exit code and what it
// changed that the mod can see: the files it wrote and the refs it pushed.

/** Split a command line into simple commands of words, with quotes removed and heredoc bodies skipped. */
function shellCommands(command) {
  const src = String(command ?? '')
  const cmds = []
  let words = []
  let word = null
  let heredocs = []
  const endWord = () => {
    if (word !== null) words.push(word)
    word = null
  }
  const endCmd = () => {
    endWord()
    if (words.length) cmds.push(words)
    words = []
  }
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '\n') {
      endCmd()
      // the bodies of the heredocs opened on this line are data, up to each one's terminator line
      let j = i + 1
      for (const tag of heredocs) {
        for (;;) {
          const e = src.indexOf('\n', j)
          const l = src.slice(j, e < 0 ? src.length : e)
          j = e < 0 ? src.length : e + 1
          if (e < 0 || l.replace(/^\t+/, '') === tag) break
        }
      }
      heredocs = []
      i = j - 1
      continue
    }
    if (c === "'" || c === '"') {
      const close = src.indexOf(c, i + 1)
      const end = close < 0 ? src.length : close
      word = (word ?? '') + src.slice(i + 1, end)
      i = end
      continue
    }
    if (c === '\\') {
      word = (word ?? '') + (src[i + 1] ?? '')
      i++
      continue
    }
    if (c === '<' && src[i + 1] === '<' && src[i + 2] !== '<') {
      endWord()
      let j = i + 2
      if (src[j] === '-') j++
      while (src[j] === ' ') j++
      const m = /^(['"]?)([A-Za-z0-9_.-]+)\1/.exec(src.slice(j))
      if (m) {
        heredocs.push(m[2])
        words.push('<<')
        i = j + m[0].length - 1
        continue
      }
    }
    if (c === ';' || c === '&' || c === '|' || c === '(' || c === ')') {
      endCmd()
      continue
    }
    if (c === '>' || c === '<') {
      endWord()
      let op = c
      if (src[i + 1] === '>' || src[i + 1] === '|') op += src[++i]
      if (src[i + 1] === '&') {
        i++ // >&2, 2>&1: to another descriptor, not a file
        while (/[0-9-]/.test(src[i + 1] ?? '')) i++
        continue
      }
      words.push(op)
      continue
    }
    if (c === ' ' || c === '\t') {
      endWord()
      continue
    }
    word = (word ?? '') + c
  }
  endCmd()
  return cmds
}

/** What a command does, as the approval notes say it: writes <file>, pushes <remote> <ref>, runs <name>. */
function commandEffects(command) {
  const out = []
  const add = (x) => (out.some((y) => y.kind === x.kind && y.what === x.what) ? null : out.push(x))
  for (const words of shellCommands(command)) {
    const plain = []
    let wrote = false
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      if (/^[0-9]*>{1,2}\|?$/.test(w) || w === '>' || w === '>>' || w === '>|') {
        const f = words[++i]
        if (f && f !== '/dev/null') add({ kind: 'writes', what: f })
        wrote = true
      } else if (w === '<' || w === '<<') i += w === '<' ? 1 : 0
      else if (/^[0-9]+$/.test(w) && /^>/.test(words[i + 1] ?? '')) continue
      else plain.push(w)
    }
    let k = 0
    while (k < plain.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(plain[k])) k++
    const name = plain[k]
    if (!name || name === 'cd') continue
    if (name === 'tee') {
      for (const f of plain.slice(k + 1)) if (!f.startsWith('-')) add({ kind: 'writes', what: f })
      continue
    }
    let g = k + 1
    while (name === 'git' && g < plain.length && plain[g].startsWith('-')) g += plain[g] === '-C' || plain[g] === '-c' ? 2 : 1
    if (name === 'git' && plain[g] === 'push') {
      const args = plain.slice(g + 1).filter((a) => !a.startsWith('-'))
      add({ kind: 'pushes', what: args.join(' '), remote: args[0] || null, refs: args.slice(1).map((r) => r.replace(/^\+/, '').split(':').pop()) })
      continue
    }
    if (!wrote) add({ kind: 'runs', what: name.split('/').pop() })
  }
  return out
}

const effectsText = (effects) => (effects.length ? effects.map((x) => x.kind + (x.what ? ' ' + x.what : '')).join('; ') : 'runs nothing the mod can name')

/** The note after an approved command: its exit code and what it changed that the mod can see. */
function afterNote(who, effects, r) {
  if (!r || r.deny) return 'approved command for ' + who + ' did not run' + (r && r.deny ? ': ' + firstLine(String(r.deny)) : '')
  const res = r.result && typeof r.result === 'object' ? r.result : {}
  const code = Number.isInteger(res.exitCode) ? res.exitCode : r.isError ? 1 : res.interrupted ? null : 0
  const parts = ['approved command for ' + who + ' finished: exit ' + (code === null ? '?' : code)]
  if (code === 0) {
    for (const x of effects) if (x.kind === 'writes') parts.push('wrote ' + x.what)
    const seen = new Set()
    for (const m of String(res.stderr ?? '').matchAll(/->\s+(\S+)/g)) seen.add(m[1])
    for (const x of effects) if (x.kind === 'pushes') for (const ref of x.refs) seen.add(ref)
    for (const ref of seen) parts.push('pushed ' + ref)
  }
  return parts.join('; ')
}

/** A run note that never throws (the caller has already decided). */
async function noteQuietly($, text, tag) {
  try {
    await appendNote($, 'run', text, tag)
  } catch (err) {
    $.ui.log('baton: could not note (' + tag + '): ' + err.message)
  }
}

/** A note tag for a subagent role (its spawn type minus baton:): sub-orchestrator → sub, else cut to 16 bytes. */
const roleTag = (role) => (role === 'sub-orchestrator' ? 'sub' : role.slice(0, 16))

/** The default note tag for a caller (Q-26): prime, its role tag, or agent for a subagent the mod did not see spawned. */
function callerRole(agentId) {
  if (!agentId) return 'prime'
  const n = tree.nodes.get(agentId)
  return n ? roleTag(n.role) : 'agent'
}

/** Note the one-line return of a subagent the prime dispatched. True when a note was written. */
async function noteReturn($, agentId, text) {
  if (!(await runActive($))) return false
  const who = spawnedByPrime.get(agentId)
  const line = firstLine(text)
  if (!who || !line) return false
  const tag = roleTag(String(who.type ?? 'agent').replace(/^baton:/, ''))
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

/**
 * The prime's guidance on putting a question (T13 addendum, Q-42): the asked record is what turns a queued `?`
 * row into `waiting for you`. inbox-gh.py sync writes it for a question it posts; the pane, for one answered there.
 */
const ASKED_GUIDANCE = 'When you put an open question to the operator (rule 10 step 2, at a gate), write _orch/inbox/Q-<id>.asked.md for it (through the sub-orchestrator that runs the gate, since you never edit): the lines asked_at: <measured UTC time>, asked_via: terminal|thread|pane and gate: G<n>. It is written once and never overwritten; until it exists the question is queued, not waiting for you.'

function kickoff(m) {
  const base =
    'baton v7 run ' + m.run_id + ' started — MODE ' + m.mode + ', TARGET ' + m.target + '. You are the PRIME orchestrator. ' +
    'Load the baton prime skill (Skill "baton:prime") for your standing orders. In short: you never read, run or edit anything — the mod refuses it; ' +
    'you dispatch. First dispatch one baton:sub-orchestrator to bootstrap the run (directive from the mode file, plan, plan verification) ' +
    'and return one line. Then dispatch one sub-orchestrator per phase. Note decisions with memory_note; after a rotation call memory_wake first. ' +
    ASKED_GUIDANCE
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
  const existing = await readManifest($, null)
  if (isOpenPrime(existing)) {
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
    baton: (update.local || '7'),
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
  // The manifest records the prime's session id (spec T7, Q-7): this session's.
  const sid = await sessionId($)
  if (sid) m.prime_session = { id: sid, heartbeat_at: now }
  await $.fs.write('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  let here = null
  try {
    here = await $.session.cwd()
  } catch {}
  Object.assign(membership, { recorded: true, member: true, dir: here || null, id: sid, runId: m.run_id, why: null })
  run.startedHere = true
  forgetRunCache()
  tree = newTree()
  approvals.always.clear()
  approvals.once.clear()
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
  const m = await readManifest($, null)
  run.startedHere = false
  forgetRunCache()
  if (!m || m.prime !== true) return 'no baton v7 run is active here'
  m.closed = true
  m.closed_at = new Date(Date.now()).toISOString()
  await writeManifest($, null, m)
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
  lines.push('lessons ' + lessons.recorded + ' recorded this session · ' + lessons.injected + ' carried into ' + lessons.spawnsTaught + ' spawn' + (lessons.spawnsTaught === 1 ? '' : 's') + (pause.on ? ' · PAUSED since ' + pause.since : ''))
  lines.push(
    'checkpoints ' + kit.checkpoints + ' this session (/baton checkpoints) · code tools ' + kit.codeCalls + ' calls · large reads ' + kit.bigReads + ' (' + kit.bigReadLines + ' lines) · quieted ' + kit.quieted + ' outputs (' + kit.quietLinesTotal + ' → ' + kit.quietLinesKept + ' lines)',
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
  // Memory: the wake view, a zoomed range from the browse stack, or a search. Skipped when no note
  // was written and the browse state is the same (the pane refreshes every five seconds).
  const memKey = memory.notes + '|' + pane.marksSeen + '|' + pane.memStore + '|' + browse.stack.join(',') + '|' + (browse.search || '') + '|' + budget
  if (pane.memKey === memKey && pane.memAt && Date.now() - pane.memAt < 60000) d.memory = pane.data.memory
  else try {
    pane.memKey = memKey
    pane.memAt = Date.now()
    pane.memViews = {}
    if (pane.memStore === 'project') d.memory = await readProjectMemory($, budget)
    else {
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
      pane.memRows = pane.memTiles.map((t) => memRowOf('run', null, t))
      pane.memViews['run|'] = await markView($, args)
    }
  } catch (err) {
    d.memory = [(pane.memStore === 'project' ? 'project' : 'run') + ' memory unreadable: ' + err.message]
    pane.memTiles = []
    pane.memLines = []
    pane.memRows = []
  }
  // Plan
  d.plan = trackLines(await observe($))
  // Rulings
  pane.rulings = await loadRulings($, false, RULINGS_PANE_TTL_MS)
  d.rulings = pane.rulings.length ? pane.rulings.map(rulingLine) : ['no rulings yet — say one during a run, type one below, or /baton rule <text>']
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
      Text({ bold: true, children: [label.padEnd(8).slice(0, 12) + ' '] }),
      ...segs.map((x) => Text({ wrap: 'truncate-end', ...(TONE[x.tone] ? { color: TONE[x.tone] } : { dimColor: x.tone === 'future' || x.tone === 'rail' }), children: [x.text] })),
    ],
  })
}

/** The goal's issue and its PR, as links to GitHub. */
function goalLinks({ Box, Text, Link }, key) {
  const v = track.view
  if (!v) return []
  const g = v.goal
  const kids = []
  if (g.issue) kids.push(Link({ href: g.issue.url, label: '#' + g.issue.number + ' ' + g.issue.title + ' ↗' }))
  else kids.push(Text({ bold: true, children: ['goal: ' + String(g.target || '').slice(0, 80)] }))
  if (v.pr) {
    kids.push(Text({ dimColor: true, children: ['·'] }))
    kids.push(Link({ href: v.pr.url, label: 'PR #' + v.pr.number + ' ↗' }))
    kids.push(Text({ dimColor: true, children: [v.pr.checks + (v.pr.review ? ' · review ' + v.pr.review.verdict + ' (' + v.pr.review.high + ' high, ' + v.pr.review.med + ' med)' : '')] }))
  }
  return [Box({ key, flexDirection: 'row', columnGap: 1, children: kids })]
}

/** Track: the goal, the PR (with the merge-ready rows), every phase and its nodes, each as measured steps. */
/** The merge-ready rows as one line: "merge-ready 4/6 · ✗ every check green · ✗ READY". */
function mergeLine(v) {
  if (!v || !v.pr || !v.pr.ready) return null
  const rows = v.pr.ready.rows
  const okN = rows.filter((r) => r.ok).length
  if (okN === rows.length) return { text: 'merge-ready ' + okN + '/' + rows.length + ' · waiting for you to merge', color: 'green' }
  return { text: 'merge-ready ' + okN + '/' + rows.length + ' · ' + rows.filter((r) => !r.ok).map((r) => '✗ ' + r.row.replace(/ \(.*\)$/, '')).slice(0, 3).join(' · '), color: undefined }
}

/**
 * Workspace: everything you watch in one view. The goal and its PR (links, steps, the merge
 * line), the agent table, what waits for you, and the newest rulings.
 */
function workspaceBody($, ui) {
  const { Box, Text, Button, Link, line } = ui
  if (pane.detail) {
    const d = detailBody($, ui)
    const n = pane.detail.kind === 'agent' ? tree.nodes.get(pane.detail.id) : null
    if (n && n.endedAt == null) d.push(...agentsBody($, { ...ui, onlyInput: true }))
    return d
  }
  const v = track.view
  const out = []
  if (v) {
    out.push(...goalLinks(ui, 'w-links'))
    out.push(stepperRow(ui, 'w-goal', 'goal', v.goal, v.goal.tl, spendTail(v.spend.total, v.spend.budget)))
    if (v.pr) out.push(stepperRow(ui, 'w-pr', 'PR', v.pr, v.pr.tl))
    const ml = mergeLine(v)
    if (ml) out.push(line('w-merge', '         ' + ml.text, ml.color ? { color: ml.color } : { dimColor: true }))
    // With p on, every merge-ready row, under the merge-ready line (T10 amendment, Q-56).
    if (pane.planOpen && v.pr && v.pr.ready) v.pr.ready.rows.forEach((r, i) => out.push(line('t-mr' + i, '         ' + (r.ok ? '✓ ' : '✗ ') + r.row, { color: r.ok ? 'green' : undefined, dimColor: !r.ok })))
    if (v.pr && v.pr.ready && v.pr.ready.diagnosis) out.push(line('w-diag', '         ⚠ ' + v.pr.ready.diagnosis, { color: 'yellow' }))
    if (gh.queue.length) out.push(line('t-q', 'queue: ' + gh.queue.map((x) => '#' + x.number).join(' ') + ' — /baton next', { dimColor: true }))
    // The reviewer's findings, each a link to its line on GitHub.
    const rv = v.pr && v.pr.review
    if (rv && rv.verdict === 'CHANGES' && (rv.findings || []).length) {
      const repo = /github\.com\/([^/]+\/[^/]+)\/pull\//.exec(v.pr.url || '')
      const head = gh.pr && gh.pr.headRefName
      rv.findings.slice(0, 6).forEach((f, i) => {
        const m = /^(.+):(\d+)$/.exec(f.at)
        const href = repo && head && m ? 'https://github.com/' + repo[1] + '/blob/' + encodeURIComponent(head) + '/' + m[1] + '#L' + m[2] : null
        out.push(
          Box({
            key: 'w-f' + i,
            flexDirection: 'row',
            columnGap: 1,
            children: [
              Text({ color: f.severity === 'high' ? 'red' : f.severity === 'med' ? 'yellow' : undefined, ...(f.severity === 'low' ? { dimColor: true } : {}), children: ['         ' + f.severity.padEnd(4)] }),
              href ? Link({ href, label: f.at + ' ↗' }) : Text({ children: [f.at] }),
              Text({ wrap: 'truncate-end', dimColor: true, children: [f.text] }),
            ],
          }),
        )
      })
    }
    out.push({ [GAP]: Text({ children: [' '] }) })
  }
  out.push(...agentsBody($, ui))
  if (v && (v.questions || []).length) {
    out.push(Text({ children: [' '] }))
    // Each `?` row opens its brief by Enter on its › or by its own letter (T13, Q-39). Put to the operator, it keeps
    // its red or yellow; queued, it is dim (Q-49).
    v.questions.forEach((q, i) =>
      out.push(
        Box({
          key: 'w-q' + i,
          flexDirection: 'row',
          children: [
            Button({ key: 'open-q-' + q.id, label: '›', ...letterKey('q:' + q.id), plain: true, onPress: () => openDetail($, 'question', q.id) }),
            line('w-qt' + i, '? ' + questionLine(q), q.asked ? { color: q.color } : { dimColor: true }),
          ],
        }),
      ),
    )
  }
  if (pane.rulings.length) {
    out.push(Text({ children: [' '] }))
    pane.rulings.slice(0, 3).forEach((r, i) => out.push(line('w-r' + i, 'ruling ' + rulingLine(r), { color: 'magenta' })))
    if (pane.rulings.length > 3) out.push(line('w-rm', '  … ' + (pane.rulings.length - 3) + ' more in Memory (2)', { dimColor: true }))
  }
  return out
}

function workspaceLines() {
  const v = track.view
  const out = []
  if (v) {
    out.push(...trackLines(v).slice(0, 2))
    if (v.pr) out.push('PR #' + v.pr.number + ' ' + v.pr.url + '  ' + stepperText(v.pr, v.pr.tl))
    const ml = mergeLine(v)
    if (ml) out.push('         ' + ml.text)
    if (pane.planOpen && v.pr && v.pr.ready) for (const r of v.pr.ready.rows) out.push('         ' + (r.ok ? '✓ ' : '✗ ') + r.row)
    if (gh.queue.length) out.push('queue: ' + gh.queue.map((x) => '#' + x.number).join(' ') + ' — /baton next')
    out.push('')
  }
  out.push(...queueLines(), ...treeText(), ...mismatchLines())
  if (v) for (const q of v.questions || []) out.push('? ' + questionLine(q))
  for (const r of pane.rulings.slice(0, 3)) out.push('ruling ' + rulingLine(r))
  return out
}

function usageRow({ Box, Text }, key) {
  return Box({ key, flexDirection: 'row', children: usageSegs(usage.limits, usage.cost).map((x) => Text({ wrap: 'truncate-end', ...(x.color ? { color: x.color } : { dimColor: true }), children: [x.text] })) })
}

/** Open a ruling's view in Memory: what it says, the message it came from, its enforcement. */
async function openRuling($, r) {
  let src = null
  try {
    src = await $.store.get('ruling-src:' + r.n)
  } catch {}
  pane.mdetail = { ...rulingDetail(r, src), ruling: true }
  $.ui.invalidate('ui.render')
}

/** Memory: your rulings first (what governs the run), then the memory itself (what happened). */
function memoryTabBody($, ui) {
  const { Text, Box, Button } = ui
  pane.memRowKeys = new Map()
  const hint = pane.memHint ? [ui.line('mem-hint', pane.memHint, { color: 'yellow' })] : []
  if (pane.mdetail) {
    const d = pane.mdetail
    const tone = (x) => (x.tone === 'head' ? { bold: true } : x.tone in TONE ? (TONE[x.tone] ? { color: TONE[x.tone] } : { dimColor: true }) : x.tone ? { color: x.tone } : {})
    return [
      ...hint,
      Box({ key: 'md-h', flexDirection: 'row', columnGap: 2, children: [Button({ key: 'md-back', label: '‹ back', hotkey: 'b', plain: true, autoFocus: true, onPress: () => ((pane.mdetail = null), $.ui.invalidate('ui.render')) }), Text({ bold: true, children: [d.title] })] }),
      ...d.lines.map((segs, i) => (segs.length ? Box({ key: 'md-l' + i, flexDirection: 'row', children: segs.map((x) => Text({ wrap: 'truncate-end', ...tone(x), children: [x.text] })) }) : Text({ children: [' '] }))),
    ]
  }
  return [...hint, Text({ bold: true, children: ['rulings'] }), ...rulingsBody($, ui), Text({ children: [' '] }), Text({ bold: true, children: [pane.memStore === 'project' ? 'project memory' : 'memory'] }), ...memoryBody($, ui)]
}

// ------------------------------------------------------------------ detail views (Enter on a row)

async function readText($, path, max = 6000) {
  try {
    return String(await $.fs.read(path)).slice(0, max)
  } catch {
    return null
  }
}

/** Build the view for one target from what the mod already holds plus the files it names. */
async function buildDetail($, kind, id, extra = {}) {
  const v = track.view || { phases: [], unphased: [] }
  const findNode = (nid) => {
    for (const p of v.phases || []) {
      const x = (p.nodes || []).find((y) => y.id === nid)
      if (x) return x
    }
    return (v.unphased || []).find((y) => y.id === nid) || { id: nid, ladder: 'node', state: 'red', flag: 'pending', tl: [] }
  }
  if (kind === 'agent') {
    const n = tree.nodes.get(id)
    if (!n) return null
    const pct = ctxPct(n)
    const thr = thresholdFor(n)
    const st = workState(id)
    const m = modelOf(n)
    const view = agentDetail(n, {
      chain: chain(tree, id),
      model: shortModel(m.shown) || null,
      mismatch: m.mismatch ? { requested: m.expected, served: m.served } : null,
      ctxPct: pct,
      threshold: thr,
      hist: n.ctxHist || [],
      ctxTone: ctxTone(pct, thr),
      comps: n.spend ? components(n.spend) : null,
      cost: n.spend ? shortUsd(costOf(n.spend, config.prices)) : '',
      steps: st,
      stepsTl: st && st.tl,
    })
    // An agent that returned BLOCKED is a blocked row (Q-38): its view gains the brief at its top.
    if (n.endedAt != null && n.verdict === 'BLOCKED') {
      const bb = parseBlockedBy(n.blockedBy)
      const target = workOf(n.label, runIds(v)).node || n.label
      const grant = blockGrant({ text: (n.line || '') + '\n' + (n.blockedBy || ''), blockedBy: bb, who: target })
      view.lines = [...blockedBrief({ id: n.label, verdict: 'BLOCKED', line: n.line, blockedBy: n.blockedBy, kind: bb && bb.kind, grant, note: extra.note }), ...view.lines]
      Object.assign(view, { grant, target, keys: grantKeys(grant) })
    }
    return view
  }
  if (kind === 'question') return questionView($, id, extra)
  if (kind === 'phase') {
    const p = (v.phases || []).find((x) => x.id === id)
    if (!p) return null
    const nodes = (p.nodes || []).map((x) => ({ ...x, spendText: spendTail(v.spend.byNode[x.id]).replace(/^ · /, '') }))
    // Its spend is its row's roll-up: every sub-orchestrator subtree under it (Q-54, D-T10-rollup-inclusive).
    const ids = (v.phases || []).map((x) => x.id)
    const roll = rollOf(tree.nodes.get(PRIME).children.filter((c) => phaseOwner(c, ids) === id))
    const spent = roll ? shortTokens(tokensIn(components(roll))) + ' tokens · ' + shortUsd(costOf(roll, config.prices)) : spendTail(v.spend.byPhase[id]).replace(/^ · /, '')
    const view = phaseDetail({ ...p, nodes }, { brief: await readText($, '_orch/phases/' + id + '/brief.md', 2000), envelope: await readJson($, '_orch/phases/' + id + '/envelope.json'), spend: spent })
    // A phase waiting for the operator's check: its brief approves it as band 1 does (Q-37).
    const q = approvals.queue.find((x) => phaseOf(x.label) === id)
    if (q) {
      view.lines = [[{ text: '⚑ ' + q.label + ': ' + q.line, tone: 'yellow', wrap: true }], [{ text: 'y approves it, as band 1 does; 2 on the band sends it back with a reason', tone: 'rail' }], [], ...view.lines]
      view.keys = [{ hotkey: 'y', label: 'approve', act: 'phase' }]
    }
    if (extra.note) view.lines = [[{ text: extra.note, tone: 'green', wrap: true }], [], ...view.lines]
    return view
  }
  if (kind === 'node') {
    const nd = findNode(id)
    const base = '_orch/nodes/' + id
    const handoff = await readText($, base + '/handoff.md')
    const exempt = handoff && /\brgb:\s*exempt\s*[—-]?\s*(.*)/i.exec(handoff)
    const mine = (lessons.notes || []).map((n) => parseLessonNote(n.text).text).filter((t) => t.startsWith(id + ':'))
    const view = nodeDetail(nd, {
      handoff,
      exempt: exempt ? exempt[1] || 'yes' : null,
      red: await readText($, base + '/work/red.txt', 600),
      green: await readText($, base + '/work/green.txt', 600),
      blue: await readText($, base + '/work/blue.txt', 600),
      verdict: await readJson($, '_orch/verify/' + id + '-verdict.json'),
      lessons: mine,
      spend: spendTail(v.spend && v.spend.byNode[id]).replace(/^ · /, ''),
    })
    // A node whose envelope is BLOCKED or ESCALATE is a blocked row (Q-38): its view opens with the brief.
    const st = await readJson($, base + '/status.json')
    if (st && isBlocked({ status: st.verdict })) {
      const b = await nodeBlock($, id, st)
      view.lines = [...blockedBrief({ ...b, note: extra.note }), ...view.lines]
      Object.assign(view, { grant: b.grant, target: id, keys: grantKeys(b.grant) })
    }
    return view
  }
  return null
}

async function openDetail($, kind, id, extra = {}) {
  if (kind === 'node') await loadLessons($)
  const view = await buildDetail($, kind, id, extra)
  pane.detail = view ? { kind, id, view } : null
  $.ui.invalidate('ui.render')
}

// ------------------------------------------------------------------ T13: questions and blocked rows, acted on from the pane

/** Every string an envelope holds, one per line (a `Blocked by:` line may sit in any of its fields). */
function envelopeText(x, out = []) {
  if (typeof x === 'string') out.push(x)
  else if (Array.isArray(x)) x.forEach((y) => envelopeText(y, out))
  else if (x && typeof x === 'object') Object.values(x).forEach((y) => envelopeText(y, out))
  return out
}

/** The inbox questions that name a node on their `Nodes it blocks:` line, open ones first: [{ id, text }]. */
async function questionsNaming($, nodeId) {
  const names = ((await listDir($, '_orch/inbox')) ?? []).filter((x) => x.kind === 'file').map((x) => x.name)
  const out = []
  for (const f of names.filter((n) => /^Q-[^.]+\.md$/.test(n)).sort(byId)) {
    const text = await readText($, '_orch/inbox/' + f, 20000)
    if (text && nodesBlocked(text).includes(nodeId)) out.push({ id: f.replace(/\.md$/, ''), text, open: !names.includes(f.replace(/\.md$/, '.answer.md')) })
  }
  return [...out.filter((q) => q.open), ...out.filter((q) => !q.open)]
}

/**
 * What a blocked node is blocked on (Q-38): its envelope summary and the `Blocked by:` line read from its
 * status.json, else from the inbox question that names it; and what approving it grants (Q-37).
 */
async function nodeBlock($, id, st) {
  const env = envelopeText(st).join('\n')
  const asks = await questionsNaming($, id)
  const line = blockedByLine(env) || (asks.map((q) => blockedByLine(q.text)).find(Boolean) ?? null)
  const bb = parseBlockedBy(line)
  const grant = blockGrant({ text: env + '\n' + (line || ''), blockedBy: bb, who: id, fallback: asks.length ? questionDefault(asks[0].text) : null })
  return { id, verdict: st.verdict, summary: st.summary, blockedBy: line, kind: bb && bb.kind, grant }
}

/** The keys a blocked row's brief draws: `y` and `w` only where the grant keeps them (Q-37, Q-39). */
function grantKeys(grant) {
  return (grant ? grant.keys : []).map((k) => (k === 'w' ? { hotkey: 'w', label: 'approve for the run', act: 'w' } : { hotkey: 'y', label: grant.kind === 'interpreted' ? 'overrule' : 'approve once', act: 'y' }))
}

/** A question's brief (Q-40), from its file, its asked record and any answer on file. */
async function questionView($, id, extra = {}) {
  const base = '_orch/inbox/' + id
  const text = await readText($, base + '.md', 20000)
  if (text == null) return null
  const asked = await readText($, base + '.asked.md', 600)
  const answer = await readText($, base + '.answer.md', 4000)
  const unauthorized = unauthorizedAnswer(answer) ? answer : null
  const shown = ((track.view && track.view.questions) || []).find((q) => q.id === id)
  const q = { id, asked: asked != null, gate: shown ? shown.gate : null, color: questionColor(parseBlockedBy(text)) }
  const note = extra.note ?? (answer && !unauthorized ? alreadyAnswered(id) : null)
  return questionDetail(q, { text, asked, unauthorized, note, noteTone: extra.noteTone })
}

/** What the brief says when an answer file is already there (Q-41): it is never overwritten. */
const alreadyAnswered = (id) => 'already answered: _orch/inbox/' + id + '.answer.md is the record, and it is never overwritten'

/** The live agents working on a node (their label names it), for a message with the answer (Q-36). */
function liveAgentsOn(nodeId) {
  const ids = runIds()
  return [...tree.nodes.values()].filter((n) => n.id !== PRIME && n.endedAt == null && workOf(n.label, ids).node === nodeId)
}

/**
 * Answer a question from its brief (T13; Q-35, Q-36, Q-41, Q-45): ask through the engine's dialog with
 * its options, write Q-<id>.asked.md first if it was only queued, then Q-<id>.answer.md (never over an
 * existing one), then note for the prime to re-dispatch the node it names, and message its agent if live.
 */
async function answerQuestion($, id) {
  const base = '_orch/inbox/' + id
  const said = (note, tone = 'yellow') => openDetail($, 'question', id, { note, noteTone: tone })
  if (await exists($, base + '.answer.md')) return said(alreadyAnswered(id))
  const text = (await readText($, base + '.md', 20000)) ?? ''
  const first = firstLine(text) || id
  const { labels } = questionOptions(text)
  let answer = null
  try {
    answer = String(await $.ui.ask(first, labels.length >= 2 ? labels : ['Accept the default', 'Other']))
  } catch {
    return said('not answered: the dialog was dismissed, or nobody can be asked here')
  }
  if (labels.length < 2 && answer === 'Other') return said('not answered: type your answer under Other')
  if (!answer.trim()) return said('not answered: the answer was empty')
  if (await exists($, base + '.answer.md')) return said(alreadyAnswered(id))
  const at = new Date(Date.now()).toISOString()
  const shown = ((track.view && track.view.questions) || []).find((q) => q.id === id)
  try {
    // Put first (Q-45): a queued question answered here was put to the operator here.
    if (!(await exists($, base + '.asked.md'))) await $.fs.write(base + '.asked.md', askedRecord({ at, via: 'pane', gate: shown ? shown.gate : null }))
    await $.fs.write(base + '.answer.md', answerRecord({ id, answer, at, session: await sessionId($) }))
  } catch (err) {
    return said('not answered: could not write ' + base + '.answer.md (' + err.message + ')')
  }
  const nodes = nodesBlocked(text)
  await noteQuietly($, 'answered ' + id + ' from the pane: ' + first + '. Re-dispatch ' + (nodes.join(', ') || 'the node that asked') + ' with it', 'operator')
  for (const nid of nodes) {
    for (const n of liveAgentsOn(nid)) {
      try {
        await $.session.send({ to: { agentId: n.id }, text: 'baton: the operator answered ' + id + ' (' + first + '): ' + answer })
      } catch {}
    }
  }
  if (track.view) track.view.questions = (track.view.questions || []).filter((q) => q.id !== id)
  track.dirty = true
  return said('answered: ' + answer + ' — written to ' + base + '.answer.md; the prime is told to re-dispatch ' + (nodes.join(', ') || 'the node that asked'), 'green')
}

/** Approve what a blocked row is blocked on, from its brief, with the narrowest grant its kind allows (Q-37). */
async function approveFromBrief($, d, act) {
  const g = d.view.grant
  const who = d.view.target
  if (!g || !g.keys.includes(act)) return
  let text = null
  if (g.kind === 'command' && act === 'y') {
    approvals.once.add(g.command)
    text = 'operator approved `' + g.command + '` once for ' + who + ', from its brief in the pane. Re-dispatch ' + who + ' with it.'
  } else if (g.kind === 'command' && act === 'w') {
    approvals.always.add(g.gate.id)
    text = 'operator approved every "' + g.gate.label + '" for this run, from ' + who + "'s brief in the pane. Re-dispatch " + who + ' with `' + g.command + '`.'
  } else if (g.kind === 'interpreted' && act === 'y') {
    text = 'operator overruled ' + who + "'s block (interpreted), from its brief in the pane. Re-dispatch " + who + ' to proceed on ' + (g.default ? 'the default its question states: ' + g.default : 'the default it recommended') + '.'
  }
  if (!text) return
  approvals.approved++
  await noteQuietly($, text, 'approval')
  track.dirty = true
  await openDetail($, d.kind, d.id, { note: 'done: ' + text.replace(/^operator /, '') + ' The row stays until its status changes.' })
}

/** A key of an open view's brief: answer (a), approve once or overrule (y), approve for the run (w), or approve a queued phase (y). */
async function detailAct($, d, k) {
  if (k.act === 'answer') return answerQuestion($, d.id)
  if (k.act === 'phase') {
    const i = approvals.queue.findIndex((x) => phaseOf(x.label) === d.id)
    if (i >= 0) await resolveQueued($, i, 'approve')
    return openDetail($, d.kind, d.id, i >= 0 ? { note: 'approved ' + d.id + ', as band 1 does' } : {})
  }
  return approveFromBrief($, d, k.act)
}

/** The open view, drawn in Work: a back button, the title, then its lines. */
function detailBody($, { Box, Text, Button, line }) {
  const d = pane.detail
  const tone = (x) => (x.tone === 'head' ? { bold: true } : x.tone in TONE ? (TONE[x.tone] ? { color: TONE[x.tone] } : { dimColor: true }) : x.tone ? { color: x.tone } : {})
  const out = [
    Box({
      key: 'd-h',
      flexDirection: 'row',
      columnGap: 2,
      children: [
        Button({ key: 'd-back', label: '‹ back', hotkey: 'b', plain: true, autoFocus: true, onPress: () => ((pane.detail = null), $.ui.invalidate('ui.render')) }),
        Text({ bold: true, children: [d.view.title] }),
        // The brief's own keys (T13, Q-39), drawn as 1, 2 and r are: a answers, y approves once (or overrules), w for the run.
        ...(d.view.keys || []).map((k) => Button({ key: 'd-key-' + k.hotkey, label: k.label, hotkey: k.hotkey, plain: true, onPress: () => detailAct($, d, k) })),
        Button({ key: 'd-refresh', label: 'refresh', hotkey: 'r', plain: true, dimColor: true, onPress: () => openDetail($, d.kind, d.id) }),
      ],
    }),
  ]
  d.view.lines.forEach((segs, i) => {
    if (!segs.length) out.push(Text({ children: [' '] }))
    else out.push(Box({ key: 'd-l' + i, flexDirection: 'row', children: segs.map((x) => Text({ wrap: x.wrap ? 'wrap' : 'truncate-end', ...tone(x), children: [x.text] })) }))
  })
  // A running agent can be messaged from its own view.
  if (d.kind === 'agent') {
    const n = tree.nodes.get(d.id)
    if (n && n.endedAt == null) {
      pane.target = d.id
      out.push(Text({ children: [' '] }))
    }
  }
  return out
}

/** The run's own node and phase ids, what a row's label is matched against (Q-15); undefined outside a run. */
function runIds(v = track.view) {
  if (!v) return undefined
  return { nodes: [...v.phases.flatMap((p) => p.nodes.map((x) => x.id)), ...(v.unphased || []).map((x) => x.id)], phases: v.phases.map((p) => p.id) }
}

/** The computed state an agent's row shows: its node's, else its phase's; the goal's for the prime. */
function workState(agentId) {
  const v = track.view
  if (!v || !agentId) return null
  if (agentId === PRIME) return v.goal
  const n = tree.nodes.get(agentId)
  const w = workOf(n ? n.label : '', runIds(v))
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

/** The main row's glyph and name: the prime's in a run this session is the prime of (T7's membership), else the session's (T8). */
const mainRow = () => (run.active || run.startedHere ? { glyph: '◆', name: 'prime' } : { glyph: '◇', name: 'session' })

const KNOWN_MODELS = [...Object.keys(PRICES), FRONTIER, CHEAP, MECH]

/**
 * An agent's model: what to show (what served it, else what it started on; the session's own model for the
 * prime), what it should have run on (bound or requested; the session's model for the prime, Q-22) and
 * whether the two differ (T8: the cell turns red, the detail view and /baton show both full ids).
 */
function modelOf(n) {
  const prime = n.id === PRIME
  const expected = prime ? sessionOwn.model : n.requested
  const served = n.served || null
  const shown = served || (prime ? sessionOwn.model : n.model) || null
  return { shown, expected, served, mismatch: modelMismatch(expected, served, KNOWN_MODELS) }
}

/** One line per agent whose served model differs from the one requested or bound (the /baton text, T8). */
function mismatchLines() {
  const out = []
  for (const r of treeRows(tree)) {
    const n = r.id ? tree.nodes.get(r.id) : null
    const m = n && modelOf(n)
    if (m && m.mismatch) out.push('model mismatch ' + (n.id === PRIME ? mainRow().name : n.label) + ': requested ' + m.expected + ', served ' + m.served)
  }
  return out
}

/**
 * An agent's model cell: its model, then its effort after ` · ` (served, or configured marked `cfg`), red on
 * a model or an effort mismatch (T8, C8E). No effort known: the model alone.
 */
function modelCell(n, m = modelOf(n)) {
  const model = shortModel(m.shown) || ''
  const ef = effortOf(n)
  const text = model && ef.text ? model + ' · ' + ef.text + (ef.cfg ? ' cfg' : '') : model
  return { model: text, modelMark: model && ef.cfg ? 'cfg' : '', modelTone: m.mismatch || ef.mismatch ? 'red' : undefined }
}

/** Record an effort on the agent it belongs to (no id: the main loop's, the prime's or `session` row). */
function noteEffort(agentId, field, value) {
  if (value === undefined || value === null || value === '') return
  const n = tree.nodes.get(agentId || PRIME)
  if (n) n[field] = value
}

/** A classic hook's handler: note the served effort its input carries (C8E), then pass the input on. */
async function withServedEffort($, e, next) {
  servedEffort($, e)
  return next(e)
}

/** The served effort a classic hook input carries (C8E), on the agent its agent_id names (none: the main loop). */
function servedEffort($, e) {
  try {
    if (e && e.effort && e.effort.level) {
      noteEffort(e.agent_id, 'effortServed', e.effort.level)
      if (pane.open) $.ui.invalidate('ui.render')
    }
  } catch {}
}

/** One agent as a table row. */
function agentRow(r) {
  const n = r.id ? tree.nodes.get(r.id) : null
  if (!n) return { label: r.text.trim(), tone: 'rail' }
  const m = modelOf(n)
  const glyph = n.id === PRIME ? mainRow().glyph : r.live ? '●' : r.color === 'red' ? '✗' : '✓'
  const name = n.id === PRIME ? mainRow().name : (n.role === 'sub-orchestrator' ? 'sub-orch' : n.role) + ' ' + n.label
  const st = workState(r.id)
  const mini = st ? stepperMini(st) : null
  // A row that works on no node or phase shows its own lifecycle's steps; its state cell stays what it is doing.
  const own = !mini && n.id !== PRIME ? stepperMini(lifecycle(n)) : null
  const pct = ctxPct(n)
  const thr = thresholdFor(n)
  return {
    label: '  '.repeat(r.depth) + glyph + ' ' + name,
    tone: r.color,
    ctxPct: pct,
    ctxHist: n.ctxHist || [],
    ctxTone: ctxTone(pct, thr),
    threshold: thr,
    ...modelCell(n, m),
    acc: n.spend || null,
    cost: n.spend ? shortUsd(costOf(n.spend, config.prices)) : '',
    steps: (mini || own || []).slice(0, -1),
    state: mini ? mini.at(-1).text.trim() : r.live ? (n.lastTool ? 'now ' + n.lastTool : 'starting') : String(n.verdict || '').toLowerCase(),
    stateTone: mini ? mini.at(-1).tone : r.live ? 'current' : r.color,
  }
}

/** Agents: phases waiting for a check, then the live tree; a message field for the selected agent. */
function agentsBody($, { Box, Text, Button, Input, Link, line, cols, onlyInput }) {
  const out = []
  if (onlyInput) return messageField($, { Box, Text, Input })
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
  // The one tree (T10 amendment): the prime, the phase rows, their sub-orchestrators and agents, each
  // row with its own context against its own budget, its model, its tokens by kind, its `this agent`
  // and `roll-up` groups, and the parcel steps of what it works on.
  const items = workTree()
  // Direct keys (T9, Q-60): every agent and phase row, top to bottom in tree order; then the `?` rows and the
  // blocked node rows drawn (T13, Q-39). A row keeps its letter while it exists, across a reload or a
  // restart too (Q-67, Q-82).
  const v = track.view
  const ids = rowKeyIds({
    tree: items.flatMap((x) => (x.kind === 'agent' && x.r.id ? ['agent:' + x.r.id] : x.kind === 'phase' ? ['phase:' + x.p.id] : [])),
    questions: v ? (v.questions || []).map((q) => q.id) : [],
    blocked: items.filter((x) => x.kind === 'node' && isBlocked(x.x)).map((x) => x.x.id),
  })
  restoreLetters(ids)
  assignLetters(pane.letters, ids)
  saveLetters($)
  const { t, lineOf } = treeTable(items, (data) => tableWidth(data, cols))
  const tone = (x) => (x.tone in TONE ? (TONE[x.tone] ? { color: TONE[x.tone] } : { dimColor: true }) : x.tone ? { color: x.tone } : {})
  if (track.view) out.push(Text({ dimColor: true, children: [LEGEND] }))
  out.push(Box({ key: 'ag', flexDirection: 'row', children: [Text({ children: ['  '] }), ...t.groups.map((x) => Text({ dimColor: true, children: [x.text] }))] }))
  out.push(Box({ key: 'ah', flexDirection: 'row', children: [Text({ children: ['  '] }), ...t.header.map((x) => Text({ dimColor: true, children: [x.text] }))] }))
  // The list itself is drawn by the Pane, which knows the rows it has left for it (T15, Q-68).
  const draw = (x, at) => itemLine($, x, at, { Box, Text, Button }, (y) => rowCells(x, lineOf.get(x), t.cols[0] === 'agent', tone, Text))
  out.push({ [LIST]: { items, draw, hidden: (x) => hiddenKey($, x, Button) } })
  out.push(...messageField($, { Box, Text, Input }))
  return out
}

/** A list row's table cells. A finished agent row's text is dim, its ✓ or ✗ keeping its colour (Q-69). */
function rowCells(x, segs, labelFirst, tone, Text) {
  const cell = (y, extra = {}) => Text({ wrap: 'truncate-end', ...tone(y), ...extra, children: [y.text] })
  if (!finishedRow(x)) return segs.map((y) => cell(y))
  return segs.flatMap((y, i) => {
    if (i > 0 || !labelFirst) return [cell(y, { dimColor: true })]
    const m = /^(\s*\S)([\s\S]*)$/.exec(y.text)
    return m ? [cell({ ...y, text: m[1] }), Text({ wrap: 'truncate-end', dimColor: true, children: [m[2]] })] : [cell(y, { dimColor: true })]
  })
}

/** An agent row that has returned, other than a blocked one that still waits for the operator (Q-69). */
function finishedRow(x) {
  if (x.kind !== 'agent' || !x.r.id || x.r.id === PRIME || x.r.live) return false
  const n = tree.nodes.get(x.r.id)
  const waits = n && n.verdict === 'BLOCKED' && (!track.view || (track.view.questions || []).length > 0)
  return !waits
}

/**
 * A list line's keys, by where it is drawn: a window row by its place in the window (`ar3`, `open-a3`;
 * `pr`/`open-p` for a phase, `nr`/`open-n` for a node), a strip row by its strip (`st-sa0`, `open-sa0`).
 * The focus stays on a place as the window moves under it.
 */
function lineKeys(x, at) {
  const a = (k) => pane.list.alias.get(k) ?? k
  if (/^s[ab]/.test(at)) return { box: 'st-' + at, open: a('open-' + at), msg: a('msg-' + at) }
  const k = { agent: ['ar', 'open-a'], phase: ['pr', 'open-p'], node: ['nr', 'open-n'], note: ['nt', ''] }[x.kind]
  return { box: k[0] + at, open: a(k[1] + at), msg: a('msg-' + at) }
}

/**
 * Swap two drawn list keys (Home, End): the focus ring holds an element by its key, and a plugin's
 * `$.ui.focus` is refused while the person, not the plugin, holds the keyboard; so the row the focus
 * moves to is drawn with the key the ring holds, and the row that had it takes that row's key.
 */
function swapKeys(a, b) {
  const al = pane.list.alias
  const natural = (d) => [...al].find(([, v]) => v === d)?.[0] ?? d
  const [na, nb] = [natural(a), natural(b)]
  al.set(na, b).set(nb, a)
  for (const [k, v] of al) if (k === v) al.delete(k)
}

/** One line of the list: its row with its `›` (and ✉ while it runs). */
function itemLine($, x, at, { Box, Text, Button }, cells) {
  const k = lineKeys(x, at)
  if (x.kind === 'note') return Box({ key: k.box, flexDirection: 'row', children: [Text({ children: ['  '] }), Text({ wrap: 'truncate-end', dimColor: true, children: ['  '.repeat(x.depth) + x.text] })] })
  // Enter on a row's › opens its view: an agent's, a phase's (its steps, nodes and spend, Q-54), a node's.
  if (x.kind === 'phase') return Box({ key: k.box, flexDirection: 'row', children: [Button({ key: k.open, label: '›', ...letterKey('phase:' + x.p.id), plain: true, onPress: () => openDetail($, 'phase', x.p.id) }), ...cells()] })
  // A blocked node row (Q-38) also holds a direct key; its view opens with the brief.
  if (x.kind === 'node') return Box({ key: k.box, flexDirection: 'row', children: [Button({ key: k.open, label: '›', ...(isBlocked(x.x) ? letterKey('blocked:' + x.x.id) : {}), plain: true, onPress: () => openDetail($, 'node', x.x.id) }), ...cells()] })
  const r = x.r
  const open = r.id ? [Button({ key: k.open, label: '›', ...letterKey('agent:' + r.id), plain: true, onPress: () => openDetail($, 'agent', r.id) })] : [Text({ children: ['  '] })]
  const children = [...open, ...cells()]
  if (r.live && r.id && r.id !== PRIME) children.push(Button({ key: k.msg, label: ' ✉', plain: true, onPress: () => ((pane.target = r.id), $.ui.invalidate('ui.render')) }))
  return Box({ key: k.box, flexDirection: 'row', children })
}

/** A row scrolled out of view keeps its direct key: a Button on its edge's more line carries it (Q-67). */
function hiddenKey($, x, Button) {
  const id = x.kind === 'agent' && x.r.id ? 'agent:' + x.r.id : x.kind === 'phase' ? 'phase:' + x.p.id : x.kind === 'node' && isBlocked(x.x) ? 'blocked:' + x.x.id : null
  const k = id && pane.letters.get(id)
  if (!k) return []
  const open = x.kind === 'phase' ? () => openDetail($, 'phase', x.p.id) : x.kind === 'node' ? () => openDetail($, 'node', x.x.id) : () => openDetail($, 'agent', x.r.id)
  return [Button({ key: 'hk-' + k, label: '', hotkey: k, plain: true, dimColor: true, onPress: open })]
}

// ------------------------------------------------------------------ the agent list's window (T15)

const LIST = Symbol('the agent list')
const GAP = Symbol('a spacer line the list may take')
// The empty bottom rows the pane keeps while the list scrolls (Q-F115-1 A); none while it fits.
const SPARE_ROWS = 1

/** A list item's identity, what the window's top row is held by (Q-65). */
function itemId(x) {
  return x.kind === 'agent' ? 'agent:' + (x.r.id ?? x.r.text) : x.kind === 'phase' ? 'phase:' + x.p.id : x.kind === 'node' ? 'node:' + x.x.id : 'note:' + x.key
}

/**
 * Draw the agent list into the rows the pane has left (Q-68): the lines above and below it stay whole.
 * A list that fits is drawn whole. One that does not is a window from its top row, with its pinned
 * strips and more lines (lib/view.mjs listWindow); the spacer above it and the `no phases yet` row go,
 * and the pane's last row stays empty, so the engine's Home and End (`contentRows`) are told from its
 * PageUp and PageDown (`bodyRows`) (Q-F115-1 A, D-F115-spare-row).
 */
function placeList(body, rows, { Text, Box }) {
  const L = pane.list
  const at = body.findIndex((x) => x && x[LIST])
  L.on = at >= 0
  if (!L.on) return body.flatMap((x) => (x && x[GAP] ? [x[GAP]] : [x]))
  const { items, draw, hidden } = body[at][LIST]
  // The lines besides the list: the tab row, the `read … · Esc closes` line, and the body's other entries.
  const others = 2 + body.length - 1
  const gaps = body.filter((x) => x && x[GAP]).length
  const area = rows - SPARE_ROWS - others + gaps
  const fits = items.length <= rows - others || area < 3
  const its = fits ? items : items.filter((x) => x.key !== 't-nophase')
  const ids = its.map(itemId)
  const pins = its.map((x) => x.kind === 'agent' && !!x.r.live && !!x.r.id && x.r.id !== PRIME)
  const pin = (i) => pins[i]
  const found = L.topKey ? ids.indexOf(L.topKey) : -1
  const W = fits ? listWindow(its.length, 0, its.length) : listWindow(its.length, found >= 0 ? found : L.top, area, pin)
  const lines = []
  const dim = (text, key, keys = []) => Box({ key, flexDirection: 'row', children: [Text({ dimColor: true, children: ['  ' + text] }), ...keys] })
  const running = (k) => ' · +' + k + ' running'
  const shown = new Set([...W.above, ...W.below])
  const out = (a, b) => its.slice(a, b).filter((_, j) => !shown.has(a + j))
  if (W.hiddenAbove) lines.push(dim('↑ ' + W.hiddenAbove + ' more' + (W.plusAbove && !W.stripAbove ? running(W.plusAbove) : ''), 'l-up', out(0, W.top).flatMap(hidden)))
  W.above.forEach((i, j) => lines.push(draw(its[i], 'sa' + j)))
  if (W.plusAbove && W.stripAbove) lines.push(Text({ color: 'cyan', children: ['  +' + W.plusAbove + ' running'] }))
  for (let s = 0; s < W.size; s++) lines.push(draw(its[W.top + s], String(s)))
  W.below.forEach((i, j) => lines.push(draw(its[i], 'sb' + j)))
  if (W.plusBelow && W.stripBelow) lines.push(Text({ color: 'cyan', children: ['  +' + W.plusBelow + ' running'] }))
  if (W.hiddenBelow) lines.push(dim('↓ ' + W.hiddenBelow + ' more' + (W.plusBelow && !W.stripBelow ? running(W.plusBelow) : ''), 'l-down', out(W.top + W.size, its.length).flatMap(hidden)))
  // The keys a list line's elements are drawn under (its › and ✉), at a window slot or a strip place.
  const keysAt = (x, at) => { const k = lineKeys(x || { kind: 'agent' }, at); return [k.open, k.msg] }
  const slot = (s) => keysAt(its[W.top + s], String(s))
  const win = Array.from({ length: W.size }, (_, s) => slot(s)).flat()
  const strip = [...W.above.flatMap((i, j) => keysAt(its[i], 'sa' + j)), ...W.below.flatMap((i, j) => keysAt(its[i], 'sb' + j))]
  Object.assign(L, { fits, n: its.length, area, size: W.size, top: W.top, topKey: ids[W.top] ?? null, ids, pins, items: its, win: new Set(win), keys: new Set([...win, ...strip]), first: new Set(slot(0)), last: new Set(slot(W.size - 1)) })
  return [...body.slice(0, at), ...lines, ...body.slice(at + 1)].flatMap((x) => (x && x[GAP] ? (fits ? [x[GAP]] : []) : [x]))
}

/** The keys of the elements the ring walks, in document order (Buttons, Inputs, Selects). */
function focusRing(el, out = []) {
  if (Array.isArray(el)) {
    for (const c of el) focusRing(c, out)
    return out
  }
  if (!el || typeof el !== 'object') return out
  const p = el.props || {}
  if (p.key != null && (typeof p.onPress === 'function' || typeof p.onSubmit === 'function' || typeof p.onChange === 'function')) out.push(String(p.key))
  focusRing(p.children, out)
  return out
}

/** Did the person's ↑ or ↓ step the ring from the window's edge row to an element outside the window? */
function edgeStep(prev, next) {
  const L = pane.list
  if (!L.on || L.fits || !prev || !next || !L.win.has(prev) || L.win.has(next)) return null
  const i = L.ring.indexOf(prev)
  const j = L.ring.indexOf(next)
  if (i >= 0 && j >= 0) {
    const n = L.ring.length
    return j === (i + 1) % n ? 'down' : j === (i - 1 + n) % n ? 'up' : null
  }
  return L.last.has(prev) ? 'down' : L.first.has(prev) ? 'up' : null
}

/** Letters stored with the run (Q-82), read back once per run before the first letters are given. */
async function loadLetters($) {
  const id = (run.manifest && run.manifest.run_id) || membership.runId || null
  if (!id || pane.lettersRun === id) return
  pane.lettersRun = id
  pane.lettersSaved = new Map()
  try {
    const saved = await $.store.get('letters:' + id)
    if (saved && typeof saved === 'object') pane.lettersSaved = new Map(Object.entries(saved).filter(([, l]) => ROW_LETTERS.includes(l)))
  } catch {}
}

/** A listed row that held a stored letter gets it back while no other row holds it (Q-82). */
function restoreLetters(ids) {
  const s = pane.lettersSaved
  if (!s || !s.size) return
  const taken = new Set(pane.letters.values())
  for (const id of ids) {
    const l = s.get(id)
    if (l && !pane.letters.has(id) && !taken.has(l)) {
      pane.letters.set(id, l)
      taken.add(l)
    }
    if (l) s.delete(id)
  }
}

/** Store the row-to-letter map with the run's state when it changed (Q-82). */
function saveLetters($) {
  if (!pane.lettersRun) return
  const all = { ...Object.fromEntries(pane.lettersSaved || []), ...Object.fromEntries(pane.letters) }
  const text = JSON.stringify(all)
  if (text === pane.lettersText) return
  pane.lettersText = text
  try {
    Promise.resolve($.store.set('letters:' + pane.lettersRun, all)).catch(() => {})
  } catch {}
}

/** The legend above the agent table (T10 amendment, Q-55): the tree's levels, and what a phase is. */
const LEGEND = 'the tree: prime › P<n>, a phase: a unit of the plan › its sub-orchestrator › agent (worker, verifier)'

/**
 * The phase each of the prime's children belongs to (Q-58: a sub-orchestrator by its `P<n>` or its
 * phase brief's path), or P0 for one tied to no phase when the plan has a P0 (D-P1-tree-unphased);
 * null when it stays directly under the prime.
 */
function phaseOwner(id, phaseIds) {
  return phaseOfAgent(tree.nodes.get(id), phaseIds) ?? (phaseIds.includes('P0') ? 'P0' : null)
}

/**
 * The one tree, in drawn order (T10 amendment, spec L309-340): the prime; then each phase of the plan
 * in plan order as a row of its own, under it (with `p` on) its node rows, at most 12 and then
 * `… N more nodes`, and then the sub-orchestrator(s) that ran it, siblings in spawn order, newest last,
 * each with its workers and verifiers; then the agents tied to no phase. Before the plan exists, a dim
 * `no phases yet` row stands under the prime.
 * Items: { kind: 'agent', r, depth } | { kind: 'phase', p, heads, depth } | { kind: 'node', x, depth } | { kind: 'note', key, text, depth }.
 */
function workTree() {
  const v = track.view
  const rows = treeRows(tree).map((r) => ({ kind: 'agent', r, depth: r.depth }))
  if (!v) return rows
  const [prime, ...rest] = rows
  if (!v.phases.length) return [prime, { kind: 'note', key: 't-nophase', text: 'no phases yet: the bootstrap writes the plan', depth: 1 }, ...rest]
  // The prime's children as subtrees, each led by its depth-1 row; the fold line stays last.
  const groups = []
  const tail = []
  for (const x of rest) {
    if (!x.r.id) tail.push(x)
    else if (x.depth === 1 || !groups.length) groups.push([x])
    else groups.at(-1).push(x)
  }
  const ids = v.phases.map((p) => p.id)
  const owners = groups.map((g) => phaseOwner(g[0].r.id, ids))
  const out = [prime]
  for (const p of v.phases) {
    const mine = groups.filter((_, i) => owners[i] === p.id)
    out.push({ kind: 'phase', p, heads: mine.map((g) => g[0].r.id), depth: 1 })
    if (pane.planOpen) {
      for (const x of p.nodes.slice(0, 12)) out.push({ kind: 'node', x, depth: 2 })
      if (p.nodes.length > 12) out.push({ kind: 'note', key: 't-more-' + p.id, text: '… ' + (p.nodes.length - 12) + ' more nodes', depth: 2 })
    }
    for (const g of mine) out.push(...g.map((x) => ({ ...x, depth: x.depth + 1 })))
  }
  groups.forEach((g, i) => {
    if (!owners[i]) out.push(...g)
  })
  return [...out, ...tail]
}

/** A subtree's spend as one account (the `roll-up` group), or null when nothing in it was metered. */
function rollOf(heads) {
  const accs = heads.flatMap((id) => subtree(tree, id)).map((n) => n.spend).filter(Boolean)
  return accs.length ? sumAccounts(accs) : null
}

/** One item of the tree as a table row. */
function treeItemRow(x) {
  if (x.kind === 'agent') {
    const row = agentRow({ ...x.r, depth: x.depth })
    const n = x.r.id ? tree.nodes.get(x.r.id) : null
    // Q-57: a row with no children leaves its roll-up empty; otherwise its subtree, itself included.
    const roll = n && n.children.length ? rollOf([n.id]) : null
    return { ...row, roll, rollCost: roll ? shortUsd(costOf(roll, config.prices)) : '' }
  }
  const indent = '  '.repeat(x.depth)
  if (x.kind === 'node') {
    const mini = stepperMini(x.x)
    const mark = x.x.state === 'verified' ? '✓' : x.x.flag === 'pending' ? '○' : x.x.flag ? '✗' : '●'
    return { label: indent + mark + ' ' + x.x.id, tone: x.x.flag && x.x.flag !== 'pending' ? 'red' : undefined, ctxPct: null, noContext: true, model: '', steps: mini.slice(0, -1), state: mini.at(-1).text.trim(), stateTone: mini.at(-1).tone }
  }
  // A phase row (D-T10-phase-row-cells): labelled P<n>; its this-agent group, model and context empty;
  // its roll-up the spend of the sub-orchestrator subtrees under it. Not started and with no
  // sub-orchestrator yet, it is pending: dim, marked ○, `pending`, the stepper with no step reached (Q-62).
  const p = x.p
  const pending = p.flag === 'pending' && !x.heads.length
  const roll = rollOf(x.heads)
  const mini = stepperMini(pending ? { ...p, flag: 'pending' } : p)
  const flagged = !!p.flag && p.flag !== 'pending'
  const [mark, tone] = pending ? ['○', 'rail'] : p.state === 'approved' ? ['✓', 'green'] : flagged ? ['✗', 'red'] : ['●', 'cyan']
  return {
    label: indent + mark + ' ' + p.id,
    tone,
    ctxPct: null,
    noContext: true,
    model: '',
    roll,
    rollCost: roll ? shortUsd(costOf(roll, config.prices)) : '',
    steps: mini.slice(0, -1).map((y) => (pending ? { ...y, tone: 'rail' } : y)),
    state: pending ? 'pending' : mini.at(-1).text.trim(),
    stateTone: pending ? 'rail' : mini.at(-1).tone,
  }
}

/** The tree's table rows (every item but a note) as one table, and each item's line of it. */
function treeTable(items, widthOf) {
  const drawn = items.filter((x) => x.kind !== 'note')
  const data = drawn.map(treeItemRow)
  const t = agentTable(data, widthOf(data))
  return { t, lineOf: new Map(drawn.map((x, i) => [x, t.lines[i]])) }
}

/** The width the pane draws its table at: the pane's, but never under the width every kept column needs whole. */
function tableWidth(data, cols) {
  const widest = (f) => Math.max(0, ...data.map((r) => [...String(f(r) || '')].length))
  return Math.max(tableFloor(widest((r) => r.model), widest((r) => r.label)), (cols || 120) - 4)
}

/** The tree as text (the -p form, Q-70): the legend, the group line, the column names, the rows. */
function treeText() {
  const items = workTree()
  const { t, lineOf } = treeTable(items, () => 200)
  const text = (segs) => segs.map((y) => y.text).join('').trimEnd()
  const out = [...(track.view ? [LEGEND] : []), text(t.groups), text(t.header)]
  for (const x of items) out.push(x.kind === 'note' ? '  '.repeat(x.depth) + x.text : text(lineOf.get(x)))
  return out
}

/** A blocked row (Q-38): a node whose envelope is BLOCKED or ESCALATE. */
const isBlocked = (x) => !!x && (x.status === 'BLOCKED' || x.status === 'ESCALATE')

/** A row's direct key, if it holds one: its letter as the `hotkey` of the Button that opens it (T9). */
function letterKey(id) {
  const k = pane.letters.get(id)
  return k ? { hotkey: k } : {}
}

/** A hint line: each [key, text] pair draws the key in the accent hotkeys are drawn in, then its text dim (T9, Q-32). */
function keyHint({ Box, Text }, key, parts, tail = '') {
  return Box({ key, flexDirection: 'row', children: [...parts.flatMap(([k, t]) => [Text({ color: KEY_ACCENT, children: [k] }), Text({ dimColor: true, children: [t] })]), ...(tail ? [Text({ dimColor: true, children: [tail] })] : [])] })
}

/** The field that messages the targeted running agent (✉ on its row, or its open view). */
function messageField($, { Box, Text, Input }) {
  const out = []
  const tg = pane.target && tree.nodes.get(pane.target)
  if (tg && tg.endedAt == null) {
    out.push(
      Input({
        key: 'agent-msg',
        label: 'Message ' + tg.label,
        placeholder: 'steer this agent (it reads it at its next step)',
        value: '',
        submitLabel: 'send',
        ...(pane.detail ? {} : { autoFocus: true }),
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
    // With p on, the old plan section's footer joins the hint line (T10 amendment, Q-56).
    const foot = pane.planOpen && track.view ? ' · states are computed from _orch/ and the PR; each change is a row in _orch/track/ · ' + (gh.polledAt ? 'PR read ' + gh.polledAt.slice(11, 19) : 'PR not read yet') : ''
    out.push(keyHint({ Box, Text }, 'w-hint', [['↑/↓', ' then '], ['Enter', ' on › opens a row, or its letter does · ✉ messages a running one · '], ['p', ' shows every node · '], ['b', ' goes back']], foot))
  }
  return out
}

/** Settle a queued phase from the pane (the dialog's twin). */
async function resolveQueued($, i, how, who = 'operator') {
  const item = approvals.queue[i]
  if (!item) return
  track.dirty = true
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

/** A table row of the explorer: which store and namespace it is in, its mark id and its range. */
function memRowOf(which, ns, t) {
  const lo = t.lo
  const hi = t.hi - 1
  return { which, ns: ns || null, lo, hi, level: t.level, id: t.level > 0 ? lo + '-' + hi : String(lo) }
}

const memViewKey = (row) => row.which + '|' + (row.ns ?? '')

/** The glyph a row's mark cell draws (D-T14-mark-glyphs): ✅, ❌ or nothing. */
function rowGlyph(row) {
  const v = row && pane.memViews[memViewKey(row)]
  if (!v) return ''
  return MARK_GLYPH[markOf(v.cur, v.superseded, row.id)] || ''
}

/**
 * The project memory in the explorer (Q-92, D-T14-project-view): its default store and every named
 * namespace but `rulings`, one table; a namespace's rows start their text with `[<namespace>]`. A
 * drilled range (browse.stack: '<ns>|<lo-hi>') shows that namespace's stretch only.
 */
async function readProjectMemory($, budget) {
  const base = await memoryArgs($, 'project')
  const entries = (await listDir($, base[1] + '/ns')) || []
  const names = entries.filter((x) => x && x.kind !== 'file' && cleanNamespace(x.name) === x.name && x.name !== RULINGS_NS).map((x) => x.name).sort()
  const top = browse.stack.at(-1)
  const [topNs, range] = top ? [top.slice(0, top.indexOf('|')) || null, top.slice(top.indexOf('|') + 1)] : [null, null]
  const tiles = []
  const lines = []
  const rowsOut = []
  let notes = 0
  for (const ns of [null, ...names]) {
    if (top && ns !== topNs) continue
    const args = await memoryArgs($, 'project', ns)
    let w
    try {
      w = JSON.parse(await memoRun($, [...args, '--json', ...(range ? ['zoom', '--budget', String(budget), '--', range] : ['wake', '--budget', String(budget)])]))
    } catch {
      continue
    }
    pane.memViews['project|' + (ns ?? '')] = await markView($, args)
    ;(w.tiles || []).forEach((t, j) => {
      const l = String((w.lines || [])[j] ?? '')
      tiles.push(t)
      rowsOut.push(memRowOf('project', ns, t))
      lines.push(ns ? l.replace(/^(#\d+ \S+ \[[^\]]*\] ?|#\d+-\d+ )/, '$1[' + ns + '] ') : l)
      if (t.level === 0) notes++
    })
  }
  pane.memTiles = tiles
  pane.memLines = lines
  pane.memRows = rowsOut
  return ['project memory: ' + (names.length ? 'the default store and ' + names.map((x) => '[' + x + ']').join(' ') : 'the default store') + ' (rulings are below, retracted not marked)', (range ? 'notes #' + range + (topNs ? ' [' + topNs + ']' : '') : 'wake view') + ' (' + tiles.length + ' blocks):']
}

const MEM_MARK_KEYS = new Set(['mem-key-c', 'mem-key-v', 'mem-key-u'])
const REASON_LABELS = ['Type the reason under Other', 'Make no mark']

/** The Memory view's own keys, on the key line after r (D-T14-project-toggle, D-T14-filter-keys, D-T14-mark-letters). */
function memoryKeys($, Button, rows) {
  const k = (key, label, hotkey, onPress) => Button({ key, label, hotkey, plain: true, onPress })
  return [
    k('mem-store', pane.memStore === 'project' ? 'run memory' : 'project memory', 's', () => toggleStore($, rows)),
    k('mem-filter-ok', 'confirmed only', '3', () => setFilter($, 'ok')),
    k('mem-filter-void', 'void only', '4', () => setFilter($, 'void')),
    k('mem-key-c', '✅ confirm', 'c', () => paneMark($, 'ok', rows)),
    k('mem-key-v', '❌ void', 'v', () => paneMark($, 'void', rows)),
    k('mem-key-u', 'clear', 'u', () => paneMark($, 'clear', rows)),
  ]
}

/** s: the run's memory or the project memory (Q-92). */
function toggleStore($, rows) {
  pane.memStore = pane.memStore === 'project' ? 'run' : 'project'
  Object.assign(browse, { stack: [], search: null })
  Object.assign(pane, { mdetail: null, memFocusRow: null, memHint: null })
  $.ui.invalidate('ui.render')
  return refreshPane($, rows)
}

/** 3 and 4: confirmed only, void only; the active one's key again shows every row. */
function setFilter($, f) {
  pane.memFilter = pane.memFilter === f ? null : f
  $.ui.invalidate('ui.render')
}

function memHint($, text) {
  pane.memHint = text
  $.ui.invalidate('ui.render')
}

/**
 * c, v, u from the pane (Q-71, Q-72, Q-73): on the opened note or summary, else on the focused row;
 * the reason is asked in a `reason:` dialog and required. The mark records `operator`.
 */
async function paneMark($, mark, rows) {
  const d = pane.mdetail
  const row = d ? d.mem || (d.ruling ? { ruling: true } : null) : pane.memFocusRow
  if (!row) return memHint($, 'focus a note or summary row to mark it')
  if (row.ruling) return memHint($, 'no mark: rulings are retracted, not marked')
  let answer = ''
  try {
    answer = String(await $.ui.ask('reason:', REASON_LABELS))
  } catch {
    answer = ''
  }
  const reason = REASON_LABELS.includes(answer.trim()) ? '' : cutBytes(answer)
  if (!reason) return memHint($, 'no mark: a reason is needed')
  try {
    await writeMark($, row.which, row.ns, row.id, mark, reason, 'operator')
  } catch (err) {
    return memHint($, 'no mark: ' + (err && err.message ? err.message : String(err)))
  }
  pane.memHint = (row.ns ? '[' + row.ns + '] ' : '') + '#' + row.id + ' ' + MARK_WORD[mark] + (mark === 'void' ? '; the summaries above it are rebuilt without it' : '')
  await refreshPane($, rows)
  if (pane.mdetail && pane.mdetail.mem) await openMemRow($, pane.mdetail.mem)
}

/** Enter on a row's › : the note's or summary's view, its text, its mark and every mark record (Q-71, Q-74, Q-90). */
async function openMemRow($, row) {
  const args = await memoryArgs($, row.which, row.ns)
  const records = await memoJson($, [...args, '--json', 'marks', row.id], [])
  const j = pane.memRows.findIndex((r) => r.which === row.which && r.ns === row.ns && r.id === row.id)
  const line = j >= 0 ? String(pane.memLines[j] ?? '') : ''
  const text = (lineText(line) ?? line).replace(row.ns ? '[' + row.ns + '] ' : '\u0000', '')
  pane.mdetail = { ...memDetail({ ...row, text, store: row.which === 'project' ? 'project memory' : 'run memory' }, Array.isArray(records) ? records : []), mem: row }
  $.ui.invalidate('ui.render')
}

/** Memory: open a block (+), go back (b), or search; notes and summaries as a table (T12). */
function memoryBody($, { Box, Text, Button, Input, line, rows }) {
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
  if (pane.memFilter) out.push(line('mem-filter', pane.memFilter === 'ok' ? 'confirmed only' : 'void only', { bold: true }))
  // The rows a filter keeps (3: ✅ only, 4: ❌ only), with their mark cells (T14).
  const glyphs = pane.memLines.map((_, j) => rowGlyph(pane.memRows[j]))
  const keep = pane.memLines.map((_, j) => j).filter((j) => !pane.memFilter || glyphs[j] === MARK_GLYPH[pane.memFilter])
  const shown = keep.map((j) => pane.memLines[j])
  const marks = keep.map((j) => glyphs[j])
  const cells = memTableCells(shown, Date.now(), marks)
  if (shown.length) out.push(Box({ key: 'mem-head', flexDirection: 'row', children: [Text({ children: ['    '] }), line('mem-head-l', memTableHeader(shown, Date.now(), marks), { dimColor: true })] }))
  cells.forEach(([idCell, markCell, rest], at) => {
    const j = keep[at]
    const t = pane.memTiles[j]
    const row = pane.memRows[j]
    const isVoid = marks[at] === MARK_GLYPH.void
    // the first column: a summary's + opens it; a note keeps the column blank so the table lines up
    const first =
      t && t.level > 0
        ? Button({
            key: 'mem-open-' + j,
            label: '+',
            plain: true,
            onPress: () => {
              browse.search = null
              browse.stack.push((pane.memStore === 'project' ? (row && row.ns ? row.ns : '') + '|' : '') + t.lo + '-' + (t.hi - 1))
              return reload()
            },
          })
        : Text({ children: [' '] })
    // then the row's open control (D-T14-row-open-control): Enter opens the note's or summary's view
    const open = Button({ key: 'mem-row-' + j, label: '›', plain: true, onPress: () => openMemRow($, row) })
    if (row) {
      pane.memRowKeys.set('mem-open-' + j, row)
      pane.memRowKeys.set('mem-row-' + j, row)
    }
    const dim = isVoid ? { dimColor: true } : {}
    out.push(
      Box({
        key: 'mr' + j,
        flexDirection: 'row',
        children: [
          first,
          Text({ children: [' '] }),
          open,
          Text({ children: [' '] }),
          Text({ wrap: 'truncate-end', ...dim, children: [idCell] }),
          Text({ wrap: 'truncate-end', ...(isVoid ? { color: 'red' } : {}), children: [markCell] }),
          line('m' + j, rest, dim),
        ],
      }),
    )
  })
  if (pane.memTiles.some((t) => t && t.level > 0)) out.push(keyHint({ Box, Text }, 'mem-hint', [['+', ' then '], ['Enter', ' opens a block · '], ['b', ' goes back']]))
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
    pane.memRowKeys.set('open-r-' + r.n, { ruling: true })
    pane.memRowKeys.set('retract-' + r.n, { ruling: true })
    out.push(
      Box({
        key: 'rr' + r.n,
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Button({ key: 'open-r-' + r.n, label: '›', plain: true, onPress: () => openRuling($, r) }),
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
  if (id === 'work') return workspaceLines()
  if (id === 'memory') return ['rulings:', ...(pane.data.rulings ?? []), '', ...(pane.data.memory ?? []), ...pane.memLines]
  if (id === 'agents') return [...queueLines(), ...treeText(), ...mismatchLines()]
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
      case 'memory_wake': {
        const args = await memoryArgs($, 'run')
        const rules = await rulingsBlock($)
        return { result: rules + (await withMarks($, args, await memoRun($, [...args, 'wake', '--budget', String(budget)]))) }
      }
      case 'memory_mark':
        return await markTool($, e, 'run')
      case 'project_mark':
        return await markTool($, e, 'project')
      case 'memory_note': {
        // Only the run's own session writes run notes (T7); Q-80: an error result, nothing written.
        const outside = await outsideRun($)
        if (outside) return { deny: outside }
        const given = e.tag != null && e.tag !== ''
        const tag = given ? cleanTag(e.tag) : callerRole(e.agentId)
        if (given && isReservedTag(tag)) {
          return { result: 'baton: tag "' + tag + '" is reserved (' + RESERVED_TAGS_TEXT + '); no note written. Use another tag, or none for your role.' }
        }
        return { result: await appendNote($, 'run', String(e.text ?? ''), tag) }
      }
      case 'memory_zoom': {
        const args = await memoryArgs($, 'run')
        return { result: await withMarks($, args, await memoRun($, [...args, 'zoom', '--budget', String(budget), '--', String(e.range ?? '')]), { includeVoid: e.include_void === true }) }
      }
      case 'memory_recall': {
        const args = await memoryArgs($, 'run')
        const pattern = String(e.pattern ?? '')
        return { result: await withMarks($, args, await memoRun($, [...args, 'recall', '--limit', String(e.limit ?? 20), '--', pattern]), { includeVoid: e.include_void === true, pattern }) }
      }
      case 'project_wake': {
        const args = await memoryArgs($, 'project', e.namespace)
        return { result: await withMarks($, args, await memoRun($, [...args, 'wake', '--budget', String(budget)]), { which: 'project', namespace: cleanNamespace(e.namespace) }) }
      }
      case 'project_note':
        return { result: await appendNote($, 'project', String(e.text ?? ''), e.agentId ? 'agent' : 'prime', e.namespace) }
      case 'project_recall': {
        const args = await memoryArgs($, 'project', e.namespace)
        const pattern = String(e.pattern ?? '')
        return { result: await withMarks($, args, await memoRun($, [...args, 'recall', '--limit', String(e.limit ?? 20), '--', pattern]), { includeVoid: e.include_void === true, pattern, which: 'project', namespace: cleanNamespace(e.namespace) }) }
      }
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

async function recordRuling($, text, tag = 'ruling', source = null) {
  const r = await appendNote($, 'project', text, tag, RULINGS_NS)
  forgetRulings()
  // Where it came from, for its view in Memory: the message it was lifted from.
  const m = /noted #(\d+)/.exec(r)
  if (m && source) {
    try {
      await $.store.set('ruling-src:' + m[1], { text: String(source).slice(0, 600), at: new Date(Date.now()).toISOString().slice(11, 19) + 'Z' })
    } catch {}
  }
  return r
}

// The rulings memo (T6, R-C6-05). A read spawns memo (about 70 ms on the call's path), so a list
// younger than RULINGS_TTL_MS is used as is, and an older one is still used while a fresh read runs
// in the background; only a cold memo (none yet, or a rulings write since) or one older than
// RULINGS_MAX_AGE_MS waits for the read. Every rulings write clears it (forgetRulings), and a read
// begun before a write never lands after it (gen).
const rulingsCache = { at: -1e12, list: [], gen: 0, pending: null }
const RULINGS_TTL_MS = 3000
const RULINGS_PANE_TTL_MS = 60000
const RULINGS_MAX_AGE_MS = 120000

/** One memo read of the rulings at a time per write generation; it lands only if no write came since. */
function readRulings($) {
  const gen = rulingsCache.gen
  if (rulingsCache.pending && rulingsCache.pending.gen === gen) return rulingsCache.pending.p
  const entry = { gen, p: null }
  entry.p = (async () => {
    let list
    try {
      const args = await memoryArgs($, 'project', RULINGS_NS)
      const r = JSON.parse(await memoRun($, [...args, '--json', 'recall', '--limit', '2000', '--', '.']))
      list = activeRulings(r.notes ?? [])
    } catch {
      list = []
    }
    if (rulingsCache.gen === gen) {
      rulingsCache.list = list
      rulingsCache.at = Date.now()
    }
    return list
  })().finally(() => {
    if (rulingsCache.pending === entry) rulingsCache.pending = null
  })
  rulingsCache.pending = entry
  return entry.p
}

/** The standing rulings, newest first (retracted ones dropped, enforcement attached). Memoized, see above. */
async function loadRulings($, fresh = false, ttl = RULINGS_TTL_MS) {
  const age = Date.now() - rulingsCache.at
  if (fresh || age >= RULINGS_MAX_AGE_MS) return readRulings($)
  if (age >= ttl) readRulings($)
  return rulingsCache.list
}

function forgetRulings() {
  rulingsCache.at = -1e12
  rulingsCache.gen++
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
    n.ctxHist = [...(n.ctxHist || []), null].slice(-8) // filled below once the window is known
    if (usage.model) n.served = usage.model // the model that answered; n.model stays the short name for the row
    n.window = n.id === PRIME && rotation.window ? rotation.window : windowFor(n.served, rotation.window || 200_000)
    n.ctxHist[n.ctxHist.length - 1] = Math.round((n.ctx / n.window) * 100)
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
  // Re-read the record only when something could have moved it (an agent's turn or tool call,
  // a poll, an approval), and at most every TRACK_TTL_MS; otherwise once a minute regardless.
  const age = Date.now() - track.at
  if (!force && (age < TRACK_TTL_MS || (!track.dirty && age < 60000))) return track.view
  track.dirty = false
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
  // The nodes: every one the plan names (a phase row's node rows come from the plan, T10 amendment) and
  // every directory under _orch/nodes, listed as the declared kind 'dir'.
  const nodeDirs = ((await listDir($, '_orch/nodes')) ?? []).filter((x) => x.kind === 'dir').map((x) => x.name)
  const nodeIds = [...new Set([...phaseOfNode.keys(), ...nodeDirs])].filter((id) => /^[A-Za-z0-9._-]+$/.test(id)).sort(byId).slice(0, 400)
  for (const id of nodeIds) {
    const base = '_orch/nodes/' + id
    const st = await readJson($, base + '/status.json')
    const vd = await readJson($, '_orch/verify/' + id + '-verdict.json')
    let handoff = ''
    try {
      handoff = await $.fs.read(base + '/handoff.md')
    } catch {}
    if (vd && Array.isArray(vd.criteria) && vd.criteria.some((r) => String(r.verdict).toUpperCase() === 'REFUTED')) await recordLessons($, id, vd, handoff)
    const facts = {
      exempt: /\brgb:\s*exempt\b/i.test(handoff),
      red: await exists($, base + '/work/red.txt'),
      green: await exists($, base + '/work/green.txt'),
      blue: await exists($, base + '/work/blue.txt'),
      started: !!st || (await exists($, base + '/work')),
      status: st && st.verdict,
      verdict: vd && vd.verdict,
    }
    nodes.push({ id, phase: phaseOfNode.get(id) ?? null, ...nodeState(facts), status: facts.status, verified: facts.verdict === 'CONFIRMED' })
  }
  const phaseNums = new Set([...phaseOfNode.values()])
  for (const d of (await listDir($, '_orch/phases')) ?? []) {
    const mm = /^P(\d+)$/.exec(d.name)
    if (d.kind === 'dir' && mm && Number(mm[1]) > 0) phaseNums.add(Number(mm[1]))
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
  // Any Q-<id>.md is a question; an answer file closes it unless it is marked unauthorized (Q-48). It is put to the operator
  // once its asked record Q-<id>.asked.md exists (Q-42), and queued until then, for the next gate (Q-43) or none (Q-44).
  const questions = []
  const inbox = ((await listDir($, '_orch/inbox')) ?? []).filter((x) => x.kind === 'file').map((x) => x.name)
  const gate = graphText ? nextGate(nodes) : null
  for (const f of inbox.filter((n) => /^Q-[^.]+\.md$/.test(n)).sort(byId)) {
    const id = f.replace(/\.md$/, '')
    // An answer file closes the question unless it is marked unauthorized (Q-48).
    const unauthorized = inbox.includes(id + '.answer.md')
    if (unauthorized && !unauthorizedAnswer(await readText($, '_orch/inbox/' + id + '.answer.md', 4000))) continue
    let text = ''
    try {
      text = await $.fs.read('_orch/inbox/' + f)
    } catch {}
    const asked = inbox.includes(id + '.asked.md')
    const blockedBy = parseBlockedBy(text)
    questions.push({ id, first: firstLine(text), blockedBy, asked, gate: asked ? null : gate, unauthorized, nodes: nodesBlocked(text), color: questionColor(blockedBy) })
    await notify($, 'q:' + (m.run_id || '') + f + (asked ? ':asked' : ''), (asked ? 'a question waits for you: ' : 'a question is ' + questionState({ asked, gate }) + ': ') + firstLine(text).slice(0, 120))
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

/** A `?` row's text: the id, its state right after it (Q-49), the first line, and the line it rests on. */
function questionLine(q) {
  return q.id + ' · ' + questionState(q) + ' · ' + q.first + (q.blockedBy ? '  — blocked by ' + q.blockedBy.where + ' (' + q.blockedBy.kind + (q.blockedBy.kind === 'interpreted' ? ': you may overrule it' : ': fix the cause') + ')' : '')
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
      if (!agentIdVerified(probe.version)) {
        probe.notice =
          `baton: the prime guard tells the prime from a subagent by tool.call's agentId, which needs Claude Code ` +
          `${VERIFIED_AGENTID_VERSION} or later; this is ${probe.version}. The guard fails closed: a call without agentId ` +
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
    await readSessionModel($)
    // Run membership is recorded once (T7): where the session started, and whose run it is. Here,
    // or already by the startup SessionStart, which 2.1.316 runs first (ensureMembership).
    try {
      await ensureMembership($, e)
    } catch (err) {
      $.ui.log('baton: could not record run membership: ' + err.message)
    }
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
    // The doctor runs once, in the background; a failed check shows in the band.
    $.clock.after(1500, () => runDoctor($).catch(() => {}))
    $.clock.after(4000, () => checkUpdate($).catch(() => {}))
    // The pane opens by itself, and plan usage refreshes on the clock: no /baton needed.
    $.clock.after(500, () => autoOpenPane($).catch(() => {}))
    try {
      $.clock.every(30000, () =>
        heartbeat($)
          .catch((err) => $.ui.log('baton: prime heartbeat: ' + err.message))
          .then(() => readUsage($))
          .then(() => $.ui.invalidate('ui.render')),
      )
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
        description: 'baton v7: start | stop | pause | resume | rotate | status | show | doctor | watch | next | rule | rulings | retract | enforce | checkpoints | restore — or no argument for the pane',
        argumentHint: '[start <MODE> <TARGET|#issue> | stop | pause | resume | rotate | status | show <id> | doctor | watch | next | rule <text> | rulings | retract <#> | enforce <#> <regex> | checkpoints | restore <id>]',
        immediate: true,
      })
    } catch (err) {
      $.ui.log('baton: /baton not registered: ' + err.message)
    }
    return next(e)
  })

  // ---------------------------------------------------------------- the prime guard

  // Every tool.call hook below handles its own failure (closedOnThrow / openOnThrow) and carries the
  // same .catch, toolCallCaught: see "The tool.call hooks' own failure handling" above.
  on('tool.call', async ($, e, next) => closedOnThrow($, e, next, 'the prime guard', async (pass) => {
    addToolCall(tree, isPrimeCall(e) ? PRIME : e.agentId, e.tool, toolDetail(e))
    if (!isPrimeCall(e)) track.dirty = true
    if (pane.open && pane.tab === 'agents') $.ui.invalidate('ui.render')
    if (!isPrimeCall(e)) {
      if (!probe.seen.has(e.agentId)) {
        probe.seen.add(e.agentId)
        if (probe.spawned.has(e.agentId) && !probe.verified) probe.verified = true
      }
      // Where subagents report through a SubagentHandback tool, that call carries the return.
      if (e.tool === 'SubagentHandback' && spawnedByPrime.has(e.agentId)) {
        const r = await pass(e)
        if (!r.deny && (await noteReturn($, e.agentId, e.message))) handedBack.add(e.agentId)
        return r
      }
      return pass(e)
    }
    const active = await runActive($)
    const verdict = guardDecision(e, active)
    if (!verdict) {
      // Third path for the wake: if neither SessionStart nor a prompt carried
      // it, the prime's first tool call after a rotation does.
      const wake = active && rotation.pendingWake ? takeWake() : null
      if (!wake) return pass(e)
      const r = await pass(e)
      return r && !r.deny ? { ...r, context: [...(r.context ?? []), wake] } : r
    }
    probe.denied++
    const live = [...probe.spawned].some((id) => !probe.seen.has(id))
    if (live) probe.deniedWhileLive++
    $.ui.log('prime denied ' + e.tool + ' → dispatch a sub-orchestrator')
    return verdict
  })).catch(toolCallCaught)

  // ---------------------------------------------------------------- memory tools

  on('tool.call', { tool: /^mcp__baton__(memory|project)_/ }, async ($, e) => openOnThrow(e, () => serveMemoryTool($, e))).catch(toolCallCaught)

  // ---------------------------------------------------------------- approvals

  // A line the model reads after a tool's result, whatever the result's shape (Bash's is an object).
  const withContext = (r, line) => (r && !r.deny ? { ...r, context: [...(r.context || []), line] } : r)

  // Pause holds gated commands too, from any agent.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => closedOnThrow($, e, next, 'the pause check', async (pass) => {
    if (!pause.on || !gateFor(e.command)) return pass(e)
    pause.held++
    return { deny: 'baton is paused by the operator. This command waits: return BLOCKED with it, and it is re-dispatched after /baton resume.' }
  })).catch(toolCallCaught)

  // The command gate: an irreversible shell command from any agent, at any
  // depth, waits for the operator. Nobody to ask (claude -p) refuses it.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => closedOnThrow($, e, next, 'the command gate', async (pass) => {
    if (!config.approvals || !(await runActive($))) return pass(e)
    const gate = gateFor(e.command)
    if (!gate || approvals.always.has(gate.id)) return pass(e)
    // Approved once from a blocked row's brief (T13, Q-37): that exact command passes, once.
    if (approvals.once.delete(String(e.command).trim())) {
      const r = await pass(e)
      await noteQuietly($, afterNote(chain(tree, isPrimeCall(e) ? PRIME : e.agentId), commandEffects(e.command), r), 'approval')
      return withContext(r, 'baton: the operator approved this exact command once, from the pane.')
    }
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
      // Q-81: what the shell would run, heredoc bodies and quoted strings read as data; the gate is not named (D-T14-approval-notes).
      const effects = commandEffects(e.command)
      await noteQuietly($, 'operator approved for ' + who + (verdict === 'always' ? ' (and every command of this kind for the run)' : '') + ': ' + effectsText(effects), 'approval')
      const r = await pass(e)
      await noteQuietly($, afterNote(who, effects, r), 'approval')
      // The agent never sees the dialog: tell it the operator approved, so its report is true.
      return withContext(r, 'baton: the operator approved this "' + gate.label + '" command before it ran' + (verdict === 'always' ? ', and every "' + gate.label + '" for the rest of the run' : '') + '.')
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
  })).catch(toolCallCaught)

  // Forbidden files: refuse a `git add` that names one, from any agent, run or no
  // run. Prevention at the moment it happens; the PR's merge-ready row catches
  // what a broad `git add -A` let through. (Beneath pause and the command gate since
  // FX1, so each of the three is the first to read a command in its own case.)
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => closedOnThrow($, e, next, 'the forbidden-file check', async (pass) => {
    const hits = forbiddenHits(gitAddPaths(e.command), config.forbiddenFiles)
    if (!hits.length) return pass(e)
    if (await runActive($)) await noteQuietly($, 'refused git add of ' + hits.join(', ') + ' for ' + chain(tree, isPrimeCall(e) ? PRIME : e.agentId), 'approval')
    return { deny: 'baton: ' + hits.join(', ') + ' matches a forbidden-file pattern (secrets, keys, env files) and is never committed. Leave it untracked; if the work needs it, return BLOCKED and say why.' }
  })).catch(toolCallCaught)

  // Checkpoints: a command that discards work snapshots the tree first (after the gate let it through).
  // During a run, no snapshot means no discard: the command is refused (fail closed).
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => closedOnThrow($, e, next, 'the checkpoint', async (pass) => {
    if (!discards(e)) return pass(e)
    const id = await checkpoint($, (e.agentId ? chain(tree, e.agentId) : 'session') + ': ' + String(e.command).slice(0, 160))
    if (!id && (await runActive($))) {
      return { deny: 'baton: the checkpoint snapshot before this command failed, so it was refused and nothing was discarded. Do not retry it another way: return BLOCKED with the exact command.' }
    }
    const r = await pass(e)
    return id ? withContext(r, 'baton checkpoint ' + id + ' taken first: /baton restore ' + id + ' puts the files back.') : r
  })).catch(toolCallCaught)

  // The phase gate: once a sub-orchestrator reports DONE, the prime's next
  // dispatch waits until the operator approves that phase or sends it back.
  on('tool.call', { tool: /^(Agent|Task)$/ }, async ($, e, next) => closedOnThrow($, e, next, 'the phase gate', async (pass) => {
    if (!isPrimeCall(e) || !config.phaseGate || !approvals.queue.length || !(await runActive($))) return pass(e)
    while (approvals.queue.length) {
      const item = approvals.queue[0]
      // Built outside the try: a question that cannot be built is the gate failing (closedOnThrow), not a dismissal.
      const question = phaseQuestion(item, await rulingLines($, 5))
      let answer = null
      try {
        answer = await $.ui.ask(question, [APPROVE, SEND_BACK])
      } catch {
        answer = null
      }
      if (answer === null) return pass(e) // dismissed: leave it queued, do not stall the run
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
    return pass(e)
  })).catch(toolCallCaught)

  // ---------------------------------------------------------------- the kit

  on('tool.call', { tool: /^mcp__baton__code_/ }, async ($, e) => openOnThrow(e, () => serveCodeTool($, e))).catch(toolCallCaught)

  // A Read of a large source file runs as asked; its result carries a pointer to
  // code_fetch, and the mod counts it (the experiment in #48 decides whether this
  // ever becomes a redirect).
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const r = await next(e)
    try {
      if (r && !r.deny && config.readHintLines && langOf(e.file_path) && !e.offset && !e.limit) {
        const text = readResultText(r.result)
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
  }).catch(toolCallCaught)

  // Quiet output: a long shell result is cut to head, failures and tail; the whole goes to a file.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const r = await next(e)
    try {
      const out = r && !r.deny ? bashText(r.result) : null
      if (out == null || !config.quietOutputLines || /--json\b/.test(String(e.command)) || /^\s*[[{]/.test(out)) return r
      const n = out.split('\n').length
      if (n <= config.quietOutputLines) return r
      // Absolute, as memoryArgs resolves its directories: _orch under the working directory, .baton under the root.
      const inRun = await runActive($)
      const dir = inRun ? (await $.session.cwd()) + '/_orch/out' : (await $.session.root()) + '/.baton/out'
      const file = dir + '/' + new Date(Date.now()).toISOString().replace(/[-:.]/g, '') + '-' + (e.agentId ? String(e.agentId).slice(0, 8) : 'main') + '.log'
      await $.fs.write(file, out)
      if (!inRun) {
        try {
          if (!(await $.fs.exists(dir + '/.gitignore'))) await $.fs.write(dir + '/.gitignore', '*\n')
        } catch {}
      }
      const q = quietText(out, config.quietOutputLines, file)
      if (!q) return r
      kit.quieted++
      kit.quietLinesTotal += n
      kit.quietLinesKept += q.split('\n').length
      return { ...r, result: typeof r.result === 'string' ? q : { ...r.result, stdout: q } }
    } catch {
      return r
    }
  }).catch(toolCallCaught)

  // The served effort (C8E): a classic hook input in a tool-use context carries the effort applied to the
  // turn, after any silent downgrade, with the subagent's agent_id (none: the main loop). Stop is read by withNotice.
  on('classic.PostToolUse', withServedEffort).catch(failOpen)
  on('classic.PostToolUseFailure', withServedEffort).catch(failOpen)
  on('classic.SubagentStop', withServedEffort).catch(failOpen)

  // Notifications reach the desktop when Claude Code next lets a hook emit one.
  on('classic.Stop', withNotice).catch(failOpen)
  on('classic.Notification', withNotice).catch(failOpen)

  // Enforced rulings: a standing ruling with a pattern refuses matching shell
  // commands outright, run or no run, after the permission rules decide.
  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const decided = await next(e)
    const hit = enforcedHit(await loadRulings($), e.input && e.input.command)
    if (!hit) return decided
    return { decision: 'deny', reason: 'baton ruling #' + hit.n + ' (enforced): ' + hit.text }
  }).catch(async ($, e, next) => ((await runActive($)) ? { decision: 'deny', reason: 'baton: the enforced-rulings check failed (' + next.error.kind + '), so this command was refused during the run.' } : next(e)))

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
  // The prime that ends clears its prime_session, so a restart picks the run up at once (Q-7).
  on('session.end', async ($, e, next) => {
    try {
      await releaseRun($, e)
    } catch (err) {
      $.ui.log('baton: could not clear prime_session: ' + err.message)
    }
    return next(e)
  }).catch(failOpen)

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
  }).catch(failOpen)

  // After a compaction the engine raises SessionStart with source "compact":
  // hand the prime the wake instruction there.
  // A new session (or a resumed one) that is the run's own by its recorded membership (T7) is the
  // prime of that run, picking up where another session left off: it must wake from the memory
  // before anything else. One left unarmed by a live prime elsewhere is told why instead (Q-29).
  on('classic.SessionStart', { source: /^(startup|resume)$/ }, async ($, e, next) => {
    const r = await next(e)
    // At 2.1.316 this hook runs before session.start: record membership first, or a second session in the
    // run's directory is told it is the prime, gets the memory tools and writes a run note (T7, LV7 §7).
    try {
      await ensureMembership($, { cwd: e.cwd })
    } catch {}
    forgetRunCache()
    if (!(await runActive($))) {
      // A session left unarmed by a live prime elsewhere is told why in its output too (Q-29).
      return membership.why ? { ...(r || {}), additionalContext: [...((r && r.additionalContext) || []), membership.why] } : r
    }
    try {
      await registerMemoryTools($)
    } catch {}
    const m = run.manifest || {}
    const text = pickUpContext(m)
    membership.takeoverWake = null // told here; the next prompt need not repeat it
    await noteQuietly($, 'a new session picked the run up (' + e.source + ')', 'handoff')
    return { ...(r || {}), additionalContext: [...((r && r.additionalContext) || []), text] }
  }).catch(failOpen)

  on('classic.SessionStart', { source: 'compact' }, async ($, e, next) => {
    const r = await next(e)
    const wake = (await runActive($)) ? takeWake() : null
    if (!wake) return r
    return { ...(r || {}), additionalContext: [...((r && r.additionalContext) || []), wake] }
  }).catch(failOpen)

  // The operator's words become run notes, and any standing rule in them a
  // ruling (in the background: the turn does not wait on the cheap model).
  // After a rotation, the prompt also carries the wake.
  on('prompt.submit', async ($, e, next) => {
    const operatorPrompt = isOperatorPrompt(e.text, run.lastKickoff, e.origin)
    if (operatorPrompt && !(await runActive($))) await notNoted($, 'the operator prompt')
    else if (operatorPrompt) {
      const text = String(e.text)
      try {
        await appendNote($, 'run', text, 'operator')
      } catch (err) {
        $.ui.log('baton: could not note the operator prompt: ' + err.message)
      }
      $.clock.after(0, async () => {
        // Only a message that could state a rule costs a model call.
        if (!mightBeRuling(text)) return
        const rule = await extractRuling($, text)
        if (!rule) return
        try {
          await recordRuling($, rule, 'ruling', text)
          $.ui.log('baton: ruling recorded — ' + rule)
        } catch (err) {
          $.ui.log('baton: could not record a ruling: ' + err.message)
        }
      })
    }
    // Belt and braces for the wake: if no SessionStart carried it, this prompt does.
    const active = await runActive($)
    let wake = rotation.pendingWake && active ? takeWake() : null
    // A take-over (P4-d3): the pick-up the startup hook could not give, once, on the first prompt after the yes.
    if (!wake && membership.takeoverWake && active && membership.member) {
      wake = membership.takeoverWake
      membership.takeoverWake = null
    }
    if (!wake) return next(e)
    return next({ ...e, context: [...(e.context ?? []), wake] })
  }).catch(failOpen)

  // ---------------------------------------------------------------- /baton

  on('command.run', { command: 'baton' }, async ($, e) => {
    if (!sessionOwn.model) await readSessionModel($)
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
      case 'show': {
        const what = rest.join(' ').trim()
        await observe($, true)
        const v = track.view || { phases: [] }
        const target = resolveTarget(what, {
          phases: v.phases || [],
          nodes: [...(v.phases || []).flatMap((p) => p.nodes || []), ...(v.unphased || [])],
          agents: [...tree.nodes.values()].filter((n) => n.id !== PRIME).map((n) => ({ id: n.id, label: n.label })),
        })
        if (!what || !target) return { text: 'usage: /baton show <P3 | T12 | an agent’s name> — the same view Enter opens in Work' }
        if (target.kind === 'node') await loadLessons($)
        const view = await buildDetail($, target.kind, target.id)
        if (!view) return { text: 'nothing to show for ' + what }
        if (await interactive($)) {
          pane.detail = { ...target, view }
          pane.tab = 'work'
          if (!pane.open) await autoOpenPane($)
          $.ui.invalidate('ui.render')
        }
        return { text: detailText(view) }
      }
      case 'checkpoints': {
        let cps = []
        try {
          cps = await listCheckpoints($)
        } catch {}
        return { text: cps.length ? 'baton checkpoints, newest first (/baton restore <id>):\n' + cps.slice(0, 30).map(([id, subj]) => '  ' + id + '  ' + subj).join('\n') : 'no checkpoints yet: one is taken before every reset --hard, clean -f or rm -r' }
      }
      case 'restore': {
        const id = String(rest[0] || '').trim()
        if (!/^\d{8}T\d{9}Z$/.test(id)) return { text: 'usage: /baton restore <id> — /baton checkpoints lists them' }
        const before = await checkpoint($, 'before restoring ' + id)
        const r = await $.process.run(['git', 'restore', '--source=' + CHECKPOINT_REF + id, '--worktree', '--', '.'], { timeoutMs: 60000 })
        if (r.exitCode !== 0) return { text: 'could not restore ' + id + ': ' + (r.stderr || r.stdout).trim() }
        if (await runActive($)) await noteQuietly($, 'operator restored the files to checkpoint ' + id, 'operator')
        return { text: 'baton: files restored to checkpoint ' + id + ' (files created since are left alone).' + (before ? ' The state just before is checkpoint ' + before + '.' : '') }
      }
      case 'doctor':
        return { text: doctorText(await runDoctor($)) }
      case 'pause': {
        pause.on = true
        pause.since = new Date(Date.now()).toISOString().slice(11, 19) + 'Z'
        pause.held = 0
        if (await runActive($)) await noteQuietly($, 'operator paused the run', 'operator')
        $.ui.invalidate('ui.render')
        return { text: 'baton: paused. New spawns and gated commands are held; agents already running finish what they are doing. /baton resume lets it go on.' }
      }
      case 'resume': {
        if (!pause.on) return { text: 'baton is not paused' }
        pause.on = false
        if (await runActive($)) await noteQuietly($, 'operator resumed the run (' + pause.held + ' spawn' + (pause.held === 1 ? '' : 's') + ' held while paused)', 'operator')
        $.ui.invalidate('ui.render')
        return { text: 'baton: resumed (' + pause.held + ' held while paused; the prime re-dispatches them).' }
      }
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
        // The Memory view opens on the run's memory every time the pane is opened (D-T14-project-toggle).
        if (pane.memStore !== 'run') {
          Object.assign(pane, { memStore: 'run', mdetail: pane.mdetail && pane.mdetail.mem ? null : pane.mdetail, memFocusRow: null })
          Object.assign(browse, { stack: [], search: null })
        }
        await refreshPane($, 30)
        if (!surfaces.length) return { text: (await statusText($)) + '\n\n' + paneText() }
        pane.open = true
        pane.waiting = false
        Object.assign(pane.list, { top: 0, topKey: null, focus: null, alias: new Map() })
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
  }).catch(failOpen)

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
    if (pane.tab === 'memory') tabs.push(...memoryKeys($, Button, rows))
    // p shows or hides the node rows under every phase row of the tree (T10 amendment, Q-59).
    if (pane.tab === 'work' && !pane.detail && track.view) tabs.push(Button({ key: 'nodes-toggle', label: pane.planOpen ? 'hide the nodes' : 'every node', hotkey: 'p', plain: true, dimColor: true, onPress: () => ((pane.planOpen = !pane.planOpen), $.ui.invalidate('ui.render')) }))
    const line = (key, text, extra = {}) => Text({ wrap: 'truncate-end', ...extra, children: [String(text).slice(0, Math.max(20, cols * 2)) || ' '] })
    const ui = { Box, Text, Button, Input, Link, line, rows, cols }
    if (pane.tab !== 'memory') await loadLetters($)
    const body = placeList(pane.tab === 'memory' ? memoryTabBody($, ui) : workspaceBody($, ui), rows, ui)
    const root = Box({
      flexDirection: 'column',
      children: [
        Box({ flexDirection: 'row', columnGap: 3, ...(pane.tab === 'memory' ? { flexWrap: 'wrap' } : {}), children: tabs }),
        Text({ dimColor: true, children: ['read ' + (pane.refreshedAt ?? 'never') + ' · Esc closes'] }),
        ...body,
      ],
    })
    pane.list.ring = focusRing(root)
    return root
  })

  // The agent list scrolls itself (T15): PageUp and PageDown move its window by one window, Home and
  // End to its first and last row, with the focus there (Q-63); the wheel moves it row by row.
  on('ui.scroll', { component: 'Pane' }, async ($, e, next) => {
    const L = pane.list
    if (e.requestId !== PANE || pane.tab !== 'work' || pane.detail || !L.on || L.fits) return next(e)
    const by = Number(e.by) || 0
    const pin = (i) => L.pins[i]
    const end = listEnd(L.n, L.area, pin)
    let top = L.top
    let focusAt = null
    if (e.contentRows !== e.bodyRows && Math.abs(by) === e.contentRows) [top, focusAt] = by < 0 ? [0, 0] : [end, L.n - 1]
    else if (Math.abs(by) === e.bodyRows) top = by < 0 ? Math.max(0, L.top - L.size) : L.top + L.size < L.n ? L.top + L.size : L.top
    else top = Math.max(0, Math.min(L.top + by, Math.max(end, L.top)))
    L.top = top
    L.topKey = L.ids[top] ?? null
    $.ui.invalidate('ui.render')
    if (focusAt !== null) {
      const w = listWindow(L.n, top, L.area, pin)
      const key = lineKeys(L.items[focusAt], String(focusAt - w.top)).open
      // The ring is on a list row: its key is drawn on the first or last row now (swapKeys).
      if (L.focus && L.keys.has(L.focus)) {
        if (L.focus !== key) swapKeys(key, L.focus)
      } else {
        L.focus = key
        try {
          Promise.resolve($.ui.focus({ requestId: PANE, key })).catch(() => {})
        } catch {}
      }
    }
    return {}
  }).catch(failOpen)

  // ↑ or ↓ past the window's first or last row scrolls the list so the next row comes into view, with
  // the focus on it (spec L289-290, L371); any other move of the ring is the engine's.
  on('ui.focus', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    // Memory (Q-71): the focused row is the one whose Button the ring is on; it stays while the ring is on c, v, u.
    if (pane.tab === 'memory') {
      const el = e.element ?? null
      if (pane.memRowKeys.has(el)) pane.memFocusRow = pane.memRowKeys.get(el)
      else if (!MEM_MARK_KEYS.has(el)) pane.memFocusRow = null
    }
    const L = pane.list
    const step = e.origin && e.origin.kind === 'person' && pane.tab === 'work' && !pane.detail ? edgeStep(L.focus, e.element) : null
    const target = step === 'down' ? L.top + L.size : step === 'up' ? L.top - 1 : -1
    if (target < 0 || target >= L.n) {
      L.focus = e.element ?? null
      return next(e)
    }
    const top = listReveal(L.n, L.top, L.area, target, (i) => L.pins[i])
    L.top = top
    L.topKey = L.ids[top] ?? null
    L.focus = lineKeys(L.items[target], String(target - top)).open
    $.ui.invalidate('ui.render')
    return next({ ...e, element: L.focus })
  }).catch(failOpen)

  // The band above the prompt: the prime's context gauge and rotation count.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    const theirs = await next(e)
    // One line in every session: each plan window, the context against its threshold, the cost;
    // in a run, rotations, the goal and the PR. A second line only when something waits for you.
    const inRun = run.active || run.startedHere
    const v = inRun ? track.view : null
    const goal = v ? { text: (v.goal.issue ? '#' + v.goal.issue.number + ' ' : 'goal ') + v.goal.state + (v.goal.flag ? ' (' + v.goal.flag + ')' : ''), color: v.goal.flag ? 'red' : undefined } : null
    const pr = v && v.pr ? { text: 'PR #' + v.pr.number + ' ' + v.pr.checks.replace('checks ', '') + (v.pr.ready && v.pr.ready.ok ? ' ready to merge' : ''), color: v.pr.ready && v.pr.ready.ok ? 'green' : v.pr.flag ? 'red' : undefined } : null
    const segs = bandSegs({
      limits: usage.limits,
      cost: usage.cost,
      ctx: typeof rotation.lastPercent === 'number' ? rotation.lastPercent : null,
      threshold: inRun ? config.rotateAtPercent : null,
      rotations: inRun ? rotation.count : null,
      goal,
      pr,
    })
    // Not the run's own session, or no longer (T7): the band says why it is not armed.
    if (membership.why) segs.push(...(segs.length ? [{ text: ' · ', color: undefined }] : []), { text: membership.why, color: 'yellow' })
    if (pane.waiting) {
      // A wider terminal places the waiting pane by itself; check the engine's record before saying so.
      try {
        const up = (await $.ui.panes()).find((x) => x.id === PANE)
        if (!up || up.isPlaced) {
          pane.waiting = false
          pane.open = !!up
        }
      } catch {}
      if (pane.waiting) segs.push(...(segs.length ? [{ text: ' · ', color: undefined }] : []), { text: '/baton opens the pane', color: undefined })
    }
    const lineBox = Box({ key: 'band', flexDirection: 'row', children: segs.map((x) => Text({ wrap: 'truncate-end', ...(x.color ? { color: x.color } : { dimColor: true }), children: [x.text] })) })
    const waiting = []
    if (approvals.queue.length) waiting.push(approvals.queue.length + ' phase' + (approvals.queue.length === 1 ? '' : 's') + ' to check (' + approvals.queue.map((q) => q.label).join(', ') + ')')
    // Only questions put to the operator count (spec T13 addendum, Q-50); queued ones are seen in Work.
    const askedN = v ? (v.questions || []).filter((q) => q.asked).length : 0
    if (askedN) waiting.push(askedN + ' question' + (askedN === 1 ? '' : 's'))
    const flag = waiting.length ? [Text({ wrap: 'truncate-end', color: 'yellow', children: ['⚑ waiting for you: ' + waiting.join(' · ') + ' — Work (1)'] })] : []
    // One key: with a phase waiting, typing 1 into an empty prompt approves it; 2 opens the pane to send it back.
    if (approvals.queue.length) {
      const { Button } = $.ui.resolve(e)
      const q0 = approvals.queue[0]
      flag.push(
        Box({
          key: 'keys',
          flexDirection: 'row',
          columnGap: 2,
          children: [
            Button({ key: 'band-approve', label: 'approve ' + q0.label, hotkey: '1', plain: true, onPress: () => resolveQueued($, 0, 'approve') }),
            Button({
              key: 'band-sendback',
              label: 'send back…',
              hotkey: '2',
              plain: true,
              onPress: async () => {
                pane.tab = 'work'
                await $.ui.open({ id: PANE, title: 'baton', focus: true, closeOnEscape: true })
                pane.open = true
                $.ui.invalidate('ui.render')
              },
            }),
          ],
        }),
      )
    }
    if (update.state === 'available' || update.state === 'updating') {
      const { Button } = $.ui.resolve(e)
      flag.push(
        Box({
          key: 'upd',
          flexDirection: 'row',
          columnGap: 2,
          children: [
            Text({ color: 'cyan', children: [update.state === 'updating' ? 'baton: updating to ' + update.remote + '…' : 'baton ' + update.remote + ' is out (you have ' + update.local + ')'] }),
            ...(update.state === 'available' ? [Button({ key: 'band-update', label: 'update now', hotkey: '9', plain: true, onPress: () => applyUpdate($) })] : []),
          ],
        }),
      )
    } else if (update.state === 'installed' && update.message) flag.push(Text({ color: 'green', wrap: 'truncate-end', children: [update.message] }))
    if (pause.on) flag.unshift(Text({ wrap: 'truncate-end', color: 'yellow', children: ['⏸ baton paused since ' + pause.since + ' — ' + pause.held + ' held · /baton resume'] }))
    const dw = doctorWarning()
    if (dw) flag.push(Text({ wrap: 'truncate-end', color: 'red', children: [dw] }))
    return Box({ flexDirection: 'column', children: [lineBox, ...flag, ...(theirs ? [theirs] : [])] })
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
    track.dirty = true
    if (e.agentId) {
      finishAgent(tree, e.agentId, { line: firstLine(e.answer), aborted: e.isAborted })
      // A BLOCKED return's `Blocked by:` line, for its brief (Q-38): the line its final text ends with.
      const ended = tree.nodes.get(e.agentId)
      if (ended) ended.blockedBy = blockedByLine(e.answer)
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
    if (!e.agentId && !e.isAborted && !(await runActive($)) && firstLine(e.answer)) await notNoted($, 'the reply')
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
    // The configured effort (C8E): what this request asks for, the session's setting or the model's default.
    noteEffort(e.agentId, 'effortConfigured', e.effort)
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
    if (pause.on) {
      pause.held++
      return { deny: 'baton is paused by the operator (/baton pause, since ' + pause.since + '). Do not start new work: say what you were about to dispatch and wait for /baton resume.' }
    }
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
      // Lessons: a producer spawned on code that earlier refutations touched gets them in its prompt.
      const role = String(e.subagentType || '').replace(/^.*:/, '')
      if (['worker', 'worker-cheap', 'sub-orchestrator'].includes(role) && e.prompt) {
        const rel = relevantLessons(await loadLessons($), e.prompt)
        if (rel.length) {
          input = { ...input, prompt: e.prompt + lessonBlock(rel) }
          lessons.injected += rel.length
          lessons.spawnsTaught++
        }
      }
      // A reviewer on a PR that conflicts with its base reviews code that will change; resolve first.
      if (String(e.subagentType || '').replace(/^.*:/, '') === 'pr-reviewer' && gh.pr && gh.pr.mergeable === 'CONFLICTING') {
        return { deny: 'baton: PR #' + gh.pr.number + ' conflicts with its base. Dispatch a sub-orchestrator to merge the base into the branch (never rebase) and re-run the checks, then the reviewer.' }
      }
      const model = bindModel(e)
      if (model && e.model !== model) {
        input = { ...input, model }
        if (e.model) $.ui.log('baton: ' + (e.subagentType || 'agent') + ' bound to ' + model + ' (asked for ' + e.model + ')')
      }
    }
    const r = await next(input)
    if (r && r.agentId) {
      probe.spawned.add(r.agentId)
      addSpawn(tree, { id: r.agentId, parent: e.parentAgentId, type: e.subagentType, label: e.name || e.description, description: e.description, model: r.model || input.model, requested: input.model, prompt: input.prompt })
      if (!pane.open) $.clock.after(0, () => autoOpenPane($).catch(() => {}))
      if (!e.parentAgentId) {
        spawnedByPrime.set(r.agentId, { type: e.subagentType, description: e.description, name: e.name })
        live.set(r.agentId, String(e.name || e.description || e.subagentType || 'agent').slice(0, 32))
        $.ui.invalidate('ui.render')
      }
    }
    return r
  }).catch(async ($, e, next) => {
    // The doors fail closed: pause, and during a run a review/fix round whose budget cannot be read
    // as unspent. Lessons, binding and the rest fail open: the spawn goes on as asked.
    if (next.called) return next(e)
    if (pause.on) return { deny: 'baton is paused by the operator (/baton pause). Do not start new work: wait for /baton resume.' }
    let shut = await runActive($)
    try {
      shut = shut && isRoundSpawn(e) && budgetNow().status === 'exceeded'
    } catch {}
    if (shut) return { deny: 'baton: the goal-budget check failed (' + next.error.kind + '), so this review or fix round was refused. Brief the operator before starting another.' }
    return next(e)
  })
}
