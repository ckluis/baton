// claude plugin test — T14 memory marks, part A (node T114A, the split-out red step of F114):
// run-store marks, mark history, rebuilds, the superseded log, recall and zoom.
//
// Written from the spec (docs/designs/v7.6-tuning.md L403-457, the operator answers L458-564) and the
// operator's answers (_orch/inbox/Q-73, Q-74, Q-75, Q-76, Q-77, Q-84 .answer.md) and the planner's display
// decisions (_orch/plan/decisions/D-T14-tool-names, D-T14-mark-messages, D-T14-mark-glyphs, Q-90,
// D-T14-superseded-recall) BEFORE the implementation exists. Requirement ids are the rows of
// _orch/plan/traceability.yaml (cluster C15). F114 may not edit these tests.
//
// The store is a fixture. A plugin test runs no process, so the memo CLI the mod drives through
// $.process.run (mod/bin/memo.mjs) is answered by `fakeMemo` below, from memory. It answers every
// command memo takes at da5910c (note, wake, zoom, recall, pending, merge, stats) the way the store
// does today: it never skips, hides, marks or rebuilds anything by itself. Every T14 behaviour pinned
// here — wake, recall and zoom skipping a ❌ note, the rebuilding placeholder, the bottom-up rebuild,
// who may mark — is the mod's to produce. The fixture adds four storage commands, which the real
// memo must take too (the live check LV14 drives it):
//   mark <id> ok|void|clear --who operator|prime [--session <id>] [--reason <text> | -]
//        appends one mark record {id, mark, reason, who, session, ts}; the reason on stdin with `-`
//   marks [<id>]          every mark record (of that id), oldest first (JSON with --json)
//   rebuild <lo>-<hi> --reason <text> -
//        the new summary on stdin: the summary's old text is appended to the superseded log with
//        the reason, then the summary's slot holds the new text
//   superseded            every superseded entry {level, index, lo, hi, text, reason, ts}, oldest first
// A rebuilt summary is summarized the way merges are (the cheap model, `model.complete`); the
// fixture's model answers with the fixture tokens it was given, so a summary shows what it was
// built from. No test reads or writes a real memory: every path is under the fixture root /proj
// (_orch/inbox/Q-85.answer.md: the run's own bad records are the operator's to mark, after T14 ships).
//
// Tests named `guard: ...` pin behaviour that already holds at da5910c (OQ7 preservation guards):
// exempt from red, logged as deviations from spec L19-20 and L100, approved by
// _orch/inbox/OQ7.answer.md ("Each one is logged as a deviation from the red-first rule
// (spec L19-20, L100), with this file as the approval"). Evidence: _orch/nodes/T114A/work/guard-evidence.md.
import { expect, mock, test } from 'claude-code/testing'

const PROJ = '/proj' // fixture root: nothing here is a real directory
const RUN = '/proj/run' // the run's directory (fixture)
const OUT = '/proj' // a directory outside the run (fixture; spec L86 "A monitor session started in ~/Desktop/projects")
const RUN_ID = 'build-20261019T125436Z' // fixture run id
const MANIFEST_PATH = RUN + '/_orch/manifest.json'
const RUN_MEMORY = RUN + '/_orch/memory' // the run's memory (memory_note writes here today: memory.test.ts)
const PRIME = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a' // fixture: the manifest's prime session id (T7, L93)
const SECOND = 'b93f2d17-8e6a-4f05-a2c4-6d7e8f901234' // fixture: a session outside the run
const SUBAGENT = 'a0b1c2d3e4f5a6b7' // fixture: a subagent's agentId
const SLOW_MODEL_MS = 1000 // fixture: how long the slow summarizer takes to answer
const SLOW = { timeoutMs: 20000 }
const TS = '2026-10-19T12:00:00Z' // fixture timestamp

// ------------------------------------------------------------------ the shared fixture
//
// Eight run notes #0-#7 and every summary over them: four L1 summaries (#0-1, #2-3, #4-5, #6-7),
// two L2 summaries (#0-3, #4-7) and one L3 summary (#0-7). Note #5 is the one marked ❌ (a stray
// monitor session's note, as #4-#7 were, spec L436). The L1 summary #4-5 and the L2 summary #4-7
// hold its text (token tokN5): spec L545-546 "the L448 fixture holds an L1 summary and an L2
// summary over the note marked ❌". Every text carries a token (tokN<i> for note i, tokS<k>x<i>
// for summary (k, i)) so a test can tell what a summary was built from.
const NOTES = [
  { tag: 'prime', text: 'G1 answers recorded tokN0' },
  { tag: 'sub', text: 'P1 dispatched, F11 landed tokN1' },
  { tag: 'prime', text: 'T114A red step started tokN2' },
  { tag: 'sub', text: 'F17 landed at the run tip tokN3' },
  { tag: 'prime', text: 'P2 waits on Q-80 tokN4' },
  { tag: 'prime-reply', text: 'monitor session: approved push for prime tokN5' },
  { tag: 'sub', text: 'XT114 verdict CONFIRMED tokN6' },
  { tag: 'prime', text: 'P3 parked: waits on Q-92 tokN7' },
]
const VOID_NOTE = 5 // the note marked ❌ in the shared fixture
const VOID_TEXT = 'tokN5' // its text's token
const SUMMARIES: Record<string, string> = {
  '1:0': 'G1 answered; P1 dispatched tokN0 tokN1 tokS1x0',
  '1:1': 'T114A red started; F17 landed tokN2 tokN3 tokS1x1',
  '1:2': 'P2 waits on Q-80; push approved tokN4 tokN5 tokS1x2', // L1 #4-5, over the ❌ note
  '1:3': 'XT114 confirmed; P3 parked on Q-92 tokN6 tokN7 tokS1x3',
  '2:0': 'G1, P1, T114A, F17 tokN0 tokN1 tokN2 tokN3 tokS2x0',
  '2:1': 'P2 on Q-80, push approved, XT114, P3 tokN4 tokN5 tokN6 tokN7 tokS2x1', // L2 #4-7, over the ❌ note
  '3:0': 'the run so far tokN0 tokN1 tokN2 tokN3 tokN4 tokN5 tokN6 tokN7 tokS3x0', // L3 #0-7
}
const TOKEN_RE = /\b(?:tokN\d|tokS\dx\d|gen\d+)\b/g

