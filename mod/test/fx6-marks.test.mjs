// node --test mod/test — FX6 (run build-20261019T125436Z, phase P4): rulings are refused in any letter
// case, and the T14 mark rules that held with no test able to fail on them now have one each.
//
// Written from the spec (docs/designs/v7.6-tuning.md L403-457, the operator answers L458-609) and the
// coverage gaps R-C15-119, R-C15-174, R-C15-81, R-C15-85, R-C15-200, R-C15-221 (_orch/nodes/T20/work/
// coverage-of-spec.md), never from the code. A plugin test answers the memo CLI from a fixture that only
// appends, so no product change in the real store could fail it (the verdicts' `attack`). These tests run
// the real hooks module (hooks/register.js) under a small fake runtime, as fixtures/hooks-smoke.mjs does,
// with the real memo CLI (bin/memo.mjs) and the real store (lib/memstore.mjs) on a scratch directory under
// $TMPDIR/baton-v76-FX6-*. Nothing here reads or writes this run's own memory or the project's memory.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Memory } from '../lib/memstore.mjs'

const MOD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MEMO = MOD + '/bin/memo.mjs'
const REGISTER = pathToFileURL(MOD + '/hooks/register.js').href
const REFUSED_RULINGS = 'refused: rulings are retracted, not marked' // D-T14-mark-messages, verbatim
let worlds = 0

// ------------------------------------------------------------------ the fake runtime

const memo = (args, input = '') => execFileSync(process.execPath, [MEMO, ...args], { input, encoding: 'utf8' })
const flat = (n, out = []) => {
  if (!n || typeof n !== 'object') return out
  if (Array.isArray(n)) {
    n.forEach((c) => flat(c, out))
    return out
  }
  out.push(n)
  flat(n.props?.children, out)
  return out
}
const textOf = (n) => flat(n).filter((x) => x.type === 'Text').map((x) => (x.props.children || []).join('')).join('\n')

/**
 * A fresh world: a scratch run directory (the run's prime session in it), a project memory under
 * <root>/.baton/memory with three default-store notes, two `lessons` notes and one ruling, and a fresh
 * instance of the hooks module (imported under its own URL, so no state is shared between tests).
 * `rulingsDir` is the spelling the rulings store's directory was first made with (null: no ruling yet);
 * `alias` names a symbolic link ns/<alias> -> ns/<rulingsDir> made by hand.
 */
