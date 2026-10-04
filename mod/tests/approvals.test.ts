// claude plugin test — the command gate, the phase gate, enforced rulings, the agent tree.
import { expect, mock, test } from 'claude-code/testing'

const ACTIVE = JSON.stringify({ run_id: 't', mode: 'BUILD', prime: true })

function world(on: any, opts: { answers?: any[]; surfaces?: string[]; rulings?: any[] } = {}) {
  const asked: { q: string; options: string[] }[] = []
  const notes: { tag: string; text: string }[] = []
  const answers = [...(opts.answers ?? [])]
  on('fs.read', (_$: any, e: any) => (e.path.endsWith('_orch/manifest.json') ? { value: ACTIVE } : { deny: 'ENOENT' }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: opts.surfaces ?? ['terminal'] }))
  on('ui.ask', (_$: any, e: any) => {
    asked.push({ q: e.question ?? e.text ?? String(e), options: e.options ?? [] })
    const a = answers.shift()
    return a === undefined ? { deny: 'dismissed' } : { value: typeof a === 'function' ? a(e.options ?? []) : a }
  })
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    if (argv.includes('note')) {
      notes.push({ tag: argv[argv.indexOf('--tag') + 1], text: e.init?.stdin })
      return { value: { exitCode: 0, stdout: JSON.stringify({ index: notes.length - 1, text: '', truncated: false, merges: [] }), stderr: '' } }
    }
    if (argv.includes('recall')) return { value: { exitCode: 0, stdout: JSON.stringify({ pattern: '.', total: 0, notes: opts.rulings ?? [], blocks: [] }), stderr: '' } }
    return { value: { exitCode: 0, stdout: '{}', stderr: '' } }
  })
  on('agent.spawn', (_$: any, e: any) => ({ model: e.model ?? 'claude-opus-5-5', agentId: e.prompt }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: 'ran' }))
  on('tool.check', () => ({ decision: 'allow' }))
  return { asked, notes }
}

async function tree($: any) {
  await $.agent.spawn({ prompt: 's1', description: 'P3', subagentType: 'baton:sub-orchestrator' } as any)
  await $.agent.spawn({ prompt: 'w1', description: 'T7', subagentType: 'baton:worker-cheap', parentAgentId: 's1' } as any)
}

test('a worker two levels down asks before git push; Approve runs it and notes the approval', async ($, on) => {
  const w = world(on, { answers: ['Approve'] })
  await tree($)
  const r: any = await $.tool.call({ tool: 'Bash', command: 'git push origin v7', agentId: 'w1' } as any)
  expect(r.result).toBe('ran')
  expect(w.asked[0].q).toContain('prime › P3 › T7 wants to git push')
  expect(w.notes.at(-1)!.tag).toBe('approval')
})

test('a typed answer refuses with that reason; approve-for-run skips later asks of the same gate', async ($, on) => {
  const w = world(on, { answers: ['use a branch, not main', (o: string[]) => o[1]] })
  await tree($)
  const no: any = await $.tool.call({ tool: 'Bash', command: 'git push origin main', agentId: 'w1' } as any)
  expect(no.deny).toContain('use a branch, not main')
  await $.tool.call({ tool: 'Bash', command: 'rm -rf build', agentId: 'w1' } as any)
  const again: any = await $.tool.call({ tool: 'Bash', command: 'rm -rf dist', agentId: 'w1' } as any)
  expect(again.result).toBe('ran')
  expect(w.asked).toHaveLength(2)
})

test('nobody to ask (claude -p): a gated command is refused, an ordinary one is not', async ($, on) => {
  world(on, { surfaces: [] })
  await tree($)
  expect(((await $.tool.call({ tool: 'Bash', command: 'gh pr merge 41', agentId: 'w1' } as any)) as any).deny).toContain('nobody can be asked')
  expect(((await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'w1' } as any)) as any).result).toBe('ran')
})

test('a sub-orchestrator reporting DONE holds the next dispatch until the operator answers', async ($, on) => {
  const w = world(on, { answers: ['the criteria are vacuous'] })
  await tree($)
  await $.turn.complete({ agentId: 's1', answer: 'P3 DONE+CONFIRMED 4/4', durationMs: 1, isAborted: false, turnId: 'x', reason: 'answer' } as any)
  const r: any = await $.tool.call({ tool: 'Agent', prompt: 'P4', description: 'P4' } as any)
  expect(r.deny).toContain('sent back P3 — "the criteria are vacuous"')
  expect(w.asked[0].q).toContain('P3 reports:')
  expect(((await $.tool.call({ tool: 'Agent', prompt: 'P3b', description: 'P3' } as any)) as any).result).toBe('ran')
})

test('an enforced ruling refuses a matching command at tool.check; others keep their decision', async ($, on) => {
  world(on, {
    rulings: [
      { index: 0, ts: '2026-10-04T00:00:00Z', tag: 'ruling', text: 'never push to main' },
      { index: 1, ts: '2026-10-04T00:00:00Z', tag: 'enforce', text: 'enforce #0 /git push.*\\bmain\\b/' },
    ],
  })
  const r: any = await $.tool.check({ tool: 'Bash', input: { command: 'git push origin main' } } as any)
  expect(r).toEqual({ decision: 'deny', reason: 'baton ruling #0 (enforced): never push to main' })
  expect(((await $.tool.check({ tool: 'Bash', input: { command: 'git push origin v7' } } as any)) as any).decision).toBe('allow')
})
