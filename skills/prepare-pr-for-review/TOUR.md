# Writing the review tour

A review tour tells the story of a pull request, one step at a time, in the order the reviewer needs it. It starts with
what was wrong or missing, builds up through the code that changes it, and ends with what the reviewer is agreeing to.
Write it for a **newcomer**: someone smart who has never seen this project or this work. Each step makes sense with
only the steps before it.

A posted tour appears under the user's name. If the user or repository has a writing-style skill, load it and write in
that voice. Its rules for words and sentences apply; its rules for headings, greetings and other formats don't, since a
tour lives in a small card over the diff.

## Find the story first

Read the whole diff, then answer three questions in a sentence each:

1. What was wrong or missing, as the people affected saw it?
2. What does this change do about it?
3. In what order do the pieces build on each other?

The answers become Start here, and the order becomes the steps. A change that makes nothing happen on its own (a
rename, wiring, a value passed along, wording) is not a step: it goes in the skim list, unless **Caller first** under
Order makes the wiring a step.

## Shape

1. **Start here**, no `file`, at most 80 words: the answers to questions 1 and 2, then the path the tour takes ("We
   start with the table, then the chart.").
2. **The steps with a `file`**, at most 10. Lines that together make one thing happen are one step, placed on the line
   that decides it rather than an import or the top of the file.
3. **Before you approve**, no `file`, at most 100 words plus the skim list:
   - what changes for live pages or saved data the moment this merges, with the step that showed it;
   - the choices the reviewer needs to agree with;
   - the steps no test covers;
   - **Skim:** every file in the review list that got no step, grouped by why it changed: one bullet per reason, the
     reason first, then its files, each once, under its main reason. The review list is the last "Left for the
     reviewer" printout in SKILL.md, after the repeats were passed to the script. Name a file by the shortest end of
     its path that no other file in the pull request shares (`sales-table.tsx`, `chart/config.ts`), with "(deleted)"
     after a deleted one. Each repeated edit from [REPEATS.md](REPEATS.md) gets one bullet, which names the kept file
     or the step that shows the edit. When the repeats were marked viewed, the bullet says how many there are: "Every
     chart gets the new label setting: `charts/line.tsx`, and the same edit in 3 more files, marked viewed." When
     they were not marked, it names them instead, since the reviewer still sees them unviewed.

Steps are numbered as the card counts them, so Start here is step 1.

With more than 10 steps, merge steps that tell one piece of the story and move steps that make nothing happen on their
own to the skim list, keeping the wiring steps **Caller first** needs. If more than 10 remain, keep them and say in
your report to the user that the pull request does too much. Never drop behavior or a risk to fit.

Words are whitespace-separated tokens.

## Each step

The reader has just been moved into the middle of a file. A step tells them where they are, what happens here, and why
it matters, in that order:

1. **Where we are.** The first sentence places the reader:
   - on the first step in a file, what that file is for, in plain words: "We're in the sales table, the grid of
     monthly numbers at the top of the report.";
   - on a later step in the same file, the function or part of the file: "Further down, where the shadow is drawn,";
   - on code no earlier step showed being run, what runs it and when, as **Caller first** asks: "This is the report's
     refresh, which runs each time someone picks another month."
2. **What happens here**, picking up from the step before with linking words ("so", "but", "that means", "with that in
   place"). Two steps that could swap places without a sentence changing are notes, not a story.
3. **The catch**, when there is one: what would go wrong if this were wrong ("If this picked the wrong banner, the menu
   would cover its text."), or, on a Risk step, what changes for live pages or saved data after merge.

Then "Tested in `<test file>`." when a test checks what the step describes; a test edited only to follow a rename
doesn't count.

- `description`: at most 60 words including the "Tested in" line, in paragraphs of one or two sentences with a blank
  line between them.
- `title`: at most six plain words saying what happens ("Old saves are refused"). It labels the step's dot.
- **Plain words:** use everyday words and short sentences. Say what a thing is before its code name, as in "the big
  banner at the top of the page (`Hero`)", and give a code name only when the reader needs it to find something.
  Swap every technical term for what it means:

  | Technical                                 | Plain                                     |
  | ----------------------------------------- | ----------------------------------------- |
  | relative luminance under 0.179            | how dark the color is                     |
  | passes the ID through the render metadata | tells the page preview which banner it is |
  | sorts by `_order`                         | uses the order the shop owner set         |
  | idempotent                                | safe to run twice                         |

- **Only what helps judge the change:** every sentence places the reader, says what happens, says why, or says what
  could go wrong. Cut any other, such as a one-pixel tolerance or a CSS value.
- **Risk:** start the title with "Risk:", which the six words don't count, when after merge something that already
  exists behaves differently (even on purpose): saved data or live pages, who can see or change what, two things
  happening at the same time, a data migration, or anything that can't be undone. A new setting that leaves existing
  pages as they were is not a risk.
- Tests are left out of the review list and usually marked viewed, and PR Tour counts a step on a viewed file as done
  before anyone reads it, so a test appears only in the "Tested in" line of the step it covers, never as a step's
  `file`.
- A removal is a step when the removal is the point: put it on the deleted line with `"side": "old"`.

## Order

- Each step uses only ideas from earlier steps or from everyday life. When a step leans on something a later step
  explains, say so in a few words ("step 6 shows how the color is picked").
- **Caller first:** before a step lands inside a function, the reader knows what runs it and when: an earlier step
  showed the caller, or this step names it. A new function's first step lands on its declaration. When a wiring line
  (a hook list, a route, the only call site) is the one place that shows what runs new code, that line is a step,
  before the function.
- One fix or feature is one part of the tour. A part the others rely on comes first, then the parts with Risk steps,
  while the reviewer is fresh. The first sentence of a new part moves on and places the reader at once: "Now the chart:
  we're in its labels, the dates along the bottom."
- Inside a part: the rule first, then the places that use it, then the docs.
- Inside a part, consecutive steps in the same file go top to bottom, so the reviewer scrolls down, never back up.

## An example

Start here and the first two steps of a tour for a pull request that made a weekly report readable on a phone. Each
card shows the title and file as the reviewer sees them; in the JSON they are the `title` and `file` fields.

> **Start here**
>
> Some people read the weekly report on a phone, and two parts of it broke there.
>
> The sales table, a grid with a column for each month, ran off the right edge with no sign that more was there. And
> the chart under it drew its date labels on top of each other.
>
> This lets the table scroll sideways and thins out the chart's labels on a narrow screen. We start with the table.

> **Table knows its hidden columns** · `sales-table.tsx`
>
> We're in the sales table, the grid of monthly numbers at the top of the report.
>
> To know whether to show a shadow at its right edge, the table works out if any column sits past it. A column only
> half in view counts as hidden, so the shadow stays until the last column is whole.
>
> Tested in `sales-table.test.tsx`.

> **Measures again when it changes** · same file
>
> Further down, the table runs that check whenever its edge could have moved: on load, on every scroll and when the
> phone turns.
>
> Until the first check, the shadow stays hidden, so the page arrives without it.

## Fields

`ref` is the head commit. Each line step has `line`, `anchor` (the code of that line copied from the diff, on a line
whose code appears once in that file's diff) and, on a deleted line, `"side": "old"`. The field reference is "The tour
comment" in the [PR Tour README](https://github.com/GhaythFuad/pr-tour#the-tour-comment); `check-tour` enforces it and prints the exact fix for each problem.

## Before checking

`check-tour` checks where steps land; these it can't, so confirm each against the tour:

- Read every step as the newcomer. Each technical word is swapped for plain words or explained in that step or an
  earlier one, and each step uses only ideas from earlier steps.
- The first sentence of every step with a `file` says where the reader is, as "Each step" describes.
- No two steps in a row start with the same two words.
- No two steps in the same part could swap places without a sentence changing.
- Every sentence places the reader, says what happens, says why, or says what could go wrong.
- No paragraph has more than two sentences.
- Every file in the review list is a step's `file` or in the skim list, files that changed for the same reason share a
  skim bullet, and each repeated edit has a bullet that counts its repeats, or names them when they were not marked
  viewed.
- Every step's `file` is in the review list.
- Titles have at most six words besides "Risk:"; descriptions at most 60 words; Start here at most 80; Before you
  approve at most 100 plus the skim list; at most 10 steps with a `file`, or your report says the pull request does
  too much.
- Every step that meets the Risk definition under "Each step" has "Risk:" in its title.
- **Caller first** holds: for each step on code, name what runs that code and the earlier step, or this step's text,
  that says so.

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
