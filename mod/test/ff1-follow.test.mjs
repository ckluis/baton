// node --test — FF1 red 4: a staging line that also does something the check cannot follow.
//
// The verifier's attack (_orch/nodes/FF1/verify-work-2/attack2.mjs, run at f514b26 and again at
// 90c994d) found lines the check allowed with no reason while real git staged .env: an alias defined
// on the line, a function defined and then called after a cd, a cd sourced from a here-string, CDPATH
// set on the line, and IFS set on the line. Each is one test below, with the attack's own fixture built
// here in a temp dir: <top>/D, the command's working directory (clean), beside <top>/A holding an
// untracked .env; for CDPATH, D also holds a clean directory A, so `cd A` without CDPATH lands there;
// <top>/r holds the untracked .env itself. Each must be refused with a plain reason.
//
// The rule (Q-FF1-1 = A) is one rule: a line that stages or commits and also defines an alias or a
// function, sources or evals text, feeds a shell its commands on stdin, or sets a variable that
// changes how the shell reads words, paths or commands, is refused, because the check cannot tell
// where or what it stages. The guards: ordinary add/commit lines in a clean tree are allowed, and
// ordinary lines that stage nothing are untouched (no reason, and git is never asked).
//
// API (ledger.mjs): stagedForbidden(command, { cwd, run, patterns? }) resolves to { hits, reason }.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, execFile } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as ledger from '../lib/ledger.mjs'

const G = ['-c', 'user.name=ff1', '-c', 'user.email=ff1@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null']
const git = (cwd, ...args) => execFileSync('git', [...G, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString()

/** The real programs, as `$.process.run` answers; `asked` records every call. */
function runner() {
  const asked = []
  const run = (argv, init = {}) =>
    new Promise((resolve) => {
      asked.push(argv)
      execFile(argv[0], argv.slice(1), { cwd: init.cwd, env: { ...process.env, ...(init.env ?? {}) } }, (err, stdout, stderr) => {
        resolve({ exitCode: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout), stderr: String(stderr) })
      })
    })
  return { run, asked }
}

const SECRET = { '.env': 'SECRET=1\n', 'dir/.env': 'SECRET=2\n', 'dir/a.txt': 'a\n', 'sub/x.txt': 'x\n' }
const CLEAN = { 'env.txt': 'not a secret\n', 'dir/a.txt': 'a\n', 'sub/x.txt': 'x\n' }

/** A repository at <top>/<name> with README.md and notes.txt committed and `files` written, untracked. */
function repo(top, name, files) {
  const r = join(top, name)
  mkdirSync(r, { recursive: true })
  git(r, 'init', '-q')
  writeFileSync(join(r, 'README.md'), 'readme\n')
  writeFileSync(join(r, 'notes.txt'), 'n\n')
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(join(r, p, '..'), { recursive: true })
    writeFileSync(join(r, p), text)
  }
  git(r, 'add', '--', 'README.md', 'notes.txt')
  git(r, 'commit', '-q', '-m', 'fixture')
  return r
}

const newTop = () => realpathSync(mkdtempSync(join(tmpdir(), 'ff1f-')))
/** The attack's fixtures: the directory the command runs in. */
const FIXTURES = {
  // a clean repo D (cwd) next to a dirty repo A
  twoRepos: () => {
    const top = newTop()
    repo(top, 'A', SECRET)
    return repo(top, 'D', CLEAN)
  },
  // D holds a clean directory A; the dirty repo A is D's sibling
  cdpath: () => {
    const top = newTop()
    repo(top, 'A', SECRET)
    return repo(top, 'D', { ...CLEAN, 'A/a.txt': 'a\n' })
  },
  // r holds the untracked .env
  untracked: () => repo(newTop(), 'r', SECRET),
  clean: () => repo(newTop(), 'r', CLEAN),
}

async function check(command, cwd, run) {
  assert.equal(typeof ledger.stagedForbidden, 'function', 'ledger.mjs exports stagedForbidden')
  return ledger.stagedForbidden(command, { cwd, run })
}

/** The command is refused with a plain reason. */
async function refusedWithReason(kind, command) {
  const { run } = runner()
  const out = await check(command, FIXTURES[kind](), run)
  assert.equal(typeof out.reason, 'string', 'refused with a reason: ' + JSON.stringify(command) + ' got ' + JSON.stringify(out))
  assert.ok(out.reason.length > 10, 'the reason is a sentence: ' + out.reason)
}

