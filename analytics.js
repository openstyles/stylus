var _gaq = _gaq || [];
_gaq.push(['_setAccount', 'UA-8246384-4']);
_gaq.push(['_trackPageview']);

function isAnalyticsEnabled() {
	try {
		return chrome.extension.getBackgroundPage().prefs.get("analyticsEnabled");
	} catch (ex) {
		console.log(ex);
		return true;
	}
}

// Prefs seems not available immediately
setTimeout(function() {
	if (isAnalyticsEnabled()) {
		(function() {
			var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
			ga.src = 'https://ssl.google-analytics.com/ga.js';
			var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
		})();
		setInterval(function() {
			if (isAnalyticsEnabled()) {
				_gaq.push(['_trackPageview']);
			}
		}, 1000 * 60 * 60 * 24);
	}
}, 1000);