type Mark = { id: string; mark: string; reason: string; who: string; session?: string; ts: string }
type Store = {
  notes: { text: string; tag: string; ts: string }[]
  sums: Map<string, string>
  marks: Mark[]
  superseded: { level: number; index: number; lo: number; hi: number; text: string; reason: string; ts: string }[]
  rebuilds: { level: number; index: number; lo: number; hi: number; text: string }[]
}

function fixtureStore(marks: Mark[] = []): Store {
  return {
    notes: NOTES.map((n) => ({ ...n, ts: TS })),
    sums: new Map(Object.entries(SUMMARIES)),
    marks: marks.map((m) => ({ ...m })),
    superseded: [],
    rebuilds: [],
  }
}
const emptyStore = (): Store => ({ notes: [], sums: new Map(), marks: [], superseded: [], rebuilds: [] })

// ------------------------------------------------------------------ the fixture memo CLI

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
const blockOf = (lo: number, hi: number) => {
  // lo-hi inclusive, a whole aligned block of 2^k notes
  const size = hi - lo + 1
  const k = Math.round(Math.log2(size))
  if (k < 1 || span(k) !== size || lo % size !== 0) return null
  return { level: k, index: lo / size }
}

/** The tiles a view of [lo, hi) shows within budget: whole summaries, the newest opened first. */
function tiling(st: Store, lo: number, hi: number, budget: number) {
  const out: { level: number; lo: number; hi: number }[] = []
  let i = lo
  while (i < hi) {
    let k = 0
    for (;;) {
      const s = span(k + 1)
      if (i % s === 0 && i + s <= hi && st.sums.has(k + 1 + ':' + i / s)) k++
      else break
    }
    out.push({ level: k, lo: i, hi: i + span(k) })
    i += span(k)
  }
  for (;;) {
    let j = -1
    for (let x = out.length - 1; x >= 0; x--) if (out[x].level > 0) { j = x; break }
    if (j < 0 || out.length + 1 > budget) break
    const t = out[j]
    const half = span(t.level - 1)
    out.splice(j, 1, { level: t.level - 1, lo: t.lo, hi: t.lo + half }, { level: t.level - 1, lo: t.lo + half, hi: t.hi })
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

/** memo, from memory: one store per --dir (+ --ns). */
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
      // ---- the four storage commands T14 adds (see the header)
      case 'mark': {
        const id = normId(flags.id ?? rest[0])
        const mark = String(flags.mark ?? rest[1] ?? '')
        if (!id || !['ok', 'void', 'clear'].includes(mark)) return fail(1, 'mark <id> ok|void|clear')
        let reason = flags.reason !== undefined ? String(flags.reason) : rest.includes('-') || stdin !== undefined ? String(stdin ?? '') : ''
        reason = reason.trim()
        const rec: Mark = { id, mark, reason, who: String(flags.who ?? ''), ts: TS }
        if (flags.session !== undefined) rec.session = String(flags.session)
        st.marks.push(rec)
        return ok(rec, `marked #${id} ${mark}`)
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
        st.rebuilds.push({ level: b.level, index: b.index, lo, hi, text })
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
  session?: 'prime' | 'outside' // the run's prime session (default), or a session started outside the run
  marks?: Mark[] // mark records the fixture store starts with
  slowModel?: boolean // the summarizer answers only after SLOW_MODEL_MS of the mocked clock
}

function world(on: any, o: Opts = {}) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 })
  const iso = (ms: number) => new Date(ms).toISOString()
  const outside = o.session === 'outside'
  const s = { cwd: outside ? OUT : RUN, id: outside ? SECOND : PRIME, start: outside ? OUT : RUN }
  const files = new Map<string, string>()
  // T7's manifest (spec L93 "The manifest records the prime's session id"): the prime is live (heard 10 s ago).
  files.set(MANIFEST_PATH, JSON.stringify({ run_id: RUN_ID, mode: 'BUILD', target: 'docs/designs/v7.6-tuning.md', prime: true, started_at: iso(t0 - 3600000), memory: { run: '_orch/memory' }, prime_session: { id: PRIME, heartbeat_at: iso(t0 - 10000) } }, null, 2) + '\n')
  const abs = (p: string) => {
    if (p === PROJ || p.startsWith(PROJ + '/')) return p
    if (p.startsWith('_orch/')) return s.cwd + '/' + p
    const i = p.lastIndexOf('/_orch/')
    return i >= 0 ? s.cwd + p.slice(i) : p
  }
  const stores = new Map<string, Store>()
  stores.set(RUN_MEMORY, fixtureStore(o.marks ?? []))
  const memo = fakeMemo(stores)
  const calls: { argv: string[]; stdin?: string }[] = []
  const tools = new Map<string, any>()
  const models: any[] = []
  let gen = 0

  on('fs.read', (_$: any, e: any) => {
    const v = files.get(abs(e.path))
    return v === undefined ? { deny: 'ENOENT: no such file or directory' } : { value: v }
  })
  on('fs.write', (_$: any, e: any) => {
    files.set(abs(e.path), e.text)
    return { value: undefined }
  })
  on('fs.exists', (_$: any, e: any) => {
    const p = abs(e.path)
    return { value: files.has(p) || [...files.keys()].some((k) => k.startsWith(p + '/')) }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { id: 'baton', isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return Text({ key: 'engine', children: ['engine ' + JSON.stringify(e.component)] })
  })
  on('session.cwd', () => ({ value: s.cwd }))
  on('session.root', () => ({ value: s.start }))
  on('session.id', () => ({ value: s.id }))
  on('session.surfaces', () => ({ value: [] }))
  on('session.version', () => ({ value: { version: '2.1.303', base: '2.1.303' } }))
  on('session.usage', () => ({ value: { rateLimits: [] } }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.end', (_$: any, e: any) => ({ sessionId: e.sessionId }))
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  on('classic.SessionStart', () => ({}))
  on('classic.CwdChanged', () => ({}))
  on('tool.register', (_$: any, e: any) => {
    tools.set(e.name, e)
    return { value: { tool: 'mcp__baton__' + e.name } }
  })
  on('command.register', () => ({ value: undefined }))
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  on('model.fork', () => ({ value: { isAnswered: true, text: 'P3 running', usage: {} } }))
  // The summarizer: answers with every fixture token its prompt holds, then a fresh gen<k> of its own,
  // so a summary shows what it was built from (and a summary built from it shows that too).
  on('model.complete', async (_$: any, e: any) => {
    models.push(e)
    if (o.slowModel) await clock.sleep(SLOW_MODEL_MS)
    const seen = [...new Set(String(e.prompt ?? '').match(TOKEN_RE) ?? [])]
    gen++
    return { value: { isAnswered: true, text: ['merged', ...seen, 'gen' + gen].join(' '), usage: {} } }
  })
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    calls.push({ argv, stdin: e.init?.stdin })
    if (!String(argv[1] ?? '').endsWith('/bin/memo.mjs')) return { value: { exitCode: 0, stdout: '{}', stderr: '' } }
    return { value: memo(argv, e.init?.stdin) }
  })
  // Beneath the mod every other tool runs and answers without error.
  on('tool.call', () => ({ result: 'ran' }))
  mock.store(on)
  mock.env(on, {})
  mock.session(on)

  /** The engine starting this session in its start directory. */
  async function begin($: any) {
    await $.session.start({ cwd: s.start, surface: null, isInteractive: false } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: s.start } as any)
    await clock.advance(2000)
    await clock.settle()
  }
  /** The session's shell runs `cd dir` (as t7-membership.test.ts does; the mod caches its manifest read 1.5 s). */
  async function cd($: any, dir: string) {
    const old = s.cwd
    s.cwd = dir
    await $.classic.CwdChanged({ old_cwd: old, new_cwd: dir } as any)
    await new Promise((r) => setTimeout(r, 1600))
  }
  /** Let every background job finish: the slow summarizer answers, merges and rebuilds run. */
  async function drain() {
    for (let k = 0; k < 6; k++) {
      await clock.advance(SLOW_MODEL_MS * 2)
      await clock.settle()
    }
  }
  const run = () => stores.get(RUN_MEMORY)!
  const sum = (k: number, i: number) => run().sums.get(k + ':' + i)
  const marksOf = (id: string) => run().marks.filter((m) => m.id === id)
  return { clock, s, calls, tools, models, begin, cd, drain, run, sum, marksOf }
}