// The rows of attack2.mjs that got through at f514b26 (and still do at 90c994d), one test each.
const ROWS = [
  ['twoRepos', 'source /dev/stdin <<< "cd ../A"; git add .'],
  ['twoRepos', '. /dev/stdin <<< "cd ../A"; git add .'],
  ['cdpath', 'CDPATH=..; cd A && git add .'],
  ['cdpath', 'export CDPATH=..; cd A && git add .'],
  ['cdpath', 'CDPATH=.. cd A && git add .'],
  ['twoRepos', 'f() { git add -A; }; cd ../A && f'],
  ['twoRepos', 'shopt -s expand_aliases\nalias ga="git add -A"\ncd ../A\nga'],
  ['untracked', 'shopt -s expand_aliases\nalias ga="git add"\nga .env'],
  ['untracked', 'IFS=,; F=.env,notes.txt; git add $F'],
]

for (const [kind, command] of ROWS) {
  test('FF1 4: refused, the check cannot follow it: ' + JSON.stringify(command), async () => {
    await refusedWithReason(kind, command)
  })
}

// The same rule, other spellings of each kind the check does not follow (each lets real bash stage
// the .env the check does not see).
const MORE = [
  ['twoRepos', 'echo "cd ../A && git add ." | bash'],
  ['twoRepos', 'function f { git add -A; }; cd ../A && f'],
  ['twoRepos', 'trap "cd ../A" DEBUG; git add .'],
  ['cdpath', ': ${CDPATH:=..}; cd A && git add .'],
  ['cdpath', 'declare CDPATH=..; cd A && git add .'],
  ['twoRepos', 'cd sub; OLDPWD=../../A; cd - && git add .'],
  ['untracked', 'read -r IFS <<< ,; F=.env,notes.txt; git add $F'],
  ['twoRepos', 'BASH_ENV=/dev/stdin bash -c "git add ." <<< "cd ../A"'],
]

test('FF1 4: the same rule for other spellings: piped shell, function keyword, trap, ${CDPATH:=}, declare, OLDPWD, read IFS, BASH_ENV', async () => {
  const got = []
  for (const [kind, command] of MORE) {
    const { run } = runner()
    const out = await check(command, FIXTURES[kind](), run)
    got.push([command, typeof out.reason === 'string' ? 'reason' : out.hits.length ? 'hits' : 'allowed'])
  }
  assert.deepEqual(got, MORE.map(([, c]) => [c, 'reason']))
})

// Guards: ordinary staging lines in a clean tree are allowed (and git is asked where it matters).
const ORDINARY = [
  'git add notes.txt',
  'git add .',
  'git add -A',
  'git add -A && git commit -m "fix parse() and eval of f() in alias handling"',
  'git commit -am x',
  'git commit -m x -- notes.txt',
  "cd dir && git add . && git commit -m 'IFS and CDPATH notes'",
  'set -e; git add -A',
  'set -euo pipefail; git add notes.txt && git commit -m x',
  'export FOO=1; git add .',
  'git add . && echo "source done"',
  'git -C sub add .',
]

test('FF1 4 guard: ordinary git add / commit lines in a clean tree are allowed', async () => {
  const got = []
  for (const command of ORDINARY) {
    const { run } = runner()
    const out = await check(command, FIXTURES.clean(), run)
    got.push([command, out.reason ?? (out.hits.length ? 'hits' : 'allowed')])
  }
  assert.deepEqual(got, ORDINARY.map((c) => [c, 'allowed']))
})

// Guards: lines that stage nothing are untouched, whatever they define, source or set.
const NO_STAGING = [
  "alias ll='ls -l'; ll",
  'f() { echo hi; }; f',
  'function g { ls; }; g',
  'IFS=, read -r a b <<< "1,2"; echo $a',
  'source venv/bin/activate && pytest -q',
  '. ./env.sh; make',
  'eval "$(ssh-agent -s)"',
  'CDPATH=.. cd A && ls',
  "bash <<< 'echo hi'",
  'echo hi | sh',
  'shopt -s nullglob; ls *.txt',
  "trap 'echo bye' EXIT; make",
  'export PATH="$PWD/bin:$PATH"; git status',
  'git log --oneline -5',
]

test('FF1 4 guard: lines that stage nothing are untouched, and git is never asked', async () => {
  const got = []
  const asks = []
  for (const command of NO_STAGING) {
    const { run, asked } = runner()
    const out = await check(command, FIXTURES.untracked(), run)
    got.push([command, out.reason ?? (out.hits.length ? 'hits' : 'allowed')])
    asks.push(...asked)
  }
  assert.deepEqual(got, NO_STAGING.map((c) => [c, 'allowed']))
  assert.deepEqual(asks, [])
})
