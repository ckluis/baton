// node --test — T13, part D: `python3 tools/inbox-gh.py sync` writes the asked record of a question it puts (C14).
//
// Written from the spec (docs/designs/v7.6-tuning.md L218-246, the T13 addendum) and the operator's answers BEFORE the
// implementation (node T113D, the split red step of F113). Requirement ids are the rows of
// _orch/plan/traceability.yaml, cluster C14: R-C14-31 "a question is put to the operator once the run's record on disk
// under `_orch/` shows that it was asked" (L231), R-C14-32 "Until that record names the question, it is queued." (L232).
// Q-42 (_orch/inbox/Q-42.answer.md): "A: a write-once Q-<id>.asked.md with asked_at and asked_via is the asked record."
// Handoff c25: sync "writes `_orch/inbox/Q-<id>.asked.md` holding `asked_via: thread`". Expected values come from those
// words; none is copied from the implementation.
//
// The world: a scratch `_orch` under $TMPDIR/baton-v76-T113D-* whose thread is already open
// (`_orch/inbox/github.json`, the run state `open-run` writes), and a fake `gh` that answers from memory and logs every
// call. Nothing reaches GitHub; the run's real `_orch/inbox` is never read. The scratch directory is removed after each
// test. Tests named `guard: ...` pin behaviour that already holds at da5910c (OQ7, _orch/inbox/OQ7.answer.md).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const TOOL = fileURLToPath(new URL('../../tools/inbox-gh.py', import.meta.url)) // the tool under test
const REPO = 'acme/widgets' // fixture repository
const THREAD = { kind: 'pr', number: 7, url: 'https://github.com/acme/widgets/pull/7' } // fixture: the run's thread

// A fake `gh`: comments POSTed get an id; the issue and its comments are read from memory (no answers yet).
const FAKE_GH = `#!/usr/bin/env python3
import json, os, sys
a = sys.argv[1:]
with open(os.environ["FAKE_GH_LOG"], "a") as fh: fh.write(json.dumps(a) + "\\n")
if a and a[0] == "api":
    path = [x for x in a[1:] if x.startswith("repos/")][0]
    if "-X" in a and "POST" in a and path.endswith("/comments"):
        p = os.environ["FAKE_GH_COUNTER"]; n = int(open(p).read() or "0") + 1; open(p, "w").write(str(n))
        sys.stdout.write(json.dumps({"id": 500 + n, "html_url": "https://github.com/acme/widgets/pull/7#issuecomment-%d" % (500 + n), "created_at": "2026-10-19T12:00:00Z"}))
    elif path.endswith("/comments"): sys.stdout.write("[]")
    else: sys.stdout.write(json.dumps({"assignees": []}))
else:
    sys.stderr.write("fake gh: unknown %r\\n" % a); sys.exit(2)
`

// Fixture question (rule 10 step 1 shape).
const Q80 = '# Q-80 · Which date format does the export use?\n\n1. **(recommended)** ISO 8601.\n2. US style.\n\nBlocked by: docs/export.md:"dates follow the house style" (interpreted)\n'

/** A scratch `_orch` with the thread open; `posted` names questions github.json already records as posted. */
function scratch({ questions, posted = {}, files = {} }) {
  const dir = mkdtempSync(join(tmpdir(), 'baton-v76-T113D-'))
  const root = join(dir, '_orch')
  mkdirSync(join(root, 'inbox'), { recursive: true })
  writeFileSync(join(root, 'manifest.json'), JSON.stringify({ run_id: 'r1', mode: 'BUILD', target: 'docs/x.md' }) + '\n')
  writeFileSync(join(root, 'inbox', 'github.json'), JSON.stringify({ repo: REPO, thread: THREAD, questions: posted }, null, 2) + '\n')
  for (const [id, text] of Object.entries(questions)) writeFileSync(join(root, 'inbox', id + '.md'), text)
  for (const [rel, text] of Object.entries(files)) writeFileSync(join(root, rel), text)
  const gh = join(dir, 'gh')
  writeFileSync(gh, FAKE_GH)
  chmodSync(gh, 0o755)
  writeFileSync(join(dir, 'counter'), '0')
  const env = { ...process.env, FAKE_GH_LOG: join(dir, 'gh.log'), FAKE_GH_COUNTER: join(dir, 'counter') }
  const sync = () => execFileSync('python3', [TOOL, 'sync', '--state-root', root, '--repo', REPO, '--gh', gh], { encoding: 'utf8', env })
  const read = (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel)) : null)
  const posts = () => Number(readFileSync(join(dir, 'counter'), 'utf8'))
  return { dir, root, sync, read, posts, done: () => rmSync(dir, { recursive: true, force: true }) }
}

