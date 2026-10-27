import { OPEN_TOUR_MESSAGE } from './messages'

chrome.action.onClicked.addListener((tab) => void openTour(tab))

/** A GitHub tab opened before the extension was installed or reloaded has no copy of the content script that can answer, so one is injected first. */
async function openTour(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined || !tab.url?.startsWith('https://github.com/')) return
  try {
    await chrome.tabs.sendMessage(tab.id, OPEN_TOUR_MESSAGE)
    return
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
    await chrome.tabs.sendMessage(tab.id, OPEN_TOUR_MESSAGE)
  }
}
