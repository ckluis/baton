// claude plugin test — the prime guard, through the hooks module.
// A test's $.tool.call always runs in the main loop (agentId is dropped), so
// these are prime calls; the subagent side is covered by test/guard.test.mjs.
import { expect, test } from 'claude-code/testing'

const ACTIVE = JSON.stringify({ run_id: 't', mode: 'BUILD', prime: true })

function world(on: any, manifest: string | null) {
  on('fs.read', (_$: any, e: any) =>
    e.path.endsWith('_orch/manifest.json')
      ? manifest === null
        ? { deny: 'ENOENT: no such file' }
        : { value: manifest }
      : { deny: 'ENOENT' },
  )
  on('ui.log', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify({ index: 0, text: 'x', truncated: false, merges: [] }), stderr: '' } }))
  on('tool.call', () => ({ result: 'ran' }))
}

test('during a run the prime is denied every reading, running and editing tool, with the route', async ($, on) => {
  world(on, ACTIVE)
  for (const tool of ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write', 'WebFetch', 'NotebookEdit', 'Skill', 'mcp__other__read']) {
    const r: any = await $.tool.call({ tool, file_path: 'src/a.ts', command: 'ls', pattern: 'x' } as any)
    expect(r.deny, tool).toMatch(/dispatch a sub-orchestrator/)
    expect(r.deny).toContain('baton:sub-orchestrator')
  }
})

test('during a run the prime keeps Agent, AskUserQuestion, SendMessage, ToolSearch and the memory tools', async ($, on) => {
  world(on, ACTIVE)
  for (const tool of ['Agent', 'AskUserQuestion', 'SendMessage', 'ToolSearch', 'mcp__baton__memory_wake', 'mcp__baton__memory_note', 'mcp__baton__project_wake']) {
    const r: any = await $.tool.call({ tool, text: 'x', pattern: 'x', range: '0-1' } as any)
    expect(r.deny, tool).toBeUndefined()
    expect(String(r.result), tool).not.toContain('error')
  }
})

test('with no run the guard is invisible', async ($, on) => {
  world(on, null)
  const r: any = await $.tool.call({ tool: 'Read', file_path: 'README.md' })
  expect(r.result).toBe('ran')
})

test('a manifest without "prime": true, or a closed run, does not arm the guard', async ($, on) => {
  world(on, JSON.stringify({ run_id: 'v5-run', mode: 'BUILD' }))
  expect(((await $.tool.call({ tool: 'Bash', command: 'ls' })) as any).result).toBe('ran')
})

test('a closed prime run does not arm the guard', async ($, on) => {
  world(on, JSON.stringify({ run_id: 'x', prime: true, closed: true }))
  expect(((await $.tool.call({ tool: 'Bash', command: 'ls' })) as any).result).toBe('ran')
})

test('a malformed manifest does not arm the guard', async ($, on) => {
  world(on, '{ prime: true,')
  expect(((await $.tool.call({ tool: 'Read', file_path: 'x' })) as any).result).toBe('ran')
})
