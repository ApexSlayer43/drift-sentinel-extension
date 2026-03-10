// bridge.js
// Runs on app.driftsentinel.io — relays device token between webapp and extension
console.log("[DriftSentinel] bridge.js loaded on", window.location.hostname);

function sendStatus() {
  chrome.storage.local.get(["ds_device_token"], (result) => {
    window.postMessage({
      type: "DS_STATUS",
      connected: !!result.ds_device_token,
    }, "*");
  });
}

// Send immediately on load
sendStatus();

// Re-send every 500ms for 10s to catch SPA-mounted React listeners
let retries = 0;
const interval = setInterval(() => {
  sendStatus();
  if (++retries >= 20) clearInterval(interval);
}, 500);

// Listen for messages from the page
window.addEventListener("message", (event) => {
  if (event.origin !== "https://app.driftsentinel.io") return;

  // Respond to ping requests (handles SPA navigation to /settings)
  if (event.data?.type === "DS_PING") {
    sendStatus();
    return;
  }

  // Handle device registration
  if (event.data?.type !== "DS_REGISTER_DEVICE") return;

  const { device_token, account_ref } = event.data;
  if (!device_token || !account_ref) return;

  chrome.storage.local.set({
    ds_device_token: device_token,
    ds_account_ref: account_ref,
  }, () => {
    window.postMessage({ type: "DS_REGISTER_ACK", ok: true }, "*");
    chrome.runtime.sendMessage({ type: "TOKEN_UPDATED" });
  });
});
