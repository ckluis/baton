// node --test — FF1 red 2: a staging command whose directory, repository or paths are not plainly
// written on the line.
//
// Each case is checked against real fixture repositories built in a temp dir by this file: <top>/D
// (the command's working directory) and <top>/A, a sibling repository; whichever the case needs holds
// an untracked forbidden file. What the line lets the check work out it must work out (`~` and
// $HOME, $PWD, `cd -`, a plain VAR=value set earlier on the line, env/export of GIT_DIR, GIT_WORK_TREE,
// GIT_INDEX_FILE, env -C) and refuse with the forbidden paths it found ("hits"); what it cannot (any
// other variable, a command substitution, a loop variable, xargs or find -exec feeding git) it must
// refuse with a plain reason ("reason"). A directory changed only inside a subshell, a pipeline
// element or a shell run by the line does not move the commands after it. The same resolvable
// commands against clean trees are allowed.
//
// API (ledger.mjs): stagedForbidden(command, { cwd, run, home?, patterns? }) resolves to
// { hits, reason }. `home` is the user's home directory when the caller gives one; absent, the
// check never reads HOME (R-C3-13) and a staging line using ~ or $HOME is refused with a reason.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, execFile } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as ledger from '../lib/ledger.mjs'

const G = ['-c', 'user.name=ff1', '-c', 'user.email=ff1@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null']
const git = (cwd, ...args) => execFileSync('git', [...G, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString()

/** The real programs, as `$.process.run` answers (init.env set over this process's environment). */
const run = (argv, init = {}) =>
  new Promise((resolve) => {
    execFile(argv[0], argv.slice(1), { cwd: init.cwd, env: { ...process.env, ...(init.env ?? {}) } }, (err, stdout, stderr) => {
      resolve({ exitCode: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    })
  })

const SECRET = { '.env': 'SECRET=1\n', 'dir/.env': 'SECRET=2\n', 'dir/a.txt': 'a\n', 'notes.txt': 'n\n' }
const CLEAN = { 'env.txt': 'not a secret\n', 'dir/a.txt': 'a\n', 'notes.txt': 'n\n' }

/** A repository at <top>/<name> with README.md committed and `files` written, untracked. */
function repo(top, name, files) {
  const r = join(top, name)
  mkdirSync(r, { recursive: true })
  git(r, 'init', '-q')
  writeFileSync(join(r, 'README.md'), 'readme\n')
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(join(r, p, '..'), { recursive: true })
    writeFileSync(join(r, p), text)
  }
  git(r, 'add', '--', 'README.md')
  git(r, 'commit', '-q', '-m', 'fixture')
  return r
}

/** <top>/D and <top>/A; `dirty` names the one holding the forbidden files ('A', 'D' or null). */
function pair(dirty) {
  const top = realpathSync(mkdtempSync(join(tmpdir(), 'ff1u-')))
  const D = repo(top, 'D', dirty === 'D' ? SECRET : CLEAN)
  repo(top, 'A', dirty === 'A' ? SECRET : CLEAN)
  return { top, D }
}

/** hits (refused, the forbidden paths found), reason (refused, cannot tell) or allowed. */
async function verdict(command, opts) {
  assert.equal(typeof ledger.stagedForbidden, 'function', 'ledger.mjs exports stagedForbidden')
  const out = await ledger.stagedForbidden(command, { run, ...opts })
  if (out.reason) return 'reason'
  return out.hits.length ? 'hits' : 'allowed'
}

async function expectAll(rows, opts) {
  const got = []
  for (const [command, want] of rows) got.push([command, await verdict(command, opts)])
  assert.deepEqual(got, rows)
}

// Directories the line spells with ~, $HOME, $PWD, a variable set on it, cd -, pushd/popd, env -C.
const DIRS = [
  'cd ~/A && git add .',
  'cd ~ && cd A && git add -A',
  'cd "$HOME/A" && git add .',
  'cd ${HOME}/A && git add .',
  'cd "$PWD/../A" && git add .',
  'T=../A; cd $T && git add .',
  'T=../A && cd "$T" && git add .',
  'T=$PWD/../A; cd $T; git add .',
  'cd ../A && git add . && cd -',
  'cd .. && cd A && git add .',
  'pushd ../A && git add .',
  'env -C ../A git add .',
  'env --chdir=../A git add .',
]

test('FF1 2: a directory written with ~, $HOME, $PWD or a variable set on the line is resolved', async () => {
  const { top, D } = pair('A')
  await expectAll(
    DIRS.map((c) => [c, 'hits']),
    { cwd: D, home: top },
  )
})

test('FF1 2 guard: the same directory forms against a clean sibling are allowed', async () => {
  const { top, D } = pair(null)
  await expectAll(
    [...DIRS.map((c) => [c, 'allowed']), ['cd ../A && cd - && git add .', 'allowed']],
    { cwd: D, home: top },
  )
})

test('FF1 2: cd - goes back; a cd only in a subshell, pipeline or child shell does not move later commands', async () => {
  const { D } = pair('D')
  await expectAll(
    [
      ['cd ../A && cd - && git add .', 'hits'],
      ['(cd ../A); git add .', 'hits'],
      ['(cd ../A && true) && git add -A', 'hits'],
      ['cd ../A | true; git add .', 'hits'],
      ["sh -c 'cd ../A'; git add .", 'hits'],
      ['X=$(cd ../A && pwd); git add .', 'hits'],
      ['pushd ../A && popd && git add .', 'hits'],
    ],
    { cwd: D },
  )
})

// The repository named by env or export, before or after the program word.
const REPOS = [
  'env GIT_DIR=../A/.git GIT_WORK_TREE=../A git add .',
  'env -i GIT_DIR=../A/.git GIT_WORK_TREE=../A git add -A',
  'nice env GIT_DIR=../A/.git GIT_WORK_TREE=../A git add .',
  'export GIT_DIR=../A/.git GIT_WORK_TREE=../A; git add .',
  'export GIT_DIR=../A/.git; export GIT_WORK_TREE=../A; git add .',
  'GIT_DIR=../A/.git; GIT_WORK_TREE=../A; export GIT_DIR GIT_WORK_TREE; git add -A',
  'declare -x GIT_WORK_TREE=../A GIT_DIR=../A/.git; git add .',
  'export GIT_DIR="$PWD/../A/.git" GIT_WORK_TREE=~/A; git add .',
]

test('FF1 2: GIT_DIR / GIT_WORK_TREE set by env or export are read', async () => {
  const { top, D } = pair('A')
  await expectAll(
    REPOS.map((c) => [c, 'hits']),
    { cwd: D, home: top },
  )
})

test('FF1 2 guard: the same env/export forms against a clean sibling are allowed', async () => {
  const { top, D } = pair(null)
  await expectAll(
    REPOS.map((c) => [c, 'allowed']),
    { cwd: D, home: top },
  )
})

test('FF1 2: GIT_INDEX_FILE from env or export reaches the git it asks, resolved', async () => {
  for (const command of ['export GIT_INDEX_FILE=alt.idx; git add .', 'env GIT_INDEX_FILE=alt.idx git add .', 'GIT_INDEX_FILE=alt.idx git add -A']) {
    const asked = []
    const spy = async (argv, init = {}) => {
      asked.push({ argv, env: init.env ?? {}, cwd: init.cwd })
      return { exitCode: 0, stdout: '', stderr: '' }
    }
    const out = await ledger.stagedForbidden(command, { cwd: '/w/D', run: spy, home: '/h' })
    assert.deepEqual(out, { hits: [], reason: null }, command)
    assert.ok(asked.length > 0, command + ': git was asked')
    assert.ok(
      asked.every((q) => q.env.GIT_INDEX_FILE === '/w/D/alt.idx'),
      command + ': every ask carries GIT_INDEX_FILE=/w/D/alt.idx, got ' + JSON.stringify(asked),
    )
  }
})

test('FF1 2: a pathspec set by a plain variable on the line is read; one set again in a subshell or loop is not trusted', async () => {
  const { D } = pair('D')
  await expectAll(
    [
      ['F=.env; git add $F', 'hits'],
      ['F=.env; git add "$F"', 'hits'],
      ['F=.env && git add ${F}', 'hits'],
      ['F=.env; (F=notes.txt); git add $F', 'hits'],
      ['f=notes.txt; for f in .env; do git add "$f"; done', 'reason'],
      ['git add "$PWD/.env"', 'hits'],
      ['S=add; git $S .', 'hits'],
      ['G=git; $G add .env', 'hits'],
      ['D=dir; git add $D/', 'hits'],
    ],
    { cwd: D, home: '/nowhere' },
  )
})

// Lines whose directory, repository, subcommand or paths are not on the line: fail closed.
const UNREAD = [
  'cd $SOMEWHERE && git add .',
  'cd "$(git rev-parse --show-toplevel)" && git add .',
  'cd `dirname x` && git add -A',
  'cd ~bob && git add .',
  'export GIT_DIR=$REPO; git add .',
  'env GIT_WORK_TREE=$WT git add .',
  'git -C "$R" add .',
  'git add $F',
  'git add "$(echo .env)"',
  'git add `echo .env`',
  'git add $(git ls-files -o)',
  'for f in .env; do git add "$f"; done',
  'echo .env | xargs git add',
  'ls -a | xargs -I{} git add {}',
  'find . -name .env | xargs git add -f',
  'find . -name .env -exec git add {} +',
  'find . -name .env -exec git add {} \\;',
  'echo .env | xargs git commit -m x',
  'git commit -m x $F',
  'git $SUB .',
  '$GIT add .',
  'read f; git add "$f"',
]

test('FF1 2: when the directory, repository or paths cannot be read from the line, it fails closed', async () => {
  const { D } = pair('D')
  await expectAll(
    UNREAD.map((c) => [c, 'reason']),
    { cwd: D, home: '/nowhere' },
  )
})

test('FF1 2: fail closed even when every tree in sight is clean', async () => {
  const { D } = pair(null)
  await expectAll(
    UNREAD.map((c) => [c, 'reason']),
    { cwd: D, home: '/nowhere' },
  )
})

test('FF1 3: no home given: a staging line using ~ or $HOME is refused with a reason, and HOME is never read', async () => {
  // R-C3-13 (Q-FX7-1, Q-99 = A): the mod never builds a path from the home directory, so without a
  // `home` from the caller a line that stages from ~ or $HOME cannot be resolved and fails closed,
  // with a reason that names the home directory.
  const lines = [
    'cd ~/A && git add .',
    'cd ~ && cd A && git add -A',
    'cd "$HOME/A" && git add .',
    'cd ${HOME}/A && git commit -am x',
    'git -C ~/A add .',
    'export GIT_DIR=$HOME/A/.git GIT_WORK_TREE=$HOME/A; git add .',
  ]
  const asked = []
  const spy = async (argv, init = {}) => {
    asked.push({ argv, cwd: init.cwd, env: init.env })
    return { exitCode: 0, stdout: '', stderr: '' }
  }
  const realEnv = process.env
  const envReads = []
  process.env = new Proxy(realEnv, {
    get(t, k) {
      if (k === 'HOME') envReads.push('get')
      return Reflect.get(t, k)
    },
    has(t, k) {
      if (k === 'HOME') envReads.push('has')
      return Reflect.has(t, k)
    },
    getOwnPropertyDescriptor(t, k) {
      if (k === 'HOME') envReads.push('descriptor')
      return Reflect.getOwnPropertyDescriptor(t, k)
    },
  })
  const got = []
  try {
    for (const line of lines) {
      const out = await ledger.stagedForbidden(line, { cwd: '/w/D', run: spy })
      // The reason is plain: it says the line uses the home directory, which the mod does not read.
      got.push([line, typeof out.reason === 'string' && /home directory/.test(out.reason) ? 'reason' : JSON.stringify(out)])
    }
  } finally {
    process.env = realEnv
  }
  assert.deepEqual(got, lines.map((l) => [l, 'reason']))
  assert.deepEqual(envReads, [], 'process.env.HOME is never read')
  const homeAsks = asked.filter((q) => JSON.stringify(q.argv).match(/HOME|printenv|\benv\b|echo ~|pwd/))
  assert.deepEqual(homeAsks, [], 'run is never asked for the home directory')
})

test('FF1 2 guard: lines with substitutions that do not decide what is staged are still allowed', async () => {
  const { D } = pair(null)
  await expectAll(
    [
      ['git commit -m "$(printf x)"', 'allowed'],
      ['git commit -F "$MSG"', 'allowed'],
      ['git commit -m "cost $5" notes.txt', 'allowed'],
      ['cd $SOMEWHERE && git status', 'allowed'],
      ['echo $HOME && git log --oneline', 'allowed'],
      ['F=notes.txt; git add $F', 'allowed'],
      ['git add notes.txt dir/a.txt', 'allowed'],
      ['echo .env | xargs cat', 'allowed'],
      ['find . -name "*.txt" -exec cat {} +', 'allowed'],
    ],
    { cwd: D, home: '/nowhere' },
  )
})
