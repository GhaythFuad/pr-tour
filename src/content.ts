import {
  expandCollapsedFile,
  fileAnchorId,
  filesViewUrl,
  findFileSection,
  findViewedToggle,
  hasAnchoredLines,
  isFilesView,
  lineAnchorId,
  queryLine,
  searchForLine,
  tintLine,
} from './github-page'
import {
  describePull,
  listChangedFiles,
  listCommentBodies,
  listViewedFiles,
  parsePullPath,
  readHeadCommit,
  renderMarkdown,
  type ChangedFile,
  type PullRef,
} from './github'
import { OPEN_TOUR_MESSAGE } from './messages'
import {
  buildLoadPanel,
  buildLoadingOverlay,
  buildProblemOverlay,
  buildTourOverlay,
  type MountedOverlay,
  type ScreenBand,
  type TourOverlay,
} from './overlay'
import { readToken } from './settings'
import { readStorage, writeStorage } from './storage'
import { locateManualStep, locateStep, type LineTarget } from './patch'
import { findTour, findTourInText, isTourOutdated, type Tour, type TourStep } from './tour'

/** A tour step with where it opens in the diff and what the reviewer should know about it; `target` is its line when the diff shows it. */
type PlannedStep = TourStep & { fileId: string | null; target: LineTarget | null; warning: string | null }

/** Where a step opens in Files changed: its line when the diff shows it, otherwise the file. */
type StepTarget = { fileId: string; line: LineTarget | null }

type ViewedFiles = { paths: Set<string>; problem: string | null }

/** An overlay ready to mount, with the tour session behind it when it shows a tour. */
type LoadedOverlay = { overlay: MountedOverlay; session: Session | null }

type RenderedNotes = { html: string } | { text: string } | { problem: string }

type Session = {
  pull: PullRef
  token: string
  steps: PlannedStep[]
  index: number
  /** Replaced each time the Viewed marks are read again. */
  viewed: ViewedFiles
  /** Steps shown so far in this tab. */
  shown: Set<number>
  /** Settled notes by step index. */
  notes: Map<number, RenderedNotes>
  /** One rendering request per step, so a step's notes are fetched once. */
  notesRequests: Map<number, Promise<void>>
  /** Stops the scrolling for a step the reviewer has moved on from. */
  reveal: AbortController
  overlay: TourOverlay
}

const FILE_WAIT_MS = 5000
/** How long the tour keeps scrolling toward a line; loading a large diff alone can take several seconds. */
const LINE_SEARCH_MS = 15000
/** How long a revealed step stays pinned in place while GitHub finishes drawing the page: files above render, collapse or resize. */
const HOLD_MS = 2500
/** GitHub pins the pull request's bar and the file's name bar to the top of the screen; together they are about this tall. */
const GITHUB_PINNED_BARS_PX = 120
/** Keys that scroll the page; pressing one hands the scrolling back to the reviewer. */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])
/** Time for GitHub to save a Viewed tick before the marks are read again. */
const VIEWED_SETTLE_MS = 1000
/** Sent by a freshly injected copy of this script, so a copy left over from before an extension reload steps aside. */
const REPLACED_EVENT = 'pr-tour:replaced'
const NO_TOUR_COMMENT = 'No tour loaded yet.'

let shownPull: string | null = null
let mountedOverlay: MountedOverlay | null = null
/** The tour on the page, or null while a problem, nothing or a closed tour is shown. */
let activeSession: Session | null = null
let viewedRefreshTimer: ReturnType<typeof setTimeout> | undefined
/** Removes this copy's page listeners when a newer copy takes over the tab. */
const pageListeners = new AbortController()

