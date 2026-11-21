"use strict"

const api = typeof browser !== "undefined" ? browser : chrome;

const RULESET_IDS = ["ads", "trackers"];
const FLUSH_DELAY_MS = 500;

let queue = Promise.resolve();
let pendingTabs = {};
let pendingLifetime = 0;
let flushTimer = null;

function enqueue(task) {
    queue = queue.then(task).catch((error) => console.error("AdNix:", error));
}

// ---- Settings -> blocking rules ----

async function syncRulesets() {
    const { enabled = true } = await api.storage.local.get("enabled");
    await api.declarativeNetRequest.updateEnabledRulesets(
        enabled ? { enableRulesetIds: RULESET_IDS } : { disableRulesetIds: RULESET_IDS }
    );
}

async function syncAllowlistRules() {
    const { allowlist = [] } = await api.storage.local.get("allowlist");
    const existing = await api.declarativeNetRequest.getDynamicRules();
    await api.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existing.map((rule) => rule.id),
        addRules: allowlist.map((host, index) => ({
            id: index + 1,
            priority: 2,
            action: { type: "allowAllRequests" },
            condition: { requestDomains: [host], resourceTypes: ["main_frame"] }
        }))
    });
}

async function handleMessage(message) {
    if (message.type === "set-enabled") {
        await api.storage.local.set({ enabled: message.enabled === true });
        await syncRulesets();
    } else if (message.type === "set-allowlist") {
        const allowlist = message.allowlist.filter((host) => typeof host === "string" && host);
        await api.storage.local.set({ allowlist });
        await syncAllowlistRules();
    }
}

// ---- Blocked counters ----

function scheduleFlush() {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        enqueue(flushCounts);
    }, FLUSH_DELAY_MS);
}

async function flushCounts() {
    const tabDeltas = pendingTabs;
    const lifetimeDelta = pendingLifetime;
    pendingTabs = {};
    pendingLifetime = 0;

    if (lifetimeDelta > 0) {
        const { lifetimeBlocked = 0 } = await api.storage.local.get("lifetimeBlocked");
        await api.storage.local.set({ lifetimeBlocked: lifetimeBlocked + lifetimeDelta });
    }

    const tabIds = Object.keys(tabDeltas);
    if (tabIds.length > 0) {
        const { tabCounts = {} } = await api.storage.session.get("tabCounts");
        for (const tabId of tabIds) {
            tabCounts[tabId] = (tabCounts[tabId] || 0) + tabDeltas[tabId];
        }
        await api.storage.session.set({ tabCounts });
    }
}

function countBlocked(tabId) {
    pendingLifetime += 1;
    if (tabId >= 0) pendingTabs[tabId] = (pendingTabs[tabId] || 0) + 1;
    scheduleFlush();
}

function resetTabCount(tabId) {
    delete pendingTabs[tabId];
    enqueue(async () => {
        const { tabCounts = {} } = await api.storage.session.get("tabCounts");
        if (!(tabId in tabCounts)) return;
        delete tabCounts[tabId];
        await api.storage.session.set({ tabCounts });
    });
}

// Debug-only API: unpacked Chrome/Edge, and Firefox only if implemented and enabled.
if (api.declarativeNetRequest.onRuleMatchedDebug) {
    api.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
        if (!RULESET_IDS.includes(info.rule.rulesetId)) return;
        countBlocked(info.request.tabId);
    });
}

api.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "loading") resetTabCount(tabId);
});

api.tabs.onRemoved.addListener((tabId) => resetTabCount(tabId));

// ---- Lifecycle and popup messages ----

api.runtime.onInstalled.addListener(async () => {
    console.log("AdNix: Installed");
    await syncRulesets();
    await syncAllowlistRules();
    const rulesets = await api.declarativeNetRequest.getEnabledRulesets();
    console.log("AdNix: Enabled rulesets:", rulesets);
});

api.runtime.onStartup.addListener(syncRulesets);

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => {
            console.error("AdNix:", error);
            sendResponse({ ok: false });
        });
    return true;
});