// ------------------------------------------------------------------ helpers

const call = ($: any, tool: string, input: any = {}) => $.tool.call({ tool: 'mcp__baton__' + tool, ...input } as any) as Promise<any>
const mark = ($: any, id: string, m: string, reason: string, extra: any = {}) => call($, 'memory_mark', { id, mark: m, reason, ...extra })
/** An error result: refused (`deny`, which the model reads as an error result) or errored (`isError`). */
const isErrorResult = (r: any) => r?.deny !== undefined || r?.isError === true
const errorText = (r: any) => String(r?.deny ?? r?.text ?? r?.result ?? '')
const text = (r: any) => String(r?.result ?? r?.text ?? '')
const lineOf = (out: string, prefix: string) => out.split('\n').find((l) => l.startsWith(prefix)) ?? ''
const rec = (id: string, m: string, who: string, reason: string, session?: string): Mark => ({ id, mark: m, reason, who, ...(session ? { session } : {}), ts: TS })

/** The shared fixture with note #5 marked ❌ by the prime through memory_mark. */
async function voidTheNote($: any, w: ReturnType<typeof world>) {
  await w.begin($)
  return mark($, String(VOID_NOTE), 'void', 'a monitor session wrote it (T7)')
}

// ------------------------------------------------------------------ memory_mark records a mark

// R-C15-01, R-C15-12 · spec L412 "A note or a summary can be marked ✅ (confirmed)" · L419 "The prime marks
// through a memory tool" · D-T14-tool-names: `memory_mark` with `id`, `mark` (`ok` or `void`) and `reason`.
test('memory_mark with mark ok records ✅ on the note it names', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  await mark($, '6', 'ok', 'checked against the verdict file')
  expect(w.marksOf('6').map((m) => m.mark)).toEqual(['ok']) // L412 ✅ = `ok` (D-T14-tool-names); the store's mark record (header protocol)
})

// R-C15-02, R-C15-12 · spec L412 "or ❌ (void)." · D-T14-tool-names: `mark` (`ok` or `void`).
test('memory_mark with mark void records ❌ on the note it names', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  await mark($, '6', 'void', 'the verdict was withdrawn')
  expect(w.marksOf('6').map((m) => m.mark)).toEqual(['void']) // L412 ❌ = `void` (D-T14-tool-names)
})

