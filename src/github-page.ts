/**
 * Everything PR Tour knows about GitHub's Files changed page, so a change to that page is fixed here and nowhere else.
 * Lookups go by GitHub's link anchors first, since links people share keep them stable, then by the code's own text.
 */
import type { PullRef } from './github'
import type { ScreenBand } from './overlay'
import type { LineTarget } from './patch'

const LINE_STEP_WAIT_MS = 300
/** How much each scroll through a long file overlaps the last, so no line is skipped between screenfuls. */
const SCROLL_OVERLAP_PX = 80
const TARGET_TINT = 'inset 0 0 0 999px rgba(99, 102, 241, 0.16)'
const TARGET_BAR = 'inset 3px 0 0 #6366f1'

let tintedCells: HTMLElement[] = []

/** GitHub's id for a file in Files changed and the anchor of links to it: `diff-` plus the SHA-256 hex of its path. */
export async function fileAnchorId(path: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(path))
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `diff-${hex}`
}

/** GitHub's link anchor for a line: `R` and its number in the new file, or `L` and its number in the old one. */
export function lineAnchorId(fileId: string, target: LineTarget): string {
  return `${fileId}${target.side === 'new' ? 'R' : 'L'}${target.line}`
}

/** Files changed is `/files` in GitHub's classic view and `/changes` in its new one. */
export function isFilesView(pull: PullRef): boolean {
  const base = pullPath(pull)
  return location.pathname.startsWith(base) && /^\/(files|changes)(\/|$)/.test(location.pathname.slice(base.length))
}

/** A link that opens Files changed at `anchor`; GitHub sends `/files` to whichever view the reviewer uses. */
export function filesViewUrl(pull: PullRef, anchor: string): string {
  return `${pullPath(pull)}/files#${anchor}`
}

export function findFileSection(fileId: string, timeoutMs: number): Promise<HTMLElement | null> {
  return waitFor(() => document.getElementById(fileId), timeoutMs)
}

/** Opens a file GitHub collapsed, as it does every Viewed file; expanding it leaves the Viewed mark alone. */
export function expandCollapsedFile(section: HTMLElement): void {
  const expand = [...section.querySelectorAll('button')].find(
    (button) =>
      labelOf(button) === 'Expand file' ||
      (button.getAttribute('aria-label') === 'Toggle diff contents' && button.getAttribute('aria-expanded') === 'false'),
  )
  expand?.click()
}

/** The line, if GitHub has rendered it: by its link anchor, else by its code. */
export function queryLine(fileId: string, target: LineTarget): HTMLElement | null {
  const section = document.getElementById(fileId)
  if (!section) return null
  const anchor = lineAnchorId(fileId, target)
  // The classic view puts the anchor in the line's id, the new view in its data-line-anchor.
  const anchored = section.querySelector(`[id="${anchor}"], [data-line-anchor="${anchor}"]`)
  if (anchored instanceof HTMLElement) return anchored
  return findByCode(section, target)
}

/** Waits for GitHub to render the line: loads a large diff and scrolls down the file, since GitHub renders long diffs only near the viewport. */
export async function searchForLine(
  fileId: string,
  target: LineTarget,
  search: { signal: AbortSignal; timeoutMs: number; readableBand: () => ScreenBand },
): Promise<HTMLElement | null> {
  const deadline = performance.now() + search.timeoutMs
  let found = queryLine(fileId, target)
  while (!found && !search.signal.aborted && performance.now() < deadline) {
    loadLargeDiff(fileId)
    found = await waitFor(() => queryLine(fileId, target), LINE_STEP_WAIT_MS)
    if (!found && !search.signal.aborted) scrollThroughFile(fileId, search.readableBand())
  }
  return found
}

/** Whether any line of the file carries an anchor PR Tour recognises; none while the diff shows means GitHub changed its page. */
export function hasAnchoredLines(fileId: string): boolean {
  return document.querySelector(`[id^="${fileId}R"], [id^="${fileId}L"], [data-line-anchor^="${fileId}"]`) !== null
}

