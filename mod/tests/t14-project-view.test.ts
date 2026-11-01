// claude plugin test — T14 memory marks, part C2 (node T114C, the split-out red step of F114): the memory
// explorer's project view, the operator's answer to Q-92.
//
// Written from the spec (docs/designs/v7.6-tuning.md L574-609, the operator's answer to Q-92, which supersedes
// L512-514; with L403-457 and the answers L458-564), the operator's answers (_orch/inbox/Q-92.answer.md: "the
// memory explorer gets a run/project toggle with the same table, drill-down and ✅/❌ keys, so the operator can
// view and mark project notes themselves. Rulings stay excluded from marks (Q-86)."; Q-71, Q-72, Q-73, Q-74, Q-86)
// and the planner's display decisions (_orch/plan/decisions/D-T14-project-toggle, D-T14-project-view,
// D-T14-filter-keys, D-T14-mark-letters, D-T14-mark-messages, D-T14-mark-glyphs, D-T14-mark-column, Q-90) BEFORE the
// implementation exists. Requirement ids are the rows of _orch/plan/traceability.yaml (cluster C15). F114 may not
// edit these tests. The prime's `project_mark` is the other file of this node, mod/tests/t14-project-mark.test.ts.
//
// Driving the explorer (T12's table, C12, T112's mod/tests/t12-memtable.test.ts): the pane is opened with /baton,
// mounted on the terminal and switched to the Memory view with its `2` tab. A key is pressed by pressing the
// Button that carries it as `hotkey` (the engine takes one digit or one lowercase letter as a hotkey, E1 §k), and
// focus-and-Enter on a drawn key is raising `ui.focus` on its Button and pressing it. A row is focused by raising
// `ui.focus` on the first Button its row draws (Q-71 "a mark key acts on the focused row"), and Enter on it is
// pressing that Button. The `reason:` dialog (Q-72, `$.ui.ask`) is the AskUserQuestion tool call beneath the mod,
// answered with free text or dismissed. A pane reload is closing the drawing and opening it again (/baton, a new
// drawing), as T115's tests do. Assertions read the cells this cluster owns (the store shown, the `s` key, the
// `[<namespace>]` prefix, the mark cell, the hint line), never a whole row string (hazard H28).
//
// Tests named `guard: ...` pin behaviour that already holds at da5910c (OQ7 preservation guards): exempt from
// red, logged as deviations from spec L19-20 and L100, approved by _orch/inbox/OQ7.answer.md ("Each one is
// logged as a deviation from the red-first rule (spec L19-20, L100), with this file as the approval").
// Evidence: _orch/nodes/T114C/work/guard-evidence.md; each also fails on a mutant that breaks its property
// (_orch/nodes/T114C/work/mutants.txt).
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
    if (a!.startsWith('--')) {
      const eq = a!.indexOf('=')
      const k = eq > 0 ? a!.slice(2, eq) : a!.slice(2)
      if (eq > 0) flags[k] = a!.slice(eq + 1)
      else if (VALUE_FLAGS.has(k)) flags[k] = argv[++i]
      else flags[k] = true
    } else rest.push(a!)
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
    for (let x = out.length - 1; x >= 0; x--) if (out[x]!.level > 0) { j = x; break }
    if (j < 0 || out.length + 1 > budget) break
    const t = out[j]
    const half = span(t!.level - 1)
    out.splice(j, 1, { level: t!.level - 1, index: (t!.lo / half) | 0, lo: t!.lo, hi: t!.lo + half }, { level: t!.level - 1, index: ((t!.lo + half) / half) | 0, lo: t!.lo + half, hi: t!.hi })
  }
  return out
}
function render(st: Store, tiles: { level: number; lo: number; hi: number }[]) {
  return tiles.map((t) => {
    if (t.level === 0) {
      const r = st.notes[t.lo]
      return `#${t.lo} ${r!.ts} [${r!.tag}] ${r!.text}`
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
      const texts = k === 1 ? [st.notes[2 * i]!.text, st.notes[2 * i + 1]!.text] : [st.sums.get(k - 1 + ':' + 2 * i), st.sums.get(k - 1 + ':' + (2 * i + 1))]
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
          if (re.test(text)) blocks.push({ level: k, index: i, lo: i! * span(k!), hi: (i! + 1) * span(k!) - 1, text })
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
    for (const k of stores.keys()) if (k.startsWith(p + '/')) kids.set(k.slice(p.length + 1).split('/')[0]!, 'dir')
    for (const k of files.keys()) if (k.startsWith(p + '/')) {
      const rest = k.slice(p.length + 1).split('/')
      kids.set(rest[0]!, rest.length > 1 ? 'dir' : 'file')
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

// ------------------------------------------------------------------ the pane

const PANE_PROPS = { title: 'baton', isFocused: true, bodyColumns: 160, placement: 'dock', scroll: { bodyRows: 400 } }

/** Open the pane (/baton), mount it and show the Memory view (its `2` tab, E1 §k). */
async function openMemory($: any, w: ReturnType<typeof world>) {
  await $.command.run({ command: 'baton', args: '' } as any)
  await w.settle(1000)
  const ui: any = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: PANE_PROPS as any })
  await ui.press({ key: 'tab-memory' })
  await w.settle(1000)
  return ui
}
/** The session starts, then the Memory view. */
async function memoryView($: any, w: ReturnType<typeof world>) {
  await w.begin($)
  return openMemory($, w)
}
/** A pane reload: the drawing is closed, and the pane is opened again (T115's reload, spec L572). */
async function reload($: any, w: ReturnType<typeof world>, ui: any) {
  await ui.unmount()
  await w.settle(1000)
  return openMemory($, w)
}

// ------------------------------------------------------------------ reading the drawn tree (T112's model)

const kids = (n: any): any[] => (n && typeof n === 'object' ? (Array.isArray(n) ? n : n.children || []) : [])
const num = (v: any) => (typeof v === 'number' ? v : v === undefined || v === null ? 0 : 1)
const width = (s: string) => Array.from(s).length
/** How the terminal lays an element out as cells (T112's model: row Boxes side by side with their gap, a plain
 * Button as `hotkey: label`, any other Button as `[ label ]`). */
function cells(n: any): string {
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  if (!n || typeof n !== 'object') return ''
  if (Array.isArray(n)) return n.map(cells).join('')
  const p = n.props || {}
  if (n.type === 'Button') {
    const inner = kids(n).length ? kids(n).map(cells).join('') : String(p.label ?? '')
    return p.plain ? (p.hotkey ? p.hotkey + ': ' : '') + inner : '[ ' + inner + ' ]'
  }
  if (n.type === 'Box') {
    const parts = kids(n).map((c: any) => {
      const t = cells(c)
      const wd = c && c.props ? (typeof c.props.width === 'number' ? c.props.width : typeof c.props.minWidth === 'number' ? c.props.minWidth : 0) : 0
      return wd && width(t) < wd && !t.includes('\n') ? t + ' '.repeat(wd - width(t)) : t
    })
    const dir = p.flexDirection ?? 'row'
    return dir.startsWith('column') ? parts.join('\n') : parts.join(' '.repeat(num(p.columnGap ?? p.gap)))
  }
  if (n.type === 'Input' || n.type === 'Select') return ''
  return kids(n).map(cells).join('')
}
function all(tree: any): any[] {
  const out: any[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(walk)
    out.push(n)
    kids(n).forEach(walk)
  }
  walk(tree)
  return out
}
const labelOf = (b: any) => String(b.props?.label ?? cells(kids(b)) ?? '')
const keyOf = (b: any) => String(b.key ?? b.props?.key ?? '')
/** The smallest drawn one-line row (a row Box, or a lone Text or Button) holding `token`. */
function rowsWith(tree: any, token: string) {
  const found: any[] = []
  for (const el of all(tree)) {
    if (el.type === 'Box' && String(el.props?.flexDirection ?? 'row').startsWith('column')) continue
    if (el.type === 'Input' || el.type === 'Select') continue
    const t = cells(el)
    if (t.includes(token) && !t.includes('\n')) found.push(el)
  }
  // keep the outermost one-line element of each line: a row, not a cell inside it
  return found.filter((el) => !found.some((o) => o !== el && all(o).includes(el)))
}
/** A ruling row of the Memory view's rulings part: it draws the `x` retract button (register.js rulingsBody). */
const isRulingRow = (el: any) => all(el).some((b) => b.type === 'Button' && labelOf(b).trim() === 'x')
/** The explorer table's row holding `token`: a row that is not a ruling row (D-T14-project-view: "The ruling rows
 * stay where the Memory view draws them today, with their `x` retract button"). */
async function tableRow(ui: any, token: string) {
  return rowsWith(await ui.drawn(), token).find((el) => !isRulingRow(el))
}
async function rulingRow(ui: any, token: string) {
  return rowsWith(await ui.drawn(), token).find((el) => isRulingRow(el))
}
const lineOf = (el: any) => (el ? cells(el) : '')
/** The Button that carries hotkey `k`, as drawn. */
async function hotkeyButton(ui: any, k: string) {
  return all(await ui.drawn()).find((b) => b.type === 'Button' && b.props?.hotkey === k)
}
/** Press key `k`: the Button drawn with that hotkey (E1 §k). False when no Button carries it. */
async function pressKey(ui: any, w: ReturnType<typeof world>, k: string) {
  const b = await hotkeyButton(ui, k)
  if (!b) return false
  await ui.press({ key: keyOf(b) })
  await w.settle(1000)
  return true
}
/** Raise `ui.focus` on an element of the pane, as the person's arrows or Tab do. */
async function focus($: any, w: ReturnType<typeof world>, key: string) {
  await $.ui.focus({ component: 'Pane', requestId: 'baton', plugin: 'baton', element: key, origin: { kind: 'person' } } as any)
  await w.settle(100)
}
/** Focus the row holding `token` (the first Button it draws, Q-71). Its key, or null when it draws none. */
async function focusRow($: any, ui: any, w: ReturnType<typeof world>, token: string, ruling = false) {
  const row = ruling ? await rulingRow(ui, token) : await tableRow(ui, token)
  const b = row && all(row).find((x) => x.type === 'Button')
  if (!b) return null
  await focus($, w, keyOf(b))
  return keyOf(b)
}
/** Enter on the focused element: its Button pressed (the engine raises `ui.press` for Enter under the focus). */
async function enter(ui: any, w: ReturnType<typeof world>, key: string | null) {
  if (!key) return
  await ui.press({ key })
  await w.settle(1000)
}
/** A mark key (`c`, `v` or `u`, D-T14-mark-letters) with the `reason:` dialog answered `reason`, or dismissed (null). */
async function markKey(ui: any, w: ReturnType<typeof world>, k: string, reason: string | null) {
  w.reasons.push(reason)
  const pressed = await pressKey(ui, w, k)
  await w.drain()
  return pressed
}
/** Show the project memory: the `s` key (D-T14-project-toggle). */
const toggle = (ui: any, w: ReturnType<typeof world>) => pressKey(ui, w, 's')

const has = async (ui: any, token: string) => !!(await tableRow(ui, token))
const OPERATOR_VOID = rec('4', 'void', 'operator', 'the cut was fixed; this route is stale') // fixture: the record a pane ❌ on project note #4 leaves (Q-73 `operator`)

// ================================================================== the toggle (`s`)

// c14 · R-C15-183, R-C15-184, R-C15-190 · Q-92 answer "the memory explorer gets a run/project toggle" · spec L581-582
// "The memory explorer has a toggle between the run's memory and the project memory (Q-92). The key `s` switches it"
// · D-T14-project-toggle "`s` switches the explorer between the run's memory and the project memory".
test('with the run\'s memory shown, s makes the explorer\'s table list a project note\'s row', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await memoryView($, w)
  await toggle(ui, w)
  expect(await has(ui, 'tokP0')).toBe(true) // L586 "the explorer's table lists the project memory's notes": project note #0 (fixture PNOTES[0], token tokP0)
})

// c15 · R-C15-183, R-C15-190 · Q-92 answer "a run/project toggle" · spec L586-587 "With the project memory shown, the
// explorer's table lists the project memory's notes and summaries".
test('with the project memory shown, the explorer\'s table lists no row of a run note', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await memoryView($, w)
  await toggle(ui, w)
  expect(await has(ui, 'tokN0')).toBe(false) // L586: the table is the project memory's; the run note #0 (fixture RUNNOTES[0], token tokN0) is not in it
})

// c16 · R-C15-183, R-C15-184 · Q-92 answer "a run/project toggle" · spec L581-582 "a toggle between the run's memory and
// the project memory (Q-92). The key `s` switches it".
// guard per _orch/inbox/OQ7.answer.md (deviation from spec L19-20, L100): at da5910c `s` does nothing and the table is
// always the run's, so this holds there (work/probe-da5910c.md P-C16); it pins that `s` switches back.
test('guard: with the project memory shown, s makes the explorer\'s table list the run note\'s row again', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await memoryView($, w)
  await toggle(ui, w) // the project memory
  expect(await has(ui, 'tokP0'), 'the first s did not show the project memory').toBe(true) // fixture: P3-d3, the project memory is shown (fixture PNOTES[0])
  await toggle(ui, w) // the run's memory again
  expect(await has(ui, 'tokN0')).toBe(true) // L581 "a toggle between": the run note #0 (fixture RUNNOTES[0]) is listed again
  expect(await has(ui, 'tokP0')).toBe(false) // and the run's memory, not the project memory, is shown (fixture PNOTES[0])
})

