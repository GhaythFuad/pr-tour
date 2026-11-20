#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const SUPPORTING_PATH = /\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)(?:tests|__tests__|evidence)\/|\.(?:png|jpe?g|gif|webp|svg|ico)$|(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|Cargo\.lock|Gemfile\.lock|poetry\.lock|uv\.lock|composer\.lock|go\.sum)$/i
const LIST_QUERY = `query($id: ID!, $after: String) {
  node(id: $id) { ... on PullRequest {
    files(first: 100, after: $after) {
      nodes { path changeType additions deletions viewerViewedState }
      pageInfo { hasNextPage endCursor }
    }
  } }
}`
const MARK_MUTATION = `mutation($pr: ID!, $path: String!) {
  markFileAsViewed(input: { pullRequestId: $pr, path: $path }) { clientMutationId }
}`

function gh(args) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }))
}

export async function prepareReview(prUrl, { dryRun = true, extraPaths = [], runGh = gh, log = console.log } = {}) {
  const url = new URL(prUrl)
  const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/([1-9]\d*)(?:\/|$)/)
  if (url.origin !== 'https://github.com' || !match) throw new Error('Use a full https://github.com/OWNER/REPO/pull/NUMBER URL.')
  const [, owner, repo, number] = match
  const repository = `${owner}/${repo}`
  const pr = runGh(['pr', 'view', prUrl, '--json', 'id,headRefOid'])
  const tree = runGh(['api', `repos/${repository}/git/trees/${pr.headRefOid}?recursive=1`])
  if (tree.truncated) log('GitHub truncated the tree; some symlinks may stay in the review list.')
  const symlinks = new Set((tree.tree ?? []).filter((entry) => entry.mode === '120000').map((entry) => entry.path))
  const files = []
  let after = null
  do {
    const args = ['api', 'graphql', '-f', `query=${LIST_QUERY}`, '-f', `id=${pr.id}`]
    if (after !== null) args.push('-f', `after=${after}`)
    const answer = runGh(args)
    if (answer.errors?.length) throw new Error(answer.errors.map((error) => error.message).join('; '))
    const page = answer.data?.node?.files
    if (!page || !Array.isArray(page.nodes)) throw new Error('GitHub did not return the pull request files.')
    files.push(...page.nodes)
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
    if (page.pageInfo.hasNextPage && !after) throw new Error('GitHub did not return the next page cursor.')
  } while (after !== null)

  // Extra paths are repeats or the repository's own generated files; refuse any the pull request doesn't change.
  const changed = new Set(files.map((file) => file.path))
  const unknown = extraPaths.filter((path) => !changed.has(path))
  if (unknown.length) {
    throw new Error(`${repository}#${number} changes no file at these paths, so nothing was marked:\n` +
      `${unknown.map((path) => `  ${path}`).join('\n')}\nPass each path as "Left for the reviewer" prints it.`)
  }
  const extra = new Set(extraPaths)
  const supporting = (file) => SUPPORTING_PATH.test(file.path) || symlinks.has(file.path) || extra.has(file.path) ||
    (file.changeType === 'RENAMED' && file.additions === 0 && file.deletions === 0)
  const candidates = files.filter((file) => supporting(file) && file.viewerViewedState !== 'VIEWED')
  for (const file of candidates) {
    if (!dryRun) {
      const answer = runGh(['api', 'graphql', '-f', `query=${MARK_MUTATION}`, '-f', `pr=${pr.id}`, '-f', `path=${file.path}`])
      if (answer.errors?.length) throw new Error(answer.errors.map((error) => error.message).join('; '))
      if (!answer.data?.markFileAsViewed) throw new Error(`GitHub did not confirm the mark for ${file.path}.`)
    }
    log(`${dryRun ? 'would mark' : 'viewed'} ${file.path}`)
  }
  log(`${repository}#${number}: ${candidates.length} file(s) ${dryRun ? 'would be marked' : 'marked'}.`)
  const reviewable = files.filter((file) => !supporting(file)).map((file) => file.path)
  log('Left for the reviewer:')
  for (const path of reviewable) log(`  ${path}`)
  return { candidates: candidates.map((file) => file.path), reviewable }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [prUrl, ...rest] = process.argv.slice(2)
  const extraPaths = rest.filter((arg) => arg !== '--dry-run')
  if (!prUrl || extraPaths.some((path) => path.startsWith('-'))) {
    console.error('Usage: node mark-pr-files-viewed.mjs <PR URL> [--dry-run] [path ...]')
    process.exit(1)
  }
  try {
    await prepareReview(prUrl, { dryRun: rest.includes('--dry-run'), extraPaths })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
