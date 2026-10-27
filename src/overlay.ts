import { readStorage, writeStorage } from './storage'
import { OVERLAY_STYLES } from './styles'
import { CODETOUR_SCHEMA } from './tour'

export type OverlayStep = { label: string; isDone: boolean }

/** A stretch of the viewport, in pixels from its top edge. */
export type ScreenBand = { top: number; bottom: number }

export type OverlayNotes = { html: string } | { text: string } | 'loading'

/** What the overlay shows for the current step. */
export type StepView = {
  index: number
  steps: OverlayStep[]
  location: string | null
  warning: string
  notes: OverlayNotes
  /** Whether the step's file is marked Viewed; null for a step without a file. */
  fileViewed: boolean | null
}

export type OverlayActions = {
  goTo: (index: number) => void
  previous: () => void
  next: () => void
  finish: () => void
  openLocation: () => void
  toggleViewed: () => void
  loadTour: () => void
  close: () => void
}

/** An overlay for the page; `remove` also drops the page-wide listeners it added. */
export type MountedOverlay = { host: HTMLElement; mount: () => void; remove: () => void }

/** Mounting it again after `remove` shows it as it was. */
export type TourOverlay = MountedOverlay & {
  showStep: (view: StepView) => void
  showWarning: (warning: string) => void
  /** Shows what the tour is doing on the page, such as searching for a line; an empty string clears it. */
  showStatus: (status: string) => void
  /** The part of the viewport the overlay leaves visible. */
  uncoveredBand: () => ScreenBand
}

export type LoadPanelActions = {
  /** `origin` names where the text came from, for a problem: the file's name, or "The pasted text". */
  load: (tourText: string, origin: string) => void
  /** Null unless a loaded tour replaces the tour comment. */
  useComment: (() => void) | null
  checkForTour: () => void
  cancel: () => void
}

export type LoadPanel = MountedOverlay & { showProblem: (problem: string) => void }

/** The edge of the screen the overlay sits on; the reviewer picks it, and every page remembers the choice. */
type Dock = 'top' | 'bottom'

const HIDDEN_KEY = 'pr-tour:hidden'
const DOCK_KEY = 'pr-tour:dock'
const CHEVRON_UP = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 10l4-4 4 4"/></svg>'
const CHEVRON_DOWN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>'
const CROSS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7m0-7l-7 7"/></svg>'
const ARROW_LEFT = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 4l-4 4 4 4"/></svg>'
const ARROW_RIGHT = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 4l4 4-4 4"/></svg>'
const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>'
/** A page with a folded corner: the button that loads a tour. */
const FILE_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 2.5H4.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V6z"/><path d="M9 2.5V6h3.5"/></svg>'
/** A window with its bar along the bottom edge: the button that moves the tour there. */
const DOCK_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M2.5 10h11"/></svg>'
/** How far an edge fades where the dots or the step have more content scrolled out of sight. */
const EDGE_FADE_PX = 20
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
const SETTLED = { opacity: 1, transform: 'none' }

