import { describe, expect, it } from 'vitest'
import { CODETOUR_SCHEMA, findTour, findTourInText, isTourOutdated } from '../src/tour'

const comment = (tour: unknown) => `<details><summary>Review tour</summary>\n\n\`\`\`json\n${JSON.stringify(tour, null, 2)}\n\`\`\`\n</details>`

describe('findTour', () => {
  it('returns null when no comment has a CodeTour block', () => {
    expect(findTour(['LGTM', '```json\n{"steps": []}\n```'])).toBeNull()
  })

  it('reads the tour from the newest comment that has one', () => {
    const older = comment({ $schema: CODETOUR_SCHEMA, title: 'Old', steps: [{ description: 'a' }] })
    const newer = comment({
      $schema: CODETOUR_SCHEMA,
      title: 'New',
      steps: [{ description: 'Start here' }, { title: 'Types', description: 'b', file: 'src/a.ts', line: 3 }],
    })
    expect(findTour([older, newer, 'Thanks!'])).toEqual({
      tour: {
        title: 'New',
        steps: [{ description: 'Start here' }, { title: 'Types', description: 'b', file: 'src/a.ts', line: 3 }],
      },
    })
  })

  it('names the step that breaks the format', () => {
    const broken = comment({ $schema: CODETOUR_SCHEMA, title: 'T', steps: [{ description: 'ok' }, { description: 'x', line: 4 }] })
    expect(findTour([broken])).toEqual({
      problem: 'Step 2 of "T" has a "line" without a "file".',
    })
  })

  it('rejects a line that is not a positive integer', () => {
    const broken = comment({ $schema: CODETOUR_SCHEMA, title: 'T', steps: [{ description: 'x', file: 'a', line: 0 }] })
    expect(findTour([broken])).toMatchObject({ problem: expect.stringContaining('not a positive integer') })
  })

  it('reads the anchor, side and ref PR Tour adds to CodeTour', () => {
    const tour = { $schema: CODETOUR_SCHEMA, title: 'T', ref: 'abc1234', steps: [{ description: 'x', file: 'a.ts', line: 3, anchor: 'return a', side: 'old' }] }
    expect(findTour([comment(tour)])).toEqual({
      tour: { title: 'T', ref: 'abc1234', steps: [{ description: 'x', file: 'a.ts', line: 3, anchor: 'return a', side: 'old' }] },
    })
  })

  it.each([
    [{ ref: 'main' }, 'has a "ref" that isn\'t a commit SHA'],
    [{ steps: [{ description: 'x', anchor: 'return a' }] }, 'has a "anchor" without a "file"'],
    [{ steps: [{ description: 'x', file: 'a.ts', anchor: 'a\nb' }] }, 'has an "anchor" that is not one line of code'],
    [{ steps: [{ description: 'x', file: 'a.ts', anchor: '  ' }] }, 'has an "anchor" that is not one line of code'],
    [{ steps: [{ description: 'x', file: 'a.ts', side: 'left' }] }, 'has a "side" other than "new" or "old"'],
  ])('rejects %j', (fields, problem) => {
    const tour = { $schema: CODETOUR_SCHEMA, title: 'T', steps: [{ description: 'x' }], ...fields }
    expect(findTour([comment(tour)])).toMatchObject({ problem: expect.stringContaining(problem) })
  })

  it('rejects a tour without steps', () => {
    expect(findTour([comment({ $schema: CODETOUR_SCHEMA, title: 'T', steps: [] })])).toMatchObject({
      problem: expect.stringContaining('has no "steps"'),
    })
  })
})

describe('findTourInText', () => {
  const tour = { $schema: CODETOUR_SCHEMA, title: 'T', steps: [{ description: 'x' }] }

  it('reads a pasted comment and a bare tour file alike', () => {
    expect(findTourInText(comment(tour))).toEqual({ tour: { title: 'T', steps: [{ description: 'x' }] } })
    expect(findTourInText(JSON.stringify(tour))).toEqual({ tour: { title: 'T', steps: [{ description: 'x' }] } })
  })

  it('returns null for text without a tour', () => {
    expect(findTourInText('')).toBeNull()
    expect(findTourInText('{"title": "not a tour"}')).toBeNull()
  })
})

describe('isTourOutdated', () => {
  const head = '5a3a89b708da730c8762a53ccf5e909acf370e4a'

  it('compares the tour ref with the latest commit, short or full', () => {
    expect(isTourOutdated({ title: 'T', ref: '5A3A89B', steps: [] }, head)).toBe(false)
    expect(isTourOutdated({ title: 'T', ref: head, steps: [] }, head)).toBe(false)
    expect(isTourOutdated({ title: 'T', ref: '1234567', steps: [] }, head)).toBe(true)
  })

  it("can't tell without a ref", () => {
    expect(isTourOutdated({ title: 'T', steps: [] }, head)).toBe(false)
  })
})
