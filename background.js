'use strict';

chrome.runtime.onInstalled.addListener(() => {
  // Storage example
  //chrome.storage.sync.set({color: '#3aa757'}, function() { console.log("The color is green."); });

  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([
      {
      conditions: [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { hostEquals: 'app.roll20.net' }
        })
      ],
      actions: [new chrome.declarativeContent.ShowAction()]
    }]);
  });
});