export function buildTourOverlay(tourTitle: string, stepCount: number, isTourOverride: boolean, actions: OverlayActions): TourOverlay {
  const shell = buildShell(tourTitle, isTourOverride, actions.close, actions.loadTour)
  const { host, card, pillCounter, controls } = shell
  card.classList.add('tour')

  const rail = element('div', 'rail')
  const railContent = element('div', 'rail-content')
  railContent.style.setProperty('--count', String(stepCount))
  const dots = element('div', 'dots')
  const tip = element('div', 'tip')
  tip.setAttribute('role', 'tooltip')
  const dotButtons = Array.from({ length: stepCount }, (_, index) => {
    const dot = element('button', 'dot')
    dot.type = 'button'
    dot.addEventListener('click', () => actions.goTo(index))
    const showTip = (): void => placeTip(tip, dot, card)
    dot.addEventListener('pointerenter', showTip)
    dot.addEventListener('focus', showTip)
    dot.addEventListener('pointerleave', () => tip.removeAttribute('data-shown'))
    dot.addEventListener('blur', () => tip.removeAttribute('data-shown'))
    return dot
  })
  dots.append(...dotButtons)
  railContent.append(element('div', 'track'), dots)
  rail.append(railContent)
  rail.addEventListener('scroll', () => {
    tip.removeAttribute('data-shown')
    fadeRailEdges(rail)
  })
  const stepContent = element('div', 'step')
  stepContent.addEventListener('scroll', () => fadeStepEnd(stepContent))
  // The rail and the step have no size until the overlay is on the page, and change size with the window.
  const sizes = new ResizeObserver(() => {
    const currentDot = dotButtons.find((dot) => dot.hasAttribute('aria-current'))
    if (currentDot) centerInRail(rail, currentDot)
    fadeStepEnd(stepContent)
  })

  const heading = element('h2', 'step-title')
  const location = element('button', 'location')
  location.type = 'button'
  location.title = 'Show in the diff'
  location.addEventListener('click', actions.openLocation)
  const warning = element('p', 'warning')
  const notes = element('div', 'notes')
  stepContent.append(heading, location, warning, notes)
  const counter = element('span', 'counter')
  const status = element('span', 'status')
  status.setAttribute('role', 'status')
  const viewed = textButton('button', '', actions.toggleViewed)
  const previous = textButton('button back', `${ARROW_LEFT}<span>Previous</span>`, actions.previous)
  let isLastStep = false
  const next = textButton('button primary', '', () => (isLastStep ? actions.finish() : actions.next()))
  const footer = element('div', 'footer')
  footer.append(controls, counter, status, element('span', 'spacer'), viewed, previous, next)
  card.append(rail, stepContent, footer, tip)

  const runShortcut = (event: KeyboardEvent): void => {
    const command = readShortcut(event)
    const isCardShown = !host.hasAttribute('data-hidden')
    if (command === 'toggle') void shell.setHidden(isCardShown)
    else if (command === 'previous' && isCardShown && !previous.disabled) actions.previous()
    else if (command === 'next' && isCardShown && !isLastStep) actions.next()
    else return
    event.preventDefault()
  }

  let shownIndex: number | null = null

  return {
    host,
    mount: () => {
      document.addEventListener('keydown', runShortcut)
      sizes.observe(rail)
      sizes.observe(stepContent)
      shell.mount()
    },
    remove: () => {
      document.removeEventListener('keydown', runShortcut)
      sizes.disconnect()
      host.remove()
    },
    showStep: (view) => {
      const { index, steps } = view
      const direction = shownIndex === null || shownIndex === index ? 0 : Math.sign(index - shownIndex)
      shownIndex = index
      counter.textContent = `${index + 1} / ${steps.length}`
      pillCounter.textContent = counter.textContent
      for (const [dotIndex, dot] of dotButtons.entries()) {
        const step = steps[dotIndex]
        const isDone = step?.isDone ?? false
        dot.toggleAttribute('data-done', isDone)
        dot.dataset.label = `${dotIndex + 1}. ${step?.label ?? ''}`
        dot.setAttribute('aria-label', `Step ${dotIndex + 1}: ${step?.label ?? ''} (${isDone ? 'done' : 'to review'})`)
        if (dotIndex === index) dot.setAttribute('aria-current', 'step')
        else dot.removeAttribute('aria-current')
      }
      // The file names a step on a file; the title stays in the dot's tooltip and heads only a step without one.
      heading.hidden = view.location !== null
      heading.textContent = steps[index]?.label ?? ''
      location.hidden = view.location === null
      fillLocation(location, view.location ?? '')
      warning.textContent = view.warning
      fillNotes(notes, view.notes)
      viewed.hidden = view.fileViewed === null
      viewed.setAttribute('aria-pressed', String(view.fileViewed === true))
      viewed.innerHTML = view.fileViewed ? `${CHECK}<span>Viewed</span>` : '<span>Mark viewed</span>'
      viewed.title = view.fileViewed ? 'Unmark the file as viewed on GitHub' : 'Mark the file as viewed on GitHub'
      previous.disabled = index === 0
      isLastStep = index === steps.length - 1
      next.innerHTML = isLastStep ? `<span>Finish</span>${CHECK}` : `<span>Next</span>${ARROW_RIGHT}`
      const currentDot = dotButtons[index]
      if (currentDot) centerInRail(rail, currentDot)
      if (direction !== 0) {
        stepContent.scrollTop = 0
        if (!prefersReducedMotion()) {
          stepContent.animate(
            [{ opacity: 0, transform: `translateX(${direction * 10}px)` }, SETTLED],
            { duration: 220, easing: EASE_OUT },
          )
        }
      }
      fadeStepEnd(stepContent)
    },
    showWarning: (text) => {
      warning.textContent = text
    },
    showStatus: (text) => {
      status.textContent = text
    },
    uncoveredBand: () => {
      const screen = { top: 0, bottom: window.innerHeight }
      if (host.hasAttribute('data-hidden')) return screen
      const cardBox = card.getBoundingClientRect()
      return shell.currentDock() === 'top' ? { ...screen, top: cardBox.bottom } : { ...screen, bottom: cardBox.top }
    },
  }
}

