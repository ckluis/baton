// node --test — FF1 red: the forbidden-file check resolves what a command actually stages.
//
// Each case is a command run in a real fixture work tree (a git repository built in a temp dir by
// this file) that holds a forbidden file, untracked or tracked and modified as the form needs, and
// must be refused; the same command in a tree with no forbidden file is allowed (guards). Paths
// resolve against `-C`, `cd` and the command's working directory. The check asks git through the
// `run` it is given (register.js gives it `$.process.run`); here `run` is the real git.
//
// API (ledger.mjs): stagedForbidden(command, { cwd, run, patterns? }) resolves to { hits, reason }:
// hits the forbidden paths it would stage, reason a plain sentence when it cannot tell (git failed),
// else null. Refused when hits is non-empty or reason is set.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, execFile } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as ledger from '../lib/ledger.mjs'

const G = ['-c', 'user.name=ff1', '-c', 'user.email=ff1@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null']
const git = (cwd, ...args) => execFileSync('git', [...G, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString()

/** The real git, as `$.process.run` answers: exit code and output, never a throw for a non-zero exit. */
const run = (argv, init = {}) =>
  new Promise((resolve) => {
    execFile(argv[0], argv.slice(1), { cwd: init.cwd }, (err, stdout, stderr) => {
      resolve({ exitCode: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    })
  })

/**
 * A fixture: <top>/r is a repository with README.md and src/b.ts committed. `files` adds more
 * (path -> text), `tracked` lists those committed too (then each is changed after the commit, so it
 * is modified), `ignore` is the .gitignore text (committed).
 */
function fixture({ files = {}, tracked = [], ignore = null } = {}) {
  const top = realpathSync(mkdtempSync(join(tmpdir(), 'ff1-')))
  const r = join(top, 'r')
  mkdirSync(join(r, 'src'), { recursive: true })
  git(r, 'init', '-q')
  writeFileSync(join(r, 'README.md'), 'readme\n')
  writeFileSync(join(r, 'src', 'b.ts'), 'export {}\n')
  if (ignore !== null) writeFileSync(join(r, '.gitignore'), ignore)
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(join(r, p, '..'), { recursive: true })
    writeFileSync(join(r, p), text)
  }
  git(r, 'add', '--', 'README.md', 'src/b.ts', ...(ignore !== null ? ['.gitignore'] : []), ...tracked)
  git(r, 'commit', '-q', '-m', 'fixture')
  for (const p of tracked) writeFileSync(join(r, p), 'changed\n')
  return { top, r }
}

/** Refused or allowed, as the hook reads the result. */
async function verdict(command, cwd) {
  assert.equal(typeof ledger.stagedForbidden, 'function', 'ledger.mjs exports stagedForbidden')
  const out = await ledger.stagedForbidden(command, { cwd, run })
  return out.hits.length > 0 || !!out.reason ? 'refused' : 'allowed'
}

async function expectAll(rows, cwdOf) {
  const got = []
  for (const [command, want] of rows) got.push([command, await verdict(command, cwdOf(command))])
  assert.deepEqual(got, rows)
}

// An untracked forbidden file at the top and one in a directory; harmless untracked files too.
const UNTRACKED = { '.env': 'SECRET=1\n', 'dir/.env': 'SECRET=2\n', 'dir/a.txt': 'a\n', 'notes.txt': 'n\n' }
// The same tree with no forbidden file.
const CLEAN = { 'env.txt': 'not a secret\n', 'dir/a.txt': 'a\n', 'notes.txt': 'n\n' }

test('FF1: global options and the working directory: -C, --git-dir/--work-tree, cd', async () => {
  const { top, r } = fixture({ files: UNTRACKED })
  // from the parent directory: the repository is r
  await expectAll(
    [
      ['git -C r add .env', 'refused'],
      ['git -C r add .', 'refused'],
      ['git -C . -C r add dir', 'refused'],
      ['git --git-dir=r/.git --work-tree=r add .env', 'refused'],
      ['git --git-dir r/.git --work-tree r add -A', 'refused'],
      ['cd r && git add .', 'refused'],
    ],
    () => top,
  )
  // in the repository itself
  await expectAll([['git add .env', 'refused']], () => r)
})

test('FF1 guard: global options and the working directory, no forbidden file', async () => {
  const { top } = fixture({ files: CLEAN })
  await expectAll(
    [
      ['git -C r add notes.txt', 'allowed'],
      ['git -C r add .', 'allowed'],
      ['git -C . -C r add dir', 'allowed'],
      ['git --git-dir=r/.git --work-tree=r add notes.txt', 'allowed'],
      ['git --git-dir r/.git --work-tree r add -A', 'allowed'],
      ['cd r && git add .', 'allowed'],
    ],
    () => top,
  )
})

test('FF1: broad add forms stage an untracked forbidden file', async () => {
  const { r } = fixture({ files: UNTRACKED })
  await expectAll(
    [
      ['git add .', 'refused'],
      ['git add -A', 'refused'],
      ['git add --all', 'refused'],
      ['git add dir/', 'refused'],
      ['git add dir', 'refused'],
      ["git add '*.env'", 'refused'],
      ['git add *.env', 'refused'],
      ["git add ':(glob)**/.env'", 'refused'],
      ['git stage .', 'refused'],
      ['git add -v -- .', 'refused'],
    ],
    () => r,
  )
})

test('FF1 guard: broad add forms in a tree with no forbidden file', async () => {
  const { r } = fixture({ files: CLEAN })
  await expectAll(
    [
      ['git add .', 'allowed'],
      ['git add -A', 'allowed'],
      ['git add --all', 'allowed'],
      ['git add dir/', 'allowed'],
      ['git add dir', 'allowed'],
      ["git add '*.txt'", 'allowed'],
      ['git stage .', 'allowed'],
      ['git add -u', 'allowed'],
    ],
    () => r,
  )
})

test('FF1: a forbidden file in a subdirectory is staged by a broad add from inside it', async () => {
  const { r } = fixture({ files: UNTRACKED })
  await expectAll([['git add .', 'refused']], () => join(r, 'dir'))
})

test('FF1: -u and commit -a take a tracked forbidden file that was modified', async () => {
  const { r } = fixture({ files: { '.env': 'SECRET=1\n' }, tracked: ['.env'] })
  await expectAll(
    [
      ['git add -u', 'refused'],
      ['git add --update', 'refused'],
      ['git commit -a -m x', 'refused'],
      ['git commit -am x', 'refused'],
      ['git commit --all -m x', 'refused'],
      ['git commit -m x .env', 'refused'],
      ['git commit -m x -- .', 'refused'],
      ['git commit -q -a -m "a message"', 'refused'],
    ],
    () => r,
  )
})

test('FF1 guard: -u and commit -a with only harmless tracked changes', async () => {
  const { r } = fixture({ files: { 'notes.txt': 'n\n', '.env': 'SECRET=1\n' }, tracked: ['notes.txt'] })
  // .env is untracked here: -u and -a do not take untracked files, so it is not staged
  await expectAll(
    [
      ['git add -u', 'allowed'],
      ['git commit -a -m x', 'allowed'],
      ['git commit -am x', 'allowed'],
      ['git commit --all -m x', 'allowed'],
      ['git commit -m x notes.txt', 'allowed'],
      ['git commit -m x', 'allowed'],
    ],
    () => r,
  )
})

test('FF1: an ignored forbidden file: plain add skips it, -f takes it', async () => {
  const { r } = fixture({ files: { '.env': 'SECRET=1\n', 'notes.txt': 'n\n' }, ignore: '.env\n' })
  await expectAll(
    [
      ['git add .', 'allowed'],
      ['git add -A', 'allowed'],
      ['git add -f .', 'refused'],
      ['git add --force -A', 'refused'],
      ['git add -f .env', 'refused'],
    ],
    () => r,
  )
})

test('FF1: fails closed when git cannot say what would be staged', async () => {
  assert.equal(typeof ledger.stagedForbidden, 'function', 'ledger.mjs exports stagedForbidden')
  const failing = async () => ({ exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' })
  const throwing = async () => {
    throw new Error('spawn failed')
  }
  for (const r of [failing, throwing]) {
    for (const c of ['git add .', 'git add -A', 'git commit -am x', 'git -C r add dir/']) {
      const out = await ledger.stagedForbidden(c, { cwd: '/nowhere', run: r })
      assert.equal(typeof out.reason, 'string', c)
      assert.ok(out.reason.length > 0, c)
    }
  }
})

test('FF1 guard: commands that stage nothing never ask git', async () => {
  assert.equal(typeof ledger.stagedForbidden, 'function', 'ledger.mjs exports stagedForbidden')
  const asked = []
  const spy = async (argv) => {
    asked.push(argv.join(' '))
    return { exitCode: 128, stdout: '', stderr: 'fatal' }
  }
  for (const c of ['git status', 'git commit -m x', 'git log --all', 'ls -A', 'echo git add .', 'npm test']) {
    const out = await ledger.stagedForbidden(c, { cwd: '/nowhere', run: spy })
    assert.deepEqual(out, { hits: [], reason: null }, c)
  }
  assert.deepEqual(asked, [])
})

test('FF1: a forbidden name on the line is refused without asking git', async () => {
  assert.equal(typeof ledger.stagedForbidden, 'function', 'ledger.mjs exports stagedForbidden')
  const out = await ledger.stagedForbidden('git -C r add deploy/id_rsa', { cwd: '/nowhere', run: async () => ({ exitCode: 0, stdout: '', stderr: '' }) })
  assert.deepEqual(out.hits, ['deploy/id_rsa'])
})