document.dispatchEvent(new Event(REPLACED_EVENT))
document.addEventListener(REPLACED_EVENT, retire, { once: true })
void syncWithPage()
// GitHub moves between pages without reloading, so the overlay follows same-document navigations too.
navigation.addEventListener('navigatesuccess', () => void syncWithPage(), { signal: pageListeners.signal })
chrome.runtime.onMessage.addListener((message) => {
  if (message === OPEN_TOUR_MESSAGE) void reopenTour()
})
// GitHub saves a Viewed tick without telling other scripts, so any click on the page re-reads the marks once it settles.
document.addEventListener(
  'click',
  (event) => {
    if (!activeSession || isOnOverlay(event)) return
    clearTimeout(viewedRefreshTimer)
    viewedRefreshTimer = setTimeout(() => void refreshViewedMarks(), VIEWED_SETTLE_MS)
  },
  { capture: true, signal: pageListeners.signal },
)
for (const type of ['wheel', 'touchmove', 'pointerdown', 'keydown']) {
  document.addEventListener(type, stopRevealForReviewer, { capture: true, passive: true, signal: pageListeners.signal })
}
document.addEventListener(
  'visibilitychange',
  () => {
    if (document.visibilityState === 'visible') void refreshViewedMarks()
  },
  { signal: pageListeners.signal },
)

function retire(): void {
  pageListeners.abort()
  if (activeSession) stopReveal(activeSession)
  unmountOverlay()
}

function isOnOverlay(event: Event): boolean {
  return mountedOverlay !== null && event.composedPath().includes(mountedOverlay.host)
}

/** The reviewer scrolling or clicking the page takes over from the tour's search for a line. */
function stopRevealForReviewer(event: Event): void {
  if (!activeSession || isOnOverlay(event)) return
  if (event instanceof KeyboardEvent && !SCROLL_KEYS.has(event.key)) return
  stopReveal(activeSession)
}

async function syncWithPage(): Promise<void> {
  const pull = parsePullPath(location.pathname)
  const pullName = pull && describePull(pull)
  if (pullName === shownPull) return
  shownPull = pullName
  unmountOverlay()
  if (!pull || readStorage(sessionStorage, closedKey(pull)) === '1') return
  showLoaded(pullName, await loadOverlay(pull))
}

/** Replaces what the overlay shows with what loaded, unless the reviewer moved to another pull request meanwhile. */
function showLoaded(pullName: string | null, loaded: LoadedOverlay | null): void {
  if (shownPull !== pullName || pageListeners.signal.aborted) return
  unmountOverlay()
  if (loaded) showOverlay(loaded)
}

function showOverlay({ overlay, session }: LoadedOverlay): void {
  mountedOverlay?.remove()
  overlay.mount()
  mountedOverlay = overlay
  activeSession = session
}

function unmountOverlay(): void {
  mountedOverlay?.remove()
  mountedOverlay = null
  activeSession = null
  tintLine(null)
}

async function reopenTour(): Promise<void> {
  if (mountedOverlay) return
  const pull = parsePullPath(location.pathname)
  if (!pull) {
    const problem = "This page isn't a pull request. Open one, then click PR Tour again."
    showOverlay({ overlay: buildProblemOverlay(problem, unmountOverlay), session: null })
    return
  }
  writeStorage(sessionStorage, closedKey(pull), null)
  await showTourOrLoadPanel(pull)
}

async function showTourOrLoadPanel(pull: PullRef): Promise<void> {
  const pullName = describePull(pull)
  shownPull = pullName
  unmountOverlay()
  showOverlay({ overlay: buildLoadingOverlay(), session: null })
  showLoaded(pullName, (await loadOverlay(pull)) ?? loadPanel(pull, NO_TOUR_COMMENT, null))
}

function loadPanel(pull: PullRef, reason: string | null, restoreOnCancel: LoadedOverlay | null): LoadedOverlay {
  const hasTourOverride = readTourOverride(pull) !== null
  const panel = buildLoadPanel(reason, {
    load: (tourText, origin) => {
      const found = findTourInText(tourText)
      if (found === null) {
        panel.showProblem(`${origin} isn't a CodeTour tour, so nothing was loaded. Paste or choose a whole tour comment or .tour file.`)
      } else if ('problem' in found) {
        panel.showProblem(`${found.problem} Fix the tour, then load it again.`)
      } else {
        void switchTour(pull, tourText)
      }
    },
    useComment: hasTourOverride ? () => void switchTour(pull, null) : null,
    checkForTour: () => void showTourOrLoadPanel(pull),
    cancel: () => {
      if (restoreOnCancel) showOverlay(restoreOnCancel)
      else unmountOverlay()
    },
  }, `https://github.com/${pull.owner}/${pull.repo}/pull/${pull.number}`)
  return { overlay: panel, session: null }
}

