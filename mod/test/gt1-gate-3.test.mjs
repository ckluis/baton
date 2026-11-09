// node --test — GT1 red 3: spelled-out irreversible commands the attempt-1 gate let through
// (the verifier's findings, _orch/nodes/GT1/handoff-attempt2.md), and guards that stay null.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gateFor } from '../lib/approve.mjs'

const check = (rows) => {
  for (const [c, want] of rows) assert.equal(gateFor(c)?.id ?? null, want, JSON.stringify(c))
}

test('GT1 3: git global options that take the next word, from git\'s own list', () => {
  check([
    ['git --attr-source HEAD push', 'push'],
    ['git --attr-source HEAD -C r reset --hard', 'reset'],
    ['git --shallow-file f push', 'push'],
    ['git --super-prefix p/ push', 'push'],
    ['git --config-env a.b=ENV push', 'push'],
    ['git --namespace x --attr-source v1 -C r push', 'push'],
  ])
})

test('GT1 3: git aliases defined on the line with -c are followed', () => {
  check([
    ['git -c alias.p=push p origin main', 'push'],
    ['git -c alias.wipe="reset --hard" wipe', 'reset'],
    ["git -c 'alias.x=!git -C r push' x", 'push'],
  ])
})

test('GT1 3: wrapper options with values inside a cluster', () => {
  check([
    ['sudo -iu bob git -C r push', 'push'],
    ['sudo -Hu bob git -C r push', 'push'],
    ['sudo -Eu bob rm -rf build', 'rm'],
    ['sudo -ubob git -C r push', 'push'],
    ['doas -u bob git -C r push', 'push'],
    ['nice -n5 git -C r push', 'push'],
    ['timeout -sKILL 5 git -C r push', 'push'],
    ['xargs -0I{} rm -r {}', 'rm'],
    ['env -iS"git -C r push"', 'push'],
  ])
})

test('GT1 3: bash, sh and zsh run -c after any cluster of options', () => {
  check([
    ["bash -euo pipefail -c 'git -C r push'", 'push'],
    ["bash -eo pipefail -c 'git -C r push'", 'push'],
    ["bash -ou pipefail -ec 'git -C r push'", 'push'],
    ["sh -eu -o errexit -c 'rm -f -r build'", 'rm'],
    ["zsh -o extendedglob -c 'git -C r push'", 'push'],
    ["bash -O extglob -euxc 'git -C r push'", 'push'],
  ])
})

test('GT1 3: git accepts any unique prefix of a long option', () => {
  check([
    ['git reset --har HEAD~1', 'reset'],
    ['git reset --ha', 'reset'],
    ['git clean --forc', 'reset'],
    ['git clean --fo -d', 'reset'],
    ['git branch --del --force x', 'reset'],
    ['git branch --delete --forc x', 'reset'],
    ['git branch --de --fo x', 'reset'],
    ['git checkout --forc main', 'reset'],
    ['git restore --work --stag .', 'reset'],
  ])
})

test('GT1 3: gh aliases for the gated commands', () => {
  check([
    ['gh pr new', 'pr'],
    ['gh pr new --fill', 'pr'],
    ['gh -R o/r pr new', 'pr'],
    ['gh release new v1', 'release'],
  ])
})

test('GT1 3: git switch throwing away local changes is a discard, like checkout -f', () => {
  check([
    ['git switch -f main', 'reset'],
    ['git switch --force main', 'reset'],
    ['git switch --discard-changes main', 'reset'],
    ['git switch --disc main', 'reset'],
    ['git -C r switch -qf main', 'reset'],
  ])
})

test('GT1 3: npm options before the subcommand, and npm\'s command abbreviations', () => {
  check([
    ['npm --loglevel silly publish', 'release'],
    ['npm --registry=x --loglevel silly publish --tag next', 'release'],
    ['npm publi', 'release'],
    ['npm pu --dry-run', 'release'],
    ['pnpm --loglevel debug publish', 'release'],
  ])
})