// R-C15-01, R-C15-94 · spec L412 "A note or a summary can be marked" · D-T14-tool-names: `id` is "a note number
// such as `48`, or a summary label such as `48-51`, as `memory_wake` prints them".
test('memory_mark given a summary label records the mark on that summary', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  await mark($, '0-1', 'ok', 'both notes checked')
  expect(w.marksOf('0-1').map((m) => m.mark)).toEqual(['ok']) // the summary #0-1 (fixture L1 #0-1) carries the mark
  expect(w.marksOf('0')).toEqual([]) // L490 "A mark on a summary is the summary's own (Q-75)": not its notes'
  expect(w.marksOf('1')).toEqual([]) // Q-75: nor note #1's (fixture)
})

// R-C15-03, R-C15-77 · spec L412-413 "A mark records a one-line reason" · Q-74 "a mark is an appended record
// (mark, reason, who, time)".
test('a mark records the one-line reason it was given', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  await mark($, '6', 'ok', 'checked against the verdict file')
  expect(w.marksOf('6').map((m) => m.reason)).toEqual(['checked against the verdict file']) // the reason the call gave (L412)
})

// R-C15-04, R-C15-66, R-C15-68 · Q-73 "a `memory_mark` call from the run's prime session records `prime`"
// · spec L471-472 "A `memory_mark` call from the run's prime session records `prime` and that session's id."
test('a memory_mark call from the run\'s prime session records prime as who marked it', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  await mark($, '6', 'ok', 'checked')
  expect(w.marksOf('6').map((m) => m.who)).toEqual(['prime']) // Q-73: `prime`
})

// R-C15-69 · Q-73 "records `prime` with its session id" · spec L472 "and that session's id."
test('a memory_mark call from the run\'s prime session records that session\'s id with the mark', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  await mark($, '6', 'ok', 'checked')
  expect(w.marksOf('6').map((m) => m.session)).toEqual([PRIME]) // the prime session's id (fixture PRIME, the manifest's prime_session.id)
})

// R-C15-70 · Q-73 "`memory_mark` has no `who` argument." · spec L473 "`memory_mark` takes no `who` argument."
test('the input schema of the listed memory_mark tool has no who property', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  const t = w.tools.get('memory_mark')
  expect(t).toBeDefined() // the tool is listed (spec L419 "The prime marks through a memory tool", D-T14-tool-names)
  expect(Object.keys(t?.inputSchema?.properties ?? {})).not.toContain('who') // Q-73: no `who` argument
})

// ------------------------------------------------------------------ who may mark (Q-73)

// R-C15-71, R-C15-73 · Q-73 "A call carrying an `agentId` (any subagent) ... is refused with an error and makes
// no mark." · spec L473-474.
test('a memory_mark call carrying an agentId returns an error result', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  const r = await mark($, '6', 'void', 'a worker thinks it is wrong', { agentId: SUBAGENT })
  expect(isErrorResult(r)).toBe(true) // Q-73 "refused with an error"
})

// R-C15-74 · Q-73 "... is refused with an error and makes no mark." The earlier mark is the prime's (fixture record).
// guard per _orch/inbox/OQ7.answer.md (deviation from spec L19-20, L100): at da5910c no call can change a mark,
// so this holds there (work/probe-da5910c.md P-C10); it pins that the refusal keeps holding.
test('guard: a memory_mark call carrying an agentId leaves the earlier prime mark as the note\'s current mark', SLOW, async ($, on) => {
  const seed = [rec('3', 'ok', 'prime', 'checked by the prime', PRIME)] // fixture: #3 marked ✅ by the prime
  const w = world(on, { marks: seed })
  await w.begin($)
  const r = await mark($, '3', 'void', 'a worker thinks it is wrong', { agentId: SUBAGENT })
  expect([isErrorResult(r), errorText(r)], 'the memory_mark call was not refused').toEqual([true, 'refused: only the operator and the prime mark (Q-73)']) // fixture: sweep F79, the call reached the mark tool and was refused (Q-73)
  expect(w.marksOf('3')).toEqual(seed) // Q-73 "makes no mark": the prime's record is still the newest (Q-74 "The newest record is the note's current mark")
})

// R-C15-72, R-C15-73 · Q-73 "A call ... from a session outside the run (T7) is refused with an error and makes no mark."
// The session started outside the run and cd'd into it (spec L86-88, T7's case).
test('a memory_mark call from a session outside the run returns an error result', SLOW, async ($, on) => {
  const w = world(on, { session: 'outside' })
  await w.begin($)
  await w.cd($, RUN)
  const r = await mark($, '6', 'void', 'looks wrong from here')
  expect(isErrorResult(r)).toBe(true) // Q-73 "refused with an error"
})

// R-C15-74 · Q-73 "... from a session outside the run (T7) is refused with an error and makes no mark."
// guard per _orch/inbox/OQ7.answer.md (deviation from spec L19-20, L100): holds at da5910c (work/probe-da5910c.md P-C12).
test('guard: a memory_mark call from a session outside the run leaves the earlier prime mark as the note\'s current mark', SLOW, async ($, on) => {
  const seed = [rec('3', 'ok', 'prime', 'checked by the prime', PRIME)] // fixture: #3 marked ✅ by the prime
  const w = world(on, { session: 'outside', marks: seed })
  await w.begin($)
  await w.cd($, RUN)
  const r = await mark($, '3', 'void', 'looks wrong from here')
  expect([isErrorResult(r), errorText(r).startsWith('refused: this session is not in run ')], 'the memory_mark call was not refused').toEqual([true, true]) // fixture: sweep F79, the call reached the mark tool and was refused (Q-73, T7)
  expect(w.marksOf('3')).toEqual(seed) // Q-73 "makes no mark": the prime's mark stays current
})