// c17 · R-C15-189 · spec L584-585 "The Memory view opens on the run's memory" · D-T14-project-toggle "The Memory view
// opens on the run's memory every time it is opened, after a pane reload too" · Q-92 answer "a run/project toggle".
// guard per _orch/inbox/OQ7.answer.md (deviation from spec L19-20, L100): at da5910c the view shows only the run's
// memory, so this holds there (work/probe-da5910c.md P-C17); it pins that the toggle does not survive a reload.
test('guard: after the pane is reloaded while the project memory was shown, the Memory view shows the run\'s memory', SLOW, async ($, on) => {
  const w = world(on)
  let ui = await memoryView($, w)
  await toggle(ui, w) // the project memory
  expect(await has(ui, 'tokP0'), 's did not show the project memory before the reload').toBe(true) // fixture: P3-d3, the project memory is shown (fixture PNOTES[0])
  ui = await reload($, w, ui)
  expect(await has(ui, 'tokN0')).toBe(true) // D-T14-project-toggle: opens on the run's memory; the run note #0 (fixture RUNNOTES[0])
  expect(await has(ui, 'tokP0')).toBe(false) // and not the project memory (fixture PNOTES[0])
})

// c18 · R-C15-186, R-C15-187 · Q-92 answer "a run/project toggle" · spec L582-584 "The key line draws it the way `1`, `2`
// and `r` are drawn: `s: project memory` while the run's memory is shown" · D-T14-project-toggle "drawn on the Memory
// view's key line, highlighted the way `1`, `2` and `r` are".
test('while the run\'s memory is shown, the key line draws s: project memory the way 1, 2 and r are drawn', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await memoryView($, w)
  const s = await hotkeyButton(ui, 's')
  const two = await hotkeyButton(ui, '2')
  expect(cells(s)).toBe('s: project memory') // L583, verbatim: the hotkey, a colon, the label (a plain Button, as `2: Memory` is drawn, E1 §k)
  expect(s?.props?.plain).toBe(two?.props?.plain) // "the way `1`, `2` and `r` are drawn" (L582): plain, as the `2` tab is
})

