// claude plugin test — T14 memory marks, part C1 (node T114C, the split-out red step of F114): the project
// memory's marks through `project_mark`.
//
// Written from the spec (docs/designs/v7.6-tuning.md L403-457, the operator answers L458-564), the operator's
// answers (_orch/inbox/Q-73, Q-74, Q-86 .answer.md, quoted in _orch/nodes/T114A/work/t14-answers.md) and the
// planner's display decisions (_orch/plan/decisions/D-T14-project-mark, D-T14-mark-messages, D-T14-tool-names,
// Q-90) BEFORE the implementation exists. Requirement ids are the rows of _orch/plan/traceability.yaml
// (cluster C15). F114 may not edit these tests. The pane's project view is the other file of this node,
// mod/tests/t14-project-view.test.ts.
//
// `project_mark` takes `memory_mark`'s arguments `id`, `mark` (`ok`, `void` or `clear`) and `reason`, plus
// the optional `namespace` (D-T14-project-mark). A mark is written to the store with memo's `mark` command,
// the protocol T114A's tests fix for the run's memory (mod/tests/t14-marks.test.ts header), in the project
// memory's store of that namespace.
//
// Tests named `guard: ...` pin behaviour that already holds at da5910c (OQ7 preservation guards): exempt from
// red, logged as deviations from spec L19-20 and L100, approved by _orch/inbox/OQ7.answer.md ("Each one is
// logged as a deviation from the red-first rule (spec L19-20, L100), with this file as the approval").
// Evidence: _orch/nodes/T114C/work/guard-evidence.md.
import { expect, mock, test } from 'claude-code/testing'

// ------------------------------------------------------------------ fixture paths and ids
//
// Every path is under the fixture root /proj, which is no real directory: no test reads or writes the
// project memory at /Users/clank/Desktop/projects/baton/.baton/memory, nor this run's own _orch/memory
// (spec L599-600 "each uses a project memory it builds"; _orch/inbox/Q-85.answer.md: the run's own bad
// records are the operator's to mark, after T14 ships). The memo CLI is the fixture `fakeMemo` below.
const PROJ = '/proj' // fixture root
const RUN = '/proj/run' // the run's directory, and the session's start directory (fixture)
const RUN_ID = 'build-20261019T125436Z' // fixture run id
const MANIFEST_PATH = RUN + '/_orch/manifest.json'
const RUN_MEMORY = RUN + '/_orch/memory' // the run's memory: memoryArgs 'run' is <cwd>/_orch/memory
const PROJECT_MEMORY = RUN + '/.baton/memory' // the project memory: <session root>/.baton/memory (config memoryDir default)
const LESSONS = PROJECT_MEMORY + '/ns/lessons' // a named namespace (memo --ns NAME is <dir>/ns/NAME)
const RULINGS = PROJECT_MEMORY + '/ns/rulings' // the rulings namespace
const PRIME = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a' // fixture: the manifest's prime session id (T7, L93)
const SUBAGENT = 'a0b1c2d3e4f5a6b7' // fixture: a subagent's agentId
const TS = '2026-10-19T12:00:00Z' // fixture timestamp
const SLOW = { timeoutMs: 30000 }

// ------------------------------------------------------------------ the fixture stores
//
// The project memory's default store: five notes #0-#4, the L1 summaries #0-1 and #2-3 and the L2 summary
// #0-3. Note #1 is held by both summaries over it (token tokP1); note #4 is under no summary, so a recall
// or a wake that shows it shows the note itself. Every text carries a token so a test can tell what is shown.
const PNOTES = [
  { tag: 'prime', text: 'decision: one branch off main per run tokP0' },
  { tag: 'prime', text: 'criterion fixture proved vacuous at the tip tokP1' },
  { tag: 'prime', text: 'route that worked: the split red step tokP2' },
  { tag: 'prime', text: 'the gate matching is unchanged tokP3' },
  { tag: 'prime', text: 'stale fixture route: cut memo input tokP4' },
]
const PSUMS: Record<string, string> = {
  '1:0': 'branch per run; vacuous criterion tokP0 tokP1 tokS1x0', // L1 #0-1, over note #1
  '1:1': 'split red step; gate unchanged tokP2 tokP3 tokS1x1', // L1 #2-3
  '2:0': 'project so far tokP0 tokP1 tokP2 tokP3 tokS2x0', // L2 #0-3, over note #1
}
const LNOTES = [
  { tag: 'prime', text: 'lesson: probe the tip before writing red tokL0' },
  { tag: 'prime', text: 'lesson: stage files by name tokL1' },
]
const RNOTES = [{ tag: 'ruling', text: 'never push without the operator gate tokR0' }] // a standing ruling (lib/rulings.mjs reads tag `ruling`)
const RUNNOTES = [
  { tag: 'prime', text: 'run note: P2 dispatched tokN0' },
  { tag: 'sub', text: 'run note: T114C started tokN1' },
]
const TOKEN_RE = /\b(?:tok[PLRN]\d|tokS\dx\d|gen\d+)\b/g

