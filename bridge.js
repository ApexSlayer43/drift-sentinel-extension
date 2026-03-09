// bridge.js
// Listens for postMessage from app.driftsentinel.io
// Relays device token to background.js storage

window.addEventListener("message", (event) => {
  if (event.origin !== "https://app.driftsentinel.io") return;
  if (!event.data || event.data.type !== "DS_REGISTER_DEVICE") return;

  const { device_token, account_ref } = event.data;
  if (!device_token || !account_ref) return;

  chrome.storage.local.set({
    ds_device_token: device_token,
    ds_account_ref: account_ref,
  }, () => {
    // Confirm back to web app
    window.postMessage({ type: "DS_REGISTER_ACK", ok: true }, "*");
    // Tell background to immediately re-poll state
    chrome.runtime.sendMessage({ type: "TOKEN_UPDATED" });
  });
});

// On load, tell the page whether a token already exists
chrome.storage.local.get(["ds_device_token"], (result) => {
  window.postMessage({
    type: "DS_STATUS",
    connected: !!result.ds_device_token,
  }, "*");
});