async function world({ rulingsDir = 'rulings', alias = null } = {}) {
  const W = fs.mkdtempSync(path.join(os.tmpdir(), 'baton-v76-FX6-'))
  fs.mkdirSync(W + '/_orch', { recursive: true })
  fs.writeFileSync(W + '/_orch/manifest.json', JSON.stringify({ prime: true, run_id: 'build-fx6', mode: 'BUILD', target: '.', phase: 'P4' }))
  const PM = W + '/.baton/memory'
  for (const t of ['default note zero tokP0', 'default note one tokP1', 'default note two tokP2']) memo(['--dir', PM, 'note', '--tag', 'prime', '-'], t)
  for (const t of ['lesson zero tokL0', 'lesson one tokL1']) memo(['--dir', PM, '--ns', 'lessons', 'note', '--tag', 'prime', '-'], t)
  if (rulingsDir) memo(['--dir', PM, '--ns', rulingsDir, 'note', '--tag', 'ruling', '-'], 'PRs target main directly tokR0')
  if (rulingsDir) memo(['--dir', PM, '--ns', rulingsDir, 'note', '--tag', 'ruling', '-'], 'stage files by name tokR1')
  if (alias) fs.symlinkSync(PM + '/ns/' + rulingsDir, PM + '/ns/' + alias)
  memo(['--dir', W + '/_orch/memory', 'note', '--tag', 'prime', '-'], 'run note zero tokN0')

  const { register } = await import(REGISTER + '?fx6=' + ++worlds)
  const hooks = {}
  register((ev, a, b) => {
    const [m, f] = typeof a === 'function' ? [null, a] : [a, b]
    ;(hooks[ev] ??= []).push({ m, f })
    return { catch() {} }
  })
  const match = (m, e) => !m || Object.entries(m).every(([k, v]) => (v instanceof RegExp ? v.test(e[k]) : e[k] === v))
  const runs = [] // every process the mod ran: its argv
  const answers = [] // what the next $.ui.ask dialogs answer; a dismissed dialog when none is queued
  const asked = []
  const timers = []
  const terminal = { 'tool.call': () => ({ result: 'ran' }), 'tool.check': () => ({ decision: 'allow' }) }
  const $ = {
    plugin: { root: MOD },
    env: { get: async () => undefined },
    fs: {
      read: async (p) => fs.readFileSync(path.resolve(W, p), 'utf8'),
      write: async (p, t) => {
        fs.mkdirSync(path.dirname(path.resolve(W, p)), { recursive: true })
        fs.writeFileSync(path.resolve(W, p), t)
      },
      exists: async (p) => fs.existsSync(path.resolve(W, p)),
      // As the engine lists (FsEntry): a symbolic link is `other` with `isLink`.
      list: async (p) => fs.readdirSync(path.resolve(W, p), { withFileTypes: true }).map((d) => ({ name: d.name, kind: d.isSymbolicLink() ? 'other' : d.isDirectory() ? 'dir' : 'file', isLink: d.isSymbolicLink() })),
      // As the engine stats (FsStat): a link followed; `realPath` with `resolve`, every link followed and the
      // spelling otherwise kept (a case alias keeps its own spelling). Rejects for a missing path.
      stat: async (p, o) => {
        const q = path.resolve(W, p)
        const st = fs.statSync(q)
        return { kind: st.isDirectory() ? 'dir' : st.isFile() ? 'file' : 'other', size: st.isFile() ? st.size : 0, mtimeMs: st.mtimeMs, isLink: fs.lstatSync(q).isSymbolicLink(), ...(o?.resolve ? { realPath: fs.realpathSync(q) } : {}) }
      },
    },
    session: { cwd: async () => W, root: async () => W, id: async () => 'fx6-prime-session', surfaces: async () => ['terminal'], version: async () => ({ base: '2.1.316' }), send: async () => ({ isDelivered: true }) },
    process: {
      run: async (argv, o) => {
        runs.push(argv.map(String))
        try {
          return { exitCode: 0, stdout: execFileSync(argv[0], argv.slice(1), { input: o?.stdin ?? '', cwd: W, stdio: ['pipe', 'pipe', 'pipe'] }).toString(), stderr: '' }
        } catch (err) {
          return { exitCode: 1, stdout: '', stderr: String(err.stderr) }
        }
      },
    },
    model: { complete: async () => ({ isAnswered: true, text: 'NONE' }) },
    clock: { after: (ms, f) => timers.push(f), every: () => ({ cancel() {} }) },
    ui: {
      log: () => {},
      invalidate: () => {},
      toast: () => {},
      status: async () => ({}),
      open: async () => ({ isPlaced: true }),
      focus: async () => ({}),
      notify: async () => ({ isSent: true, channel: 'terminal' }),
      ask: async (q, opts) => {
        asked.push(q)
        const a = answers.shift()
        if (a === undefined || a === null) throw new Error('dismissed')
        return a
      },
      resolve: () => new Proxy({}, { get: (_, type) => (props) => ({ type, props }) }),
    },
    prompt: { submit: async () => ({}) },
    tool: { register: async () => ({}) },
    command: { register: async () => ({}) },
    store: { get: async () => null, set: async () => {} },
  }
  async function fire(ev, e) {
    const hs = hooks[ev] ?? []
    const go = async (i, x) => {
      for (; i < hs.length; i++) if (match(hs[i].m, x)) return hs[i].f($, x, (y) => go(i + 1, y))
      return terminal[ev] ? terminal[ev](x) : x
    }
    return go(0, e)
  }
  /** Run every queued background job (merges, rebuilds), and those they queue. */
  async function drain() {
    for (let k = 0; k < 20 && timers.length; k++) for (const f of timers.splice(0)) await f()
  }
  const render = () => fire('ui.render', { component: 'Pane', requestId: 'baton', surface: 'terminal', props: { bodyColumns: 160, scroll: { bodyRows: 200 } } })
  const byKey = (tree, k) => flat(tree).find((n) => n.props?.key === k)
  const hotkeys = (tree) => flat(tree).filter((n) => n.type === 'Button' && n.props?.hotkey)
  /** The `mem-row-<j>` open control of the table row whose text holds `token`. */
  function rowKey(tree, token) {
    const rows = flat(tree).filter((n) => n.type === 'Box' && /^mr\d+$/.test(String(n.props?.key ?? '')))
    const row = rows.find((r) => textOf(r).includes(token))
    const open = row && flat(row).find((n) => n.type === 'Button' && /^mem-row-/.test(String(n.props.key)))
    return open ? open.props.key : null
  }
  const press = async (tree, key) => {
    const b = byKey(tree, key)
    assert.ok(b, 'no drawn element ' + key + ' to press')
    await b.props.onPress()
    await drain()
    return render()
  }
  const focus = async (key) => {
    await fire('ui.focus', { component: 'Pane', requestId: 'baton', element: key, origin: { kind: 'person' } })
    return render()
  }
  /** The pane opened (/baton), its Memory view shown, then the project memory (`s`). */
  async function projectView() {
    await fire('command.run', { command: 'baton', args: '' })
    await drain()
    let t = await render()
    t = await press(t, 'tab-memory')
    t = await press(t, 'mem-store')
    assert.ok(rowKey(t, 'tokP0'), 'the project view lists no row of the default store\'s note #0:\n' + textOf(t))
    return t
  }
  const call = (tool, input = {}) => fire('tool.call', { tool: 'mcp__baton__' + tool, ...input })
  const marksPath = (ns) => PM + (ns ? '/ns/' + ns : '') + '/marks.jsonl'
  /** The mark log of a store, line by line, as the file holds it (not as any reader of it shows it). */
  const logLines = (ns) => (fs.existsSync(marksPath(ns)) ? fs.readFileSync(marksPath(ns), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])
  /** Every memo `mark` command the mod ran. */
  const markRuns = () => runs.filter((a) => a[1] === MEMO && a.includes('mark') && !a.includes('marks'))

  await fire('session.start', { cwd: W })
  await drain()
  return { W, PM, fire, drain, render, byKey, hotkeys, rowKey, press, focus, projectView, call, logLines, markRuns, runs, answers, asked }
}