// c19 · R-C15-188 · Q-92 answer "a run/project toggle" · spec L584 "and `s: run memory` while the project memory is shown."
test('while the project memory is shown, the key line draws s: run memory', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await memoryView($, w)
  await toggle(ui, w)
  expect(cells(await hotkeyButton(ui, 's'))).toBe('s: run memory') // L584, verbatim
})

// c20 · R-C15-185 · Q-92 answer "a run/project toggle" · spec L582 "and focus-and-Enter on its drawn key does the same."
test('focus and Enter on the s button switches the shown store, as s does', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await memoryView($, w)
  const s = await hotkeyButton(ui, 's')
  if (s) {
    await focus($, w, keyOf(s))
    await enter(ui, w, keyOf(s))
  }
  expect(await has(ui, 'tokP0')).toBe(true) // L582 "does the same": the project memory is shown (fixture PNOTES[0])
})

// ================================================================== what the project view lists

// c21 · R-C15-190, R-C15-193 · Q-92 answer "the same table" · spec L587-588 "A row from a named namespace starts with
// `[<namespace>]`" · D-T14-project-view "(for example `[lessons]`)".
test('with the project memory shown, a lessons note is listed with its text starting [lessons]', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await memoryView($, w)
  await toggle(ui, w)
  const line = lineOf(await tableRow(ui, 'tokL0'))
  expect(line).toMatch(/\[lessons\] +lesson: probe the tip/) // D-T14-project-view: the text cell starts `[lessons]`; the note is fixture LNOTES[0]
})