/** Why there is no tour to show, in the pill a hidden tour folds into. */
export function buildProblemOverlay(problem: string, close: () => void): MountedOverlay {
  const pill = element('div', 'pill problem')
  pill.setAttribute('role', 'alert')
  const closeButton = iconButton(CROSS, 'Close; the toolbar button tries again')
  closeButton.addEventListener('click', close)
  pill.append(element('span', 'eyebrow', 'Review tour'), element('span', 'message', problem), closeButton)
  return buildPillOverlay(pill)
}

/** A pill that answers the toolbar button at once while the tour loads; it fades out as the tour takes its place. */
export function buildLoadingOverlay(): MountedOverlay {
  const pill = element('div', 'pill loading')
  pill.setAttribute('role', 'status')
  pill.append(element('span', 'eyebrow', 'Review tour'), element('span', 'counter', 'Loading…'))
  return buildPillOverlay(pill)
}

/** Takes a tour pasted as text or chosen as a file; `reason`, when given, says why it opened without being asked. */
export function buildLoadPanel(reason: string | null, actions: LoadPanelActions, pullUrl: string): LoadPanel {
  const host = document.createElement('pr-tour-overlay')
  const dock = readDock()
  host.dataset.dock = dock
  const card = element('section', 'card load')
  const isEmpty = reason !== null
  card.setAttribute('aria-label', isEmpty ? 'Generate a review tour' : 'Load a review tour')
  const hint = 'Paste a tour comment or a .tour file, or choose the file. PR Tour remembers it for this pull request after reloads.'
  const tourField = element('textarea', 'tour-field')
  tourField.placeholder = `{ "$schema": "${CODETOUR_SCHEMA}", "title": "…", "steps": […] }`
  tourField.spellcheck = false
  tourField.setAttribute('aria-label', 'Tour')
  const message = element('p', 'message')
  message.setAttribute('role', 'alert')
  const fileInput = element('input', '')
  fileInput.type = 'file'
  fileInput.accept = '.tour,.json,.md,.txt'
  fileInput.hidden = true
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    // Choosing the same file again after fixing it fires `change` only once the input is empty.
    fileInput.value = ''
    if (file) actions.load(await file.text(), file.name)
  })
  const load = textButton('button primary', '<span>Load</span>', () => actions.load(tourField.value, 'The pasted text'))
  load.disabled = true
  tourField.addEventListener('input', () => {
    load.disabled = tourField.value.trim() === ''
    message.textContent = ''
  })
  const footer = element('div', 'footer')
  if (actions.useComment) footer.append(textButton('button', '<span>Use the tour comment</span>', actions.useComment))
  const mainButtons = element('div', 'main-buttons')
  mainButtons.append(
    textButton('button', '<span>Cancel</span>', actions.cancel),
    textButton('button', '<span>Choose file…</span>', () => fileInput.click()),
    load,
  )
  footer.append(mainButtons)
  card.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    actions.cancel()
  })
  if (isEmpty) {
    card.classList.add('onboarding')
    const header = element('div', 'load-heading')
    const titles = element('div', '')
    titles.append(element('span', 'eyebrow', 'PR Tour'), element('h2', 'step-title', 'Choose how to load your tour'))
    const close = iconButton(CROSS, 'Close tour setup')
    close.addEventListener('click', actions.cancel)
    header.append(titles, close)

    const choices = element('div', 'tour-choices')
    choices.setAttribute('role', 'group')
    choices.setAttribute('aria-label', 'Tour loading method')
    const manualChoice = element('button', 'tour-choice')
    const commentChoice = element('button', 'tour-choice')
    for (const [choice, title, subtitle] of [
      [manualChoice, 'Without a PAT', 'Paste or upload a tour'],
      [commentChoice, 'With a PAT', 'Read tour comments from the PR'],
    ] as const) {
      choice.type = 'button'
      choice.setAttribute('aria-label', title)
      choice.append(element('strong', '', title), element('span', '', subtitle))
      choices.append(choice)
    }
    const methodHint = element('p', 'hint method-hint')
    const connection = element('div', 'token-setup')
    connection.append(element('p', 'hint', '1. Create a personal access token (PAT) with access to this repository and Pull requests: Read-only.'))
    const tokenLink = element('a', 'skill-link', 'Create a fine-grained PAT')
    tokenLink.href = 'https://github.com/settings/personal-access-tokens/new'
    tokenLink.target = '_blank'
    tokenLink.rel = 'noreferrer'
    connection.append(tokenLink, element('p', 'hint', '2. Right-click the PR Tour extension icon → Options. Save the PAT, then reload this PR.'))
    connection.append(element('p', 'hint', 'This PAT lets the extension read comments and Viewed status. Your coding agent posts the tour using its own GitHub sign-in; see Skill instructions below.'))

    const feedback = element('p', 'copy-feedback')
    feedback.setAttribute('role', 'status')
    const steps = element('ol', 'generate-steps')
    const installCommand = 'npx skills add GhaythFuad/pr-tour --skill prepare-pr-for-review'
    const manualPrompt = `Use the prepare-pr-for-review skill to write and validate a review tour for ${pullUrl}. Save it as a .tour file for me to load into PR Tour. Do not post a PR comment.`
    const commentPrompt = `Use the prepare-pr-for-review skill to write, validate, and post a review tour for ${pullUrl}.`
    let prompt = manualPrompt
    let promptField: HTMLTextAreaElement
    let promptHelp: HTMLElement
    let promptCopy: HTMLButtonElement
    for (const { title, help, value, label, fieldLabel, copied } of [
      { title: 'Install the skill', help: 'Requires Node.js 22+ and GitHub CLI (gh). Run this once in your project’s terminal.', value: installCommand, label: 'install command', fieldLabel: 'Skill install command', copied: 'Install command copied.' },
      { title: 'Ask your coding agent', help: 'Paste this prompt into your agent.', value: prompt, label: 'generation prompt', fieldLabel: 'Tour generation prompt', copied: 'Generation prompt copied.' },
    ]) {
      const step = element('li', 'generate-step')
      const text = element('div', 'generate-content')
      const field = element('textarea', 'copy-text', value)
      field.readOnly = true
      field.rows = label === 'generation prompt' ? 3 : 2
      field.setAttribute('aria-label', fieldLabel)
      const copy = textButton('button copy-button', '<span>Copy</span>', () => {
        void navigator.clipboard.writeText(field.value).then(
          () => {
            feedback.textContent = copied
            copy.textContent = 'Copied'
          },
          () => {
            feedback.textContent = 'Could not copy. Select the text and copy it manually.'
            field.focus({ preventScroll: true })
            field.select()
          },
        )
      })
      copy.setAttribute('aria-label', `Copy ${label}`)
      const copyRow = element('div', 'copy-row')
      copyRow.append(field, copy)
      const helpText = element('p', 'hint', help)
      text.append(element('h3', 'generate-title', title), helpText, copyRow)
      if (label === 'generation prompt') {
        promptField = field
        promptHelp = helpText
        promptCopy = copy
      }
      step.append(text)
      steps.append(step)
    }
    const next = element('div', 'generate-next')
    next.append(
      element('p', 'hint', 'Once your agent posts the tour comment, check for it here.'),
      textButton('button primary', '<span>Check for tour</span>', actions.checkForTour),
    )
    const instructions = element('a', 'skill-link', 'Skill instructions')
    instructions.href = 'https://github.com/GhaythFuad/pr-tour/tree/main/skills/prepare-pr-for-review'
    instructions.target = '_blank'
    instructions.rel = 'noreferrer'
    const manual = element('div', 'manual-tour')
    manual.append(element('h3', 'generate-title', 'Load your tour'), element('p', 'hint', 'Paste the tour below, or choose the .tour file your agent saved.'), tourField, message, footer, fileInput)
    const setMethod = (withPat: boolean): void => {
      manualChoice.setAttribute('aria-pressed', String(!withPat))
      commentChoice.setAttribute('aria-pressed', String(withPat))
      connection.hidden = !withPat
      next.hidden = !withPat
      manual.hidden = withPat
      methodHint.textContent = withPat
        ? 'Connect a PAT once. PR Tour then reads the tour comment from the PR, including private repositories.'
        : 'No PAT required. Load a tour yourself on any PR you can open in GitHub, including private PRs. Notes appear as plain text; commit checks and Viewed status are unavailable.'
      prompt = withPat ? commentPrompt : manualPrompt
      promptField.value = prompt
      promptHelp.textContent = withPat ? 'Ask your agent to post the tour as a PR comment.' : 'Ask your agent to save a file. It does not need to post a comment.'
      promptCopy.textContent = 'Copy'
      feedback.textContent = ''
    }
    manualChoice.addEventListener('click', () => setMethod(false))
    commentChoice.addEventListener('click', () => setMethod(true))
    setMethod(false)
    card.append(header, element('p', 'hint', reason), choices, methodHint, connection, steps, feedback, manual, next, instructions)
  } else {
    card.append(element('h2', 'step-title', 'Load a tour'), element('p', 'hint', hint), tourField, message, footer, fileInput)
  }
  host.attachShadow({ mode: 'open' }).append(element('style', '', OVERLAY_STYLES), card)
  return {
    host,
    mount: () => {
      document.body.append(host)
      if (!isEmpty) tourField.focus({ preventScroll: true })
      if (!prefersReducedMotion()) card.animate([tucked(dock), SETTLED], { duration: 220, easing: EASE_OUT })
    },
    remove: () => host.remove(),
    showProblem: (text) => {
      message.textContent = text
    },
  }
}

