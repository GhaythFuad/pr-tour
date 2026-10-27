// @vitest-environment happy-dom
import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OPEN_TOUR_MESSAGE } from '../src/messages'
import { CODETOUR_SCHEMA } from '../src/tour'

let openTour: (message: string) => void
const fetch = vi.fn()
const assign = vi.fn()
const readSettings = vi.fn<() => Promise<Record<string, string>>>()

beforeEach(() => {
  vi.resetModules()
  document.body.innerHTML = ''
  localStorage.clear()
  sessionStorage.clear()
  fetch.mockReset()
  assign.mockReset()
  readSettings.mockReset().mockResolvedValue({})
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('fetch', fetch)
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  vi.stubGlobal('navigation', new EventTarget())
  vi.stubGlobal('location', { pathname: '/owner/private-repo/pull/42', hash: '', assign })
  vi.stubGlobal('chrome', {
    storage: { local: { get: readSettings } },
    runtime: { onMessage: { addListener: (listener: typeof openTour) => { openTour = listener } } },
  })
})

afterEach(() => {
  document.dispatchEvent(new Event('pr-tour:replaced'))
  vi.unstubAllGlobals()
})

it('offers manual loading without trying to read private PR comments when no PAT is saved', async () => {
  await import('../src/content')
  openTour(OPEN_TOUR_MESSAGE)
  await vi.waitFor(() => expect(document.querySelector('pr-tour-overlay')?.shadowRoot?.querySelector('.tour-choices')).toBeTruthy())
  expect(fetch).not.toHaveBeenCalled()
})

it('plays a private PR tour and opens its old-side line without a PAT or API requests', async () => {
  await import('../src/content')
  openTour(OPEN_TOUR_MESSAGE)
  await vi.waitFor(() => expect(document.querySelector('pr-tour-overlay')?.shadowRoot?.querySelector('.tour-field')).toBeTruthy())
  const root = document.querySelector('pr-tour-overlay')!.shadowRoot!
  const field = root.querySelector<HTMLTextAreaElement>('.tour-field')!
  field.value = JSON.stringify({
    $schema: CODETOUR_SCHEMA,
    title: 'Private review',
    ref: '1234567',
    steps: [
      { description: 'Start here. <img src=x onerror=alert(1)>' },
      { description: 'Review the removed check.', file: 'src/private.ts', line: 7, side: 'old' },
    ],
  })
  field.dispatchEvent(new Event('input'))
  const load = [...root.querySelectorAll('button')].find((button) => button.textContent === 'Load')!
  load.click()
  await vi.waitFor(() => expect(document.querySelector('pr-tour-overlay')?.shadowRoot?.querySelector('.card.tour')).toBeTruthy())
  const tour = document.querySelector('pr-tour-overlay')!.shadowRoot!
  expect(tour.querySelector('.notes')?.textContent).toBe('Start here. <img src=x onerror=alert(1)>')
  expect(tour.querySelector('.notes img')).toBeNull()
  const next = [...tour.querySelectorAll('button')].find((button) => button.textContent === 'Next')!
  next.click()
  expect(assign).toHaveBeenCalledWith(expect.stringMatching(/^\/owner\/private-repo\/pull\/42\/files#diff-[0-9a-f]{64}L7$/))
  expect(fetch).not.toHaveBeenCalled()
})

it('reads and validates a posted tour through the API when a PAT is saved', async () => {
  readSettings.mockResolvedValue({ githubToken: 'test-token' })
  const tour = { $schema: CODETOUR_SCHEMA, title: 'Posted review', ref: '1234567', steps: [{ description: '**Review this.**', file: 'src/private.ts', line: 2 }] }
  fetch.mockImplementation(async (url: string) => {
    if (url.includes('/comments?')) return new Response(JSON.stringify([{ body: '```json\n' + JSON.stringify(tour) + '\n```' }]))
    if (url.includes('/files?')) return new Response(JSON.stringify([{ filename: 'src/private.ts', patch: '@@ -1,1 +1,2 @@\n start\n+changed' }]))
    if (url.endsWith('/graphql')) return new Response(JSON.stringify({ data: { repository: { pullRequest: { files: { nodes: [], pageInfo: { hasNextPage: false } } } } } }))
    if (url.endsWith('/markdown')) return new Response('<p><strong>Review this.</strong></p>')
    if (url.endsWith('/pulls/42')) return new Response(JSON.stringify({ head: { sha: '1234567abcdef' } }))
    throw new Error(`Unexpected request: ${url}`)
  })
  await import('../src/content')
  await vi.waitFor(() => expect(document.querySelector('pr-tour-overlay')?.shadowRoot?.querySelector('.notes strong')?.textContent).toBe('Review this.'))
  expect(fetch).toHaveBeenCalledTimes(5)
  for (const [, options] of fetch.mock.calls) expect(options.headers.Authorization).toBe('Bearer test-token')
})