type Mark = { id: string; mark: string; reason: string; who: string; session?: string; ts: string }
type Store = {
  notes: { text: string; tag: string; ts: string }[]
  sums: Map<string, string>
  marks: Mark[]
  superseded: { level: number; index: number; lo: number; hi: number; text: string; reason: string; ts: string }[]
}
const storeOf = (notes: { tag: string; text: string }[], sums: Record<string, string> = {}, marks: Mark[] = []): Store => ({
  notes: notes.map((n) => ({ ...n, ts: TS })),
  sums: new Map(Object.entries(sums)),
  marks: marks.map((m) => ({ ...m })),
  superseded: [],
})
const rec = (id: string, m: string, who: string, reason: string, session?: string): Mark => ({ id, mark: m, reason, who, ...(session ? { session } : {}), ts: TS })

// ------------------------------------------------------------------ the fixture memo CLI
//
// It answers every command memo takes at da5910c (note, wake, zoom, recall, pending, merge, stats) the way
// the store does today: it never skips, hides, marks or rebuilds anything by itself, so every T14 behaviour
// pinned here is the mod's to produce. It also takes the storage commands T114A's tests add
// (mod/tests/t14-marks.test.ts header, node T114A): `mark <id> ok|void|clear --who operator|prime
// [--session <id>] -` (the reason on stdin) appends one mark record; `marks [<id>]` lists them, oldest
// first; `rebuild <lo>-<hi> --reason <text> -` keeps the old summary text in the superseded log and puts
// the new one in its slot; `superseded` lists that log. One store per --dir, and --ns NAME is <dir>/ns/NAME.

