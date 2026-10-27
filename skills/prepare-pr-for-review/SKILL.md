---
name: prepare-pr-for-review
description: Write, validate, and post a guided review tour for a GitHub pull request. Optionally mark supporting files as viewed for the authenticated reviewer.
---

# Prepare a PR for review

Write a tour that explains a pull request to someone who has never seen the project. PR Tour plays it over GitHub's
Files changed page. The same JSON works as a CodeTour file in VS Code.

## Requirements

Use Node.js 22 or later and GitHub CLI (`gh`), authenticated with access to the pull request. The bundled scripts
need no package install or project-specific checkout. Resolve `scripts/` and `TOUR.md` relative to this skill's folder,
wherever it was installed. Commands below use `SKILL_DIR` for that absolute folder and `PR_URL` for the full
`https://github.com/OWNER/REPO/pull/NUMBER` URL. The extension supports github.com.

Read the target repository's contributor and agent instructions before writing. Respect the user's scope: a request
to draft or check a tour does not authorize posting it or changing Viewed marks.

## Workflow

1. Read the PR description, diff, relevant surrounding code, and tests with `gh pr view "$PR_URL"` and
   `gh pr diff "$PR_URL"`. Get its current head commit with
   `gh pr view "$PR_URL" --json headRefOid --jq .headRefOid`.
2. When asked to prepare files as well, preview the supporting-file list:

   ```bash
   node "$SKILL_DIR/scripts/mark-pr-files-viewed.mjs" "$PR_URL" --dry-run
   ```

   If this matches the requested scope, run the command without `--dry-run`. Viewed marks belong to the signed-in
   `gh` user. Do not mark files on behalf of another reviewer. If the task is only to write a tour, leave marks alone
   and use all changed hand-written files as the review list. The helper skips common tests, image files, lockfiles,
   symlinks, and unchanged renames. Check its list against repository conventions; treat other files as reviewable.
3. Read [TOUR.md](TOUR.md) and write a tour comment to a temporary Markdown file. Follow its newcomer-first order,
   caller-first explanations, Risk steps, and coverage checklist. Use exact diff lines as anchors and the current
   head SHA as `ref`. Include every reviewable file either in a step or in the final skim list.
4. Validate the file before posting:

   ```bash
   node "$SKILL_DIR/scripts/check-tour.mjs" "$PR_URL" /absolute/path/to/tour-comment.md
   ```

   The checker uses `GITHUB_TOKEN` if set, otherwise `gh auth token`. Fix every reported problem until it prints
   `The tour is ready to post.` It checks locations and anchors; manually check the explanations and coverage.
5. If posting is part of the user's request, keep one tour comment per PR. Read all issue comments with
   `gh api --paginate "repos/OWNER/REPO/issues/NUMBER/comments"`. Find the latest comment containing the CodeTour
   schema URL and read it before updating it. Update a tour you own; if another author owns it, ask before replacing
   their work. Use `gh api -X PATCH "repos/OWNER/REPO/issues/comments/COMMENT_ID" -F body=@/absolute/path/to/tour-comment.md`
   for an existing comment, or `gh pr comment "$PR_URL" --body-file /absolute/path/to/tour-comment.md` for a new one.
6. Check the posted comment by running the checker with just `"$PR_URL"`. Report the comment link, step count,
   Risk steps, any files marked viewed, and any uncovered behavior. For a draft-only task, give the file instead.

Every push changes the commit the tour describes. Read the latest posted tour, update affected steps and new claims,
set `ref` to the new head SHA, and validate again. GitHub also clears Viewed marks on files changed by the push.

Do not hide risks or shorten a tour by dropping behavior. If a tour needs more than 25 steps, keep the steps and
explain that the PR may be easier to review as smaller changes.