test('GT1 3: program names in any case (a case-insensitive filesystem runs the real program)', () => {
  check([
    ['GIT -C r push', 'push'],
    ['Git -C r push', 'push'],
    ['RM -rf build', 'rm'],
    ['Rm -Rf build', 'rm'],
    ['/USR/BIN/GIT -C r push', 'push'],
    ['GH pr merge 1', 'pr'],
    ['SUDO git -C r push', 'push'],
    ['ENV X=1 git -C r push', 'push'],
    ["BASH -c 'git -C r push'", 'push'],
    ['FIND . -delete', 'rm'],
    ['NPM publish', 'release'],
  ])
})

test('GT1 3: ANSI-C and locale quoting, and brace expansion', () => {
  check([
    ["$'git' -C r push", 'push'],
    ["$'rm' -rf build", 'rm'],
    ['$"git" -C r push', 'push'],
    ["$'\\x67it' -C r push", 'push'],
    ["$'\\147it' -C r push", 'push'],
    ["git -C r $'pu\\x73h'", 'push'],
    ['{git,-C,r,push}', 'push'],
    ['rm -{r,f} build', 'rm'],
    ['git {-C,r} push', 'push'],
    ['{sudo,git,-C,r,push}', 'push'],
  ])
})

test('GT1 3: more wrappers: setsid, xcrun, arch', () => {
  check([
    ['setsid git -C r push', 'push'],
    ['setsid -f git -C r push', 'push'],
    ['xcrun git -C r push', 'push'],
    ['xcrun --sdk macosx git -C r push', 'push'],
    ['arch -arm64 git -C r push', 'push'],
    ['arch -x86_64 rm -rf build', 'rm'],
    ['arch -arch arm64 -e A=1 git -C r push', 'push'],
  ])
})

test('GT1 3: an unlisted wrapper that names the program as a word is still read', () => {
  check([
    ['flock /tmp/lock git -C r push', 'push'],
    ['taskset 1 git -C r push', 'push'],
    ['chrt 5 rm -rf build', 'rm'],
    ['some-wrapper --opt v gh pr merge 1', 'pr'],
    ['ssh host git -C r push', 'push'],
  ])
})

test('GT1 3: the value of a git short option is not read as flags (a false alarm at the start)', () => {
  check([
    ['git switch -cfix', null],
    ['git checkout -bfix', null],
    ['git clean -efoo -n', null],
    ['git restore -sStable .', 'reset'],
  ])
})

test('GT1 3 guard: reads, other subcommands and look-alikes stay null', () => {
  check([
    ['git --attr-source HEAD log -1', null],
    ['git -c alias.p=push status', null],
    ['git -c alias.st=status st', null],
    ['git switch main', null],
    ['git switch -c new', null],
    ['git reset --soft HEAD~1', null],
    ['git restore --staged f', null],
    ['git branch -d merged', null],
    ['gh pr view 1', null],
    ['gh release view v1', null],
    ['gh pr list', null],
    ['npm run publish', null],
    ['npm test -- publish', null],
    ['npm --loglevel silly view x', null],
    ['npm p', null],
    ['npm pack', null],
    ['bash -o pipefail script.sh', null],
    ['sudo -u bob ls', null],
    ['setsid ls', null],
    ['xcrun --show-sdk-path', null],
    ['arch', null],
    ['command -v GIT', null],
    ['which GIT', null],
    ['ls git', null],
    ['cat /usr/bin/git', null],
    ['RM file', null],
    ['echo ${a,b}', null],
    ['xargs -I{} echo {}', null],
  ])
})

test('GT1 3 guard: a quoted or echoed mention stays as the v7.7 gate reads it', () => {
  check([
    ['echo "git -C r push"', null],
    ['echo git -C r push', null],
    ["echo 'gh pr new'", null],
    ["echo 'git switch -f main'", null],
    ['cat > f <<EOF\ngit switch -f main\nEOF', null],
    ['echo "git push"', 'push'],
    ["echo 'rm -rf build'", 'rm'],
    ['echo git push', 'push'],
    ['cat > f <<EOF\ngit push origin main\nEOF', 'push'],
    ['git commit -m "do not git push yet"', 'push'],
  ])
})
