// src/check-tour.ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// src/github.ts
var API = "https://api.github.com";
function parsePullPath(pathname) {
  const match = pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/);
  if (!match) return null;
  const [, owner = "", repo = "", number = ""] = match;
  return { owner, repo, number: Number(number) };
}
function describePull(pull2) {
  return `${pull2.owner}/${pull2.repo}#${pull2.number}`;
}
async function listCommentBodies(pull2, token2) {
  const url = `${API}/repos/${pull2.owner}/${pull2.repo}/issues/${pull2.number}/comments?per_page=100`;
  const comments = await getAllPages(url, token2, `the comments of ${describePull(pull2)}`);
  return comments.map((comment) => comment.body ?? "");
}
async function listChangedFiles(pull2, token2) {
  const url = `${API}/repos/${pull2.owner}/${pull2.repo}/pulls/${pull2.number}/files?per_page=100`;
  return await getAllPages(url, token2, `the changed files of ${describePull(pull2)}`);
}
async function readHeadCommit(pull2, token2) {
  const response = await fetch(`${API}/repos/${pull2.owner}/${pull2.repo}/pulls/${pull2.number}`, { headers: headersFor(token2) });
  if (!response.ok) throw new Error(describeFailure(response, `the latest commit of ${describePull(pull2)}`));
  const { head } = await response.json();
  return head.sha;
}
async function getAllPages(firstUrl, token2, what) {
  const items = [];
  let url = firstUrl;
  while (url) {
    const response = await fetch(url, { headers: headersFor(token2) });
    if (!response.ok) throw new Error(describeFailure(response, what));
    items.push(...await response.json());
    url = response.headers.get("Link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
  }
  return items;
}
function headersFor(token2) {
  const headers = { Accept: "application/vnd.github+json" };
  if (token2) headers.Authorization = `Bearer ${token2}`;
  return headers;
}
function describeFailure(response, what) {
  const cause = `GitHub answered ${response.status} when PR Tour asked for ${what}.`;
  if (response.headers.get("x-ratelimit-remaining") === "0") {
    const reset = new Date(Number(response.headers.get("x-ratelimit-reset")) * 1e3).toLocaleTimeString();
    return `${cause} The API rate limit is used up until ${reset}; adding a token in the PR Tour options raises it.`;
  }
  if (response.status === 401) return `${cause} The token in the PR Tour options was rejected; replace it.`;
  if (response.status === 403 || response.status === 404) {
    return `${cause} For a private repository, add a token with "Pull requests: Read-only" access to it in the PR Tour options.`;
  }
  return cause;
}

// src/patch.ts
function parsePatch(patch) {
  const lines = [];
  let oldLine = 0;
  let newLine = 0;
  for (const row of patch.split("\n")) {
    const hunk = row.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
    } else if (row.startsWith("+")) {
      lines.push({ text: row.slice(1), oldLine: null, newLine: newLine++ });
    } else if (row.startsWith("-")) {
      lines.push({ text: row.slice(1), oldLine: oldLine++, newLine: null });
    } else if (row.startsWith(" ")) {
      lines.push({ text: row.slice(1), oldLine: oldLine++, newLine: newLine++ });
    }
  }
  return lines;
}
function locateStep(step, files2, isTourOutdated2) {
  if (step.file === void 0) return { file: null, line: null, warning: null };
  const file = files2.find((changed) => changed.filename === step.file) ?? null;
  if (!file) return { file, line: null, warning: `${step.file} isn't changed in this pull request, so this step has no diff to open.` };
  if (step.line === void 0 && step.anchor === void 0) return { file, line: null, warning: null };
  if (file.patch === void 0) {
    return { file, line: null, warning: `GitHub shows no line diff for ${step.file}, so this step opens the file instead of the line.` };
  }
  const side = step.side ?? "new";
  const lines = parsePatch(file.patch);
  const numbered = lines.flatMap((line) => {
    const number = side === "new" ? line.newLine : line.oldLine;
    return number === null ? [] : [{ ...line, number }];
  });
  const targetOf = (line) => {
    const code = line.text.trim();
    return { side, line: line.number, code, isCodeUnique: code !== "" && lines.filter((other) => other.text.trim() === code).length === 1 };
  };
  let missingAnchor = null;
  if (step.anchor !== void 0) {
    const anchor = step.anchor.trim();
    const matches = numbered.filter((line) => line.text.trim() === anchor);
    const nearest = nearestTo(matches, step.line);
    if (nearest && (matches.length === 1 || step.line !== void 0)) return { file, line: targetOf(nearest), warning: null };
    if (nearest) {
      const warning = `The code "${anchor}" appears ${matches.length} times in the diff of ${step.file}, so this step opens the first; a "line" would pick one.`;
      return { file, line: targetOf(nearest), warning };
    }
    missingAnchor = `The code "${anchor}" isn't in the diff of ${step.file} any more`;
  }
  const shown = step.line === void 0 ? void 0 : numbered.find((line) => line.number === step.line);
  if (!shown) {
    const lineOutside = step.line === void 0 ? null : `line ${step.line} of ${step.file} is outside the diff`;
    const cause = [missingAnchor, lineOutside].filter((part) => part !== null).join(", and ");
    return { file, line: null, warning: `${upperFirst(cause)}, so this step opens the file instead.` };
  }
  if (missingAnchor) return { file, line: targetOf(shown), warning: `${missingAnchor}, so this step opens line ${step.line}, which may now hold other code.` };
  if (isTourOutdated2 && step.anchor === void 0) {
    return { file, line: targetOf(shown), warning: `The pull request changed after this tour was written, so line ${step.line} of ${step.file} may have moved.` };
  }
  return { file, line: targetOf(shown), warning: null };
}
function nearestTo(matches, line) {
  if (line === void 0) return matches[0];
  const distance = (match) => Math.abs(match.number - line);
  return matches.reduce((best, match) => best === void 0 || distance(match) < distance(best) ? match : best, void 0);
}
function upperFirst(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// src/tour.ts
var CODETOUR_SCHEMA = "https://aka.ms/codetour-schema";
function isTourOutdated(tour2, headCommit2) {
  return tour2.ref !== void 0 && !headCommit2.startsWith(tour2.ref.toLowerCase());
}
function findTour(commentBodies) {
  for (const body of [...commentBodies].reverse()) {
    for (const block of body.matchAll(/```json[^\n]*\n([\s\S]*?)\n\s*```/g)) {
      const found2 = parseTour(block[1] ?? "");
      if (found2) return found2;
    }
  }
  return null;
}
function findTourInText(text) {
  return findTour([text]) ?? parseTour(text);
}
function parseTour(json) {
  const value = parseJson(json);
  return isPlainObject(value) && value.$schema === CODETOUR_SCHEMA ? readTour(value) : null;
}
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return void 0;
  }
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readTour(value) {
  if (typeof value.title !== "string") return { problem: 'The tour has no "title" string.' };
  if (value.ref !== void 0 && !(typeof value.ref === "string" && /^[0-9a-f]{7,40}$/i.test(value.ref))) {
    return { problem: `The tour "${value.title}" has a "ref" that isn't a commit SHA.` };
  }
  if (!Array.isArray(value.steps) || value.steps.length === 0) {
    return { problem: `The tour "${value.title}" has no "steps".` };
  }
  const steps = [];
  for (const [index, step] of value.steps.entries()) {
    const problem = describeStepProblem(step);
    if (problem) return { problem: `Step ${index + 1} of "${value.title}" ${problem}.` };
    steps.push(step);
  }
  return { tour: { title: value.title, ...typeof value.ref === "string" && { ref: value.ref }, steps } };
}
function describeStepProblem(step) {
  if (!isPlainObject(step)) return "is not an object";
  if (typeof step.description !== "string") return 'has no "description" string';
  if (step.title !== void 0 && typeof step.title !== "string") return 'has a "title" that is not a string';
  if (step.file !== void 0 && typeof step.file !== "string") return 'has a "file" that is not a string';
  for (const field of ["line", "anchor", "side"]) {
    if (step[field] !== void 0 && step.file === void 0) return `has a "${field}" without a "file"`;
  }
  if (step.line !== void 0 && !(Number.isInteger(step.line) && Number(step.line) >= 1)) {
    return 'has a "line" that is not a positive integer';
  }
  if (step.anchor !== void 0 && !(typeof step.anchor === "string" && step.anchor.trim() !== "" && !step.anchor.includes("\n"))) {
    return 'has an "anchor" that is not one line of code';
  }
  if (step.side !== void 0 && step.side !== "new" && step.side !== "old") return 'has a "side" other than "new" or "old"';
  return null;
}

