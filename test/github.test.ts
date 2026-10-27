import { afterEach, describe, expect, it, vi } from 'vitest'
import { listViewedFiles } from '../src/github'

const pull = { owner: 'o', repo: 'r', number: 7 }
const page = (nodes: { path: string; viewerViewedState: string }[], endCursor: string | null) =>
  new Response(
    JSON.stringify({
      data: { repository: { pullRequest: { files: { nodes, pageInfo: { hasNextPage: endCursor !== null, endCursor } } } } },
    }),
  )

afterEach(() => vi.unstubAllGlobals())

describe('listViewedFiles', () => {
  it('collects Viewed paths across pages and treats files changed since viewing as unviewed', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page([{ path: 'a.ts', viewerViewedState: 'VIEWED' }, { path: 'b.ts', viewerViewedState: 'UNVIEWED' }], 'c1'))
      .mockResolvedValueOnce(page([{ path: 'c.ts', viewerViewedState: 'DISMISSED' }, { path: 'd.ts', viewerViewedState: 'VIEWED' }], null))
    vi.stubGlobal('fetch', fetch)
    expect(await listViewedFiles(pull, 'token')).toEqual(new Set(['a.ts', 'd.ts']))
    expect(JSON.parse(fetch.mock.calls[1]?.[1].body).variables).toEqual({ ...pull, after: 'c1' })
  })

  it('reports a GraphQL refusal with the pull request it concerns', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ errors: [{ message: 'Bad credentials' }] }))))
    await expect(listViewedFiles(pull, 'token')).rejects.toThrow(
      "GitHub refused PR Tour's request for the files you marked Viewed in o/r#7: Bad credentials",
    )
  })
})