test('missing #14 (c25): sync puts an open question it has not posted and writes _orch/inbox/Q-<id>.asked.md holding asked_via: thread', () => {
  // Requirements R-C14-31 (L231), R-C14-32 (L232). Q-42 (_orch/inbox/Q-42.answer.md): "a write-once Q-<id>.asked.md
  // with asked_at and asked_via is the asked record". Handoff c25: "holding `asked_via: thread`".
  const s = scratch({ questions: { 'Q-80': Q80 } })
  try {
    s.sync()
    assert.equal(s.posts(), 1) // the question was put on the thread (fixture: one open, unposted question)
    const asked = String(s.read('inbox/Q-80.asked.md') ?? '')
    assert.match(asked, /^asked_via: thread$/m) // c25, Q-42: the record says how it was asked
  } finally {
    s.done()
  }
})

test('missing #15 (c26): the Q-<id>.asked.md that sync writes holds an asked_at: line', () => {
  // Requirement R-C14-31 (L231). Q-42 (_orch/inbox/Q-42.answer.md): the asked record has "asked_at and asked_via".
  const s = scratch({ questions: { 'Q-80': Q80 } })
  try {
    s.sync()
    const asked = String(s.read('inbox/Q-80.asked.md') ?? '')
    assert.match(asked, /^asked_at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/m) // Q-42; Q-42.md option 1: `asked_at` (measured, rule 7.1), a time stamp like rule 10's measured `synced_at`
  } finally {
    s.done()
  }
})

test('guard: c27 a second sync leaves an existing Q-<id>.asked.md byte-identical', () => {
  // Requirement R-C14-31 (L231). Q-42 (_orch/inbox/Q-42.answer.md): the asked record is "write-once". Handoff c27: "a
  // second `python3 tools/inbox-gh.py sync` leaves an existing `Q-<id>.asked.md` byte-identical".
  // Fixture: Q-80 was put by an earlier sync (github.json records its comment; its asked record exists, as that sync
  // wrote it). Q-81 was asked from the pane before any sync posted it (Q-45, _orch/inbox/Q-45.answer.md: "answering a
  // queued question first writes the asked record (asked_via: pane)"); sync now posts it, and its record must stay.
  const rec80 = 'asked_at: 2026-10-19T10:00:00Z\nasked_via: thread\n' // fixture: the record the first sync wrote (Q-42 fields)
  const rec81 = 'asked_at: 2026-10-19T11:00:00Z\nasked_via: pane\n' // fixture: the pane's record (Q-45)
  const s = scratch({
    questions: { 'Q-80': Q80, 'Q-81': Q80.replace(/Q-80/g, 'Q-81'), 'Q-82': Q80.replace(/Q-80/g, 'Q-82') }, // GV4 sweep (P3-d4): Q-82, put by this sync with no record yet
    posted: { 'Q-80': { comment_id: 501, url: 'https://github.com/acme/widgets/pull/7#issuecomment-501', answered: false } },
    files: { 'inbox/Q-80.asked.md': rec80, 'inbox/Q-81.asked.md': rec81 },
  })
  try {
    s.sync()
    // GV4 sweep (P3-d4): the premise, that this sync writes the asked record of a question it puts (Q-82 had none)
    const rec82 = String(s.read('inbox/Q-82.asked.md') ?? '')
    assert.match(rec82, /^asked_via: thread$/m, 'premise: the first sync wrote the asked record of the question it put')
    s.sync()
    assert.equal(s.posts(), 2) // only Q-81 and Q-82 were newly put (fixture: Q-80 already posted)
    assert.deepEqual({ 'Q-80': String(s.read('inbox/Q-80.asked.md')), 'Q-81': String(s.read('inbox/Q-81.asked.md')), 'Q-82': String(s.read('inbox/Q-82.asked.md')) }, { 'Q-80': rec80, 'Q-81': rec81, 'Q-82': rec82 }) // Q-42: write-once, byte-identical
  } finally {
    s.done()
  }
})
