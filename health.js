chrome.extension.sendMessage({method: "healthCheck"}, function(ok) {
	if (!ok) {
		if (confirm(t("dbError"))) {
			window.open("http://userstyles.org/dberror");
		}
	}
});
