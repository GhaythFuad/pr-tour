# PR Tour privacy policy

Effective date: October 27, 2026

PR Tour adds guided review steps to GitHub pull requests. It runs in your browser and talks directly to GitHub.
The extension has no developer-operated server, analytics, advertising, or crash-reporting service.

## Data used to show a tour

On github.com, the extension reads the current pull request's address, comments, changed files, diff contents,
head commit, and your Viewed marks. It uses this data to find tours, show step notes, locate lines, and show progress.
It sends requests to `https://api.github.com` for that pull request. Step descriptions are sent to GitHub's Markdown
API for formatting, including descriptions from a file or pasted tour. GitHub may load images referenced in the
rendered Markdown. GitHub handles API data under its own [privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

If you add a GitHub token, PR Tour saves it in `chrome.storage.local` in your browser profile. It sends the token
only to GitHub's API for authentication. The token is not synced by the extension and is not sent to the developer.
You can remove it by saving an empty token in the extension's Options page. Uninstalling the extension removes
extension storage. Use a token limited to the repositories you need, with Pull requests: Read-only access.

## Data kept in your browser

PR Tour stores pasted or imported tours and display preferences in github.com's local storage. It stores the current
step, visited steps, and the closed state for a tab in github.com's session storage. These records are browser-local;
because they use github.com's page storage, scripts running on that origin can access them. They are not private
extension storage. Use “Use the tour comment” to remove an imported tour, or clear site data for github.com to remove
these records. Clearing GitHub site data may also sign you out of GitHub. Uninstalling PR Tour does not clear that
site data.

PR Tour changes Viewed marks only when you click Mark viewed. It does not post comments, approve reviews, or edit
repository files. The separate optional authoring skill uses your coding agent and GitHub CLI; their data handling
and any model service you choose are separate from the browser extension.

## Sharing and limited use

The developer does not receive or sell your browsing data, repository contents, tours, or token. Data is used only
to provide the guided-review features described above. PR Tour follows the Chrome Web Store User Data Policy,
including its Limited Use requirements. The extension
does not use data for advertising, credit decisions, or unrelated profiling.

## Contact and changes

For privacy questions, [open an issue](https://github.com/GhaythFuad/pr-tour/issues) without tokens or private code.
Updates to this policy are published in this repository with a new effective date.