async function switchTour(pull: PullRef, tourOverride: string | null): Promise<void> {
  writeStorage(localStorage, tourOverrideKey(pull), tourOverride)
  writeStorage(sessionStorage, progressKey(pull), null)
  await showTourOrLoadPanel(pull)
}

function readTourOverride(pull: PullRef): string | null {
  return readStorage(localStorage, tourOverrideKey(pull))
}

function tourOverrideKey(pull: PullRef): string {
  return `pr-tour:override:${describePull(pull)}`
}

function closeTour(pull: PullRef): void {
  writeStorage(sessionStorage, closedKey(pull), '1')
  unmountOverlay()
}

function closedKey(pull: PullRef): string {
  return `pr-tour:closed:${describePull(pull)}`
}

async function loadOverlay(pull: PullRef): Promise<LoadedOverlay | null> {
  const token = await readToken()
  const tourOverride = readTourOverride(pull)
  // Without a PAT the reviewer loads a tour manually, including on private PRs.
  if (!token && tourOverride === null) return null
  const fix = tourOverride === null ? 'Edit the tour comment to fix it.' : 'Fix the tour, then load it again.'
  try {
    const found = tourOverride === null ? findTour(await listCommentBodies(pull, token)) : findTourInText(tourOverride)
    if (!found) return null
    if ('problem' in found) {
      return { overlay: buildProblemOverlay(`Can't load the tour. ${found.problem} ${fix}`, () => closeTour(pull)), session: null }
    }
    if (tourOverride !== null) {
      const steps = await Promise.all(found.tour.steps.map(async (step): Promise<PlannedStep> => {
        const { file, line, warning } = locateManualStep(step)
        return { ...step, fileId: file === null ? null : await fileAnchorId(file.filename), target: line, warning }
      }))
      const viewed = { paths: new Set<string>(), problem: 'Manual mode does not read Viewed status from GitHub.' }
      const session = startSession(pull, '', found.tour, steps, viewed, true)
      for (const index of steps.keys()) void requestNotes(session, index)
      return { overlay: session.overlay, session }
    }
    const { ref } = found.tour
    const [files, viewed, headCommit] = await Promise.all([
      listChangedFiles(pull, token),
      readViewedFiles(pull, token, new Set()),
      ref === undefined ? null : readHeadCommit(pull, token),
    ])
    const isOutdated = headCommit !== null && isTourOutdated(found.tour, headCommit)
    const steps = await Promise.all(found.tour.steps.map((step) => planStep(step, files, isOutdated)))
    const session = startSession(pull, token, found.tour, steps, viewed, tourOverride !== null)
    // The overlay appears once, complete: the current step's notes first, the rest in the background.
    await requestNotes(session, session.index)
    for (const index of steps.keys()) void requestNotes(session, index)
    return { overlay: session.overlay, session }
  } catch (error) {
    const problem = error instanceof Error ? error.message : String(error)
    return { overlay: buildProblemOverlay(`Can't load the tour. ${problem}`, () => closeTour(pull)), session: null }
  }
}

async function planStep(step: TourStep, files: ChangedFile[], isTourOutdated: boolean): Promise<PlannedStep> {
  const { file, line, warning } = locateStep(step, files, isTourOutdated)
  return { ...step, fileId: file === null ? null : await fileAnchorId(file.filename), target: line, warning }
}

/** The marks only drive the dots and where a step opens, so a failed read keeps `fallback` and says why. */
async function readViewedFiles(pull: PullRef, token: string, fallback: Set<string>): Promise<ViewedFiles> {
  const consequence = 'the dots may not show which files you marked Viewed.'
  if (!token) {
    return {
      paths: fallback,
      problem: 'Manual mode does not read Viewed status from GitHub.',
    }
  }
  try {
    return { paths: await listViewedFiles(pull, token), problem: null }
  } catch (error) {
    return { paths: fallback, problem: `${error instanceof Error ? error.message : String(error)} Until that works, ${consequence}` }
  }
}

