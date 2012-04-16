function t(key, params) {
	var s = chrome.i18n.getMessage(key, params)
	if (s == "") {
		throw "Missing string '" + key + "'.";
	}
	return s;
}
function o(key) {
	document.write(t(key));
}
function tE(id, key, attr, esc) {
	if (attr) {
		document.getElementById(id).setAttribute(attr, t(key));
	} else if (typeof esc == "undefined" || esc) {
		document.getElementById(id).appendChild(document.createTextNode(t(key)));
	} else {
		document.getElementById(id).innerHTML = t(key);
	}
}
