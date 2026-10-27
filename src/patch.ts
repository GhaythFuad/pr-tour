import type { ChangedFile } from './github'
import type { DiffSide, TourStep } from './tour'

/** A line the diff shows, with its number in each version of the file it belongs to. */
export type DiffLine = { text: string; oldLine: number | null; newLine: number | null }

/** The diff line a step points at: its number on `side`, and its code without indentation. */
export type LineTarget = { side: DiffSide; line: number; code: string; isCodeUnique: boolean }

type NumberedLine = DiffLine & { number: number }

/** Where a step lands in the pull request, and what the reviewer should know when it isn't where the tour meant. */
export type StepLocation = { file: ChangedFile | null; line: LineTarget | null; warning: string | null }

/** Manual tours use their saved locations without asking GitHub's API for repository data. */
export function locateManualStep(step: TourStep): StepLocation {
  if (step.file === undefined) return { file: null, line: null, warning: null }
  const file = { filename: step.file }
  if (step.line === undefined) {
    return { file, line: null, warning: step.anchor === undefined ? null : 'This manual step has only a code anchor. Add a line number to open the line without a PAT; this step opens the file.' }
  }
  return {
    file,
    line: { side: step.side ?? 'new', line: step.line, code: step.anchor?.trim() ?? '', isCodeUnique: false },
    warning: 'Manual mode uses the saved line number without checking the latest commit. Load an updated tour after new commits.',
  }
}

/** Reads the lines of a unified diff hunk by hunk, skipping GitHub's "No newline at end of file" markers. */
export function parsePatch(patch: string): DiffLine[] {
  const lines: DiffLine[] = []
  let oldLine = 0
  let newLine = 0
  for (const row of patch.split('\n')) {
    const hunk = row.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
    } else if (row.startsWith('+')) {
      lines.push({ text: row.slice(1), oldLine: null, newLine: newLine++ })
    } else if (row.startsWith('-')) {
      lines.push({ text: row.slice(1), oldLine: oldLine++, newLine: null })
    } else if (row.startsWith(' ')) {
      lines.push({ text: row.slice(1), oldLine: oldLine++, newLine: newLine++ })
    }
  }
  return lines
}

/**
 * Finds where a step lands: its `anchor` code wherever the diff now shows it, otherwise its `line`.
 * `isTourOutdated` says the pull request changed after the tour's `ref`, so a bare `line` may have moved.
 */
export function locateStep(step: TourStep, files: ChangedFile[], isTourOutdated: boolean): StepLocation {
  if (step.file === undefined) return { file: null, line: null, warning: null }
  const file = files.find((changed) => changed.filename === step.file) ?? null
  if (!file) return { file, line: null, warning: `${step.file} isn't changed in this pull request, so this step has no diff to open.` }
  if (step.line === undefined && step.anchor === undefined) return { file, line: null, warning: null }
  if (file.patch === undefined) {
    return { file, line: null, warning: `GitHub shows no line diff for ${step.file}, so this step opens the file instead of the line.` }
  }
  const side = step.side ?? 'new'
  const lines = parsePatch(file.patch)
  const numbered = lines.flatMap((line): NumberedLine[] => {
    const number = side === 'new' ? line.newLine : line.oldLine
    return number === null ? [] : [{ ...line, number }]
  })
  const targetOf = (line: NumberedLine): LineTarget => {
    const code = line.text.trim()
    return { side, line: line.number, code, isCodeUnique: code !== '' && lines.filter((other) => other.text.trim() === code).length === 1 }
  }

  let missingAnchor: string | null = null
  if (step.anchor !== undefined) {
    const anchor = step.anchor.trim()
    const matches = numbered.filter((line) => line.text.trim() === anchor)
    const nearest = nearestTo(matches, step.line)
    if (nearest && (matches.length === 1 || step.line !== undefined)) return { file, line: targetOf(nearest), warning: null }
    if (nearest) {
      const warning = `The code "${anchor}" appears ${matches.length} times in the diff of ${step.file}, so this step opens the first; a "line" would pick one.`
      return { file, line: targetOf(nearest), warning }
    }
    missingAnchor = `The code "${anchor}" isn't in the diff of ${step.file} any more`
  }

  const shown = step.line === undefined ? undefined : numbered.find((line) => line.number === step.line)
  if (!shown) {
    const lineOutside = step.line === undefined ? null : `line ${step.line} of ${step.file} is outside the diff`
    const cause = [missingAnchor, lineOutside].filter((part) => part !== null).join(', and ')
    return { file, line: null, warning: `${upperFirst(cause)}, so this step opens the file instead.` }
  }
  if (missingAnchor) return { file, line: targetOf(shown), warning: `${missingAnchor}, so this step opens line ${step.line}, which may now hold other code.` }
  if (isTourOutdated && step.anchor === undefined) {
    return { file, line: targetOf(shown), warning: `The pull request changed after this tour was written, so line ${step.line} of ${step.file} may have moved.` }
  }
  return { file, line: targetOf(shown), warning: null }
}

/** The match closest to `line`, or the first one when the step gives no line. */
function nearestTo(matches: NumberedLine[], line: number | undefined): NumberedLine | undefined {
  if (line === undefined) return matches[0]
  const distance = (match: NumberedLine) => Math.abs(match.number - line)
  return matches.reduce<NumberedLine | undefined>((best, match) => (best === undefined || distance(match) < distance(best) ? match : best), undefined)
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