// ================================================================== rulings are not marked, in any letter case

// R-C15-119 · spec L508-509 "Rulings are not marked: they keep their own retract." · L511 "With `namespace: rulings`
// it is refused with an error and makes no mark." memo keeps a namespace at <dir>/ns/<NAME>, and on a file system
// that folds letter case (this macOS host's) every spelling below names the rulings store itself; cleanNamespace
// drops every character outside A-Z a-z 0-9 _ . - before the name is used, so `Rul ings` and `R/U/L/I/N/G/S` are
// those names too.
const RULINGS_SPELLINGS = ['Rulings', 'RULINGS', 'rUlings', 'ruLINGS', 'Rul ings', 'R/U/L/I/N/G/S', ' RULINGS!']
for (const ns of RULINGS_SPELLINGS) {
  // R-C15-119
  test(`R-C15-119: project_mark with namespace ${JSON.stringify(ns)} is refused and writes no mark record`, async () => {
    const w = await world()
    const r = await w.call('project_mark', { id: '0', mark: 'void', reason: 'this ruling is old', namespace: ns })
    await w.drain()
    assert.equal(r?.deny, REFUSED_RULINGS, 'not refused as a ruling: ' + JSON.stringify(r)) // L511 "refused with an error"
    assert.deepEqual(w.markRuns(), [], 'the mod ran a memo mark command') // L511 "makes no mark"
    const nsDir = w.PM + '/ns'
    const logs = fs.readdirSync(nsDir).filter((d) => fs.existsSync(nsDir + '/' + d + '/marks.jsonl'))
    assert.deepEqual(logs, [], 'a mark log was written under ' + nsDir) // no store of the project memory holds a mark record
  })
}

// R-C15-174 · spec L556 "`project_mark` marks a project note, `project_wake` skips a ❌ one, and a ruling is not
// marked;" · L511. The store is read, not only the result text: a refusal that still writes the mark is a ruling marked.
test('R-C15-174: project_mark naming a ruling writes no mark record to the rulings store', async () => {
  const w = await world()
  const r = await w.call('project_mark', { id: '0', mark: 'void', reason: 'this ruling is old', namespace: 'rulings' })
  await w.drain()
  assert.equal(r?.deny, REFUSED_RULINGS) // L511
  assert.deepEqual(w.logLines('rulings'), []) // the rulings store's mark log holds no record
  assert.deepEqual(w.markRuns(), []) // and no memo mark command ran
  const wake = await w.call('memory_wake')
  assert.match(String(wake?.result ?? ''), /PRs target main directly/) // the ruling keeps being printed, unmarked
})

// ================================================================== every record stays in the log

