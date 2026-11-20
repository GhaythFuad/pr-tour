# Finding repeats

A pull request often makes one edit in many files: a renamed function updated at every call, the same field added to
five models, one import swapped everywhere. The reviewer needs to read that edit once. Every further copy is noise:
it teaches them nothing the first copy didn't, and it buries the changes that need their attention.

Your job is to find the noise so it can be marked viewed, and to keep everything worth reading in front of the
reviewer. This task only reads and reports: it never marks files, posts comments or changes the repository. Marking
happens later, in SKILL.md step 3.

## Input

- The pull request's full URL, `https://github.com/OWNER/REPO/pull/NUMBER`.
- "Left for the reviewer": the files a person will read, as `mark-pr-files-viewed.mjs` printed them. These are the
  files you judge.

## Steps

1. Read the diff of every file in the list. `gh pr diff <PR URL>` prints the whole pull request; skip the files that
   aren't in the list. If GitHub refuses the diff as too large, read each file's `patch` from
   `gh api --paginate repos/OWNER/REPO/pulls/NUMBER/files` instead.
2. Group the files that make the same edit. A file that makes it in another form, such as through a setting or a
   helper, is not in the group. In each group, keep one file that shows the edit: one the reviewer reads anyway for its
   other changes, or else the one where the edited thing is defined.
3. For every other file in the group, ask whether the reviewer would learn anything by reading it after the kept one.
   It is worth reading when it changes more than the edit, when the edit lands on something that only shares the
   name, or when it changes what people see or what gets saved in a way the kept file doesn't show. Everything else is
   noise, and the file is a repeat. When unsure, leave the file for the reviewer: it is not a repeat.

Done when you've read the diff of every file in the list and judged every file that makes the same edit as another.

## Output

Produce only this block (as your whole reply, if you are a subagent), one line per repeated edit, naming the edit in
the few plain words a reviewer would use:

```
Repeats:
- <edit>: kept <path>; repeats <path>, <path>
```

or `Repeats: none`. Write each path exactly as the list gives it.
