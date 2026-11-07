// node --test — GT1 red 2: a wrapper named by its full path is still a wrapper.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gateFor } from '../lib/approve.mjs'

test('GT1 variant: a wrapper given by its full path is stripped like the bare name', () => {
  for (const [c, want] of [
    ['/usr/bin/nohup git -C r push', 'push'],
    ['/usr/bin/builtin git -C r push', 'push'],
    ['/usr/bin/env X=1 git -C r push', 'push'],
    ['/usr/bin/sudo rm -f -r build', 'rm'],
  ])
    assert.equal(gateFor(c)?.id ?? null, want, c)
})
