import * as esbuild from 'esbuild'
import { cp, mkdir, readFile, rm } from 'node:fs/promises'

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'))
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
if (manifest.version !== pkg.version) throw new Error('package.json and manifest.json must use the same version.')

const extension = {
  entryPoints: ['src/content.ts', 'src/background.ts', 'src/options.ts'],
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  outdir: 'dist',
}

// The tour checker runs in Node and stays out of the extension's dist folder.
const checker = {
  entryPoints: ['src/check-tour.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: 'bin/check-tour.mjs',
  // The standalone skill carries the same checker, without an npm install.
  legalComments: 'none',
}

async function buildChecker() {
  await esbuild.build(checker)
  await cp('bin/check-tour.mjs', 'skills/prepare-pr-for-review/scripts/check-tour.mjs')
}

if (process.argv.includes('--checker')) {
  await buildChecker()
} else {
  await rm('dist', { recursive: true, force: true })
  await mkdir('dist', { recursive: true })
  await cp('manifest.json', 'dist/manifest.json')
  await cp('src/options.html', 'dist/options.html')
  await cp('assets/icons', 'dist/icons', { recursive: true })
  if (process.argv.includes('--watch')) {
    await (await esbuild.context(extension)).watch()
  } else {
    await Promise.all([esbuild.build(extension), buildChecker()])
  }
}
