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
const config = { rotateAtPercent: 35, wakeBudgetLines: 96, memoryDir: '.baton/memory' }

// The cheap tier: merges are compressed here, never by a subagent.
const CHEAP_MODEL = 'claude-sonnet-5-5'
const FRONTIER_MODEL = 'claude-opus-5-5'

// Subagents the prime spawned directly: agentId -> { type, description, name }.
// Their returns become run-memory notes.
const spawnedByPrime = new Map()

const memory = {
  toolsRegistered: false,
  merging: false, // a merge pass is running
  again: false, // a note arrived during a merge pass
  notes: 0, // notes this module appended
  lastStats: null, // { run, project } from memo stats, for the pane
}

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

function firstLine(text) {
  for (const l of String(text ?? '').split('\n')) {
    const t = l.replace(/^[#>*\-\s`]+/, '').trim()
    if (t) return t
  }
  return ''
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
    try {
      const v = await $.session.version()
      probe.version = v.base ?? v.version
      if (!String(probe.version).startsWith(VERIFIED_AGENTID_VERSION)) {
        probe.notice =
          `baton: the prime guard tells the prime from a subagent by tool.call's agentId, verified on Claude Code ` +
          `${VERIFIED_AGENTID_VERSION}; this is ${probe.version}. The guard fails closed: a call without agentId ` +
          `is treated as the prime's. If subagents report "the prime never runs", agentId has changed — /baton stop.`
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
    return next(e)
  })

  // ---------------------------------------------------------------- the prime guard

  on('tool.call', async ($, e, next) => {
    if (!isPrimeCall(e)) {
      if (!probe.seen.has(e.agentId)) {
        probe.seen.add(e.agentId)
        if (probe.spawned.has(e.agentId) && !probe.verified) probe.verified = true
      }
      return next(e)
    }
    const active = await runActive($)
    const verdict = guardDecision(e, active)
    if (!verdict) return next(e)
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

  // A subagent that finishes without one tool call carrying its id, while
  // prime-classified calls were being refused, is the signature of agentId
  // having gone missing: say so loudly (the guard stays closed).
  on('turn.complete', async ($, e, next) => {
    // A subagent the prime dispatched returned: its one line becomes a note.
    if (e.agentId && spawnedByPrime.has(e.agentId) && !e.isAborted && (await runActive($))) {
      const who = spawnedByPrime.get(e.agentId)
      const line = firstLine(e.answer)
      if (line) {
        const role = String(who.type).replace(/^baton:/, '')
        const tag = role === 'sub-orchestrator' ? 'sub' : role.slice(0, 16)
        try {
          const label = who.name || who.description
          await appendNote($, 'run', (label ? label + ': ' : '') + line, tag)
        } catch (err) {
          $.ui.log('baton: could not note a return: ' + err.message)
        }
      }
    }
    if (e.agentId && probe.spawned.has(e.agentId) && !probe.seen.has(e.agentId) && probe.deniedWhileLive > 0 && !probe.verified) {
      probe.notice =
        'baton: a subagent finished with no tool call carrying its agentId while prime-classified calls were refused — ' +
        'agentId detection may be broken on this build. The guard fails closed; /baton stop to release the session.'
      $.ui.log(probe.notice)
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r && r.agentId) {
      probe.spawned.add(r.agentId)
      if (!e.parentAgentId) spawnedByPrime.set(r.agentId, { type: e.subagentType, description: e.description, name: e.name })
    }
    return r
  })
}
