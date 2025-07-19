'use strict';

/* 
 * Roll20Pixels Chrome Extension
 * This file contains the code for the background service worker of the extension.
 * It listens for clicks on the extension icon and injects scripts and styles into the active tab if the URL matches roll20.net.
 * The injected script is responsible for adding a floating dialog to the Roll20 interface.
 * The dialog allows users to interact with the extension's features.
 * The CSS file provides the styling for the floating dialog.
 */

chrome.action.onClicked.addListener((tab) => {
    let validUrl = false;
    if (tab.url.includes("roll20.net")) {
        validUrl = true;
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["/js/roll20.js"] }, _ => { 
            console.log(`Injected script '/js/roll20.js' into tab ${tab.id}.`);
        }); 
        chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["/css/popup.css"], }, _ => { 
            console.log(`Injected script '/css/popup.css' into tab ${tab.id}.`);
        });
    }
});
