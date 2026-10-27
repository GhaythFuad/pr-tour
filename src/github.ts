export type PullRef = { owner: string; repo: string; number: number }

/** The fields PR Tour reads from GitHub's "List pull request files" response. */
export type ChangedFile = { filename: string; patch?: string }

const API = 'https://api.github.com'

export function parsePullPath(pathname: string): PullRef | null {
  const match = pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/)
  if (!match) return null
  const [, owner = '', repo = '', number = ''] = match
  return { owner, repo, number: Number(number) }
}

export function describePull(pull: PullRef): string {
  return `${pull.owner}/${pull.repo}#${pull.number}`
}

export async function listCommentBodies(pull: PullRef, token: string): Promise<string[]> {
  const url = `${API}/repos/${pull.owner}/${pull.repo}/issues/${pull.number}/comments?per_page=100`
  // GitHub's "List issue comments" response is an array of comments that each carry a `body`.
  const comments = (await getAllPages(url, token, `the comments of ${describePull(pull)}`)) as { body?: string }[]
  return comments.map((comment) => comment.body ?? '')
}

export async function listChangedFiles(pull: PullRef, token: string): Promise<ChangedFile[]> {
  const url = `${API}/repos/${pull.owner}/${pull.repo}/pulls/${pull.number}/files?per_page=100`
  // GitHub's "List pull request files" response is an array of ChangedFile supersets.
  return (await getAllPages(url, token, `the changed files of ${describePull(pull)}`)) as ChangedFile[]
}

/** The commit the pull request's branch points at now. */
export async function readHeadCommit(pull: PullRef, token: string): Promise<string> {
  const response = await fetch(`${API}/repos/${pull.owner}/${pull.repo}/pulls/${pull.number}`, { headers: headersFor(token) })
  if (!response.ok) throw new Error(describeFailure(response, `the latest commit of ${describePull(pull)}`))
  // GitHub's "Get a pull request" response names the head commit in `head.sha`.
  const { head } = (await response.json()) as { head: { sha: string } }
  return head.sha
}

/** Renders GitHub-flavoured Markdown the way GitHub does, sanitized, with links resolved against the repository. */
export async function renderMarkdown(text: string, pull: PullRef, token: string): Promise<string> {
  const response = await fetch(`${API}/markdown`, {
    method: 'POST',
    headers: { ...headersFor(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, mode: 'gfm', context: `${pull.owner}/${pull.repo}` }),
  })
  if (!response.ok) throw new Error(describeFailure(response, 'the step notes'))
  return response.text()
}

/** Paths the token's owner marked Viewed; GitHub clears the mark when a file changes after that. */
export async function listViewedFiles(pull: PullRef, token: string): Promise<Set<string>> {
  const what = `the files you marked Viewed in ${describePull(pull)}`
  const viewed = new Set<string>()
  let after: string | null = null
  do {
    const response: Response = await fetch(`${API}/graphql`, {
      method: 'POST',
      headers: { ...headersFor(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: VIEWED_FILES_QUERY, variables: { ...pull, after } }),
    })
    if (!response.ok) throw new Error(describeFailure(response, what))
    // GitHub's GraphQL API answers VIEWED_FILES_QUERY in this shape.
    const answer = (await response.json()) as ViewedFilesAnswer
    const refusal = answer.errors?.[0]?.message
    if (refusal) throw new Error(`GitHub refused PR Tour's request for ${what}: ${refusal}`)
    const files = answer.data?.repository?.pullRequest?.files
    for (const file of files?.nodes ?? []) if (file.viewerViewedState === 'VIEWED') viewed.add(file.path)
    after = files?.pageInfo.hasNextPage ? files.pageInfo.endCursor : null
  } while (after)
  return viewed
}

const VIEWED_FILES_QUERY = `query ($owner: String!, $repo: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      files(first: 100, after: $after) {
        nodes { path viewerViewedState }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`

type ViewedFilesAnswer = {
  data?: {
    repository?: {
      pullRequest?: {
        files?: {
          nodes: { path: string; viewerViewedState: 'VIEWED' | 'UNVIEWED' | 'DISMISSED' }[]
          pageInfo: { hasNextPage: boolean; endCursor: string | null }
        }
      }
    }
  }
  errors?: { message: string }[]
}

async function getAllPages(firstUrl: string, token: string, what: string): Promise<unknown[]> {
  const items: unknown[] = []
  let url: string | null = firstUrl
  while (url) {
    const response: Response = await fetch(url, { headers: headersFor(token) })
    if (!response.ok) throw new Error(describeFailure(response, what))
    items.push(...(await response.json()))
    url = response.headers.get('Link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null
  }
  return items
}

function headersFor(token: string): HeadersInit {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function describeFailure(response: Response, what: string): string {
  const cause = `GitHub answered ${response.status} when PR Tour asked for ${what}.`
  if (response.headers.get('x-ratelimit-remaining') === '0') {
    const reset = new Date(Number(response.headers.get('x-ratelimit-reset')) * 1000).toLocaleTimeString()
    return `${cause} The API rate limit is used up until ${reset}; adding a token in the PR Tour options raises it.`
  }
  if (response.status === 401) return `${cause} The token in the PR Tour options was rejected; replace it.`
  if (response.status === 403 || response.status === 404) {
    return `${cause} For a private repository, add a token with "Pull requests: Read-only" access to it in the PR Tour options.`
  }
  return cause
}