// R-C15-81 · spec L477-479 "A mark is an appended record: mark, reason, who and time (Q-74). ... `clear` ... returns
// the note to unmarked. Every record stays in the log" · L420 "Nothing is deleted." After ok, void and clear on one
// note the mark log file holds all three records, oldest first.
test('R-C15-81: after ok, void and clear on one note the mark log file still holds all three records, oldest first', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baton-v76-FX6-'))
  const mem = new Memory(dir)
  mem.append('a note to mark tokM0', 'prime')
  mem.append('another note tokM1', 'prime')
  mem.mark('0', 'ok', { who: 'prime', reason: 'held in the red step' })
  mem.mark('0', 'void', { who: 'operator', reason: 'the fixture was wrong' })
  mem.mark('0', 'clear', { who: 'operator', reason: 'checked again' })
  const lines = fs.readFileSync(path.join(dir, 'marks.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  assert.deepEqual(lines.map((r) => [r.id, r.mark, r.who, r.reason]), [
    ['0', 'ok', 'prime', 'held in the red step'],
    ['0', 'void', 'operator', 'the fixture was wrong'],
    ['0', 'clear', 'operator', 'checked again'],
  ])
  assert.deepEqual(mem.marks('0').map((r) => r.mark), ['ok', 'void', 'clear']) // the reader agrees with the file
})

// ================================================================== a pane mark is an appended record

