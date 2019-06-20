/* global CodeMirror */
/*
Initialization of the multi-sections editor is slow if there are many editors
e.g. https://github.com/openstyles/stylus/issues/178. So we only refresh the
editor when they were scroll into view.
*/
'use strict';

CodeMirror.defineExtension('refreshOnView', function () {
  const cm = this;
  if (typeof IntersectionObserver === 'undefined') {
    // uh
    cm.isRefreshed = true;
    cm.refresh();
    return;
  }
  const wrapper = cm.display.wrapper;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        // wrapper.style.visibility = 'visible';
        cm.isRefreshed = true;
        cm.refresh();
        observer.disconnect();
      }
    }
  });
  observer.observe(wrapper);
});