const VALUE_FLAGS = new Set(['dir', 'root', 'ns', 'tag', 'budget', 'limit', 'max', 'memory-dir', 'who', 'session', 'reason', 'level', 'index', 'id', 'mark'])
function parseArgv(argv: string[]) {
  const flags: Record<string, any> = {}
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') {
      rest.push(...argv.slice(i + 1))
      break
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      const k = eq > 0 ? a.slice(2, eq) : a.slice(2)
      if (eq > 0) flags[k] = a.slice(eq + 1)
      else if (VALUE_FLAGS.has(k)) flags[k] = argv[++i]
      else flags[k] = true
    } else rest.push(a)
  }
  return { flags, rest }
}
const span = (k: number) => 2 ** k
function blockOf(lo: number, hi: number) {
  const size = hi - lo + 1
  const k = Math.round(Math.log2(size))
  if (k < 1 || span(k) !== size || lo % size !== 0) return null
  return { level: k, index: lo / size }
}
/** The tiles a view of [lo, hi) shows within budget: whole summaries, the newest opened first. */
function tiling(st: Store, lo: number, hi: number, budget: number) {
  const out: { level: number; index: number; lo: number; hi: number }[] = []
  let i = lo
  while (i < hi) {
    let k = 0
    for (;;) {
      const s = span(k + 1)
      if (i % s === 0 && i + s <= hi && st.sums.has(k + 1 + ':' + i / s)) k++
      else break
    }
    out.push({ level: k, index: i / span(k), lo: i, hi: i + span(k) })
    i += span(k)
  }
  for (;;) {
    let j = -1
    for (let x = out.length - 1; x >= 0; x--) if (out[x].level > 0) { j = x; break }
    if (j < 0 || out.length + 1 > budget) break
    const t = out[j]
    const half = span(t.level - 1)
    out.splice(j, 1, { level: t.level - 1, index: (t.lo / half) | 0, lo: t.lo, hi: t.lo + half }, { level: t.level - 1, index: ((t.lo + half) / half) | 0, lo: t.lo + half, hi: t.hi })
  }
  return out
}
function render(st: Store, tiles: { level: number; lo: number; hi: number }[]) {
  return tiles.map((t) => {
    if (t.level === 0) {
      const r = st.notes[t.lo]
      return `#${t.lo} ${r.ts} [${r.tag}] ${r.text}`
    }
    const s = st.sums.get(t.level + ':' + t.lo / span(t.level))
    return `#${t.lo}-${t.hi - 1} (${t.hi - t.lo} notes) ${s ?? '(not merged yet)'}`
  })
}
function pendingOf(st: Store) {
  const n = st.notes.length
  const out: any[] = []
  for (let k = 1; span(k) <= n; k++) {
    for (let i = 0; (i + 1) * span(k) <= n; i++) {
      if (st.sums.has(k + ':' + i)) continue
      const ready = k === 1 || (st.sums.has(k - 1 + ':' + 2 * i) && st.sums.has(k - 1 + ':' + (2 * i + 1)))
      const texts = k === 1 ? [st.notes[2 * i].text, st.notes[2 * i + 1].text] : [st.sums.get(k - 1 + ':' + 2 * i), st.sums.get(k - 1 + ':' + (2 * i + 1))]
      out.push({ level: k, index: i, lo: i * span(k), hi: (i + 1) * span(k) - 1, ready, texts })
    }
  }
  return out
}
const normId = (s: any) => String(s ?? '').trim().replace(/^#/, '')
const emptyStore = (): Store => storeOf([])

function fakeMemo(stores: Map<string, Store>) {
  return (argv: string[], stdin?: string) => {
    const { flags, rest } = parseArgv(argv.slice(2))
    let dir = String(flags.dir ?? RUN_MEMORY)
    if (flags.ns) dir += '/ns/' + String(flags.ns)
    if (!stores.has(dir)) stores.set(dir, emptyStore())
    const st = stores.get(dir)!
    const cmd = rest.shift()
    const json = !!flags.json
    const ok = (obj: any, text: string) => ({ exitCode: 0, stdout: (json ? JSON.stringify(obj) : text) + '\n', stderr: '' })
    const fail = (code: number, msg: string) => ({ exitCode: code, stdout: '', stderr: 'memo: ' + msg + '\n' })
    const budget = flags.budget ? Number(flags.budget) : 96
    const n = st.notes.length
    switch (cmd) {
      case 'note': {
        let text = rest.join(' ')
        if (text === '-') text = stdin ?? ''
        text = text.trim()
        if (!text) return fail(1, 'empty note')
        st.notes.push({ text, tag: String(flags.tag ?? 'note'), ts: TS })
        const index = st.notes.length - 1
        const merges = pendingOf(st).filter((p) => p.hi === index).map((p) => ({ level: p.level, index: p.index }))
        return ok({ index, text, truncated: false, merges }, `noted #${index}`)
      }
      case 'wake': {
        const tiles = n ? tiling(st, 0, n, budget) : []
        const lines = render(st, tiles)
        const head = `memory ${dir}: ${n} notes, ${st.sums.size} summaries, ${pendingOf(st).length} merges pending` + (n ? `; ${tiles.length} blocks (budget ${budget}), oldest first` : '')
        return ok({ header: head, lines, tiles }, [head, ...lines].join('\n'))
      }
      case 'zoom': {
        if (!n) return ok({ header: 'memory is empty', lines: [], tiles: [] }, 'memory is empty')
        const m = /^(\d+)-(\d+)$/.exec(rest.join('').trim())
        if (!m) return fail(1, 'a range is lo-hi')
        const lo = Math.max(0, Number(m[1]))
        const hi = Math.min(n, Number(m[2]) + 1)
        const tiles = tiling(st, lo, hi, budget)
        const lines = render(st, tiles)
        const head = `notes #${lo}-${hi - 1} of ${n}; ${tiles.length} blocks (budget ${budget})`
        return ok({ header: head, lines, tiles }, [head, ...lines].join('\n'))
      }
      case 'recall': {
        const limit = flags.limit ? Number(flags.limit) : 20
        const src = rest.join(' ')
        let re: RegExp
        try {
          re = new RegExp(src, 'i')
        } catch {
          re = new RegExp(src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        }
        const notes = st.notes.map((r, index) => ({ index, ...r })).filter((r) => re.test(r.text) || re.test(r.tag))
        const blocks: any[] = []
        for (const [key, text] of [...st.sums.entries()].sort()) {
          const [k, i] = key.split(':').map(Number)
          if (re.test(text)) blocks.push({ level: k, index: i, lo: i * span(k), hi: (i + 1) * span(k) - 1, text })
        }
        const r = { pattern: re.source, total: notes.length, notes: notes.slice(-limit), blocks: blocks.slice(-limit) }
        const lines = [
          `recall /${r.pattern}/i: ${r.total} note(s), ${r.blocks.length} summary block(s)`,
          ...r.blocks.map((b: any) => `#${b.lo}-${b.hi} (L${b.level}) ${b.text}`),
          ...r.notes.map((x: any) => `#${x.index} ${x.ts} [${x.tag}] ${x.text}`),
        ]
        return ok(r, lines.join('\n'))
      }
      case 'pending': {
        let p = pendingOf(st)
        if (flags.ready) p = p.filter((x) => x.ready)
        if (!flags.texts) p = p.map(({ texts, ...x }) => x)
        return ok(p, p.length ? p.map((x) => `L${x.level}#${x.index}`).join('\n') : 'no merges pending')
      }
      case 'merge': {
        let done = 0
        for (const l of String(stdin ?? '').split('\n').map((x) => x.trim()).filter(Boolean)) {
          try {
            const j = JSON.parse(l)
            const key = j.level + ':' + j.index
            if (!st.sums.has(key) && pendingOf(st).some((p) => p.level === j.level && p.index === j.index && p.ready)) {
              st.sums.set(key, String(j.summary))
              done++
            }
          } catch {}
        }
        return ok({ merged: done, pending: pendingOf(st).length }, `merged ${done}`)
      }
      case 'stats': {
        const s = { dir, notes: n, summaries: st.sums.size, treeCapacity: Math.max(0, n - 1), levels: n ? Math.floor(Math.log2(n)) : 0, pending: pendingOf(st).length, ready: pendingOf(st).filter((x) => x.ready).length, bytes: n * 320 }
        return ok(s, `${s.notes} notes`)
      }
      case 'mark': {
        const id = normId(flags.id ?? rest[0])
        const mark = String(flags.mark ?? rest[1] ?? '')
        if (!id || !['ok', 'void', 'clear'].includes(mark)) return fail(1, 'mark <id> ok|void|clear')
        let reason = flags.reason !== undefined ? String(flags.reason) : rest.includes('-') || stdin !== undefined ? String(stdin ?? '') : ''
        reason = reason.trim()
        const r: Mark = { id, mark, reason, who: String(flags.who ?? ''), ts: TS }
        if (flags.session !== undefined) r.session = String(flags.session)
        st.marks.push(r)
        return ok(r, `marked #${id} ${mark}`)
      }
      case 'marks': {
        const id = rest[0] !== undefined ? normId(rest[0]) : null
        const list = st.marks.filter((m) => id === null || m.id === id)
        return ok(list, list.map((m) => `#${m.id} ${m.mark} ${m.who} ${m.reason}`).join('\n') || 'no marks')
      }
      case 'rebuild': {
        let b: { level: number; index: number } | null = null
        if (flags.level !== undefined && flags.index !== undefined) b = { level: Number(flags.level), index: Number(flags.index) }
        else {
          const m = /^#?(\d+)-(\d+)$/.exec(String(rest[0] ?? ''))
          if (m) b = blockOf(Number(m[1]), Number(m[2]))
        }
        if (!b) return fail(1, 'rebuild <lo>-<hi>')
        const key = b.level + ':' + b.index
        const old = st.sums.get(key)
        const text = String(stdin ?? '').trim()
        if (old === undefined || !text) return fail(1, 'no summary to rebuild, or no text')
        const lo = b.index * span(b.level)
        const hi = lo + span(b.level) - 1
        st.superseded.push({ level: b.level, index: b.index, lo, hi, text: old, reason: String(flags.reason ?? ''), ts: TS })
        st.sums.set(key, text)
        return ok({ level: b.level, index: b.index, lo, hi, old, text }, `rebuilt #${lo}-${hi}`)
      }
      case 'superseded':
        return ok(st.superseded, st.superseded.map((s) => `#${s.lo}-${s.hi} (L${s.level}) ${s.reason} ${s.text}`).join('\n') || 'none')
      default:
        return fail(2, `unknown command "${cmd}"`)
    }
  }
}

// ------------------------------------------------------------------ the world beneath the mod

type Opts = {
  marks?: Partial<Record<'project' | 'lessons' | 'rulings' | 'run', Mark[]>> // mark records each fixture store starts with
}

function world(on: any, o: Opts = {}) {
  const t0 = Date.parse(TS)
  const clock = mock.clock(on, { now: t0 })
  const iso = (ms: number) => new Date(ms).toISOString()
  const files = new Map<string, string>()
  // T7's manifest (spec L93): this session is the run's prime, heard 10 s ago.
  files.set(MANIFEST_PATH, JSON.stringify({ run_id: RUN_ID, mode: 'BUILD', target: 'docs/designs/v7.6-tuning.md', prime: true, started_at: iso(t0 - 3600000), memory: { run: '_orch/memory' }, prime_session: { id: PRIME, heartbeat_at: iso(t0 - 10000) } }, null, 2) + '\n')
  const abs = (p: string) => {
    const s = String(p)
    if (s === PROJ || s.startsWith(PROJ + '/')) return s
    if (s.startsWith('/')) return s
    return RUN + '/' + s
  }
  const stores = new Map<string, Store>()
  stores.set(PROJECT_MEMORY, storeOf(PNOTES, PSUMS, o.marks?.project))
  stores.set(LESSONS, storeOf(LNOTES, {}, o.marks?.lessons))
  stores.set(RULINGS, storeOf(RNOTES, {}, o.marks?.rulings))
  stores.set(RUN_MEMORY, storeOf(RUNNOTES, {}, o.marks?.run))
  const memo = fakeMemo(stores)
  const calls: { argv: string[]; stdin?: string }[] = []
  const reasons: (string | null)[] = [] // what the next `reason:` dialogs answer: a reason, or null for a dismissed dialog
  const asked: string[] = []
  let gen = 0

  on('fs.read', (_$: any, e: any) => {
    const v = files.get(abs(e.path))
    return v === undefined ? { deny: 'ENOENT: no such file or directory' } : { value: v }
  })
  on('fs.write', (_$: any, e: any) => {
    const p = abs(e.path)
    files.set(p, e.text)
    // A write over a store's log file replaces that store's notes with the lines written (the fixture's
    // model of memo's log.dat, lib/memstore.mjs): nothing in the mod deletes a note this way today.
    for (const [dir, st] of stores) if (p === dir + '/log.dat') st.notes = String(e.text).split('\n').filter(Boolean).map((t) => ({ text: t, tag: 'note', ts: TS }))
    return { value: undefined }
  })
  on('fs.exists', (_$: any, e: any) => {
    const p = abs(e.path)
    return { value: files.has(p) || stores.has(p) || [...files.keys(), ...stores.keys()].some((k) => k.startsWith(p + '/')) }
  })
  on('fs.list', (_$: any, e: any) => {
    // The fixture's directories: every store (and file) under the path, one entry per child.
    const p = abs(e.path).replace(/\/$/, '')
    const kids = new Map<string, 'dir' | 'file'>()
    for (const k of stores.keys()) if (k.startsWith(p + '/')) kids.set(k.slice(p.length + 1).split('/')[0], 'dir')
    for (const k of files.keys()) if (k.startsWith(p + '/')) {
      const rest = k.slice(p.length + 1).split('/')
      kids.set(rest[0], rest.length > 1 ? 'dir' : 'file')
    }
    if (!kids.size) return { deny: 'ENOENT: no such file or directory' }
    return { value: [...kids].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0 })) }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { id: 'baton', isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.focus', () => ({})) // the ring lands where the hooks above left it (UiFocusInput.element)
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return Text({ key: 'engine', children: ['engine ' + JSON.stringify(e.component)] })
  })
  on('session.cwd', () => ({ value: RUN }))
  on('session.root', () => ({ value: RUN }))
  on('session.id', () => ({ value: PRIME }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('session.version', () => ({ value: { version: '2.1.303', base: '2.1.303' } }))
  on('session.usage', () => ({ value: { rateLimits: [] } }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.end', (_$: any, e: any) => ({ sessionId: e.sessionId }))
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  on('classic.SessionStart', () => ({}))
  on('classic.CwdChanged', () => ({}))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } }))
  on('command.register', () => ({ value: undefined }))
  on('command.run', () => ({ text: 'core' }))
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  on('model.fork', () => ({ value: { isAnswered: true, text: 'P3 running', usage: {} } }))
  // The summarizer answers with every fixture token its prompt holds, then a fresh gen<k>: a summary shows
  // what it was built from.
  on('model.complete', (_$: any, e: any) => {
    const seen = [...new Set(String(e.prompt ?? '').match(TOKEN_RE) ?? [])]
    gen++
    return { value: { isAnswered: true, text: ['merged', ...seen, 'gen' + gen].join(' '), usage: {} } }
  })
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv].map(String)
    calls.push({ argv, stdin: e.init?.stdin })
    if (!String(argv[1] ?? '').endsWith('/bin/memo.mjs')) return { value: { exitCode: 0, stdout: '{}', stderr: '' } }
    return { value: memo(argv, e.init?.stdin) }
  })
  // $.ui.ask is a tool.call of AskUserQuestion (mod/tests/approvals.test.ts): the `reason:` dialog answers
  // with the next queued reason, typed as free text, or is dismissed (a deny) when none is queued or it is null.
  on('tool.call', (_$: any, e: any) => {
    if (e.tool !== 'AskUserQuestion') return { result: 'ran' }
    const q = e.questions?.[0] ?? {}
    asked.push(String(q.question ?? ''))
    const a = reasons.shift()
    if (a === undefined || a === null) return { deny: 'dismissed' }
    return { result: { questions: e.questions, answers: { [q.question]: a } } }
  })
  mock.store(on)
  mock.env(on, {})
  mock.session(on)

  async function settle(ms = 1000) {
    await clock.advance(ms)
    await clock.settle()
  }
  /** The engine starting this session (the run's prime) in the run's directory. */
  async function begin($: any) {
    await $.session.start({ cwd: RUN, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: RUN } as any)
    await settle(2000)
  }
  /** Let every background job finish: merges and rebuilds. */
  async function drain() {
    for (let k = 0; k < 8; k++) await settle(2000)
  }
  const store = (dir: string) => stores.get(dir)!
  const marksOf = (dir: string, id: string) => store(dir).marks.filter((m) => m.id === id)
  /** Q-74 "the newest record is the note's current mark", and `clear` returns it to unmarked. */
  const current = (dir: string, id: string) => {
    const last = marksOf(dir, id).at(-1)
    return !last || last.mark === 'clear' ? 'unmarked' : last.mark
  }
  return { clock, settle, begin, drain, store, marksOf, current, calls, reasons, asked, files }
}

