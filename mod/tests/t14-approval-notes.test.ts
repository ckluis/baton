// claude plugin test — T14 (C15), part F: the two approval notes (Q-81) and the unchanged command gate (Q-87).
//
// Spec: /Users/clank/Desktop/projects/baton/docs/designs/v7.6-tuning.md L403-457, operator answers L458-564.
// Pinned answers (quoted by T114A in _orch/nodes/T114A/work/t14-answers.md):
//   Q-81: "at approval the note records what was approved and the commands the shell would run, parsed with
//          heredoc bodies and quoted strings treated as data (so `cat > f <<EOF … git push … EOF` reads
//          `writes f`); after the command, a second note records its exit code and what it changed that the
//          mod can see (files written, refs pushed)."
//   Q-87: "Keep asking: the gate's matching is not changed (asking too often is the safe failure)"
// Note words: display detail D-T14-approval-notes (_orch/plan/decisions/D-T14-approval-notes.md):
//   at approval `operator approved for <who>: <effects>` (`writes <file>`, `pushes <remote> <ref>`, `runs <name>`),
//   after the command `approved command for <who> finished: exit <n>` then `; wrote <file>` / `; pushed <ref>`.
//
// Every memory here is a fixture: the memo CLI is faked through process.run, so no test reads or writes a
// real memory store (Q-85). Nothing is pushed: the Bash tool itself is faked below and runs nothing.
import { expect, test } from 'claude-code/testing'

const ACTIVE = JSON.stringify({ run_id: 't', mode: 'BUILD', prime: true })

type Note = { tag: string; text: string }

/**
 * A run with one worker two levels down. Every note the mod writes is captured with the moment it was
 * written: `before` holds the notes written before the faked Bash ran, `after` those written after it.
 * The faked Bash returns `bash` as its result object (stdout, stderr, interrupted, exitCode).
 */
function world(on: any, opts: { answers?: any[]; bash?: { stdout?: string; stderr?: string; exitCode?: number } } = {}) {
  const asked: { q: string; options: string[] }[] = []
  const notes: Note[] = []
  const ran: string[] = []
  let ranAt = -1
  const answers = [...(opts.answers ?? [])]
  on('fs.read', (_$: any, e: any) => (e.path.endsWith('_orch/manifest.json') ? { value: ACTIVE } : { deny: 'ENOENT' }))
  on('fs.write', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    if (argv.includes('note')) {
      notes.push({ tag: argv[argv.indexOf('--tag') + 1], text: String(e.init?.stdin ?? '') })
      return { value: { exitCode: 0, stdout: JSON.stringify({ index: notes.length - 1, text: '', truncated: false, merges: [] }), stderr: '' } }
    }
    if (argv.includes('recall')) return { value: { exitCode: 0, stdout: JSON.stringify({ pattern: '.', total: 0, notes: [], blocks: [] }), stderr: '' } }
    return { value: { exitCode: 0, stdout: '{}', stderr: '' } }
  })
  on('agent.spawn', (_$: any, e: any) => ({ model: e.model ?? 'claude-opus-5-5', agentId: e.prompt }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', (_$: any, e: any) => {
    if (e.tool === 'Bash') {
      ran.push(e.command)
      ranAt = notes.length
      const b = opts.bash ?? {}
      return { result: { stdout: b.stdout ?? '', stderr: b.stderr ?? '', interrupted: false, exitCode: b.exitCode ?? 0 } }
    }
    if (e.tool !== 'AskUserQuestion') return { result: 'ran' }
    const q = e.questions[0]
    const options = q.options.map((o: any) => o.label)
    asked.push({ q: q.question, options })
    const a = answers.shift()
    if (a === undefined) return { deny: 'dismissed' }
    return { result: { questions: e.questions, answers: { [q.question]: a } } }
  })
  on('tool.check', () => ({ decision: 'allow' }))
  return {
    asked,
    notes,
    ran,
    /** approval-tagged notes written before the command ran: the note at approval */
    before: () => notes.slice(0, ranAt < 0 ? notes.length : ranAt).filter((n) => n.tag === 'approval'),
    /** every note written after the command ran */
    after: () => (ranAt < 0 ? [] : notes.slice(ranAt)),
  }
}