// R-C15-71, R-C15-73 · D-T14-mark-messages: "A `memory_mark` or `project_mark` call that carries an `agentId` (Q-73):
// the error result reads `refused: only the operator and the prime mark (Q-73)`."
test('the error a memory_mark call carrying an agentId returns reads the Q-73 refusal', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  const r = await mark($, '6', 'void', 'a worker thinks it is wrong', { agentId: SUBAGENT })
  expect(isErrorResult(r)).toBe(true) // D-T14-mark-messages: an error result first
  expect(errorText(r)).toBe('refused: only the operator and the prime mark (Q-73)') // D-T14-mark-messages, verbatim
})

// ------------------------------------------------------------------ ❌ in the shared fixture: wake, rebuilds, recall

// R-C15-13, R-C15-14 · spec L420 "Nothing is deleted." GV3 removed the guard that read the fixture store's notes after
// a ❌: that store is append-only and the mod reaches it only through memo, so no change to the mod could fail it. The
// mod's side is held by t14-project-mark.test.ts c4 (the shared writeMark) and the include_void recall test below.

// R-C15-15, R-C15-42 · spec L421 "`memory_wake` and the summaries skip a ❌ note." · L448 "in a fixture, marking a
// note ❌ removes it from `memory_wake`;"
test('in a fixture, marking a note ❌ removes it from memory_wake\'s output', SLOW, async ($, on) => {
  const w = world(on)
  await voidTheNote($, w)
  await w.drain()
  const out = text(await call($, 'memory_wake')) // the default budget (96) shows every note verbatim
  expect(out).not.toContain(VOID_TEXT) // L448: the ❌ note's text is not in memory_wake
  expect(out).not.toContain('monitor session: approved push') // the ❌ note's text (fixture NOTES[5])
})

// R-C15-18, R-C15-43, R-C15-157, R-C15-158 · spec L423 "A summary built from a ❌ note is rebuilt without it."
// · L449 "it removes the note from every summary above it;" · L545-546 "after the mark each one, rebuilt, no longer
// holds the note's text"
test('after the note is marked ❌ and rebuilt, the L1 summary over it no longer holds the note\'s text', SLOW, async ($, on) => {
  const w = world(on)
  await voidTheNote($, w)
  await w.drain()
  expect(w.sum(1, 2)).toBeDefined() // the L1 summary #4-5 (fixture) is still there, rebuilt
  expect(w.sum(1, 2)).not.toContain(VOID_TEXT) // L545-546: no longer holds the ❌ note's text
})

// R-C15-18, R-C15-157, R-C15-158 · spec L545-546 "the L448 fixture holds an L1 summary and an L2 summary over the
// note marked ❌, and after the mark each one, rebuilt, no longer holds the note's text"
test('after the note is marked ❌ and rebuilt, the L2 summary over it no longer holds the note\'s text', SLOW, async ($, on) => {
  const w = world(on)
  await voidTheNote($, w)
  await w.drain()
  expect(w.sum(2, 1)).toBeDefined() // the L2 summary #4-7 (fixture)
  expect(w.sum(2, 1)).not.toContain(VOID_TEXT) // L545-546
})

// R-C15-102 · Q-76 "the mark queues a rebuild of every summary above the note, bottom up." · spec L493-494.
test('the L1 summary over the ❌ note is rebuilt before the L2 summary, bottom up', SLOW, async ($, on) => {
  const w = world(on)
  await voidTheNote($, w)
  await w.drain()
  const order = w.run().rebuilds.map((b) => b.lo + '-' + b.hi)
  expect(order).toContain('4-5') // the L1 above #5 (fixture)
  expect(order).toContain('4-7') // the L2 above #5 (fixture)
  expect(order.indexOf('4-5')).toBeLessThan(order.indexOf('4-7')) // Q-76 "bottom up"
})

// R-C15-101 · Q-76 "At once, in the background: the mark queues a rebuild of every summary above the note" · spec L493.
test('the rebuilds run in the background, with no memory_wake call after the mark', SLOW, async ($, on) => {
  const w = world(on, { slowModel: true })
  await w.begin($)
  const before = w.calls.length
  let returned = false
  const p = mark($, String(VOID_NOTE), 'void', 'a monitor session wrote it (T7)').then((r: any) => {
    returned = true
    return r
  })
  await w.clock.settle()
  expect(returned).toBe(true) // Q-76 "in the background": the call returns while the summarizer is still at work
  await p
  await w.drain() // time passes; nobody calls memory_wake
  expect(w.calls.slice(before).some((c) => c.argv.includes('wake'))).toBe(false) // no wake after the mark
  const rebuilt = w.run().rebuilds.map((b) => b.lo + '-' + b.hi)
  expect(rebuilt).toEqual(expect.arrayContaining(['4-5', '4-7', '0-7'])) // Q-76 "every summary above the note" (fixture L1, L2, L3)
})

// R-C15-103, R-C15-104, R-C15-169 · Q-76 "Until a summary is rebuilt, `memory_wake` leaves it out and prints
// `#lo-hi: rebuilding (a note was voided)` in its place" · spec L494-495.
test('before the L1 summary is rebuilt, memory_wake prints the rebuilding line with that summary\'s range', SLOW, async ($, on) => {
  const w = world(on, { slowModel: true })
  await voidTheNote($, w)
  await w.clock.settle() // the summarizer has not answered: nothing is rebuilt yet
  // budget 4 over the fixture (eight notes, and the session's own start note #8) shows the L1 #4-5 as one block
  const out = text(await call($, 'memory_wake', { budget: 4 }))
  expect(out).toContain('#4-5: rebuilding (a note was voided)') // Q-76, verbatim, with the L1's range (fixture #4-5)
  expect(out).not.toContain('tokS1x2') // Q-76 "leaves it out": the old L1 text is not shown
})