// ------------------------------------------------------------------ tool helpers

const call = ($: any, tool: string, input: any = {}) => $.tool.call({ tool: 'mcp__baton__' + tool, ...input } as any) as Promise<any>
const pmark = ($: any, id: string, m: string, reason: string, extra: any = {}) => call($, 'project_mark', { id, mark: m, reason, ...extra })
/** An error result: refused (`deny`, which the model reads as an error result) or errored (`isError`). */
const isErrorResult = (r: any) => r?.deny !== undefined || r?.isError === true
const errorText = (r: any) => String(r?.deny ?? r?.text ?? r?.result ?? '')
const text = (r: any) => String(r?.result ?? r?.text ?? '')
/** Q-90: a marked note is printed `#n ❌` before its text: is note `n` (its token) printed so? */
const shownVoid = (out: string, n: number, token: string) => out.split('\n').some((l) => l.includes('#' + n + ' ❌') && l.includes(token))

// ================================================================== project_mark records a mark

// c1 · R-C15-113, R-C15-114, R-C15-121 · spec L505 "Marks apply to the project memory as they do to the run's
// memory (Q-86). A project note or summary, in any namespace except `rulings`, is marked ✅ or ❌" · L510 "The prime
// marks the project memory with `project_mark`" · Q-86 "marks apply to both the run memory and the project memory."
test('project_mark with mark ok records ✅ on the project note it names', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  await pmark($, '2', 'ok', 'the split red step held in T114A')
  expect(w.marksOf(PROJECT_MEMORY, '2').map((m) => m.mark)).toEqual(['ok']) // ✅ is `ok` (D-T14-tool-names, D-T14-project-mark: memory_mark's arguments); one record (Q-74 "an appended record")
})

