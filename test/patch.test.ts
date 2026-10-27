import { describe, expect, it } from 'vitest'
import type { ChangedFile } from '../src/github'
import { locateStep, parsePatch } from '../src/patch'

const PATCH = [
  '@@ -10,4 +10,5 @@ export function save() {',
  '   const draft = read()',
  '-  if (draft.revision !== expected) {',
  '+  if (draft.revision !== expected.revision) {',
  '+    report(draft)',
  '     throw new StaleRevision()',
  '   }',
  '@@ -40,2 +41,3 @@',
  '   }',
  '+  return draft',
  ' }',
  '\\ No newline at end of file',
].join('\n')
const FILES: ChangedFile[] = [{ filename: 'src/save.ts', patch: PATCH }, { filename: 'assets/logo.png' }]

describe('parsePatch', () => {
  it('numbers each line in the versions of the file it belongs to', () => {
    expect(parsePatch(PATCH).slice(0, 4)).toEqual([
      { text: '  const draft = read()', oldLine: 10, newLine: 10 },
      { text: '  if (draft.revision !== expected) {', oldLine: 11, newLine: null },
      { text: '  if (draft.revision !== expected.revision) {', oldLine: null, newLine: 11 },
      { text: '    report(draft)', oldLine: null, newLine: 12 },
    ])
  })

  it('restarts the numbers at each hunk and skips the end-of-file marker', () => {
    expect(parsePatch(PATCH).slice(-3)).toEqual([
      { text: '  }', oldLine: 40, newLine: 41 },
      { text: '  return draft', oldLine: null, newLine: 42 },
      { text: '}', oldLine: 41, newLine: 43 },
    ])
  })
})

describe('locateStep', () => {
  const step = { description: 'notes', file: 'src/save.ts' }

  it('finds the line by its anchor wherever later commits moved it', () => {
    expect(locateStep({ ...step, line: 30, anchor: 'report(draft)' }, FILES, true)).toEqual({
      file: FILES[0],
      line: { side: 'new', line: 12, code: 'report(draft)', isCodeUnique: true },
      warning: null,
    })
  })

  it('finds a deleted line in the old file', () => {
    const located = locateStep({ ...step, side: 'old', anchor: 'if (draft.revision !== expected) {' }, FILES, false)
    expect(located.line).toEqual({ side: 'old', line: 11, code: 'if (draft.revision !== expected) {', isCodeUnique: true })
  })

  it('picks the copy of repeated code nearest the line', () => {
    const located = locateStep({ ...step, line: 40, anchor: '}' }, FILES, false)
    expect(located.line).toEqual({ side: 'new', line: 41, code: '}', isCodeUnique: false })
    expect(located.warning).toBeNull()
  })

  it('opens the first copy of repeated code when the step gives no line, and says so', () => {
    const located = locateStep({ ...step, anchor: '}' }, FILES, false)
    expect(located.line?.line).toBe(14)
    expect(located.warning).toBe('The code "}" appears 3 times in the diff of src/save.ts, so this step opens the first; a "line" would pick one.')
  })

  it('falls back to the line when the anchor is gone', () => {
    expect(locateStep({ ...step, line: 12, anchor: 'audit(draft)' }, FILES, false)).toEqual({
      file: FILES[0],
      line: { side: 'new', line: 12, code: 'report(draft)', isCodeUnique: true },
      warning: 'The code "audit(draft)" isn\'t in the diff of src/save.ts any more, so this step opens line 12, which may now hold other code.',
    })
  })

  it('opens the file when neither the anchor nor the line is in the diff', () => {
    expect(locateStep({ ...step, line: 30, anchor: 'audit(draft)' }, FILES, false).warning).toBe(
      'The code "audit(draft)" isn\'t in the diff of src/save.ts any more, and line 30 of src/save.ts is outside the diff, so this step opens the file instead.',
    )
    expect(locateStep({ ...step, line: 30 }, FILES, false).warning).toBe(
      'Line 30 of src/save.ts is outside the diff, so this step opens the file instead.',
    )
  })

  it('warns that a bare line may have moved once the pull request changed after the tour', () => {
    expect(locateStep({ ...step, line: 12 }, FILES, true).warning).toBe(
      'The pull request changed after this tour was written, so line 12 of src/save.ts may have moved.',
    )
    expect(locateStep({ ...step, line: 12 }, FILES, false).warning).toBeNull()
  })

  it('explains steps whose file has no line diff or is not in the pull request', () => {
    expect(locateStep({ description: 'x', file: 'assets/logo.png', line: 1 }, FILES, false)).toEqual({
      file: FILES[1],
      line: null,
      warning: 'GitHub shows no line diff for assets/logo.png, so this step opens the file instead of the line.',
    })
    expect(locateStep({ description: 'x', file: 'src/gone.ts' }, FILES, false)).toEqual({
      file: null,
      line: null,
      warning: "src/gone.ts isn't changed in this pull request, so this step has no diff to open.",
    })
  })
})
