// claude plugin test — agent.spawn binds each role's model during a run.
import { expect, test } from 'claude-code/testing'

function world(on: any, active: boolean) {
  const spawned: any[] = []
  on('fs.read', (_$: any, e: any) =>
    active && e.path.endsWith('_orch/manifest.json') ? { value: JSON.stringify({ run_id: 'r', prime: true }) } : { deny: 'ENOENT' },
  )
  on('ui.log', () => ({ value: undefined }))
  on('agent.spawn', (_$: any, e: any) => {
    spawned.push(e)
    return { model: e.model ?? 'inherited', agentId: 'a' + spawned.length }
  })
  return spawned
}

test('during a run: roles run on Opus 5.5, -cheap on Sonnet 5.5, whatever was asked', async ($, on) => {
  const spawned = world(on, true)
  await $.agent.spawn({ prompt: 'p', subagentType: 'baton:sub-orchestrator', model: 'haiku' } as any)
  await $.agent.spawn({ prompt: 'p', subagentType: 'baton:verifier' } as any)
  await $.agent.spawn({ prompt: 'p', subagentType: 'baton:worker-cheap', model: 'opus' } as any)
  await $.agent.spawn({ prompt: 'p', subagentType: 'general-purpose', name: 'grep-cheap' } as any)
  expect(spawned.map((s) => s.model)).toEqual(['claude-opus-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5-5'])
})

test('outside a run the spawn is untouched', async ($, on) => {
  const spawned = world(on, false)
  await $.agent.spawn({ prompt: 'p', subagentType: 'Explore', model: 'haiku' } as any)
  expect(spawned[0].model).toBe('haiku')
})
