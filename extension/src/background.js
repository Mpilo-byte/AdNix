"use strict"

const api = typeof browser !== "undefined" ? browser : chrome;

api.runtime.onInstalled.addListener(async () => {
    console.log("AdNix: Installed");
    const rulesets = await api.declarativeNetRequest.getEnabledRulesets();
    console.log("AdNix: Enabled rulesets:", rulesets);
});