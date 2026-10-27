# Chrome Web Store listing

## Name and summary

**Name:** PR Tour

**Summary:** Walks you through a GitHub pull request in the order set by a CodeTour posted as a PR comment or loaded from a file.

**Category:** Developer Tools

**Language:** English

**Homepage:** https://github.com/GhaythFuad/pr-tour

**Support:** https://github.com/GhaythFuad/pr-tour/issues

**Privacy policy:** https://github.com/GhaythFuad/pr-tour/blob/main/PRIVACY.md

## Detailed description

A pull request is easier to review when someone explains where to start and what to check next.

PR Tour plays that explanation directly on GitHub. A tour is a sequence of notes attached to files and lines.
The author posts it as a CodeTour comment, or you load a .tour file or paste the tour yourself.

Use Previous and Next to follow the change in its intended order. Each step opens its file and highlights the line
in Files changed. Choose one of two ways to load the tour:

- Without a PAT: paste the tour or upload a .tour file. This works on public and private PRs you can open in
  GitHub. The extension makes no API requests, follows the saved line numbers, and shows plain-text notes.
- With a PAT: save a GitHub personal access token with Pull requests: Read-only in the extension's Options.
  PR Tour reads the tour comment from the PR, formats notes, checks the latest commit, and reads Viewed status.
  Code anchors help it find lines after later commits move them.

- See every step in a row of progress dots. Click a dot to jump to it.
- Use Mark viewed to tick GitHub's Viewed control and continue through the tour.
- Dock the card at the top or bottom, hide it, or reopen it from the toolbar.
- Use the arrow keys to move between steps and H to hide or show the tour.
- Load tours from a comment, a file, or pasted text.
- Start from the toolbar to see setup instructions and a copyable agent prompt for the path you choose.

The open-source repository also includes an optional coding-agent skill that writes, checks, and posts review
tours. It includes a standalone checker so authors can fix broken anchors before a reviewer sees them.

PR Tour is free and MIT licensed. It talks directly to GitHub and has no analytics or developer-operated server.
The extension runs on github.com; GitHub Enterprise Server is not currently supported.

## Single purpose

Display and navigate guided code-review tours on GitHub pull requests, with notes attached to changed files and lines.

## Permission justifications

**storage:** Save the optional GitHub token in chrome.storage.local in this browser profile. Users can remove it
from Options. It is sent only to GitHub's API to read the repositories they select.

**scripting:** Inject the packaged content script when the user clicks the toolbar button in a GitHub tab opened
before installation or extension reload, so the button can open the tour without a manual page reload.

**Host access to https://github.com/*:** Detect GitHub pull request pages, display the tour card, scroll to the
step's diff line, and click the current file's native Viewed control when the user asks. GitHub uses in-page
navigation, so the script also watches navigation from other github.com pages to a PR.

**Remote code:** No. All executable code is bundled. GitHub's Markdown API returns formatted step notes, not
JavaScript. No remote libraries or executable scripts are loaded.

## Data handling

The code processes GitHub PR URLs, comments, diffs, head commits, Viewed marks, imported tours, and an optional GitHub
token to provide the guided review. In the PAT path, requests go directly to GitHub, including step notes sent to
its Markdown API. Manual loading makes no API requests and displays notes as plain text.
The developer does not receive this data. There are no analytics, ads, or developer-operated backend.

The token is in extension-local storage. Imported tours and preferences use github.com local storage; per-tab
progress uses github.com session storage. See PRIVACY.md for retention and removal. Select the store's data
categories according to the live form's definitions; do not omit token or website-content handling if its wording
covers local processing or direct GitHub transmission.

## Reviewer instructions

No subscription or PR Tour account is needed. Test without a PAT:

1. Open https://github.com/GhaythFuad/pr-tour/pull/1 and expand the Review tour comment. Copy the JSON in its code block.
2. Click the PR Tour toolbar icon. Choose Without a PAT, paste the JSON, and click Load.
3. Click Next. The tour opens Files changed and highlights its line. Previous and Next navigate the steps.
   Notes appear as plain text in this path. Use Hide, Dock, and Load to test the card controls.

The With a PAT path reads the same comment automatically after you save a PAT with repository access and
Pull requests: Read-only in the extension's Options, then reload the PR. It also formats Markdown notes, checks the
head commit, and reads Viewed status. No developer-provided account or token is required for the manual test.
Mark viewed uses GitHub's own control and requires the reviewer to be signed into GitHub.

The exact tour format and a sample are in the public README under “The tour comment”.
