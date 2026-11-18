"use strict"

const api = typeof browser !== "undefined" ? browser : chrome;

api.runtime.onInstalled.addListener(() => {
    console.log("AdNix: Installed");
});