/** Builds the session and its overlay and shows the saved step. */
function startSession(pull: PullRef, token: string, tour: Tour, steps: PlannedStep[], viewed: ViewedFiles, isTourOverride: boolean): Session {
  const session: Session = {
    pull,
    token,
    steps,
    ...readSavedProgress(pull, steps.length),
    viewed,
    notes: new Map(),
    notesRequests: new Map(),
    reveal: new AbortController(),
    overlay: buildTourOverlay(tour.title, steps.length, isTourOverride, {
      goTo: (index) => goToStep(session, index),
      previous: () => goToStep(session, session.index - 1),
      next: () => goToStep(session, session.index + 1),
      finish: () => closeTour(pull),
      openLocation: () => void openInDiff(session),
      toggleViewed: () => toggleStepViewed(session),
      loadTour: () => openLoadPanel(session),
      close: () => closeTour(pull),
    }),
  }
  setCurrentStep(session, session.index)
  const step = steps[session.index]
  const target = step && targetOf(step)
  // A step opened from another tab of the pull request loads Files changed on its anchor; finish the job here.
  if (target && isFilesView(pull) && location.hash === `#${anchorOf(target)}`) void openInDiff(session)
  return session
}

function openLoadPanel(session: Session): void {
  stopReveal(session)
  showOverlay(loadPanel(session.pull, null, { overlay: session.overlay, session }))
}

function isFileViewed(session: Session, step: PlannedStep | undefined): boolean {
  return step !== undefined && step.fileId !== null && step.file !== undefined && session.viewed.paths.has(step.file)
}

/** Redraws the dots and warnings when the Viewed marks changed since the last read. */
async function refreshViewedMarks(): Promise<void> {
  const session = activeSession
  if (!session) return
  const before = session.viewed.paths
  session.viewed = await readViewedFiles(session.pull, session.token, before)
  const after = session.viewed.paths
  const hasChanged = after.size !== before.size || [...after].some((path) => !before.has(path))
  if (hasChanged && activeSession === session) showCurrentStep(session)
}

function goToStep(session: Session, index: number): void {
  setCurrentStep(session, index)
  void openInDiff(session)
}

function setCurrentStep(session: Session, index: number): void {
  const step = session.steps[index]
  if (!step) return
  session.index = index
  session.shown.add(index)
  saveProgress(session)
  showCurrentStep(session)
}

/** Draws the current step from the session's state. */
function showCurrentStep(session: Session): void {
  const { index } = session
  const step = session.steps[index]
  if (!step) return
  const notes = session.notes.get(index)
  session.overlay.showStep({
    index,
    steps: session.steps.map((listed, listedIndex) => ({
      label: labelStep(listed, listedIndex),
      isDone: isStepDone(session, listed, listedIndex),
    })),
    location: step.fileId === null ? null : step.line === undefined ? (step.file ?? '') : `${step.file}:${step.line}`,
    warning: warningsForCurrentStep(session).join(' '),
    notes: notes === undefined ? 'loading' : 'html' in notes ? notes : { text: step.description },
    fileViewed: step.fileId === null ? null : isFileViewed(session, step),
  })
}

/** A step without a diff is done once shown; one on a file is done once the file is marked Viewed. */
function isStepDone(session: Session, step: PlannedStep, index: number): boolean {
  return step.fileId === null ? session.shown.has(index) : isFileViewed(session, step)
}

