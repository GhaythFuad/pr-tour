---
name: prepare-pr-for-review
description: Write, validate, and post a guided review tour for a GitHub pull request. Optionally mark supporting files and repeated edits as viewed for the authenticated reviewer.
---

# Prepare a PR for review

Write a tour that tells the story of a pull request to someone who has never seen the project. PR Tour plays it over
GitHub's Files changed page. The same JSON works as a CodeTour file in VS Code.

## Requirements

Use Node.js 22 or later and GitHub CLI (`gh`), authenticated with access to the pull request. The bundled scripts
need no package install or project-specific checkout. Resolve `scripts/`, `TOUR.md` and `REPEATS.md` relative to this
skill's folder, wherever it was installed. Commands below use `SKILL_DIR` for that absolute folder and `PR_URL` for the
full `https://github.com/OWNER/REPO/pull/NUMBER` URL. The extension supports github.com.

Check `gh auth status` before posting. If not signed in, have the user run `gh auth login` in their terminal.
For a personal access token (PAT), the token must have access to the target repository and **Pull requests: Read and
write** to create or update tour comments. Configure it in the agent's environment, not in the tour or chat. Browser
sign-in through `gh auth login` is also supported; a manually created PAT is not required for that flow.
The extension offers two paths, separate from the agent's credentials:

- **Without a PAT:** save a bare `.tour` JSON file for the user to paste or upload; do not post a comment unless
  separately requested. The extension can play this file on public or private PRs the user can open in GitHub,
  without API requests. Include exact line numbers: manual mode does not relocate code anchors, check the current
  commit, format Markdown, or read Viewed status.
- **With a PAT:** post the validated tour comment when requested. The extension reads it using a PAT with
  **Pull requests: Read-only**, saved in PR Tour's Options. That PAT does not authenticate the coding agent.

Read the target repository's contributor and agent instructions before writing. Respect the user's scope: a request
to draft or check a tour does not authorize posting it or changing Viewed marks.

## Workflow

1. Read the PR description, diff, relevant surrounding code, and tests with `gh pr view "$PR_URL"` and
   `gh pr diff "$PR_URL"`. Get its current head commit with
   `gh pr view "$PR_URL" --json headRefOid --jq .headRefOid`.
2. List the files left for the reviewer. The dry run reads the pull request and changes nothing:

   ```bash
   node "$SKILL_DIR/scripts/mark-pr-files-viewed.mjs" "$PR_URL" --dry-run
   ```

   The helper skips common tests, image files, lockfiles, symlinks, and unchanged renames, then prints "Left for the
   reviewer". Check its list against repository conventions; treat other files as reviewable. A repository's own
   generated files that the built-in list misses, such as an ORM's generated types, go after the URL as extra paths in
   step 3.
3. Find the repeats: files that only make an edit the reviewer reads in another file, such as a rename at every call
   site or one import swapped everywhere. Follow [REPEATS.md](REPEATS.md). If your agent supports subagents, give one
   the absolute path to `REPEATS.md`, the PR URL and the "Left for the reviewer" list, and have it follow that file;
   otherwise follow it yourself. Keep the result: each line becomes a skim bullet in the tour. Preview again, passing
   after the URL only the paths that follow `repeats` on each line, plus any generated files. The `kept` path stays
   with the reviewer:

   ```bash
   node "$SKILL_DIR/scripts/mark-pr-files-viewed.mjs" "$PR_URL" --dry-run path/to/repeat.ts path/to/generated.ts
   ```

   The helper refuses a path the pull request does not change, so pass each path as the list printed it. Its new
   "Left for the reviewer" list is the review list for the tour. When asked to prepare files as well, check the
   preview against that request, then run the same command without `--dry-run`. Viewed marks belong to the signed-in
   `gh` user. Do not mark files on behalf of another reviewer. If the task is only to write a tour, leave marks alone.
4. Read [TOUR.md](TOUR.md) and write a tour comment to a temporary Markdown file. Follow its story order,
   caller-first explanations, Risk steps, and Before checking list. Use exact diff lines as anchors and the current
   head SHA as `ref`. Include every file in the review list either in a step or in the final skim list.
5. Validate the file before posting:

   ```bash
   node "$SKILL_DIR/scripts/check-tour.mjs" "$PR_URL" /absolute/path/to/tour-comment.md
   ```

   The checker uses `GITHUB_TOKEN` if set, otherwise `gh auth token`. Fix every reported problem until it prints
   `The tour is ready to post.` It checks locations and anchors; manually check the explanations and coverage.
6. If posting is part of the user's request, keep one tour comment per PR. Read all issue comments with
   `gh api --paginate "repos/OWNER/REPO/issues/NUMBER/comments"`. Find the latest comment containing the CodeTour
   schema URL and read it before updating it. Update a tour you own; if another author owns it, ask before replacing
   their work. Use `gh api -X PATCH "repos/OWNER/REPO/issues/comments/COMMENT_ID" -F body=@/absolute/path/to/tour-comment.md`
   for an existing comment, or `gh pr comment "$PR_URL" --body-file /absolute/path/to/tour-comment.md` for a new one.
7. Check the posted comment by running the checker with just `"$PR_URL"`. Report the comment link, step count,
   Risk steps, any files marked viewed and how many of them as repeats, any uncovered behavior, and whether more than
   10 steps with a file remain. For manual loading or a draft-only task, give a bare `.tour` JSON file instead of
   posting it.

Every push changes the commit the tour describes. Read the latest posted tour, update affected steps and new claims,
set `ref` to the new head SHA, and validate again. GitHub also clears Viewed marks on files changed by the push, so
find the repeats again.

Do not hide risks or shorten a tour by dropping behavior.
