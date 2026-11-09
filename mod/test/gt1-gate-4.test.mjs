// node --test — GT1 red 4: a here-string fed to a shell is a command line, like a heredoc.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gateFor } from '../lib/approve.mjs'

const check = (rows) => {
  for (const [c, want] of rows) assert.equal(gateFor(c)?.id ?? null, want, JSON.stringify(c))
}

test('GT1 4: a here-string into a shell runs its text', () => {
  check([
    ["bash <<< 'git -C r push'", 'push'],
    ['sh <<<"rm -f -r build"', 'rm'],
    ["bash -s <<< 'git -C r push'", 'push'],
    ["sudo bash -e <<< 'gh -R o/r pr merge 1'", 'pr'],
  ])
})

test('GT1 4 guard: a here-string into another program stays a mention', () => {
  check([
    ["cat <<< 'git -C r push'", null],
    ["cat <<< 'git push'", 'push'],
    ["bash script.sh <<< 'git -C r push'", null],
  ])
})
