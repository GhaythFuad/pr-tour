# Contributing

PR Tour depends on GitHub's page markup. If a line stops opening, include the browser version, a public PR that
reproduces it, and the step that failed. Remove tokens and private code before sharing a screenshot or fixture.

Use Node.js 22 or later and pnpm 10:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```

Load `dist/` as an unpacked Chrome extension. Page selectors live in `src/github-page.ts`; its tests use small HTML
fixtures for both GitHub diff views. Add a focused regression test when changing line matching or GitHub selectors.

The portable skill lives in `skills/prepare-pr-for-review/`. Its checker is generated from `src/check-tour.ts` by
`pnpm build`; do not edit the bundled `scripts/check-tour.mjs` by hand. Run `pnpm package` to create the extension
and skill ZIP files in `release/`. Keep `package.json` and `manifest.json` versions the same.

Submit a pull request with the problem, the change, and how you checked it. Contributions are covered by the
repository's MIT license.
