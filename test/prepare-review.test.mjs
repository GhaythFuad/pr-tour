import { describe, expect, it, vi } from 'vitest'
import { prepareReview } from '../skills/prepare-pr-for-review/scripts/mark-pr-files-viewed.mjs'

const prUrl = 'https://github.com/example/project/pull/12'
const file = (path, other = {}) => ({ path, changeType: 'MODIFIED', additions: 1, deletions: 0, viewerViewedState: 'UNVIEWED', ...other })
const files = [file('src/auth.ts'), file('packages/app/__tests__/auth.ts'), file('pnpm-lock.yaml'),
  file('assets/logo.svg'), file('link'), file('moved.ts', { changeType: 'RENAMED', additions: 0 }),
  file('edited-move.ts', { changeType: 'RENAMED' }), file('README.md'),
  file('already.test.ts', { viewerViewedState: 'VIEWED' })]
function github() {
  return vi.fn((args) => {
    if (args[0] === 'pr') return { id: 'PR_12', headRefOid: 'abc' }
    if (args[1].includes('/git/trees/')) return { tree: [{ path: 'link', mode: '120000' }] }
    if (args.some((arg) => arg.startsWith('query=mutation'))) return { data: { markFileAsViewed: { clientMutationId: null } } }
    const second = args.includes('after=next')
    return { data: { node: { files: { nodes: second ? files.slice(4) : files.slice(0, 4), pageInfo: { hasNextPage: !second, endCursor: second ? null : 'next' } } } } }
  })
}
const mutations = (runGh) => runGh.mock.calls.filter(([args]) => args.some((arg) => arg.startsWith('query=mutation')))

describe('prepareReview', () => {
  it('previews all pages without marking files, and keeps edited renames and source reviewable', async () => {
    const runGh = github()
    const result = await prepareReview(prUrl, { runGh, log: () => {} })
    expect(result.candidates).toEqual(['packages/app/__tests__/auth.ts', 'pnpm-lock.yaml', 'assets/logo.svg', 'link', 'moved.ts'])
    expect(result.reviewable).toEqual(['src/auth.ts', 'edited-move.ts', 'README.md'])
    expect(mutations(runGh)).toHaveLength(0)
  })
  it('marks only unviewed supporting files for the authenticated reviewer', async () => {
    const runGh = github()
    const { candidates } = await prepareReview(prUrl, { dryRun: false, runGh, log: () => {} })
    expect(mutations(runGh).map(([args]) => args.find((arg) => arg.startsWith('path=')))).toEqual(candidates.map((path) => `path=${path}`))
  })
  it('refuses non-GitHub URLs before any request', async () => {
    const runGh = github()
    await expect(prepareReview('https://example.com/o/r/pull/1', { runGh })).rejects.toThrow('Use a full')
    expect(runGh).not.toHaveBeenCalled()
  })
  it('stops on an API refusal before changing any marks', async () => {
    const runGh = vi.fn().mockReturnValueOnce({ id: 'PR_12', headRefOid: 'abc' }).mockReturnValueOnce({ tree: [] })
      .mockReturnValueOnce({ errors: [{ message: 'Access denied' }] })
    await expect(prepareReview(prUrl, { dryRun: false, runGh })).rejects.toThrow('Access denied')
    expect(mutations(runGh)).toHaveLength(0)
  })
})
