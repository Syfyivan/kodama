const { ipcRenderer } = require('electron')

function sendKodamaLarkPush(data) {
  try {
    ipcRenderer.send('pet:lark-web-push-raw', data)
  } catch {
    // The page should keep working even if Kodama is closing.
  }
}

window.__kodamaLarkPush = sendKodamaLarkPush
window.sendWebhook = sendKodamaLarkPush