// c22 · R-C15-191 · Q-92 answer "Rulings stay excluded from marks (Q-86)" · spec L587 "of every namespace except
// `rulings`" · D-T14-project-view "except `rulings` ... The ruling rows stay where the Memory view draws them today".
// guard per _orch/inbox/OQ7.answer.md (deviation from spec L19-20, L100): at da5910c the table never lists a project
// note, so this holds there (work/probe-da5910c.md P-C22); it pins that the project view leaves the rulings out.
test('guard: with the project memory shown, the explorer\'s table holds no row of a rulings note', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await memoryView($, w)
  await toggle(ui, w)
  expect(await has(ui, 'tokP0'), 's did not show the project memory').toBe(true) // fixture: P3-d3, the project memory is shown (fixture PNOTES[0])
  expect(!!(await rulingRow(ui, 'tokR0')), 'fixture: the ruling is drawn in the rulings part, with its x').toBe(true) // D-T14-project-view: the ruling rows stay (fixture RNOTES[0])
  expect(await has(ui, 'tokR0')).toBe(false) // L587 "except `rulings`": no table row of the ruling #0 (fixture RNOTES[0])
  expect(cells(await ui.drawn())).not.toContain('[rulings]') // D-T14-project-view: no row prefixed `[rulings]`
})

// c23 · R-C15-192 · Q-92 answer "the same table" · spec L587 "with the same mark column." · D-T14-mark-glyphs "a void one
// draws `❌`" · D-T14-mark-column "sits directly after the `id` column".
test('with the project memory shown, a project note marked ❌ draws ❌ in its mark cell', SLOW, async ($, on) => {
  const w = world(on, { marks: { project: [OPERATOR_VOID] } }) // fixture: project note #4 is ❌
  const ui = await memoryView($, w)
  await toggle(ui, w)
  expect(lineOf(await tableRow(ui, 'tokP4'))).toMatch(/#4(?![0-9-]) +❌/) // D-T14-mark-glyphs `❌`, in the mark cell after the id `#4` (D-T14-mark-column)
})

// c24 · R-C15-218 · Q-92 answer "the same table" · spec L589 "The filters `3` and `4` act on the store that is shown." ·
// D-T14-filter-keys "`4` shows void only".
test('with the project memory shown and the 4 filter on, the table lists a ❌ project note and no unmarked one', SLOW, async ($, on) => {
  const w = world(on, { marks: { project: [OPERATOR_VOID, rec('2', 'ok', 'operator', 'held in T114A')] } }) // fixture: #4 ❌, #2 ✅, #0 unmarked
  const ui = await memoryView($, w)
  await toggle(ui, w)
  await pressKey(ui, w, '4')
  expect(await has(ui, 'tokP4')).toBe(true) // L589, D-T14-filter-keys: void only lists the ❌ project note #4 (fixture)
  expect(await has(ui, 'tokP0')).toBe(false) // and not the unmarked project note #0 (fixture)
})

// c25 · R-C15-194 · Q-92 answer "the same table" · spec L589 "The filters `3` ... act on the store that is shown." ·
// D-T14-filter-keys "`3` shows confirmed only".
test('with the project memory shown and the 3 filter on, the table lists a ✅ project note and no unmarked one', SLOW, async ($, on) => {
  const w = world(on, { marks: { project: [OPERATOR_VOID, rec('2', 'ok', 'operator', 'held in T114A')] } }) // fixture: #4 ❌, #2 ✅, #0 unmarked
  const ui = await memoryView($, w)
  await toggle(ui, w)
  await pressKey(ui, w, '3')
  expect(await has(ui, 'tokP2')).toBe(true) // L589, D-T14-filter-keys: confirmed only lists the ✅ project note #2 (fixture)
  expect(await has(ui, 'tokP0')).toBe(false) // and not the unmarked project note #0 (fixture)
})

// ================================================================== drill-down

// c26 · R-C15-195 · Q-92 answer "the same table, drill-down" · spec L590 "Enter on a project row opens its view, as on a
// run row".
test('with the project memory shown, Enter on a focused project note row opens that note\'s view, showing its text', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await memoryView($, w)
  await toggle(ui, w)
  await enter(ui, w, await focusRow($, ui, w, 'tokP4'))
  const shown = cells(await ui.drawn())
  expect(shown).toContain(PNOTES[4]!.text) // L590: the view of project note #4 shows its text (fixture PNOTES[4])
  expect(shown).not.toContain('tokP0') // a view of that note, not the table: project note #0 (fixture) is not drawn
})

