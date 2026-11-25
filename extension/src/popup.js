"use strict"

const enabledToggle = document.getElementById("enabled-toggle");
const siteStatus = document.getElementById("site-status");
const siteButton = document.getElementById("site-button");
const pageCount = document.getElementById("page-count");
const lifetimeCount = document.getElementById("lifetime-count");

let tab = null;
let host = null;
let allowlist = [];

function matchesEntry(hostname, entry) {
    return hostname === entry || hostname.endsWith("." + entry);
}

function getSiteHost(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
        return parsed.hostname.replace(/^www\./, "");
    } catch {
        return null;
    }
}

async function render() {
    const settings = await chrome.storage.local.get(["enabled", "allowlist", "lifetimeBlocked"]);
    const session = await chrome.storage.session.get("tabCounts");
    const tabCounts = session.tabCounts || {};

    allowlist = settings.allowlist || [];
    enabledToggle.checked = settings.enabled !== false;
    lifetimeCount.textContent = (settings.lifetimeBlocked || 0).toLocaleString();

    const pageBlocked = tab ? tabCounts[tab.id] || 0 : 0;
    pageCount.textContent = pageBlocked.toLocaleString();

    if (host === null) {
        siteStatus.textContent = "Not available on this page.";
        siteButton.hidden = true;
        return;
    }

    const allowed = allowlist.some((entry) => matchesEntry(host, entry));
    siteStatus.textContent = allowed ? "Ads allowed on " + host : "Blocking on " + host;
    siteButton.textContent = allowed ? "Block ads on this site" : "Allow ads on this site";
    siteButton.hidden = false;
}

async function update(message) {
    try {
        const response = await chrome.runtime.sendMessage(message);
        if (!response || !response.ok) throw new Error("AdNix: background request failed");
        if (tab) await chrome.tabs.reload(tab.id);
    } catch (error) {
        console.error(error);
    }
    await render();
}

enabledToggle.addEventListener("change", () => {
    update({ type: "set-enabled", enabled: enabledToggle.checked });
});

siteButton.addEventListener("click", () => {
    const allowed = allowlist.some((entry) => matchesEntry(host, entry));
    const next = allowed
        ? allowlist.filter((entry) => !matchesEntry(host, entry))
        : [...allowlist, host];
    update({ type: "set-allowlist", allowlist: next });
});

async function init() {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = activeTab || null;
    host = tab ? getSiteHost(tab.url) : null;
    await render();
}

chrome.storage.onChanged.addListener(render);
init();