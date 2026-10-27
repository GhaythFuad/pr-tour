/** The subset of the CodeTour format (https://aka.ms/codetour-schema) that PR Tour plays; `ref` is the commit the tour was written against. */
export type Tour = { title: string; ref?: string; steps: TourStep[] }

/** Which version of a file a step points into: the one the pull request leaves, or the one it started from. */
export type DiffSide = 'new' | 'old'

/**
 * `line` is 1-based and counts lines of the `side` version of the file, `new` when omitted.
 * `anchor` is that line's code, which finds the line again after later commits move it.
 */
export type TourStep = { title?: string; description: string; file?: string; line?: number; anchor?: string; side?: DiffSide }

export const CODETOUR_SCHEMA = 'https://aka.ms/codetour-schema'

/** A `problem` says what is wrong but not how to fix it, which depends on where the tour came from. */
export type TourLookup = { tour: Tour } | { problem: string } | null

/** Whether the pull request moved on from the commit the tour was written against; a tour without a `ref` can't tell. */
export function isTourOutdated(tour: Tour, headCommit: string): boolean {
  return tour.ref !== undefined && !headCommit.startsWith(tour.ref.toLowerCase())
}

/** Reads the newest ```json block whose `$schema` is CODETOUR_SCHEMA; a malformed one yields a problem. */
export function findTour(commentBodies: string[]): TourLookup {
  for (const body of [...commentBodies].reverse()) {
    for (const block of body.matchAll(/```json[^\n]*\n([\s\S]*?)\n\s*```/g)) {
      const found = parseTour(block[1] ?? '')
      if (found) return found
    }
  }
  return null
}

/** Reads a tour from a comment's text or from a bare `.tour` file. */
export function findTourInText(text: string): TourLookup {
  return findTour([text]) ?? parseTour(text)
}

/** Reads one tour's JSON; null when it isn't a CodeTour tour at all. */
function parseTour(json: string): TourLookup {
  const value = parseJson(json)
  return isPlainObject(value) && value.$schema === CODETOUR_SCHEMA ? readTour(value) : null
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readTour(value: Record<string, unknown>): TourLookup {
  if (typeof value.title !== 'string') return { problem: 'The tour has no "title" string.' }
  if (value.ref !== undefined && !(typeof value.ref === 'string' && /^[0-9a-f]{7,40}$/i.test(value.ref))) {
    return { problem: `The tour "${value.title}" has a "ref" that isn't a commit SHA.` }
  }
  if (!Array.isArray(value.steps) || value.steps.length === 0) {
    return { problem: `The tour "${value.title}" has no "steps".` }
  }
  const steps: TourStep[] = []
  for (const [index, step] of value.steps.entries()) {
    const problem = describeStepProblem(step)
    if (problem) return { problem: `Step ${index + 1} of "${value.title}" ${problem}.` }
    // describeStepProblem returned no problem, so every TourStep field has its declared type.
    steps.push(step as TourStep)
  }
  return { tour: { title: value.title, ...(typeof value.ref === 'string' && { ref: value.ref }), steps } }
}

function describeStepProblem(step: unknown): string | null {
  if (!isPlainObject(step)) return 'is not an object'
  if (typeof step.description !== 'string') return 'has no "description" string'
  if (step.title !== undefined && typeof step.title !== 'string') return 'has a "title" that is not a string'
  if (step.file !== undefined && typeof step.file !== 'string') return 'has a "file" that is not a string'
  for (const field of ['line', 'anchor', 'side']) {
    if (step[field] !== undefined && step.file === undefined) return `has a "${field}" without a "file"`
  }
  if (step.line !== undefined && !(Number.isInteger(step.line) && Number(step.line) >= 1)) {
    return 'has a "line" that is not a positive integer'
  }
  if (step.anchor !== undefined && !(typeof step.anchor === 'string' && step.anchor.trim() !== '' && !step.anchor.includes('\n'))) {
    return 'has an "anchor" that is not one line of code'
  }
  if (step.side !== undefined && step.side !== 'new' && step.side !== 'old') return 'has a "side" other than "new" or "old"'
  return null
}
