"use strict"

const STYLE_ID = "adnix-cosmetic";

function injectCosmeticStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const selectors = globalThis.ADNIX_COSMETIC_SELECTORS || [];
    if (selectors.length === 0) return; 

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = selectors
        .map((selector) => selector + " {display: none !important; }")
        .join("\n");
        
    const parent = document.head || document.documentElement;
    parent.appendChild(style);
}

injectCosmeticStyle();