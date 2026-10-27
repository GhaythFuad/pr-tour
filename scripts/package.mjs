import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

const { version } = JSON.parse(await readFile('package.json', 'utf8'))
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'))
if (manifest.version !== version) throw new Error('Build the extension before packaging.')
const output = resolve('release')
await mkdir(output, { recursive: true })
const extensionZip = join(output, `pr-tour-${version}-chrome.zip`)
const skillZip = join(output, `pr-tour-${version}-skill.zip`)
const extensionFiles = ['manifest.json', 'content.js', 'background.js', 'options.js', 'options.html', 'icons']
const actual = (await readdir('dist')).sort()
if (JSON.stringify(actual) !== JSON.stringify([...extensionFiles].sort())) {
  throw new Error(`Unexpected files in dist: ${actual.join(', ')}`)
}
for (const zip of [extensionZip, skillZip]) await rm(zip, { force: true })
execFileSync('zip', ['-q', '-X', '-r', extensionZip, ...extensionFiles], { cwd: 'dist' })
const staging = await mkdtemp(join(tmpdir(), 'pr-tour-skill-'))
try {
  await cp('skills/prepare-pr-for-review', join(staging, 'prepare-pr-for-review'), { recursive: true })
  await cp('LICENSE', join(staging, 'prepare-pr-for-review/LICENSE'))
  execFileSync('zip', ['-q', '-X', '-r', skillZip, 'prepare-pr-for-review'], { cwd: staging })
} finally {
  await rm(staging, { recursive: true, force: true })
}
const sums = await Promise.all([extensionZip, skillZip].map(async (path) => {
  const hash = createHash('sha256').update(await readFile(path)).digest('hex')
  return `${hash}  ${path.split('/').at(-1)}`
}))
await writeFile(join(output, 'SHA256SUMS'), `${sums.join('\n')}\n`)
console.log(`Extension: ${extensionZip}\nSkill: ${skillZip}`)