// R-C15-105 · Q-76 "so the void content is never shown." · spec L495-496.
test('before the L1 summary is rebuilt, memory_wake\'s output holds no text of the ❌ note', SLOW, async ($, on) => {
  const w = world(on, { slowModel: true })
  await voidTheNote($, w)
  await w.clock.settle()
  for (const budget of [4, 96]) {
    const out = text(await call($, 'memory_wake', { budget }))
    expect(out).not.toContain(VOID_TEXT) // Q-76 "the void content is never shown" (the note, and the old summaries that hold it)
  }
})

// R-C15-106, R-C15-107 · Q-84 "the old summary is appended to a superseded log with the reason (`rebuilt: #n voided`)"
// · spec L497-498.
test('after a rebuild the summary\'s old text is in the superseded log with the reason rebuilt: #n voided', SLOW, async ($, on) => {
  const w = world(on)
  await voidTheNote($, w)
  await w.drain()
  const old = w.run().superseded.filter((x) => x.lo === 4 && x.hi === 5)
  expect(old.map((x) => x.text)).toEqual([SUMMARIES['1:2']]) // Q-84: the old L1 #4-5 text (fixture), kept
  expect(old.map((x) => x.reason)).toEqual(['rebuilt: #5 voided']) // Q-84 `rebuilt: #n voided`, n = 5 (fixture VOID_NOTE)
})

// R-C15-108, R-C15-170 · Q-84 "and stays findable by `memory_recall` with `include_void`" · D-T14-superseded-recall:
// the line that shows a superseded summary's old text carries its reason.
test('after a rebuild memory_recall with include_void true returns the summary\'s old text', SLOW, async ($, on) => {
  const w = world(on)
  await voidTheNote($, w)
  await w.drain()
  const out = text(await call($, 'memory_recall', { pattern: 'tokS1x2', include_void: true }))
  const line = out.split('\n').find((l) => l.includes('push approved tokN4 tokN5 tokS1x2')) ?? ''
  expect(line).toContain('tokS1x2') // Q-84: the old text (fixture SUMMARIES 1:2) is found
  expect(line).toContain('rebuilt: #5 voided') // D-T14-superseded-recall: found as superseded, with its reason
})

// R-C15-108, R-C15-16 · Q-84 (the old text is findable "with `include_void`") · spec L422 "`memory_recall` skips a ❌ note
// unless it is called with an explicit include-void flag."
test('after a rebuild memory_recall without include_void does not return the summary\'s old text', SLOW, async ($, on) => {
  const w = world(on)
  await voidTheNote($, w)
  await w.drain()
  const out = text(await call($, 'memory_recall', { pattern: 'tokS1x2' }))
  expect(out).not.toContain('tokS1x2') // the old L1 #4-5 text (fixture) is only in the superseded log
})

// R-C15-109 · Q-84 "the slot holds the new summary." · spec L499.
test('after a rebuild the summary\'s slot holds the new summary', SLOW, async ($, on) => {
  const w = world(on)
  await voidTheNote($, w)
  await w.drain()
  const now = w.sum(1, 2) ?? ''
  expect(now).not.toBe(SUMMARIES['1:2']) // not the old text (fixture)
  expect(now).toContain('tokN4') // the new summary, built from what is left under it: note #4 (fixture)
  expect(now).not.toContain(VOID_TEXT) // Q-84 with L423: the new summary is built without the ❌ note (fixture tokN5)
})

// R-C15-16, R-C15-44 · spec L422 "`memory_recall` skips a ❌ note" · D-T14-tool-names: `include_void`, false by default.
test('in the same fixture memory_recall without include_void does not return the ❌ note', SLOW, async ($, on) => {
  const w = world(on)
  await voidTheNote($, w)
  await w.drain()
  const out = text(await call($, 'memory_recall', { pattern: 'tok' }))
  expect(out).not.toContain(VOID_TEXT) // L422: the ❌ note (and no summary holds it once rebuilt)
  expect(out).toContain('tokN6') // the recall itself answered (an unmarked note, fixture #6)
})

// R-C15-17, R-C15-44 · spec L422 "unless it is called with an explicit include-void flag." · L450 "`memory_recall` with
// the explicit include-void flag still finds the note;" · Q-90: a marked note prints as `#n ❌` before its text.
test('in the same fixture memory_recall with include_void true still returns the ❌ note', SLOW, async ($, on) => {
  const w = world(on)
  await voidTheNote($, w)
  await w.drain()
  const out = text(await call($, 'memory_recall', { pattern: 'tokN5', include_void: true }))
  const line = out.split('\n').find((l) => l.includes(NOTES[VOID_NOTE].text)) ?? ''
  expect(line.startsWith('#5 ❌')).toBe(true) // L450 still finds the note; Q-90 `#n ❌` before its text
})

