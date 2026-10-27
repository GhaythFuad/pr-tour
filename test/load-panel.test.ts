// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildLoadPanel, type LoadPanelActions } from '../src/overlay'

const PR_URL = 'https://github.com/example/project/pull/42'
const actions = (): LoadPanelActions => ({ load: vi.fn(), useComment: null, checkForTour: vi.fn(), cancel: vi.fn() })
function panel(reason: string | null, handlers = actions()) {
  const view = buildLoadPanel(reason, handlers, PR_URL)
  view.mount()
  const root = view.host.shadowRoot!
  return { view, root, handlers }
}
function button(root: ShadowRoot, label: string): HTMLButtonElement {
  const result = [...root.querySelectorAll('button')].find((item) => (item.getAttribute('aria-label') ?? item.textContent) === label)
  if (!result) throw new Error(`Missing button: ${label}`)
  return result
}

beforeEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('no-tour setup', () => {
  it('copies the install command and a generation prompt for the exact PR', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText)
    const { root } = panel('This pull request has no tour comment.')
    expect(root.querySelector('.manual-tour')?.hasAttribute('hidden')).toBe(false)
    button(root, 'Copy install command').click()
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('npx skills add GhaythFuad/pr-tour --skill prepare-pr-for-review'))
    button(root, 'Copy generation prompt').click()
    await vi.waitFor(() => expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining(PR_URL)))
    expect(writeText.mock.calls[1]?.[0]).toContain('Do not post a PR comment')
    await vi.waitFor(() => expect(root.querySelector('[role="status"]')?.textContent).toBe('Generation prompt copied.'))
  })

  it('selects the text for manual copy when clipboard access is refused', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Clipboard blocked'))
    const { root } = panel('This pull request has no tour comment.')
    button(root, 'Copy generation prompt').click()
    await vi.waitFor(() => expect(root.querySelector('[role="status"]')?.textContent).toContain('copy it manually'))
    const field = root.querySelector<HTMLTextAreaElement>('[aria-label="Tour generation prompt"]')!
    expect(root.activeElement).toBe(field)
    expect(field.selectionEnd - field.selectionStart).toBe(field.value.length)
  })

  it('checks for the new comment and closes setup without loading a draft', () => {
    const { root, handlers } = panel('This pull request has no tour comment.')
    button(root, 'With a PAT').click()
    button(root, 'Check for tour').click()
    button(root, 'Close tour setup').click()
    expect(handlers.checkForTour).toHaveBeenCalledOnce()
    expect(handlers.cancel).toHaveBeenCalledOnce()
    expect(handlers.load).not.toHaveBeenCalled()
  })

  it('loads pasted text without requiring the PAT path', () => {
    const { root, handlers } = panel('This pull request has no tour comment.')
    const field = root.querySelector<HTMLTextAreaElement>('[aria-label="Tour"]')!
    field.value = '{"a":"tour"}'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    button(root, 'Load').click()
    expect(handlers.load).toHaveBeenCalledWith(field.value, 'The pasted text')
  })

  it('switches the instructions, controls and copied prompt between manual and comment paths', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText)
    const { root } = panel('This pull request has no tour comment.')
    const withPat = button(root, 'With a PAT')
    const withoutPat = button(root, 'Without a PAT')
    expect(withoutPat.getAttribute('aria-pressed')).toBe('true')
    expect(root.querySelector<HTMLElement>('.token-setup')!.hidden).toBe(true)
    withPat.click()
    expect(withPat.getAttribute('aria-pressed')).toBe('true')
    expect(root.querySelector<HTMLElement>('.manual-tour')!.hidden).toBe(true)
    expect(root.querySelector<HTMLElement>('.token-setup')!.hidden).toBe(false)
    expect(root.querySelector<HTMLElement>('.generate-next')!.hidden).toBe(false)
    button(root, 'Copy generation prompt').click()
    await vi.waitFor(() => expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('write, validate, and post')))
    withoutPat.click()
    expect(root.querySelector<HTMLElement>('.manual-tour')!.hidden).toBe(false)
    expect(root.querySelector<HTMLElement>('.generate-next')!.hidden).toBe(true)
    button(root, 'Copy generation prompt').click()
    await vi.waitFor(() => expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('Do not post a PR comment')))
  })
})

describe('loading a replacement tour', () => {
  it('opens the existing paste form directly and preserves Escape cancellation', () => {
    const { root, handlers } = panel(null)
    const field = root.querySelector<HTMLTextAreaElement>('[aria-label="Tour"]')!
    expect(root.querySelector('details')).toBeNull()
    expect(root.querySelector('[aria-label="Tour generation prompt"]')).toBeNull()
    expect(root.activeElement).toBe(field)
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(handlers.cancel).toHaveBeenCalledOnce()
  })
})