// c27 · R-C15-196 · Q-92 answer "drill-down" · spec L590 "and `b` returns to the project table." · D-T14-project-toggle
// "Opening a row's view and going back with `b` keeps the store that was shown."
test('from a project note\'s view, b returns to the table with the project memory shown', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await memoryView($, w)
  await toggle(ui, w)
  await enter(ui, w, await focusRow($, ui, w, 'tokP4'))
  await pressKey(ui, w, 'b')
  expect(await has(ui, 'tokP0')).toBe(true) // L590 "returns to the project table": project note #0 (fixture) is listed
  expect(await has(ui, 'tokN0')).toBe(false) // the project memory, not the run's (fixture RUNNOTES[0])
})

// ================================================================== marks from the project view

// c28 · R-C15-197, R-C15-219, R-C15-198, R-C15-199, R-C15-201 · Q-92 answer "✅/❌ keys, so the operator can view and mark
// project notes themselves" · spec L591-593 "`c`, `v` and `u` mark a project note or summary ... on the focused row ...
// with the required `reason:` dialog ... The mark is written to the project memory" · Q-90 `#n ❌`.
test('with a project note row focused, v and a reason mark it ❌, so project_recall with include_void returns it as ❌', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await memoryView($, w)
  await toggle(ui, w)
  await focusRow($, ui, w, 'tokP4')
  await markKey(ui, w, 'v', 'the cut was fixed; this route is stale')
  const out = text(await call($, 'project_recall', { pattern: 'stale fixture route', include_void: true }))
  expect(shownVoid(out, 4, 'tokP4')).toBe(true) // L593 written to the project memory; returned as `#4 ❌` (Q-90); note #4 is fixture PNOTES[4]
})