/** GitHub's Viewed control in a file's header: a pressed-state button labelled by its state in the new view, a checkbox in the classic one. */
export function findViewedToggle(fileId: string): HTMLElement | null {
  const button = `#${fileId} button[aria-pressed]`
  const toggle = document.querySelector(`${button}[aria-label="Viewed"], ${button}[aria-label="Not Viewed"], #${fileId} input.js-reviewed-checkbox`)
  return toggle instanceof HTMLElement ? toggle : null
}

/** Tints the line's row through inline cell shadows, or clears the tint: cell backgrounds would hide a row outline. */
export function tintLine(line: HTMLElement | null): void {
  for (const cell of tintedCells) cell.style.removeProperty('box-shadow')
  const row = line?.closest('tr') ?? line
  tintedCells = row ? (row instanceof HTMLTableRowElement ? [...row.cells] : [row]) : []
  for (const [position, cell] of tintedCells.entries()) {
    cell.style.setProperty('box-shadow', position === 0 ? `${TARGET_BAR}, ${TARGET_TINT}` : TARGET_TINT)
  }
}

function pullPath(pull: PullRef): string {
  return `/${pull.owner}/${pull.repo}/pull/${pull.number}`
}

function waitFor(find: () => HTMLElement | null, timeoutMs: number): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const present = find()
    if (present) return resolve(present)
    const observer = new MutationObserver(() => {
      const added = find()
      if (added) finish(added)
    })
    const timer = setTimeout(() => finish(null), timeoutMs)
    observer.observe(document.body, { childList: true, subtree: true })
    function finish(element: HTMLElement | null): void {
      observer.disconnect()
      clearTimeout(timer)
      resolve(element)
    }
  })
}

/** The new view names its icon buttons through a tooltip that `aria-labelledby` points at. */
function labelOf(button: HTMLButtonElement): string | null {
  const labelId = button.getAttribute('aria-labelledby')
  return labelId === null ? button.getAttribute('aria-label') : (document.getElementById(labelId)?.textContent?.trim() ?? null)
}

/**
 * Finds a line by its code, whatever markup wraps it: the outermost elements holding exactly that code, all in one row.
 * A split view shows an unchanged line twice in its row, the old file's copy first.
 */
function findByCode(section: HTMLElement, target: LineTarget): HTMLElement | null {
  if (!target.isCodeUnique) return null
  const holders = [...section.querySelectorAll<HTMLElement>('*')].filter(
    (element) => element.textContent?.trim() === target.code && element.parentElement?.textContent?.trim() !== target.code,
  )
  if (new Set(holders.map((holder) => holder.closest('tr') ?? holder)).size !== 1) return null
  return (target.side === 'new' ? holders.at(-1) : holders[0]) ?? null
}

/**
 * Clicks GitHub's "Load diff" ("Load Diff" in the new view) on a large diff, matched by its label since other header
 * buttons open forms. GitHub draws the button only once the file is near the viewport, so each search pass tries again.
 */
function loadLargeDiff(fileId: string): void {
  const loadDiff = [...(document.getElementById(fileId)?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.trim().toLowerCase() === 'load diff')
  loadDiff?.click()
}

/** Brings the next screenful of the file into the band, or the file itself back when files drawn above pushed it away. */
function scrollThroughFile(fileId: string, band: ScreenBand): void {
  const section = document.getElementById(fileId)
  if (!section) return
  const { top, bottom } = section.getBoundingClientRect()
  if (top > band.bottom || bottom < band.top) {
    window.scrollBy({ top: top - band.top, behavior: 'instant' })
  } else if (bottom > band.bottom) {
    window.scrollBy({ top: band.bottom - band.top - SCROLL_OVERLAP_PX, behavior: 'instant' })
  }
}