async function tree($: any) {
  await $.agent.spawn({ prompt: 's1', description: 'P3', subagentType: 'baton:sub-orchestrator' } as any)
  await $.agent.spawn({ prompt: 'w1', description: 'T7', subagentType: 'baton:worker-cheap', parentAgentId: 's1' } as any)
}

async function approveRun($: any, w: ReturnType<typeof world>, command: string) {
  await tree($)
  const r: any = await $.tool.call({ tool: 'Bash', command, agentId: 'w1' } as any)
  // the fixture approves, so the command runs (precondition, not this file's property)
  expect(w.ran).toEqual([command])
  return r
}

// --- criterion 1 -----------------------------------------------------------------------------------------
// requirement: R-C15-28, R-C15-53 (traceability.yaml)
// spec L437-438: "An approval note records what the approved command actually did. Writing a file is not a
// push: notes #33 and #37 recorded heredoc file writes as push approvals."
test('approving a heredoc file write records an approval note that does not say push', async ($, on) => {
  // fixture: a heredoc write whose body mentions git push (the shape of notes #33 and #37, spec L438),
  // so the unchanged gate asks it (Q-87) and the operator approves it
  const command = "cat > _notes/handoff.md <<'EOF'\nStep 3: git push origin baton/run\nEOF"
  const w = world(on, { answers: ['Approve'] })
  await approveRun($, w, command)
  const at = w.before()
  expect(at).toHaveLength(1) // one note at approval (Q-81: "at approval the note records what was approved")
  // expected: no "push" anywhere in the note — spec L437 "Writing a file is not a push"
  expect(at[0].text).not.toMatch(/push/i)
})

// --- criterion 2 -----------------------------------------------------------------------------------------
// requirement: R-C15-149, R-C15-178 (traceability.yaml)
// Q-81: "so `cat > f <<EOF … git push … EOF` reads `writes f`"; spec L533 same words;
// D-T14-approval-notes: "the note at approval reads `operator approved for <who>: <effects>`"
test('approving cat > f <<EOF … git push … EOF records an approval note reading writes f', async ($, on) => {
  // fixture: the exact command shape Q-81 names
  const command = 'cat > f <<EOF\nthen git push origin main\nEOF'
  const w = world(on, { answers: ['Approve'] })
  await approveRun($, w, command)
  const at = w.before()
  expect(at).toHaveLength(1) // one note at approval (Q-81: "at approval the note records what was approved")
  // expected `operator approved for <who>: writes f` — Q-81 "reads `writes f`", wording from D-T14-approval-notes
  expect(at[0].text).toMatch(/^operator approved for .+: writes f$/)
})

// --- criterion 3 -----------------------------------------------------------------------------------------
// requirement: R-C15-148 (traceability.yaml)
// Q-81: "parsed with heredoc bodies and quoted strings treated as data"; spec L533 same words
test('approving a command with git push inside a quoted string records an approval note that does not say push', async ($, on) => {
  // fixture: `git push` only inside a quoted argument, so the unchanged gate still asks it (Q-87)
  const command = 'git commit -m "tidy up before git push"'
  const w = world(on, { answers: ['Approve'] })
  await approveRun($, w, command)
  const at = w.before()
  expect(at).toHaveLength(1) // one note at approval (Q-81: "at approval the note records what was approved")
  // expected: a quoted string is data (Q-81), so the note names no push (D-T14-approval-notes: `runs git`)
  expect(at[0].text).not.toMatch(/push/i)
})

// --- criterion 4 -----------------------------------------------------------------------------------------
// requirement: R-C15-145, R-C15-150, R-C15-179 (traceability.yaml)
// Q-81: "after the command, a second note records its exit code"; spec L534-535 "After the command, a second
// note records its exit code"; D-T14-approval-notes "`approved command for <who> finished: exit <n>`"
test('after an approved command finishes, a second note records its exit code', async ($, on) => {
  // fixture: the faked Bash exits 1 (a rejected push)
  const w = world(on, { answers: ['Approve'], bash: { stderr: 'rejected', exitCode: 1 } })
  await approveRun($, w, 'git push origin v7')
  // expected `exit 1`: the fixture's exit code, in the words of D-T14-approval-notes ("finished: exit <n>")
  expect(w.after().some((n) => /\bfinished: exit 1\b/.test(n.text))).toBe(true)
})