// c29 · R-C15-116 · Q-92 answer "mark project notes themselves" · spec L605-607 "that `v` on a project note row marks it
// ❌, records `operator`, and `project_wake` then skips it".
test('after that pane mark, project_wake\'s output does not show the note', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await memoryView($, w)
  await toggle(ui, w)
  await focusRow($, ui, w, 'tokP4')
  await markKey(ui, w, 'v', 'the cut was fixed; this route is stale')
  expect(text(await call($, 'project_wake'))).not.toContain('tokP4') // L606-607 "`project_wake` then skips it": note #4 (fixture PNOTES[4])
})

// c30 · R-C15-203 · Q-92 answer "so the operator can view and mark project notes themselves" · spec L594 "A mark from the
// pane on a project note records `operator`." · Q-73 "a mark from the pane records `operator`".
test('a mark made from the project view records operator as who marked the project note', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await memoryView($, w)
  await toggle(ui, w)
  await focusRow($, ui, w, 'tokP4')
  await markKey(ui, w, 'v', 'the cut was fixed; this route is stale')
  expect(w.marksOf(PROJECT_MEMORY, '4').map((m) => m.who)).toEqual(['operator']) // L594, Q-73: `operator`
})

// c31 · R-C15-197, R-C15-198 · Q-92 answer "✅/❌ keys" · spec L591 "`c`, `v` and `u` mark a project note" ·
// D-T14-mark-letters "`c` marks ✅ (confirm)".
test('with a project note row focused, c and a reason mark it ✅', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await memoryView($, w)
  await toggle(ui, w)
  await focusRow($, ui, w, 'tokP2')
  await markKey(ui, w, 'c', 'held again in T114C')
  expect(w.current(PROJECT_MEMORY, '2')).toBe('ok') // D-T14-mark-letters `c` ✅, stored as `ok` (D-T14-tool-names); note #2 is fixture PNOTES[2]
})