/** An overlay that is only a pill, easing in on mount and out on removal. */
function buildPillOverlay(pill: HTMLElement): MountedOverlay {
  const host = document.createElement('pr-tour-overlay')
  const dock = readDock()
  host.dataset.dock = dock
  host.toggleAttribute('data-hidden', true)
  host.attachShadow({ mode: 'open' }).append(element('style', '', OVERLAY_STYLES), pill)
  return {
    host,
    mount: () => {
      document.body.append(host)
      if (!prefersReducedMotion()) pill.animate([tucked(dock), SETTLED], { duration: 220, easing: EASE_OUT })
    },
    remove: () => {
      if (prefersReducedMotion()) host.remove()
      else void pill.animate([SETTLED, tucked(dock)], { duration: 140, easing: 'ease-in' }).finished.then(() => host.remove())
    },
  }
}

function buildShell(tourTitle: string, isTourOverride: boolean, close: () => void, loadTour: () => void) {
  const host = document.createElement('pr-tour-overlay')
  const shadow = host.attachShadow({ mode: 'open' })
  const style = element('style', '', OVERLAY_STYLES)

  const card = element('section', 'card')
  card.setAttribute('aria-label', `Review tour: ${tourTitle}`)
  const hide = iconButton(CHEVRON_UP, 'Hide the tour (H)')
  hide.classList.add('turns-with-dock')
  let dock = readDock()
  const dockButton = iconButton(DOCK_ICON, '')
  dockButton.classList.add('turns-with-dock')
  const loadButton = iconButton(
    FILE_ICON,
    isTourOverride ? 'Playing a tour you loaded, not the tour comment. Load another, or go back to the comment' : 'Load a tour from a file or pasted text',
  )
  loadButton.toggleAttribute('data-tour-override', isTourOverride)
  const closeButton = iconButton(CROSS, 'Close the tour; the toolbar button reopens it')
  const controls = element('span', 'controls')
  controls.append(hide, dockButton, loadButton, closeButton)

  const pill = element('button', 'pill turns-with-dock')
  pill.type = 'button'
  pill.title = tourTitle
  pill.setAttribute('aria-label', `Show the review tour: ${tourTitle} (H)`)
  const pillCounter = element('span', 'counter')
  pill.append(element('span', 'eyebrow', 'Review tour'), pillCounter)
  pill.insertAdjacentHTML('beforeend', CHEVRON_DOWN)
  shadow.append(style, card, pill)
  host.toggleAttribute('data-hidden', readStorage(localStorage, HIDDEN_KEY) === '1')
  placeOnDock()

  /** Puts the overlay on its dock's edge, and labels the dock button with the edge it moves to. */
  function placeOnDock(): void {
    host.dataset.dock = dock
    setLabel(dockButton, dock === 'top' ? 'Move the tour to the bottom' : 'Move the tour to the top')
  }

  let isSwitching = false
  /** Swaps the card and the pill, easing one out and the other in. */
  const setHidden = async (hidden: boolean): Promise<void> => {
    if (isSwitching || host.hasAttribute('data-hidden') === hidden) return
    isSwitching = true
    const [leaving, entering] = hidden ? [card, pill] : [pill, card]
    if (!prefersReducedMotion()) {
      await leaving.animate([SETTLED, tucked(dock)], { duration: 140, easing: 'ease-in' }).finished
    }
    host.toggleAttribute('data-hidden', hidden)
    writeStorage(localStorage, HIDDEN_KEY, hidden ? '1' : null)
    if (!prefersReducedMotion()) entering.animate([tucked(dock), SETTLED], { duration: 220, easing: EASE_OUT })
    isSwitching = false
  }
  /** Moves the card to the other edge, easing it out toward the old edge and in from the new one. */
  const switchDock = async (): Promise<void> => {
    if (isSwitching) return
    isSwitching = true
    if (!prefersReducedMotion()) await card.animate([SETTLED, tucked(dock)], { duration: 140, easing: 'ease-in' }).finished
    dock = dock === 'top' ? 'bottom' : 'top'
    writeStorage(localStorage, DOCK_KEY, dock === 'bottom' ? dock : null)
    placeOnDock()
    if (!prefersReducedMotion()) card.animate([tucked(dock), SETTLED], { duration: 220, easing: EASE_OUT })
    isSwitching = false
  }
  hide.addEventListener('click', () => void setHidden(true))
  pill.addEventListener('click', () => void setHidden(false))
  dockButton.addEventListener('click', () => void switchDock())
  loadButton.addEventListener('click', loadTour)
  closeButton.addEventListener('click', close)

  const mount = (): void => {
    document.body.append(host)
    if (prefersReducedMotion()) return
    const shown = host.hasAttribute('data-hidden') ? pill : card
    shown.animate([tucked(dock), SETTLED], { duration: 320, easing: EASE_OUT })
  }

  return { host, card, controls, pillCounter, setHidden, mount, currentDock: () => dock }
}