// c2 · R-C15-114, R-C15-121, R-C15-122 · spec L505-506 "is marked ✅ or ❌ by the same rules" · D-T14-project-mark
// "`mark` (`ok`, `void` or `clear`)".
test('project_mark with mark void records ❌ on the project note it names', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  await pmark($, '4', 'void', 'the cut was fixed; this route is stale')
  expect(w.marksOf(PROJECT_MEMORY, '4').map((m) => m.mark)).toEqual(['void']) // ❌ is `void` (D-T14-tool-names, D-T14-project-mark)
})

// c3 · R-C15-114, R-C15-122 · spec L505-506 "A project note or summary, in any namespace except `rulings`, is
// marked" · L510-511 "`project_mark`, which takes `memory_mark`'s arguments and `namespace`."
test('project_mark with a namespace other than rulings marks the note in that namespace', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  await pmark($, '0', 'void', 'superseded by a later lesson', { namespace: 'lessons' })
  expect(w.marksOf(LESSONS, '0').map((m) => m.mark)).toEqual(['void']) // L511: the `lessons` namespace's note #0 (fixture LNOTES[0]) carries it
  expect(w.marksOf(PROJECT_MEMORY, '0')).toEqual([]) // L506 "in any namespace": the default store's #0 (fixture PNOTES[0]) is another note, unmarked
})

