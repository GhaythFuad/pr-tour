const TOKEN_KEY = 'githubToken'

/** The GitHub token saved on the options page, or an empty string when there is none. */
export async function readToken(): Promise<string> {
  const stored = await chrome.storage.local.get(TOKEN_KEY)
  const token = stored[TOKEN_KEY]
  return typeof token === 'string' ? token : ''
}

export async function saveToken(token: string): Promise<void> {
  if (token) await chrome.storage.local.set({ [TOKEN_KEY]: token })
  else await chrome.storage.local.remove(TOKEN_KEY)
}