// --- criterion 5 -----------------------------------------------------------------------------------------
// requirement: R-C15-151 (traceability.yaml)
// Q-81: "a second note records its exit code and what it changed that the mod can see (files written, refs
// pushed)"; spec L535; D-T14-approval-notes "then `; wrote <file>` for each file written"
test('after an approved heredoc write finishes, the second note names the file written', async ($, on) => {
  // fixture: a heredoc write of notes/plan.md whose body holds git push, so it is asked and approved
  const command = 'cat > notes/plan.md <<EOF\nlater: git push origin v7\nEOF'
  const w = world(on, { answers: ['Approve'] })
  await approveRun($, w, command)
  // expected `wrote notes/plan.md`: the fixture's file, in the words of D-T14-approval-notes
  expect(w.after().some((n) => /\bwrote notes\/plan\.md\b/.test(n.text))).toBe(true)
})

// --- criterion 6 -----------------------------------------------------------------------------------------
// requirement: R-C15-151 (traceability.yaml)
// Q-81: "what it changed that the mod can see (files written, refs pushed)"; spec L535;
// D-T14-approval-notes "`; pushed <ref>` for each ref pushed"
test('after an approved git push finishes, the second note names the ref pushed', async ($, on) => {
  // fixture: a push of the ref v7 that exits 0
  const w = world(on, { answers: ['Approve'], bash: { stderr: 'To origin\n * [new branch] v7 -> v7', exitCode: 0 } })
  await approveRun($, w, 'git push origin v7')
  // expected `pushed … v7`: the fixture's ref, in the words of D-T14-approval-notes ("; pushed <ref>")
  expect(w.after().some((n) => /\bpushed\b.*\bv7\b/.test(n.text))).toBe(true)
})

// --- criterion 9 (GUARD: holds at da5910c, work/guard-evidence.md, approval _orch/inbox/OQ7.answer.md) ----
// requirement: R-C15-27, R-C15-146 (traceability.yaml)
// spec L437 "An approval note records what the approved command actually did."; Q-81 "at approval the note
// records what was approved"; D-T14-approval-notes "`pushes <remote> <ref>` for a `git push` outside a
// heredoc body or quoted string"
test('guard: approving git push records an approval note that says it is a push', async ($, on) => {
  const w = world(on, { answers: ['Approve'] })
  await approveRun($, w, 'git push origin v7')
  const at = w.before()
  expect(at).toHaveLength(1) // one note at approval, as at da5910c (work/probe-da5910c.md P1) and Q-81
  // expected: the note says push — da5910c writes `operator approved (push) …` (work/probe-da5910c.md P1),
  // D-T14-approval-notes writes `pushes origin v7`; both say push outside the echoed command
  expect(at[0].text.replace('git push origin v7', '')).toMatch(/\bpush(es)?\b/)
})

// --- criterion 10 (GUARD: holds at da5910c, work/guard-evidence.md, approval _orch/inbox/OQ7.answer.md) ---
// requirement: R-C15-152, R-C15-153, R-C15-180 (traceability.yaml)
// Q-87: "Keep asking: the gate's matching is not changed (asking too often is the safe failure)";
// spec L537-538 "a command whose heredoc body or quoted string holds `git push` is still asked as a push"
test('guard: a Bash command whose heredoc body holds git push is still asked as a push', async ($, on) => {
  // fixture: git push appears only in the heredoc body
  const command = 'cat > f <<EOF\nthen git push origin main\nEOF'
  const w = world(on, { answers: ['Approve'] })
  await tree($)
  await $.tool.call({ tool: 'Bash', command, agentId: 'w1' } as any)
  expect(w.asked).toHaveLength(1) // it was asked (Q-87 "Keep asking")
  // expected: asked as the push gate — the approve-for-run option names "git push", as at da5910c
  // (work/probe-da5910c.md P2), not as any other gate
  expect(w.asked[0].options).toContain('Approve every "git push" for this run')
})