// R-C15-19, R-C15-45 · spec L424 "A summary built only from ✅ notes shows ✅." · L451 · D-T14-mark-glyphs ✅.
test('a summary built only from ✅ notes shows ✅ in memory_wake\'s output', SLOW, async ($, on) => {
  const seed = [rec('0', 'ok', 'operator', 'checked'), rec('1', 'ok', 'operator', 'checked')] // fixture: #0 and #1 ✅
  const w = world(on, { marks: seed })
  await w.begin($)
  // budget 7 over the fixture (eight notes, and the session's own start note #8) shows the L1 #0-1 as one block
  const out = text(await call($, 'memory_wake', { budget: 7 }))
  const line = lineOf(out, '#0-1')
  expect(line).toContain('tokS1x0') // the L1 #0-1 summary (fixture) is shown
  expect(line).toContain('✅') // L424: built only from ✅ notes, it shows ✅
})

// ------------------------------------------------------------------ mark history (Q-74)

// R-C15-77 · Q-74 "a mark is an appended record (mark, reason, who, time)" · spec L477.
test('marking a ✅ note ❌ appends a second mark record and keeps the first', SLOW, async ($, on) => {
  const first = rec('3', 'ok', 'prime', 'checked by the prime', PRIME) // fixture: #3 ✅ by the prime
  const w = world(on, { marks: [first] })
  await w.begin($)
  await mark($, '3', 'void', 'the check was wrong')
  const list = w.marksOf('3')
  expect(list.length).toBe(2) // Q-74 "an appended record": a second one
  expect(list[0]).toEqual(first) // the first kept as it was
  expect(list[1].mark).toBe('void') // Q-74: the newest record is the ❌ the prime just made (`void`, D-T14-tool-names)
})

// R-C15-78 · Q-74 "the newest record is the note's current mark" · spec L477-478 · Q-90 `#n ❌` before its text.
test('after that the note\'s current mark is ❌, the newest record', SLOW, async ($, on) => {
  const w = world(on, { marks: [rec('3', 'ok', 'prime', 'checked by the prime', PRIME)] })
  await w.begin($)
  await mark($, '3', 'void', 'the check was wrong')
  expect(w.marksOf('3').at(-1)?.mark).toBe('void') // the newest record is ❌
  const out = text(await call($, 'memory_recall', { pattern: 'tokN3', include_void: true }))
  expect(lineOf(out, '#3 ').startsWith('#3 ❌')).toBe(true) // Q-74: the current mark is the newest, ❌ (Q-90 display)
})

// R-C15-80, R-C15-166 · Q-74 "`clear` (key and tool value) returns it to unmarked" · spec L478-479.
test('memory_mark with mark clear returns a marked note to unmarked', SLOW, async ($, on) => {
  const w = world(on, { marks: [rec('3', 'ok', 'prime', 'checked by the prime', PRIME)] })
  await w.begin($)
  await mark($, '3', 'clear', 'not checked after all')
  expect(w.marksOf('3').at(-1)?.mark).toBe('clear') // Q-74: a `clear` record is the newest
  const out = text(await call($, 'memory_recall', { pattern: 'tokN3', include_void: true }))
  const line = lineOf(out, '#3 ')
  expect(line).toContain('tokN3') // the #3 line is the note (fixture NOTES[3])
  expect(line).not.toContain('✅') // unmarked: neither confirmed (L414)
  expect(line).not.toContain('❌') // nor void
})

// R-C15-81 · Q-74 "Every record stays in the log". GV3 removed the guard that read the fixture's mark records after a
// clear: the fixture store only appends, and the real log (lib/memstore.mjs) cannot be loaded here (a test file may
// import only relative files and claude-code, and memstore imports node:fs), so no change could fail it.

// R-C15-83, R-C15-167 · Q-74 "A mark by the prime cannot replace one by the operator" · spec L480-481.
test('a memory_mark call from the prime on a note the operator marked returns an error result', SLOW, async ($, on) => {
  const w = world(on, { marks: [rec('3', 'ok', 'operator', 'checked by hand')] }) // fixture: #3 ✅ by the operator (from the pane)
  await w.begin($)
  const r = await mark($, '3', 'void', 'looks wrong')
  expect(isErrorResult(r)).toBe(true) // Q-74: refused (D-T14-mark-messages words it)
})

// R-C15-83 · Q-74 "A mark by the prime cannot replace one by the operator".
// guard per _orch/inbox/OQ7.answer.md (deviation from spec L19-20, L100): holds at da5910c (work/probe-da5910c.md P-C36).
test('guard: after the prime\'s refused call the note\'s current mark is still the operator\'s', SLOW, async ($, on) => {
  const seed = [rec('3', 'ok', 'operator', 'checked by hand')] // fixture: #3 ✅ by the operator
  const w = world(on, { marks: seed })
  await w.begin($)
  const r = await mark($, '3', 'void', 'looks wrong')
  expect([isErrorResult(r), errorText(r)], 'the memory_mark call was not refused').toEqual([true, "refused: the operator's mark stands (Q-74)"]) // fixture: P3-d3, the prime's call was refused (Q-74)
  expect(w.marksOf('3')).toEqual(seed) // the operator's record is still the newest, so the current mark (Q-74)
})

// ------------------------------------------------------------------ a mark on a summary (Q-75)

// R-C15-97, R-C15-168 · Q-75 "❌ on a summary voids that summary, which is rebuilt from its children (their marks
// unchanged)" · spec L490-491.
// guard per _orch/inbox/OQ7.answer.md (deviation from spec L19-20, L100): at da5910c no call changes a mark
// (work/probe-da5910c.md P-C37); it pins that a summary's ❌ keeps its children's marks.
test('guard: a child note marked ✅ before its summary is marked ❌ is still ✅ after it', SLOW, async ($, on) => {
  const seed = [rec('4', 'ok', 'prime', 'checked by the prime', PRIME)] // fixture: #4 ✅, a child of L1 #4-5
  const w = world(on, { marks: seed })
  await w.begin($)
  await mark($, '4-5', 'void', 'the summary misreads #5')
  await w.drain()
  expect(w.marksOf('4-5').map((m) => m.mark), 'the summary #4-5 was not marked ❌').toEqual(['void']) // fixture: P3-d3, the summary over #4 carries the ❌
  expect(w.marksOf('4')).toEqual(seed) // Q-75 "their marks unchanged": #4's newest record is still ✅
})