function readDock(): Dock {
  return readStorage(localStorage, DOCK_KEY) === 'bottom' ? 'bottom' : 'top'
}

/** Where the card and the pill ease in from and out to: faded, and nudged toward the edge they sit on. */
function tucked(dock: Dock): Keyframe {
  return { opacity: 0, transform: `translateY(${dock === 'top' ? -6 : 6}px) scale(0.98)` }
}

/** Mutes the folder so the file's own name stands out. */
function fillLocation(location: HTMLElement, path: string): void {
  const nameStart = path.lastIndexOf('/') + 1
  location.replaceChildren(element('span', 'folder', path.slice(0, nameStart)), path.slice(nameStart))
}

function fillNotes(notes: HTMLElement, content: OverlayNotes): void {
  notes.classList.toggle('plain', typeof content === 'object' && 'text' in content)
  notes.classList.toggle('loading', content === 'loading')
  if (content === 'loading') notes.textContent = 'Loading notes…'
  else if ('html' in content) notes.innerHTML = content.html
  else notes.textContent = content.text
}

function prefersReducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Arrow keys and H drive the tour unless the reviewer is typing or holding a modifier. */
function readShortcut(event: KeyboardEvent): 'previous' | 'next' | 'toggle' | null {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null
  const focused = event.composedPath()[0]
  const isTyping =
    focused instanceof HTMLElement &&
    (focused.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(focused.tagName))
  if (isTyping) return null
  if (event.key === 'ArrowLeft') return 'previous'
  if (event.key === 'ArrowRight') return 'next'
  if (event.key === 'h' || event.key === 'H') return 'toggle'
  return null
}

