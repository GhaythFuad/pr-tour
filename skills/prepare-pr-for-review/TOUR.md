# Writing the review tour

A review tour explains the pull request to a **newcomer**: someone smart who has never seen this project or its code.
It builds the idea one step at a time, the way a good teacher would. Each step explains one thing, in plain English,
using only what earlier steps explained. By the last step the reviewer understands the whole change and can judge it.

## How to write

- Use everyday words and short sentences, one idea per sentence.
- Say what a thing is before its code name: "the big banner at the top of the page (`Hero`)". Give a code name only
  when the reader needs it to find something, and explain it the first time it appears.
- Swap every technical term for what it means:

  | Technical                                 | Plain                                     |
  | ----------------------------------------- | ----------------------------------------- |
  | relative luminance under 0.179            | how dark the colour is                    |
  | passes the ID through the render metadata | tells the page preview which banner it is |
  | sorts by `_order`                         | uses the order the shop owner set         |
  | idempotent                                | safe to run twice                         |

- Describe what happens, the way you would explain it out loud: "This picks the banner that sits under the menu."
  Every step opens with what the code does.
- When something could go wrong, say it in one plain sentence: "If this picked the wrong banner, the menu would
  cover its text."

## Shape

1. **Start here**, no `file`, at most 80 words: what was wrong, as someone using the product saw it; what this change
   does about it; and the path the tour takes ("First the menu banner, then product order, then ...").
2. **One step per idea**, in the order the ideas build on each other.
3. **Before you approve**, no `file`, at most 120 words plus the skim list:
   - what changes for live pages or saved data the moment this merges;
   - the choices the reviewer needs to agree with;
   - the numbers of the steps no test covers;
   - **Skim:** each file left for the reviewer that got no step, with a few plain words on what changed.

Words are whitespace-separated tokens.

## Steps

- **One idea:** one thing the change makes happen, such as "a save with an old version number is refused". Lines that
  together make one thing happen are one step, placed on the line that decides it. A change that makes nothing happen
  on its own (a rename, wiring, a value passed along, wording) goes in the skim list, unless **Caller first** under
  Order makes the wiring a step.
- `title`: at most six plain words saying what happens ("Old saves are refused"). It labels the step's dot.
- `file` and `line`: the line that decides it, rather than an import or the top of the file.
- `description`: two to four short sentences, at most 60 words including the "Tested in" line:
  1. what this code does;
  2. what changed and why;
  3. when it matters, what would go wrong if it were wrong, or, on a Risk step, what changes for live pages or saved
     data after merge.

  Then "Tested in `<test file>`." when a test covers it.

- **Risk:** start the title with "Risk:", which the six words don't count, when after merge something that already
  exists behaves differently (even on purpose): saved data or live pages, who can see or change what, two things
  happening at the same time, a data migration, or anything that can't be undone. A new setting that leaves existing
  pages as they were is not a risk.
- Tests are marked viewed, and PR Tour counts a step on a viewed file as done before anyone reads it, so a test appears
  only in the "Tested in" line of the step it covers, never as a step's `file`.
- A removal is a step when the removal is the point: put it on the deleted line with `"side": "old"`.

## Order

- Each step uses only ideas from earlier steps or from everyday life. When a step leans on something a later step
  explains, say so in a few words ("step 6 shows how the colour is picked").
- **Caller first:** before a step lands inside a function, the reader knows what runs it and when: an earlier step
  showed the caller, or this step names it. A new function's first step lands on its declaration. When a wiring line
  (a hook list, a route, the only call site) is the one place that shows what runs new code, that line is a step,
  before the function.
- One fix or feature is one part of the tour. A part the others rely on comes first, then the parts with Risk steps,
  while the reviewer is fresh.
- Inside a part: the rule first, then the places that use it, then the docs.
- Inside a part, consecutive steps in the same file go top to bottom, so the reviewer scrolls down, never back up.

## Fields

`ref` is the head commit. Each line step has `line`, `anchor` (the code of that line copied from the diff, on a line
whose code appears once in that file's diff) and, on a deleted line, `"side": "old"`. The field reference is "The tour
comment" in the [PR Tour README](https://github.com/GhaythFuad/pr-tour#the-tour-comment); `check-tour` enforces it and prints the exact fix for each problem.

## Before checking

`check-tour` checks where steps land; these it can't, so confirm each against the tour:

- Read every step as the newcomer. Each technical word is swapped for plain words or explained in that step or an
  earlier one, and each step uses only ideas from earlier steps.
- Every file in the script's "Left for the reviewer" list is a step's `file` or in the skim list.
- Every step's `file` is in the "Left for the reviewer" list.
- Titles have at most six words besides "Risk:"; descriptions at most 60 words; Start here at most 80; Before you
  approve at most 120 plus the skim list.
- Every step that meets the Risk definition under Steps has "Risk:" in its title.
- **Caller first** holds: for each step on code, name what runs that code and the earlier step, or this step's text,
  that says so.
- More than 25 steps means the pull request does too much: keep every step and say so in your report to the user.

## The comment

````markdown
<details><summary>Review tour</summary>

```json
{
  "$schema": "https://aka.ms/codetour-schema",
  "title": "<the pull request title>",
  "ref": "<head commit SHA>",
  "steps": [
    { "title": "Start here", "description": "..." },
    { "title": "Old saves are refused", "file": "...", "line": 42, "anchor": "...", "description": "..." },
    { "title": "Before you approve", "description": "..." }
  ]
}
```

</details>
````
