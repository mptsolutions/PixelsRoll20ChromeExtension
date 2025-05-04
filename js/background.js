'use strict';

/* 
 * Roll20Pixels Chrome Extension
 * This file contains the code for the background worker.
 */


/* 
 * Create listener for when the extension is installed.
 * In theory this will set up the rules for when the extension icon should be shown.
 * But it is not working as expected, so the icon is always shown.
 */
chrome.runtime.onInstalled.addListener(() => {
    chrome.declarativeContent.onPageChanged.removeRules(async () => {
        chrome.declarativeContent.onPageChanged.addRules([{
            conditions: [
                new chrome.declarativeContent.PageStateMatcher({
                    pageUrl: { hostSuffix: 'app.roll20.net', schemes: ['https'] },
                }),
            ],
            actions: [ new chrome.declarativeContent.ShowAction()]
        }]);
    });
});
