// node --test — GT1 red 5: gh api's method and field flags in any short-flag spelling gh accepts,
// and git's own subcommand programs (git-core's git-push and the rest) called by name or path.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gateFor } from '../lib/approve.mjs'

const check = (rows) => {
  for (const [c, want] of rows) assert.equal(gateFor(c)?.id ?? null, want, JSON.stringify(c))
}

// gh reads short flags as pflag does: in a cluster, each letter is a flag until one that takes a
// value; that letter takes the rest of the cluster (a leading `=` dropped) or, when it ends the
// cluster, the next word. -X/--method, -f/--raw-field, -F/--field, -H, -q, -t, -p take a value.
test('GT1 5: gh api -X inside a short-flag cluster, value attached or next', () => {
  check([
    ['gh api -iXPOST repos/o/r/pulls', 'api'],
    ['gh api -iX POST repos/o/r/pulls', 'api'],
    ['gh api -iX=POST repos/o/r/pulls', 'api'],
    ['gh api -iXDELETE repos/o/r/git/refs/heads/x', 'api'],
    ['gh api -iX PUT repos/o/r/topics', 'api'],
    ['gh api -iXpatch repos/o/r', 'api'],
    ['gh api repos/o/r/pulls -iXPOST', 'api'],
    ['gh api --silent -iXPOST repos/o/r/pulls', 'api'],
  ])
})

test('GT1 5: gh api -X with its value attached, with or without =', () => {
  check([
    ['gh api -XPOST repos/o/r/pulls', 'api'],
    ['gh api -X=POST repos/o/r/pulls', 'api'],
    ['gh api -X=DELETE repos/o/r/git/refs/heads/x', 'api'],
  ])
})

test('GT1 5: gh api fields inside a short-flag cluster make gh send POST', () => {
  check([
    ['gh api -iftitle=x repos/o/r/issues', 'api'],
    ['gh api -if title=x repos/o/r/issues', 'api'],
    ['gh api -iFtitle=x repos/o/r/issues', 'api'],
    ['gh api -iF title=x repos/o/r/issues', 'api'],
    ['gh api -f=title=x repos/o/r/issues', 'api'],
  ])
})

// cobra hands every flag word on the line to the api command, also those written before `api`.
test('GT1 5: gh flags written before `api` are api flags', () => {
  check([
    ['gh -XPOST api repos/o/r/pulls', 'api'],
    ['gh -X POST api repos/o/r/pulls', 'api'],
    ['gh --method POST api repos/o/r/pulls', 'api'],
    ['gh --method=POST api repos/o/r/pulls', 'api'],
    ['gh -iXPOST api repos/o/r/pulls', 'api'],
    ['gh -f title=x api repos/o/r/issues', 'api'],
    ['gh --input body.json api repos/o/r/issues', 'api'],
  ])
})

test('GT1 5 guard: gh api reads stay reads in every spelling', () => {
  check([
    ['gh api -i repos/o/r', null],
    ['gh api -i repos/o/r/pulls', null],
    ['gh api -iXGET repos/o/r', null],
    ['gh api -iX GET repos/o/r', null],
    ['gh api -X GET repos/o/r', null],
    ['gh api -XGET repos/o/r', null],
    ['gh api -X=GET repos/o/r', null],
    ['gh api -iX=HEAD repos/o/r', null],
    ['gh api -X GET search/issues -f q=x', null],
    ['gh api -iXGET search/issues -fq=x', null],
    ['gh api -iHX-Trace:1 repos/o/r', null],
    ['gh api -iH X:1 repos/o/r', null],
    ['gh api -qX repos/o/r', null],
    ['gh api -q .X repos/o/r', null],
    ['gh -X GET api repos/o/r', null],
    ['gh -R o/r api repos/o/r', null],
    ['gh pr view 1', null],
  ])
})

// git runs its subcommands as programs in its exec path (libexec/git-core): git-push is git push.
test('GT1 5: git-core push program by path or by name, any case', () => {
  check([
    ['/Library/Developer/CommandLineTools/usr/libexec/git-core/git-push origin main', 'push'],
    ['/usr/libexec/git-core/git-push origin main', 'push'],
    ['/opt/homebrew/opt/git/libexec/git-core/git-push', 'push'],
    ['$(git --exec-path)/git-push origin main', 'push'],
    ['"$(git --exec-path)"/git-push origin main', 'push'],
    ['git-push origin main', 'push'],
    ['GIT-PUSH origin main', 'push'],
    ['/usr/LibExec/Git-Core/Git-Push origin main', 'push'],
    ['./git-push origin main', 'push'],
  ])
})

test('GT1 5: every other gated git-core program by path', () => {
  const core = '/Library/Developer/CommandLineTools/usr/libexec/git-core/'
  check([
    [core + 'git-reset --hard', 'reset'],
    [core + 'git-reset --har HEAD~1', 'reset'],
    [core + 'git-clean -fd', 'reset'],
    [core + 'git-clean --force', 'reset'],
    [core + 'git-checkout -- .', 'reset'],
    [core + 'git-checkout -f main', 'reset'],
    [core + 'git-restore .', 'reset'],
    [core + 'git-branch -D x', 'reset'],
    [core + 'git-branch -d -f x', 'reset'],
    [core + 'git-switch -f main', 'reset'],
    [core + 'git-switch --discard-changes main', 'reset'],
    [core + 'GIT-RESET --hard', 'reset'],
  ])
})

test('GT1 5: a git-core program behind wrappers and separators', () => {
  const push = '/usr/libexec/git-core/git-push origin main'
  check([
    ['sudo ' + push, 'push'],
    ['env GIT_DIR=.git ' + push, 'push'],
    ['cd r && ' + push, 'push'],
    ['true; ' + push, 'push'],
    ["bash -c '" + push + "'", 'push'],
    ['xargs ' + push + ' < /dev/null', 'push'],
    ['find . -maxdepth 0 -exec ' + push + ' \\;', 'push'],
    ['echo $(' + push + ')', 'push'],
  ])
})

test('GT1 5 guard: other git-core programs, and git-push as a word that is not the program', () => {
  const core = '/Library/Developer/CommandLineTools/usr/libexec/git-core/'
  check([
    [core + 'git-status --short', null],
    ['$(git --exec-path)/git-status --short', null],
    [core + 'git-log --oneline', null],
    [core + 'git-reset --soft HEAD~1', null],
    [core + 'git-clean -n', null],
    [core + 'git-branch -d merged', null],
    [core + 'git-restore --staged file', null],
    [core + 'git-checkout -b fix', null],
    [core + 'git-checkout-index -a', null],
    [core + 'git-push-hook-helper', null],
    ['git-pushx origin', null],
    ['my-git-push origin', null],
    ['ls ' + core + 'git-push', null],
    ['cat /tmp/git-push.log', null],
    ['cp notes/git-push.md /tmp/', null],
    ['grep -r x docs/git-push-notes', null],
    ['git log -- git-push', null],
    ['git stash push', null],
  ])
})