// ================================================================== a ❌ project note: log, wake, recall, summaries

// c4 · R-C15-115, R-C15-13 · spec L420 "Nothing is deleted." · L506 "by the same rules of reason, who, history and
// rebuild" · Q-86 "marks apply to both the run memory and the project memory."
// guard per _orch/inbox/OQ7.answer.md (deviation from spec L19-20, L100): at da5910c project_mark marks nothing and
// nothing deletes a note, so this holds there (work/probe-da5910c.md P-C4); it pins that a ❌ keeps holding it.
test('guard: after a project note is marked ❌ the project memory log still holds that note', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  await pmark($, '4', 'void', 'the cut was fixed; this route is stale')
  await w.drain()
  expect(w.store(PROJECT_MEMORY).notes.map((n) => n.text)).toEqual(PNOTES.map((n) => n.text)) // L420 "Nothing is deleted": every fixture note #0-#4, #4's text unchanged
})

// c5 · R-C15-116 · spec L507 "`project_wake` and the project summaries skip a ❌ note," · Q-86.
test('after a project note is marked ❌ project_wake\'s output does not show it', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  await pmark($, '4', 'void', 'the cut was fixed; this route is stale')
  await w.drain()
  const out = text(await call($, 'project_wake'))
  expect(out).not.toContain('tokP4') // L507: the ❌ note #4 (fixture PNOTES[4], token tokP4; under no summary) is skipped
})

