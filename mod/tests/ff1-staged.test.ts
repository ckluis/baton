// claude plugin test — FF1 red: the forbidden-file hook resolves what a Bash command stages.
//
// Operator decision B (2026-11-06, _orch/nodes/FF1/handoff.md): `git -C r add .env`, `git add .`,
// `git add -A`, `git commit -am x` passed the check because it read only literal names after
// `git add`. The hook now asks git (through $.process.run, read-only `git status`) which paths a
// broad form would include, in the directory the command resolves to, and refuses when one is
// forbidden; when git cannot say, it refuses with a plain reason (fail closed, T2's rule for this
// hook). The world beneath the plugins plays git: a fixture work tree per test, answered as
// `git status --porcelain=v1 -z` answers, for the directory the call names.
// Real-git fixtures for every form are in mod/test/ff1-staged.test.mjs; this file pins the wiring.
import { expect, test } from 'claude-code/testing'

// Answers tool.check above baton, so a call reaches tool.call (as a permission layer would).
const PERMIT = {
  name: 'permit',
  tier: 'prepend' as const,
  register(on: any) {
    on('tool.check', () => ({ decision: 'allow' }))
  },
}

const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))

// A fixture work tree: porcelain entries (XY and path) git status reports in the repository at `repo`.
type Tree = { repo: string; entries: [string, string][]; fail?: boolean }

function world(on: any, tree: Tree) {
  const ran: string[] = []
  const asked: { argv: string[]; cwd: string | undefined }[] = []
  on('fs.read', () => ({ deny: 'ENOENT' })) // no run: the forbidden-file check holds run or no run
  on('fs.write', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    if (argv.includes('note')) return { value: { exitCode: 0, stdout: JSON.stringify({ index: 0, text: '', truncated: false, merges: [] }), stderr: '' } }
    if (argv.includes('recall')) return { value: { exitCode: 0, stdout: JSON.stringify({ pattern: '.', total: 0, notes: [], blocks: [] }), stderr: '' } }
    if (argv[0] === 'git' && argv.includes('status')) {
      asked.push({ argv, cwd: e.init?.cwd })
      if (tree.fail || e.init?.cwd !== tree.repo) return { value: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' } }
      return { value: { exitCode: 0, stdout: tree.entries.map(([xy, p]) => xy + ' ' + p + '\0').join(''), stderr: '' } }
    }
    return { value: { exitCode: 0, stdout: '{}', stderr: '' } }
  })
  on('agent.spawn', (_$: any, e: any) => ({ model: e.model ?? 'claude-opus-5-5', agentId: e.prompt }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.check', () => ({ decision: 'allow' }))
  on('tool.call', (_$: any, e: any) => {
    if (e.tool === 'AskUserQuestion') return { deny: 'dismissed' }
    ran.push(e.tool + ': ' + show(e.command ?? ''))
    return { result: 'ran' }
  })
  return { ran, asked }
}

async function call($: any, input: any) {
  try {
    return { r: await $.tool.call(input), thrown: null as string | null }
  } catch (err: any) {
    return { r: undefined as any, thrown: String(err && err.message) }
  }
}

const bash = (w: { ran: string[] }) => w.ran.filter((x) => x.startsWith('Bash'))

// A tree holding an untracked .env next to harmless files.
const SECRET: [string, string][] = [['??', '.env'], ['??', 'notes.txt'], [' M', 'README.md']]
// The same tree with no forbidden file.
const HARMLESS: [string, string][] = [['??', 'notes.txt'], [' M', 'README.md']]

test('FF1: git -C r add . with an untracked .env in r is refused; git was asked in /work/r; nothing runs', { plugins: [PERMIT] }, async ($, on) => {
  const w = world(on, { repo: '/work/r', entries: SECRET })
  const { r, thrown } = await call($, { tool: 'Bash', command: 'git -C r add .', agentId: 'w1' })
  expect(thrown).toBeNull()
  expect(String(r && r.deny)).toContain('.env')
  expect(String(r && r.deny)).toContain('forbidden-file')
  expect(w.asked.length).toBeGreaterThan(0)
  expect(w.asked.every((a) => a.cwd === '/work/r')).toBe(true)
  expect(bash(w)).toEqual([])
})

test('FF1 guard: git -C r add . in a tree with no forbidden file runs', { plugins: [PERMIT] }, async ($, on) => {
  const w = world(on, { repo: '/work/r', entries: HARMLESS })
  const { r, thrown } = await call($, { tool: 'Bash', command: 'git -C r add .', agentId: 'w1' })
  expect(thrown).toBeNull()
  expect(r && r.deny).toBeUndefined()
  expect(bash(w)).toEqual(['Bash: git -C r add .'])
})

for (const command of ['git add -A', 'git add --all', 'git add dir/', "git add '*.env'"]) {
  test('FF1: ' + command + ' with an untracked .env in the working directory is refused', { plugins: [PERMIT] }, async ($, on) => {
    const w = world(on, { repo: '/work', entries: SECRET })
    const { r } = await call($, { tool: 'Bash', command })
    expect(String(r && r.deny)).toContain('.env')
    expect(bash(w)).toEqual([])
  })
  test('FF1 guard: ' + command + ' with no forbidden file runs', { plugins: [PERMIT] }, async ($, on) => {
    const w = world(on, { repo: '/work', entries: HARMLESS })
    const { r } = await call($, { tool: 'Bash', command })
    expect(r && r.deny).toBeUndefined()
    expect(bash(w)).toEqual(['Bash: ' + command])
  })
}

test('FF1: git commit -am x with a modified tracked .env is refused', { plugins: [PERMIT] }, async ($, on) => {
  const w = world(on, { repo: '/work', entries: [[' M', '.env'], [' M', 'README.md']] })
  const { r } = await call($, { tool: 'Bash', command: 'git commit -am x' })
  expect(String(r && r.deny)).toContain('.env')
  expect(bash(w)).toEqual([])
})

test('FF1 guard: git commit -am x leaves an untracked .env out, so it runs', { plugins: [PERMIT] }, async ($, on) => {
  const w = world(on, { repo: '/work', entries: SECRET })
  const { r } = await call($, { tool: 'Bash', command: 'git commit -am x' })
  expect(r && r.deny).toBeUndefined()
  expect(bash(w)).toEqual(['Bash: git commit -am x'])
})

test('FF1: when git cannot say what git add . stages, it is refused with a plain reason', { plugins: [PERMIT] }, async ($, on) => {
  const w = world(on, { repo: '/work', entries: HARMLESS, fail: true })
  const { r, thrown } = await call($, { tool: 'Bash', command: 'git add .', agentId: 'w1' })
  expect(thrown).toBeNull()
  expect(String(r && r.deny)).toMatch(/could not tell what/)
  expect(bash(w)).toEqual([])
})

test('FF1 guard: a plain commit and git status never ask git and run', { plugins: [PERMIT] }, async ($, on) => {
  const w = world(on, { repo: '/work', entries: SECRET, fail: true })
  for (const command of ['git commit -m x', 'git status']) {
    const { r } = await call($, { tool: 'Bash', command })
    expect(r && r.deny).toBeUndefined()
  }
  expect(w.asked).toEqual([])
  expect(bash(w)).toEqual(['Bash: git commit -m x', 'Bash: git status'])
})