// R-C15-200 · spec L591-593 "`c`, `v` and `u` mark a project note or summary by the rules of L463-486: ... as an
// appended record. The mark is written to the project memory" · L594 "A mark from the pane on a project note records
// `operator`." The pane's mark goes after the prime's earlier one, and both stay, oldest first, in the project
// store's mark log on disk.
test('R-C15-200: a pane mark on a project note is appended after the earlier record, both kept, oldest first', async () => {
  const w = await world()
  const r = await w.call('project_mark', { id: '1', mark: 'ok', reason: 'held in the red step' })
  assert.match(String(r?.result ?? ''), /marked #1/, 'the prime\'s project_mark was not recorded: ' + JSON.stringify(r))
  let t = await w.projectView()
  t = await w.focus(w.rowKey(t, 'tokP1'))
  w.answers.push('the fixture was wrong')
  t = await w.press(t, 'mem-key-v')
  assert.deepEqual(w.logLines(null).map((x) => [x.id, x.mark, x.who]), [
    ['1', 'ok', 'prime'],
    ['1', 'void', 'operator'],
  ])
})

// ================================================================== one key per mark action

// R-C15-85 · spec L482-484 "There is one key per action, ... `c` marks ✅, `v` marks ❌ and `u` clears. They are bound
// in the Memory view only, where no other key uses them". Every key the Memory
// view draws is pressed, each in a fresh world on the same focused project row with a reason ready, and the mark
// record it leaves is read from the store: each action (confirm `ok`, void, clear) is left by exactly one key.
test('R-C15-85: each Memory-view mark action (confirm, void, clear) has exactly one key', async () => {
  const first = await world()
  const keys = first.hotkeys(await first.focus(first.rowKey(await first.projectView(), 'tokP0'))).map((b) => [b.props.key, b.props.hotkey])
  assert.ok(keys.length > 3, 'the Memory view draws too few keys: ' + JSON.stringify(keys))
  const byAction = { ok: [], void: [], clear: [] }
  for (const [key, hotkey] of keys) {
    const w = await world()
    const t = await w.focus(w.rowKey(await w.projectView(), 'tokP0'))
    const before = w.logLines(null).length
    w.answers.push('pressing every key', 'pressing every key')
    const b = w.byKey(t, key)
    if (!b || typeof b.props.onPress !== 'function') continue
    await b.props.onPress()
    await w.drain()
    for (const x of w.logLines(null).slice(before)) (byAction[x.mark] ??= []).push(hotkey)
  }
  assert.deepEqual(Object.fromEntries(Object.entries(byAction).map(([k, v]) => [k, v.length])), { ok: 1, void: 1, clear: 1 }, 'keys per action: ' + JSON.stringify(byAction))
})

// ================================================================== a pane mark acts on the opened view

// R-C15-221 · spec L591-592 "`c`, `v` and `u` mark a project note or summary ... on the focused row or the opened
// view" · Q-71 "in an opened note's or summary's view it acts on that note or summary". The ring is on note #0's
// row; note #2's view is opened with its own row control; `v` marks #2, the opened one, and leaves #0 unmarked.
test('R-C15-221: with a note\'s view opened while another row is focused, v marks the opened note', async () => {
  const w = await world()
  let t = await w.projectView()
  const open2 = w.rowKey(t, 'tokP2')
  t = await w.focus(w.rowKey(t, 'tokP0'))
  t = await w.press(t, open2)
  assert.match(textOf(t), /tokP2/, 'note #2\'s view is not open')
  assert.ok(w.byKey(t, 'md-back'), 'no opened view (no back key)')
  w.answers.push('the fixture was wrong')
  t = await w.press(t, 'mem-key-v')
  assert.deepEqual(w.logLines(null).map((x) => [x.id, x.mark, x.who]), [['2', 'void', 'operator']])
})

// ================================================================== the rulings store under any name (attempt 3)
//
// R-C15-119 · spec L508-509 "Rulings are not marked: they keep their own retract." · L587 (Q-92) "the explorer's table
// lists the project memory's notes, of every namespace except `rulings`" · L597 "`c`, `v` or `u` on a ruling row makes no
// mark". The rulings store is whatever directory memo's `--ns rulings` lands in: on a file system that folds letter case
// a directory first made as ns/Rulings is it, and so is a name whose directory is a symbolic link to it.

/** Every mark log under the project memory's namespaces (the rulings store's included, whatever its spelling). */
const nsMarkLogs = (w) => fs.readdirSync(w.PM + '/ns').filter((d) => fs.existsSync(w.PM + '/ns/' + d + '/marks.jsonl'))

// R-C15-119
test('R-C15-119: with the rulings store\'s directory spelled Rulings, the project view lists no ruling row and v on one writes no mark record', async () => {
  const w = await world({ rulingsDir: 'Rulings' })
  let t = await w.projectView()
  const k = w.rowKey(t, 'tokR1')
  if (k) {
    t = await w.focus(k)
    w.answers.push('this ruling is old')
    t = await w.press(t, 'mem-key-v')
  }
  assert.deepEqual(nsMarkLogs(w), [], 'a mark record was written under ' + w.PM + '/ns') // L597 "makes no mark"
  assert.equal(k, null, 'the project view\'s table lists the ruling tokR1 as a note row') // L587 "every namespace except `rulings`"
})

// R-C15-119
test('R-C15-119: project_wake and project_recall naming the rulings store as Rulings apply no mark record to a ruling', async () => {
  const w = await world({ rulingsDir: 'Rulings' })
  // a void record left on ruling #1 by an earlier build (as the verifier's probe left one), written with memo itself
  memo(['--dir', w.PM, '--ns', 'Rulings', '--who', 'operator', 'mark', '--', '1', 'void', '-'], 'this ruling is old')
  const wake = String((await w.call('project_wake', { namespace: 'Rulings' }))?.result ?? '')
  const recall = String((await w.call('project_recall', { namespace: 'Rulings', pattern: 'stage files' }))?.result ?? '')
  assert.match(wake, /stage files by name tokR1/, 'project_wake skipped the ruling as if it were a ❌ note:\n' + wake) // L508 "Rulings are not marked"
  assert.match(recall, /stage files by name tokR1/, 'project_recall skipped the ruling as if it were a ❌ note:\n' + recall)
})

// R-C15-119 · decision P4-FX6-d1: project_note to a spelling of `rulings` writes to the rulings store under its own name.
test('R-C15-119: project_note with namespace Rulings before any ruling makes no directory spelled Rulings', async () => {
  const w = await world({ rulingsDir: null })
  const r = await w.call('project_note', { text: 'a note for the rulings store tokX0', namespace: 'Rulings' })
  assert.match(String(r?.result ?? ''), /noted #0/, JSON.stringify(r))
  const dirs = fs.existsSync(w.PM + '/ns') ? fs.readdirSync(w.PM + '/ns') : []
  assert.ok(!dirs.includes('Rulings'), 'project_note made ' + w.PM + '/ns/Rulings: later rulings land in a store the pane lists as a namespace')
  assert.ok(dirs.includes('rulings'), 'the note is not in ' + w.PM + '/ns/rulings: ' + JSON.stringify(dirs))
})

// R-C15-119
test('R-C15-119: project_mark naming a symbolic link to the rulings store is refused and writes no mark record', async () => {
  const w = await world({ alias: 'alias' })
  const r = await w.call('project_mark', { id: '0', mark: 'void', reason: 'this ruling is old', namespace: 'alias' })
  await w.drain()
  assert.equal(r?.deny, REFUSED_RULINGS, 'not refused as a ruling: ' + JSON.stringify(r))
  assert.deepEqual(w.logLines('rulings'), [], 'the rulings store\'s mark log holds a record')
  assert.deepEqual(w.markRuns(), [])
})

// R-C15-119
test('R-C15-119: with a symbolic link to the rulings store, the project view lists no ruling row and v on one writes no mark record', async () => {
  const w = await world({ alias: 'alias' })
  let t = await w.projectView()
  const k = w.rowKey(t, 'tokR1')
  if (k) {
    t = await w.focus(k)
    w.answers.push('this ruling is old')
    t = await w.press(t, 'mem-key-v')
  }
  assert.deepEqual(w.logLines('rulings'), [], 'a mark record was written to the rulings store') // L597 "makes no mark"
  assert.equal(k, null, 'the project view\'s table lists the ruling tokR1 as a note row of [alias]')
})