function placeTip(tip: HTMLElement, dot: HTMLButtonElement, card: HTMLElement): void {
  tip.textContent = dot.dataset.label ?? ''
  tip.setAttribute('data-shown', '')
  const cardBox = card.getBoundingClientRect()
  const dotBox = dot.getBoundingClientRect()
  const halfWidth = tip.offsetWidth / 2
  const center = dotBox.left + dotBox.width / 2 - cardBox.left
  tip.style.left = `${Math.min(Math.max(center, halfWidth + 8), cardBox.width - halfWidth - 8)}px`
  tip.style.top = `${dotBox.bottom - cardBox.top + 2}px`
}

function centerInRail(rail: HTMLElement, dot: HTMLElement): void {
  rail.scrollTo({ left: dot.offsetLeft + dot.offsetWidth / 2 - rail.clientWidth / 2, behavior: 'smooth' })
  fadeRailEdges(rail)
}

/** Fades an edge of the dots only where more dots are scrolled out of sight. */
function fadeRailEdges(rail: HTMLElement): void {
  const hiddenAfter = rail.scrollWidth - rail.clientWidth - rail.scrollLeft
  rail.style.setProperty('--fade-start', `${rail.scrollLeft > 1 ? EDGE_FADE_PX : 0}px`)
  rail.style.setProperty('--fade-end', `${hiddenAfter > 1 ? EDGE_FADE_PX : 0}px`)
}

/** Fades the bottom of the step only while more of its notes are scrolled out of sight. */
function fadeStepEnd(stepContent: HTMLElement): void {
  const hiddenBelow = stepContent.scrollHeight - stepContent.clientHeight - stepContent.scrollTop
  stepContent.style.setProperty('--fade-end', `${hiddenBelow > 1 ? EDGE_FADE_PX : 0}px`)
}

function iconButton(icon: string, label: string): HTMLButtonElement {
  const button = element('button', 'icon')
  button.type = 'button'
  button.innerHTML = icon
  setLabel(button, label)
  return button
}

function setLabel(button: HTMLButtonElement, label: string): void {
  button.title = label
  button.setAttribute('aria-label', label)
}

function textButton(className: string, content: string, onClick: () => void): HTMLButtonElement {
  const button = element('button', className)
  button.type = 'button'
  button.innerHTML = content
  button.addEventListener('click', onClick)
  return button
}

function element<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className: string,
  text = '',
): HTMLElementTagNameMap[Tag] {
  const created = document.createElement(tag)
  created.className = className
  created.textContent = text
  return created
}