// c32 · R-C15-220, R-C15-198 · Q-92 answer "✅/❌ keys" · spec L591 "`u` mark a project note or summary by the rules of
// L463-486" · Q-74 "`clear` (key and tool value) returns it to unmarked" · D-T14-mark-letters "`u` clears the mark".
test('with a project note marked ❌ and its row focused, u returns it to unmarked', SLOW, async ($, on) => {
  const w = world(on, { marks: { project: [OPERATOR_VOID] } }) // fixture: project note #4 is ❌
  const ui = await memoryView($, w)
  await toggle(ui, w)
  await focusRow($, ui, w, 'tokP4')
  await markKey(ui, w, 'u', 'the route is in use again')
  expect(w.current(PROJECT_MEMORY, '4')).toBe('unmarked') // Q-74: `clear` returns it to unmarked
})

// c33 · R-C15-221 · Q-92 answer "drill-down and ✅/❌ keys" · spec L591-592 "on the focused row or the opened view" ·
// Q-71 "in an opened note's or summary's view it acts on that note or summary".
test('in an opened project note\'s view, v marks that note ❌', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await memoryView($, w)
  await toggle(ui, w)
  await enter(ui, w, await focusRow($, ui, w, 'tokP4'))
  await markKey(ui, w, 'v', 'the cut was fixed; this route is stale')
  expect(w.current(PROJECT_MEMORY, '4')).toBe('void') // Q-71: the opened note #4 (fixture PNOTES[4]) is ❌ (`void`, D-T14-tool-names)
})

// c34 · R-C15-199 · Q-92 answer "✅/❌ keys" · spec L592 "with the required `reason:` dialog" · Q-72 "A dismissed dialog
// or an empty reason makes no mark".
// guard per _orch/inbox/OQ7.answer.md (deviation from spec L19-20, L100): at da5910c no key marks a note, so this holds
// there (work/probe-da5910c.md P-C34); it pins that a dismissed dialog keeps making no mark.
test('guard: after v on a focused project note and a dismissed reason dialog, the note\'s mark log holds no record', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await memoryView($, w)
  await toggle(ui, w)
  await focusRow($, ui, w, 'tokP4')
  await markKey(ui, w, 'v', null) // the dialog is dismissed
  expect(w.asked.length, 'no reason dialog was shown, so none was dismissed').toBe(1) // fixture: P3-d3, v on the focused note asked for its reason
  expect(w.marksOf(PROJECT_MEMORY, '4')).toEqual([]) // Q-72 "makes no mark": no record for note #4 (fixture)
})

// c35 · R-C15-202 · Q-92 answer "mark project notes themselves" · spec L593 "The mark is written to the project memory,
// in the row's namespace." · D-T14-project-view "A mark made on a project row is written to that row's namespace."
test('a mark made from the project view on a lessons row is written to the lessons namespace', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await memoryView($, w)
  await toggle(ui, w)
  await focusRow($, ui, w, 'tokL0')
  await markKey(ui, w, 'v', 'a later lesson replaces it')
  const out = text(await call($, 'project_recall', { namespace: 'lessons', pattern: 'probe the tip', include_void: true }))
  expect(shownVoid(out, 0, 'tokL0')).toBe(true) // L593: the `lessons` note #0 (fixture LNOTES[0]) is returned as `#0 ❌` (Q-90)
})

