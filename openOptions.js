/* globals configureCommands */
'use strict';

document.querySelector('#manage-options-button').addEventListener("click", function() {
    if (chrome.runtime.openOptionsPage) {
        // Supported (Chrome 42+)
        chrome.runtime.openOptionsPage();
    } else {
        // Fallback
        window.open(chrome.runtime.getURL('options/index.html'));
    }
});

document.querySelector('#manage-shortcuts-button').addEventListener("click", configureCommands.open);

document.querySelector('#editor-styles-button').addEventListener("click", function() {
    chrome.tabs.create({
        'url': 'https://userstyles.org/styles/browse/chrome-extension'
    });
});