/** Clicks GitHub's own Viewed control for the step's file, shows the new mark at once and, after marking, moves one step on; the page-wide click listener then reads it back. */
function toggleStepViewed(session: Session): void {
  const step = session.steps[session.index]
  if (!step?.fileId || step.file === undefined) return
  const toggle = findViewedToggle(step.fileId)
  if (!toggle) {
    const problem = `PR Tour can't find GitHub's Viewed control for ${step.file} on this page, so the file isn't marked. Use Viewed in the file's header.`
    session.overlay.showWarning([...warningsForCurrentStep(session), problem].join(' '))
    return
  }
  toggle.click()
  const paths = new Set(session.viewed.paths)
  if (paths.has(step.file)) paths.delete(step.file)
  else paths.add(step.file)
  session.viewed = { ...session.viewed, paths }
  const isLastStep = session.index === session.steps.length - 1
  if (paths.has(step.file) && !isLastStep) goToStep(session, session.index + 1)
  else showCurrentStep(session)
}

function labelStep(step: TourStep, index: number): string {
  if (step.title) return step.title
  if (step.file === undefined) return `Step ${index + 1}`
  return step.line === undefined ? step.file : `${step.file}:${step.line}`
}

function warningsForCurrentStep(session: Session): string[] {
  const step = session.steps[session.index]
  const notes = session.notes.get(session.index)
  const notesProblem = notes && 'problem' in notes ? `${notes.problem} The notes below are unformatted.` : null
  return [step?.warning ?? null, session.viewed.problem, notesProblem].filter((warning) => warning !== null)
}

/** Renders a step's notes once, and redraws the step if it is current when they arrive. */
function requestNotes(session: Session, index: number): Promise<void> {
  const existing = session.notesRequests.get(index)
  const step = session.steps[index]
  if (existing || !step) return existing ?? Promise.resolve()
  if (!session.token) {
    session.notes.set(index, { text: step.description })
    if (session.index === index) showCurrentStep(session)
    return Promise.resolve()
  }
  const request = renderMarkdown(step.description, session.pull, session.token).then(
    (html): RenderedNotes => ({ html }),
    (error: unknown): RenderedNotes => ({ problem: error instanceof Error ? error.message : String(error) }),
  )
  const settled = request.then((notes) => {
    session.notes.set(index, notes)
    if (session.index === index) showCurrentStep(session)
  })
  session.notesRequests.set(index, settled)
  return settled
}

async function openInDiff(session: Session): Promise<void> {
  stopReveal(session)
  const { pull, index } = session
  const step = session.steps[index]
  const target = step && targetOf(step)
  if (!step || !target) return
  if (!isFilesView(pull)) {
    location.assign(filesViewUrl(pull, anchorOf(target)))
    return
  }
  session.reveal = new AbortController()
  const problem = await revealInDiff(step, target, session.overlay, session.reveal.signal)
  if (problem && session.index === index) {
    session.overlay.showWarning([...warningsForCurrentStep(session), problem].join(' '))
  }
}

/** Ends a search for a line still running for an earlier step, or one the reviewer took over. */
function stopReveal(session: Session): void {
  session.reveal.abort()
  session.overlay.showStatus('')
}

function targetOf(step: PlannedStep): StepTarget | null {
  return step.fileId === null ? null : { fileId: step.fileId, line: step.target }
}

function anchorOf({ fileId, line }: StepTarget): string {
  return line === null ? fileId : lineAnchorId(fileId, line)
}

