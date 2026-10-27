/**
 * Checks a review tour against its pull request before it's posted, so whoever wrote it (usually an LLM) fixes broken
 * steps first: `pnpm check-tour <pull request URL> [tour file]`. The tour file is the comment to post or a bare
 * `.tour` JSON file; without one, it checks the tour already posted. It signs in with GITHUB_TOKEN, else `gh auth token`.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describePull, listChangedFiles, listCommentBodies, parsePullPath, readHeadCommit } from './github'
import { locateStep, type LineTarget } from './patch'
import { CODETOUR_SCHEMA, findTour, findTourInText, isTourOutdated, type TourStep } from './tour'

const [pullUrl, tourPath] = process.argv.slice(2)
let pull = null
try {
  const url = new URL(pullUrl ?? '')
  if (url.origin === 'https://github.com') pull = parsePullPath(url.pathname)
} catch {}
if (!pull) fail('Usage: pnpm check-tour <pull request URL> [tour file]')

let token = process.env.GITHUB_TOKEN?.trim() ?? ''
if (!token) {
  try {
    token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    fail('Sign in with gh auth login, or set GITHUB_TOKEN to a token with access to the pull request.')
  }
}
const tourText = tourPath === undefined ? null : readFileSync(tourPath, 'utf8')
const found = tourText === null ? findTour(await listCommentBodies(pull, token)) : findTourInText(tourText)
if (!found) fail(`${tourPath ?? describePull(pull)} has no CodeTour tour: a JSON block whose "$schema" is ${CODETOUR_SCHEMA}.`)
if ('problem' in found) fail(`${found.problem} Fix the tour and check it again.`)

const { tour } = found
const [files, headCommit] = await Promise.all([listChangedFiles(pull, token), readHeadCommit(pull, token)])
const isOutdated = isTourOutdated(tour, headCommit)
let problemCount = 0

console.log(`"${tour.title}" on ${describePull(pull)}, whose latest commit is ${headCommit}`)
if (tour.ref === undefined) report('Tour', [`Add "ref": "${headCommit}" so reviewers learn when the pull request changes after the tour.`])
else if (isOutdated) report('Tour', [`"ref" is ${tour.ref}, not the latest commit; check every step against it, then set "ref": "${headCommit}".`])
for (const [index, step] of tour.steps.entries()) {
  const { line, warning } = locateStep(step, files, isOutdated)
  report(`Step ${index + 1} (${labelOf(step)})`, [warning, ...authoringProblems(step, line)].filter((problem) => problem !== null))
}
if (problemCount > 0) fail(`${problemCount} problem${problemCount === 1 ? '' : 's'}; fix the tour and check it again.`)
console.log('The tour is ready to post.')

/** What a tour that works today still needs so it keeps working after later commits and in CodeTour for VS Code. */
function authoringProblems(step: TourStep, line: LineTarget | null): string[] {
  if (line === null) return []
  if (!line.isCodeUnique) {
    const where = line.code === '' ? `Line ${line.line} is blank` : `The code of line ${line.line}, ${JSON.stringify(line.code)}, appears more than once in the diff`
    return [`${where}, so an anchor can't pick it out; point the step at a line of code that appears once in the diff and copy that code into "anchor".`]
  }
  if (step.anchor === undefined) return [`Add "anchor": ${JSON.stringify(line.code)}, the code of line ${line.line}, so the step finds it after later commits.`]
  if (step.line !== line.line) return [`Set "line": ${line.line}, where the anchor is, so CodeTour in VS Code opens the same line.`]
  return []
}

function labelOf(step: TourStep): string {
  if (step.title !== undefined) return step.title
  if (step.file === undefined) return 'no file'
  return step.line === undefined ? step.file : `${step.file}:${step.line}`
}

function report(subject: string, problems: string[]): void {
  problemCount += problems.length
  console.log(`${problems.length === 0 ? '✓' : '✗'} ${subject}`)
  for (const problem of problems) console.log(`    ${problem}`)
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}