// src/check-tour.ts
var [pullUrl, tourPath] = process.argv.slice(2);
var pull = null;
try {
  const url = new URL(pullUrl ?? "");
  if (url.origin === "https://github.com") pull = parsePullPath(url.pathname);
} catch {
}
if (!pull) fail("Usage: pnpm check-tour <pull request URL> [tour file]");
var token = process.env.GITHUB_TOKEN?.trim() ?? "";
if (!token) {
  try {
    token = execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    fail("Sign in with gh auth login, or set GITHUB_TOKEN to a token with access to the pull request.");
  }
}
var tourText = tourPath === void 0 ? null : readFileSync(tourPath, "utf8");
var found = tourText === null ? findTour(await listCommentBodies(pull, token)) : findTourInText(tourText);
if (!found) fail(`${tourPath ?? describePull(pull)} has no CodeTour tour: a JSON block whose "$schema" is ${CODETOUR_SCHEMA}.`);
if ("problem" in found) fail(`${found.problem} Fix the tour and check it again.`);
var { tour } = found;
var [files, headCommit] = await Promise.all([listChangedFiles(pull, token), readHeadCommit(pull, token)]);
var isOutdated = isTourOutdated(tour, headCommit);
var problemCount = 0;
console.log(`"${tour.title}" on ${describePull(pull)}, whose latest commit is ${headCommit}`);
if (tour.ref === void 0) report("Tour", [`Add "ref": "${headCommit}" so reviewers learn when the pull request changes after the tour.`]);
else if (isOutdated) report("Tour", [`"ref" is ${tour.ref}, not the latest commit; check every step against it, then set "ref": "${headCommit}".`]);
for (const [index, step] of tour.steps.entries()) {
  const { line, warning } = locateStep(step, files, isOutdated);
  report(`Step ${index + 1} (${labelOf(step)})`, [warning, ...authoringProblems(step, line)].filter((problem) => problem !== null));
}
if (problemCount > 0) fail(`${problemCount} problem${problemCount === 1 ? "" : "s"}; fix the tour and check it again.`);
console.log("The tour is ready to post.");
function authoringProblems(step, line) {
  if (line === null) return [];
  if (!line.isCodeUnique) {
    const where = line.code === "" ? `Line ${line.line} is blank` : `The code of line ${line.line}, ${JSON.stringify(line.code)}, appears more than once in the diff`;
    return [`${where}, so an anchor can't pick it out; point the step at a line of code that appears once in the diff and copy that code into "anchor".`];
  }
  if (step.anchor === void 0) return [`Add "anchor": ${JSON.stringify(line.code)}, the code of line ${line.line}, so the step finds it after later commits.`];
  if (step.line !== line.line) return [`Set "line": ${line.line}, where the anchor is, so CodeTour in VS Code opens the same line.`];
  return [];
}
function labelOf(step) {
  if (step.title !== void 0) return step.title;
  if (step.file === void 0) return "no file";
  return step.line === void 0 ? step.file : `${step.file}:${step.line}`;
}
function report(subject, problems) {
  problemCount += problems.length;
  console.log(`${problems.length === 0 ? "\u2713" : "\u2717"} ${subject}`);
  for (const problem of problems) console.log(`    ${problem}`);
}
function fail(message) {
  console.error(message);
  process.exit(1);
}