// c6 · R-C15-117 · spec L507-508 "and `project_recall` skips it unless it is called with `include_void: true`." · Q-86.
// The pattern matches note #4's words, not its token, so the recall's own header line cannot hold the token.
test('after a project note is marked ❌ project_recall without include_void does not return it', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  await pmark($, '4', 'void', 'the cut was fixed; this route is stale')
  await w.drain()
  const out = text(await call($, 'project_recall', { pattern: 'stale fixture route' }))
  expect(out).not.toContain('tokP4') // L507-508: the ❌ note #4 (fixture PNOTES[4]) is not returned
})

// c7 · R-C15-118 · spec L508 "unless it is called with `include_void: true`." · Q-90 (plan/decisions/Q-90.md):
// "`memory_recall` with `include_void` ... print a marked note as `#n ✅`/`#n ❌` before its text" (D-T14-project-mark:
// "`project_recall` takes `include_void` ... as `memory_recall` does").
test('after a project note is marked ❌ project_recall with include_void true returns it', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  await pmark($, '4', 'void', 'the cut was fixed; this route is stale')
  await w.drain()
  const out = text(await call($, 'project_recall', { pattern: 'stale fixture route', include_void: true }))
  expect(shownVoid(out, 4, 'tokP4')).toBe(true) // L508: returned, printed `#4 ❌` before its text (Q-90); note #4 is fixture PNOTES[4]
})