// R-C15-95 · Q-75 "❌ on a summary voids that summary" · spec L490 · Q-76: shown again once rebuilt.
test('marking a summary ❌ removes that summary\'s text from memory_wake\'s output once it is rebuilt', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  await mark($, '4-5', 'void', 'the summary misreads #5')
  await w.drain()
  for (const budget of [4, 96]) {
    const out = text(await call($, 'memory_wake', { budget })) // budget 4 shows the block #4-5
    expect(out).not.toContain('tokS1x2') // Q-75: the void summary's own text (fixture L1 #4-5) is gone
  }
})

// R-C15-96 · Q-75 "which is rebuilt from its children" · spec L491.
test('marking a summary ❌ rebuilds it from its children', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  await mark($, '4-5', 'void', 'the summary misreads #5')
  await w.drain()
  const now = w.sum(1, 2) ?? ''
  expect(now).not.toContain('tokS1x2') // not the void summary's own text
  expect(now).toContain('tokN4') // rebuilt from its children, notes #4 and #5 (fixture; both unmarked)
  expect(now).toContain('tokN5') // and #5 (Q-75: a summary's ❌ is its own; its notes are unmarked)
})

// R-C15-98 · Q-75 "and every summary above it is rebuilt from the new one." · spec L491-492.
test('marking an L1 summary ❌ rebuilds the L2 summary above it from the new L1 summary', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  await mark($, '4-5', 'void', 'the summary misreads #5')
  await w.drain()
  const l1 = w.sum(1, 2) ?? ''
  const l2 = w.sum(2, 1) ?? ''
  expect(l1).not.toBe(SUMMARIES['1:2']) // the L1 #4-5 was rebuilt
  expect(l2).not.toBe(SUMMARIES['2:1']) // the L2 #4-7 above it was rebuilt
  expect(l2).not.toContain('tokS1x2') // not from the void L1 text
  expect(l2).toContain('tokS1x3') // from L1 summaries (its other child, L1 #6-7), not from the notes
  for (const t of l1.match(TOKEN_RE) ?? []) expect(l2).toContain(t) // from the new L1 summary
})

// ------------------------------------------------------------------ memory_zoom (Q-77)

const ZOOM_SEED = [rec('5', 'void', 'operator', 'a monitor session wrote it (T7)')] // fixture: #5 ❌, by the operator from the pane

// R-C15-110, R-C15-171 · Q-77 "zoom skips ❌ notes unless called with `include_void: true`" · spec L500.
test('memory_zoom over a range holding a ❌ note, without include_void, does not show that note', SLOW, async ($, on) => {
  const w = world(on, { marks: ZOOM_SEED })
  await w.begin($)
  const out = text(await call($, 'memory_zoom', { range: '4-7' }))
  expect(out).not.toContain(VOID_TEXT) // Q-77: skipped
  expect(out).toContain('tokN6') // the zoom answered (an unmarked note in the range, fixture #6)
})

// R-C15-111 · Q-77 "then they are shown with ❌" · spec L500-501 · Q-90 `#n ❌` before its text.
test('memory_zoom over that range with include_void true shows the note with ❌', SLOW, async ($, on) => {
  const w = world(on, { marks: ZOOM_SEED })
  await w.begin($)
  const out = text(await call($, 'memory_zoom', { range: '4-7', include_void: true }))
  const line = out.split('\n').find((l) => l.includes(NOTES[VOID_NOTE].text)) ?? ''
  expect(line).toContain('❌') // Q-77 "shown with ❌"
  expect(line.startsWith('#5 ❌')).toBe(true) // Q-90 `#n ❌` before its text
})

// R-C15-112 · Q-77 "then they are shown with ❌ and their reason." · spec L501.
test('memory_zoom over that range with include_void true shows the note\'s mark reason', SLOW, async ($, on) => {
  const w = world(on, { marks: ZOOM_SEED })
  await w.begin($)
  const out = text(await call($, 'memory_zoom', { range: '4-7', include_void: true }))
  const line = out.split('\n').find((l) => l.includes(NOTES[VOID_NOTE].text)) ?? ''
  expect(line).toContain('a monitor session wrote it (T7)') // Q-77 "and their reason" (fixture ZOOM_SEED reason)
})

// ------------------------------------------------------------------ unmarked is the default (guards)

// R-C15-05 · spec L414 "Unmarked is the default, and means neither confirmed nor void." · as at da5910c.
// guard per _orch/inbox/OQ7.answer.md (deviation from spec L19-20, L100); work/guard-evidence.md, probe P-C46.
test('guard: an unmarked note is shown by memory_wake, as at da5910c', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  const out = text(await call($, 'memory_wake'))
  expect(out).toContain(NOTES[6].text) // L414: an unmarked note (fixture #6) is not void, so wake shows it
})

// R-C15-05 · spec L414 "Unmarked is the default, and means neither confirmed nor void." · as at da5910c.
// guard per _orch/inbox/OQ7.answer.md (deviation from spec L19-20, L100); work/guard-evidence.md, probe P-C47.
test('guard: an unmarked note is returned by memory_recall, as at da5910c', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($)
  const out = text(await call($, 'memory_recall', { pattern: 'tokN6' }))
  expect(out).toContain(NOTES[6].text) // L414: an unmarked note (fixture #6) is returned
})
