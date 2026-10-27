# Publishing PR Tour

The extension and the authoring skill share one version. Source code, documentation, and the skill are MIT licensed.

## Build a release

Use Node.js 22 or later, pnpm 10, and the `zip` command (available on macOS and the Ubuntu CI runner).

1. Set the same version in `package.json` and `manifest.json`.
2. Run `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm typecheck`, and `pnpm package`.
3. Commit the rebuilt `skills/prepare-pr-for-review/scripts/check-tour.mjs` alongside source changes.
4. Load `dist/` in Chrome and check a tour on a public PR: Next, Previous, a line anchor, Mark viewed, Hide,
   Dock, and Load. Check Options without exposing a real token in screenshots.
5. Create a GitHub release tagged `v<version>`. Attach both ZIPs and `release/SHA256SUMS`.

The Chrome ZIP contains the manifest at its root, bundled JavaScript, Options HTML, and icons. The skill ZIP is a
separate download; do not upload it as the browser extension. Development source and credentials stay outside both.

## Chrome Web Store

The initial submission was accepted for review on October 27, 2026, with automatic publication after approval.
The store item ID is `dnfljchfhbdkoefakmnfakoloipkfdji`. Update this same item for future versions.

The [developer dashboard](https://chrome.google.com/webstore/devconsole) requires a registered publisher account.
Upload `release/pr-tour-<version>-chrome.zip` as a new item, or a new package on the existing PR Tour item.
Use [STORE-LISTING.md](STORE-LISTING.md) for listing text, permission explanations, and reviewer instructions.

Supply `assets/icons/128.png` as the store icon, the 1280×800 product screenshots in `assets/store/`,
and `assets/store/promo-440x280.png` as the small promotional tile. Keep screenshots representative of the current build. The privacy policy URL is:

https://github.com/GhaythFuad/pr-tour/blob/main/PRIVACY.md

Set distribution to **Public** and free. Complete the dashboard's privacy declarations from the actual code and
[PRIVACY.md](../PRIVACY.md). The extension handles an optional authentication token and repository/PR content locally
and sends API requests only to GitHub. Do not describe it as never processing or transmitting data.

Submit for review and select automatic publication after approval. A submission is not a live listing: check the
item status after review and add the verified store URL to README.md when it is public. Account registration,
identity checks, developer agreements, or fees may require the publisher to complete a step personally.

Official references: [first publication](https://developer.chrome.com/docs/webstore/publish),
[listing information](https://developer.chrome.com/docs/webstore/cws-dashboard-listing), and
[privacy practices](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).
