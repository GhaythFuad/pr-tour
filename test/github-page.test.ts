// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  expandCollapsedFile,
  fileAnchorId,
  findViewedToggle,
  hasAnchoredLines,
  lineAnchorId,
  queryLine,
  searchForLine,
  tintLine,
} from '../src/github-page'
import type { LineTarget } from '../src/patch'

const NEW_VIEW = readFileSync(`${import.meta.dirname}/fixtures/github-changes-view.html`, 'utf8')
const CLASSIC_VIEW = readFileSync(`${import.meta.dirname}/fixtures/github-files-view.html`, 'utf8')
const VIEWED_FILE = 'diff-227269e48750baf5b46a42d1b00ff8f58f7c77a9720a551e0ee8cdf31143a650'
const OPEN_FILE = 'diff-e4f4ce8c23c217d1880005106cecdbac9f3adaabfe60c1ebfb4cce93a6e7996a'
const LARGE_FILE = 'diff-4a3b116ace8abc1b7e751b534c6c8e331fea3ad04bf819df609ff3497945e83b'
const CLASSIC_FILE = 'diff-d6e571bd4c1e3e899e3117820150c73a7742af5bddd609d15653f2217d762239'
const ADDED_IMPORT = 'import type { PublicationState } from "@/lib/page-builder/editing-session";'

const target = (side: LineTarget['side'], line: number, uniqueCode?: string): LineTarget => ({
  side,
  line,
  code: uniqueCode ?? '',
  isCodeUnique: uniqueCode !== undefined,
})
const sectionOf = (fileId: string): HTMLElement => {
  const section = document.getElementById(fileId)
  if (!section) throw new Error(`${fileId} isn't in the fixture`)
  return section
}
const rowText = (element: HTMLElement | null) => element?.closest('tr')?.textContent?.replace(/\s+/g, ' ').trim()

describe('fileAnchorId', () => {
  it('matches the id GitHub gives the file in Files changed', async () => {
    expect(await fileAnchorId('test/main.ts')).toBe(CLASSIC_FILE)
  })
})

describe('lineAnchorId', () => {
  it('uses R for the new file and L for the old one, as GitHub links do', () => {
    expect(lineAnchorId('diff-abc', target('new', 42))).toBe('diff-abcR42')
    expect(lineAnchorId('diff-abc', target('old', 42))).toBe('diff-abcL42')
  })
})

describe("GitHub's new view", () => {
  beforeEach(() => {
    document.body.innerHTML = NEW_VIEW
  })

  it('finds added and deleted lines by their link anchors', () => {
    expect(rowText(queryLine(OPEN_FILE, target('new', 7)))).toContain('PublicationState')
    expect(rowText(queryLine(OPEN_FILE, target('old', 23)))).toContain('recovered document')
  })

  it('finds a line by its code when GitHub drops the anchors', () => {
    for (const cell of document.querySelectorAll('[data-line-anchor]')) cell.removeAttribute('data-line-anchor')
    expect(queryLine(OPEN_FILE, target('new', 7))).toBeNull()
    expect(rowText(queryLine(OPEN_FILE, target('new', 7, ADDED_IMPORT)))).toContain('PublicationState')
  })

  it("won't guess between two rows showing the same code", () => {
    for (const cell of document.querySelectorAll('[data-line-anchor]')) cell.removeAttribute('data-line-anchor')
    const row = document.querySelector(`#${OPEN_FILE} tbody tr:nth-child(3)`)
    row?.after(row.cloneNode(true))
    expect(queryLine(OPEN_FILE, target('new', 7, ADDED_IMPORT))).toBeNull()
  })

  it("expands a collapsed file with GitHub's Expand button, not the comment button beside it", () => {
    const clicked: string[] = []
    document.addEventListener('click', (event) => clicked.push(event.target instanceof Element ? (event.target.getAttribute('aria-labelledby') ?? '') : ''), true)
    expandCollapsedFile(sectionOf(VIEWED_FILE))
    expect(clicked).toEqual(['_R_2n0lcql9io5_'])
  })

  it('leaves an expanded file alone', () => {
    let clicks = 0
    document.addEventListener('click', () => clicks++, true)
    expandCollapsedFile(sectionOf(OPEN_FILE))
    expect(clicks).toBe(0)
  })

  it("finds each file's Viewed control in either state", () => {
    expect(findViewedToggle(VIEWED_FILE)?.getAttribute('aria-pressed')).toBe('true')
    expect(findViewedToggle(OPEN_FILE)?.getAttribute('aria-pressed')).toBe('false')
    expect(findViewedToggle(LARGE_FILE)).toBeNull()
  })

  it('tells a file with recognisable lines from one without', () => {
    expect(hasAnchoredLines(OPEN_FILE)).toBe(true)
    expect(hasAnchoredLines(VIEWED_FILE)).toBe(false)
  })

  it('loads a large diff and waits for the line to appear', async () => {
    const loadDiff = [...document.querySelectorAll(`#${LARGE_FILE} button`)].find((button) => button.textContent === 'Load Diff')
    loadDiff?.addEventListener('click', () => {
      setTimeout(() => {
        const cell = document.createElement('td')
        cell.dataset.lineAnchor = `${LARGE_FILE}R12`
        const row = document.createElement('tr')
        row.append(cell)
        sectionOf(LARGE_FILE).append(row)
      }, 50)
    })
    const found = await searchForLine(LARGE_FILE, target('new', 12), {
      signal: new AbortController().signal,
      timeoutMs: 1000,
      readableBand: () => ({ top: 0, bottom: window.innerHeight }),
    })
    expect(found?.dataset.lineAnchor).toBe(`${LARGE_FILE}R12`)
  })

  it('tints the whole row of the line and clears it again', () => {
    const line = queryLine(OPEN_FILE, target('new', 7))
    tintLine(line)
    const cells = [...(line?.closest('tr')?.cells ?? [])]
    expect(cells.every((cell) => cell.style.boxShadow !== '')).toBe(true)
    tintLine(null)
    expect(cells.every((cell) => cell.style.boxShadow === '')).toBe(true)
  })
})

describe("GitHub's classic view", () => {
  beforeEach(() => {
    document.body.innerHTML = CLASSIC_VIEW
  })

  it('finds lines by their ids', () => {
    expect(rowText(queryLine(CLASSIC_FILE, target('old', 3)))).toContain('limit = 10')
    expect(rowText(queryLine(CLASSIC_FILE, target('new', 3)))).toContain('limit = 20')
  })

  it('expands a collapsed file and finds its Viewed checkbox', () => {
    let clicked: EventTarget | null = null
    document.addEventListener('click', (event) => (clicked = event.target), true)
    expandCollapsedFile(sectionOf(CLASSIC_FILE))
    expect(clicked).toBe(document.querySelector('.js-details-target'))
    expect(findViewedToggle(CLASSIC_FILE)).toBe(document.querySelector('.js-reviewed-checkbox'))
  })
})