/** Scrolls to the step's file, expands it if GitHub collapsed it, then scrolls to its line and holds it there; GitHub renders large diffs lazily, so each waits to appear. */
async function revealInDiff(step: PlannedStep, target: StepTarget, overlay: TourOverlay, signal: AbortSignal): Promise<string | null> {
  const section = await findFileSection(target.fileId, FILE_WAIT_MS)
  if (!section) {
    return `GitHub hasn't shown ${step.file} on this page, so the tour can't scroll to it. Open it from the file tree, then click the file name in the tour again.`
  }
  if (signal.aborted) return null
  scrollToLanding(section, fileLanding(overlay))
  expandCollapsedFile(section)
  const { line } = target
  if (line === null) {
    tintLine(null)
    history.replaceState(history.state, '', `#${anchorOf(target)}`)
    await holdInView(() => document.getElementById(target.fileId), () => fileLanding(overlay), signal)
    return null
  }
  let lineElement = queryLine(target.fileId, line)
  if (!lineElement) {
    overlay.showStatus(`Finding line ${line.line}…`)
    lineElement = await searchForLine(target.fileId, line, { signal, timeoutMs: LINE_SEARCH_MS, readableBand: () => readableBand(overlay) })
    if (!signal.aborted) overlay.showStatus('')
  }
  if (signal.aborted) return null
  if (!lineElement) {
    scrollToLanding(section, fileLanding(overlay))
    return hasAnchoredLines(target.fileId)
      ? `GitHub didn't render line ${line.line} of ${step.file} within ${LINE_SEARCH_MS / 1000} seconds, so the tour stopped at the file. Scroll down to the line, or click the file name in the tour to search again.`
      : `PR Tour can't recognise the lines of ${step.file} on this page, so the tour stopped at the file; GitHub may have changed Files changed. Scroll down to line ${line.line} yourself.`
  }
  history.replaceState(history.state, '', `#${anchorOf(target)}`)
  // GitHub may redraw the line's row, so each frame finds it again and moves the tint to it.
  const findAndTintLine = (): HTMLElement | null => {
    const drawn = queryLine(target.fileId, line)
    if (drawn) tintLine(drawn)
    return drawn
  }
  await holdInView(findAndTintLine, () => lineLanding(overlay), signal)
  return null
}

/**
 * Keeps scrolling the element back to its landing spot for HOLD_MS, since GitHub keeps moving the page after the jump,
 * as when the file marked Viewed just above collapses. Stops early when the reviewer scrolls or moves to another step.
 */
async function holdInView(find: () => HTMLElement | null, landingTop: () => number, signal: AbortSignal): Promise<void> {
  const deadline = performance.now() + HOLD_MS
  while (!signal.aborted && performance.now() < deadline) {
    const element = find()
    if (element) scrollToLanding(element, landingTop())
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
}

/** Scrolls the element's top to `landingTop`, the viewport y; an element GitHub hasn't laid out yet, as in a collapsed file, has no position to scroll to. */
function scrollToLanding(element: HTMLElement, landingTop: number): void {
  if (element.getClientRects().length === 0) return
  const distance = element.getBoundingClientRect().top - landingTop
  if (Math.abs(distance) >= 1) window.scrollBy({ top: distance, behavior: 'instant' })
}

/** A file lands at the top of the readable band, so its name shows first. */
function fileLanding(overlay: TourOverlay): number {
  return readableBand(overlay).top
}

/** A line lands a third of the way down the readable band, so the code above it shows where it sits. */
function lineLanding(overlay: TourOverlay): number {
  const { top, bottom } = readableBand(overlay)
  return top + (bottom - top) / 3
}

/** The part of the screen that neither the tour nor GitHub's pinned bars cover. */
function readableBand(overlay: TourOverlay): ScreenBand {
  const { top, bottom } = overlay.uncoveredBand()
  return { top: Math.max(top, GITHUB_PINNED_BARS_PX), bottom }
}

/** The current step and the steps shown, kept per pull request for this tab; anything unreadable starts over. */
function readSavedProgress(pull: PullRef, stepCount: number): { index: number; shown: Set<number> } {
  const isStepIndex = (value: unknown): value is number =>
    Number.isInteger(value) && Number(value) >= 0 && Number(value) < stepCount
  let saved: unknown
  try {
    saved = JSON.parse(readStorage(sessionStorage, progressKey(pull)) ?? 'null')
  } catch {
    saved = null
  }
  // Any non-null object can be read field by field as unknown values.
  const record = typeof saved === 'object' && saved !== null ? (saved as Record<string, unknown>) : {}
  return {
    index: isStepIndex(record.index) ? record.index : 0,
    shown: new Set(Array.isArray(record.shown) ? record.shown.filter(isStepIndex) : []),
  }
}

function saveProgress(session: Session): void {
  writeStorage(sessionStorage, progressKey(session.pull), JSON.stringify({ index: session.index, shown: [...session.shown] }))
}

function progressKey(pull: PullRef): string {
  return `pr-tour:progress:${describePull(pull)}`
}
