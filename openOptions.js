document.querySelector('#manage-options-button').addEventListener("click", function() {
    if (chrome.runtime.openOptionsPage) {
        // Supported (Chrome 42+)
        chrome.runtime.openOptionsPage();
    } else {
        // Fallback
        window.open(chrome.runtime.getURL('options/index.html'));
    }
});

document.querySelector('#shortcuts-button').addEventListener("click", function() {
    chrome.tabs.create({
        'url': 'chrome://extensions/configureCommands'
    });
});