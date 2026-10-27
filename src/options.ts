import { readToken, saveToken } from './settings'

// options.html declares these elements with these ids and types.
const form = document.getElementById('form') as HTMLFormElement
const input = document.getElementById('token') as HTMLInputElement
const status = document.getElementById('status') as HTMLElement

void readToken().then((token) => {
  input.value = token
  status.textContent = token ? 'A token is saved.' : 'No token saved.'
})

form.addEventListener('submit', (event) => {
  event.preventDefault()
  const token = input.value.trim()
  void saveToken(token).then(() => {
    status.textContent = token ? 'Saved. Reload open pull requests to use it.' : 'Token removed.'
  })
})