// ================================================================== the operator's mark stands (Q-74)

// c36 · R-C15-205, R-C15-206 · Q-92 answer "so the operator can view and mark project notes themselves" · spec L595-596
// "Q-74 holds in the project memory: a `project_mark` call that would replace the operator's mark is refused with
// `refused: the operator's mark stands (Q-74)`." · D-T14-mark-messages.
test('after the operator marks a project note from the pane, a prime project_mark naming it returns the refusal', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await memoryView($, w)
  await toggle(ui, w)
  await focusRow($, ui, w, 'tokP4')
  await markKey(ui, w, 'v', 'the cut was fixed; this route is stale')
  const r = await pmark($, '4', 'ok', 'the prime thinks it still holds')
  expect(isErrorResult(r)).toBe(true) // L596 "is refused"
  expect(errorText(r)).toContain("refused: the operator's mark stands (Q-74)") // L596, D-T14-mark-messages, verbatim
})

// c37 · R-C15-205 · Q-92 answer "mark project notes themselves" · spec L595-596 "a `project_mark` call that would replace
// the operator's mark is refused" · Q-74 "A mark by the prime cannot replace one by the operator".
// guard per _orch/inbox/OQ7.answer.md (deviation from spec L19-20, L100): at da5910c project_mark marks nothing, so this
// holds there (work/probe-da5910c.md P-C37). The operator's record is the fixture a pane mark leaves (c30).
test('guard: after that refused project_mark call the project note\'s current mark is still the operator\'s', SLOW, async ($, on) => {
  const w = world(on, { marks: { project: [OPERATOR_VOID] } }) // fixture: project note #4 marked ❌ by the operator from the pane
  await w.begin($)
  const r = await pmark($, '4', 'ok', 'the prime thinks it still holds')
  expect([isErrorResult(r), errorText(r)], 'the project_mark call was not refused').toEqual([true, "refused: the operator's mark stands (Q-74)"]) // fixture: P3-d3, the call was refused (L596)
  expect(w.marksOf(PROJECT_MEMORY, '4')).toEqual([OPERATOR_VOID]) // Q-74: the operator's record is still the newest, the current mark
})

// ================================================================== rulings stay excluded

// c38 · R-C15-207 · Q-92 answer "Rulings stay excluded from marks (Q-86)." · spec L597 "`c`, `v` or `u` on a ruling row
// makes no mark".
// guard per _orch/inbox/OQ7.answer.md (deviation from spec L19-20, L100): at da5910c no key marks anything, so this
// holds there (work/probe-da5910c.md P-C38); it pins that a ruling row stays unmarkable.
test('guard: with a ruling row focused in the Memory view, v writes no mark record to the project memory', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await memoryView($, w)
  await focusRow($, ui, w, 'tokR0', true)
  await markKey(ui, w, 'v', 'this ruling is old')
  expect(cells(await ui.drawn()), 'v did not act on the focused ruling row').toContain('no mark: rulings are retracted, not marked') // fixture: P3-d3, v reached the ruling row (L598)
  const all3 =[PROJECT_MEMORY, LESSONS, RULINGS].flatMap((d) => w.store(d).marks)
  expect(all3).toEqual([]) // L597 "makes no mark": no record in any store of the project memory (fixture stores)
})

// c39 · R-C15-208 · Q-92 answer "Rulings stay excluded from marks (Q-86)." · spec L597-598 "and the hint line reads `no
// mark: rulings are retracted, not marked`." · D-T14-mark-messages (PLAN attempt 20).
test('after v on a focused ruling row, the hint line reads no mark: rulings are retracted, not marked', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await memoryView($, w)
  await focusRow($, ui, w, 'tokR0', true)
  await markKey(ui, w, 'v', 'this ruling is old')
  expect(cells(await ui.drawn())).toContain('no mark: rulings are retracted, not marked') // L598, D-T14-mark-messages, verbatim
})