// c8 · R-C15-115, R-C15-116 · spec L506-507 "by the same rules of reason, who, history and rebuild. `project_wake` and
// the project summaries skip a ❌ note" · L423 "A summary built from a ❌ note is rebuilt without it."
test('after a project note is marked ❌ and its rebuilds are done, the project summaries over it no longer hold its text', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  await pmark($, '1', 'void', 'the criterion was fixed; not vacuous now')
  await w.drain()
  const sums = w.store(PROJECT_MEMORY).sums
  expect(sums.get('1:0')).not.toContain('tokP1') // L423, L506: the L1 summary #0-1 (fixture PSUMS '1:0') is rebuilt without note #1's text (token tokP1)
  expect(sums.get('2:0')).not.toContain('tokP1') // the L2 summary #0-3 above it too (fixture PSUMS '2:0')
})

// ================================================================== clear, who, refusals

// c9 · R-C15-115, R-C15-77 · Q-74 "`clear` (key and tool value) returns it to unmarked." · Q-86 "marks apply to both"
// · spec L478-479 "`clear`, as a key and as a `memory_mark` value, returns the note to unmarked."
test('project_mark with mark clear returns a marked project note to unmarked', SLOW, async ($, on) => {
  const w = world(on, { marks: { project: [rec('2', 'ok', 'prime', 'checked by the prime', PRIME)] } }) // fixture: #2 marked ✅ by the prime
  await w.begin($)
  await pmark($, '2', 'clear', 'checked against the wrong run')
  expect(w.current(PROJECT_MEMORY, '2')).toBe('unmarked') // Q-74: `clear` returns it to unmarked (the newest record is the current mark)
})

// c10 · R-C15-115, R-C15-71, R-C15-73 · Q-73 "A call carrying an `agentId` (any subagent) ... is refused with an error
// and makes no mark." · Q-86: by the same rules of who · D-T14-mark-messages "A `memory_mark` or `project_mark` call
// that carries an `agentId`".
test('a project_mark call carrying an agentId returns an error result', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  const r = await pmark($, '4', 'void', 'a worker thinks it is stale', { agentId: SUBAGENT })
  expect(isErrorResult(r)).toBe(true) // Q-73 "refused with an error"
})

// c11 · R-C15-119, R-C15-123, R-C15-124 · spec L511 "With `namespace: rulings` it is refused with an error and makes no
// mark." · D-T14-mark-messages "`project_mark` with `namespace: rulings` (Q-86): the error result reads `refused:
// rulings are retracted, not marked`."
test('project_mark with namespace rulings returns the error result refused: rulings are retracted, not marked', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  const r = await pmark($, '0', 'void', 'this ruling is old', { namespace: 'rulings' })
  expect(isErrorResult(r)).toBe(true) // L511 "refused with an error"
  expect(errorText(r)).toContain('refused: rulings are retracted, not marked') // D-T14-mark-messages, verbatim
})

// c12 · R-C15-126, R-C15-204, R-C15-66 · Q-73 "a `memory_mark` call from the run's prime session records `prime`" · spec
// L512-513 "whose mark records `prime` (Q-73)" · T01 verdict r7 criterion 40.
test('a project_mark call from the run\'s prime session records prime as who marked the project note', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  await pmark($, '2', 'ok', 'the split red step held in T114A')
  expect(w.marksOf(PROJECT_MEMORY, '2').map((m) => m.who)).toEqual(['prime']) // Q-73: `prime`
})

// ================================================================== rulings keep their own retract

// c43 · R-C15-119, R-C15-120 · spec L508-509 "Rulings are not marked: they keep their own retract." · Q-86 "Rulings are
// excluded, since they already have retract." · register.js:1684-1708 at da5910c: memory_wake leads with the rulings.
// guard per _orch/inbox/OQ7.answer.md (deviation from spec L19-20, L100): holds at da5910c (work/probe-da5910c.md P-C43).
test('guard: memory_wake prints a ruling also after a project_mark call naming it', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  await pmark($, '0', 'void', 'this ruling is old', { namespace: 'rulings' })
  await w.drain()
  const out = text(await call($, 'memory_wake'))
  expect(out).toContain(RNOTES[0].text) // L508-509: the ruling #0 (fixture RNOTES[0]) is not marked, so memory_wake still prints it
})
