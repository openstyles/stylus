function confirmDelete(event, {float = false} = {}) {
  const id = getClickedStyleId(event);
  const box = $('#confirm');
  box.dataset.id = id;
  box.dataset.display = true;
  box.style.cssText = '';
  $('b', box).textContent = ((cachedStyles.byId.get(id) || {}).style || {}).name;
  if (float) {
    const GAP = 50;
    const {width:W, height:H} = box.firstElementChild.getBoundingClientRect();
    const {left:L, top:T, right:R, bottom:B} = event.target.getBoundingClientRect();
    Object.assign(box.style, {
      paddingTop: (Math.min(T - H/2, innerHeight - H) - GAP) + 'px',
      paddingLeft: (Math.min(L - W/2, innerWidth - W) - GAP) + 'px',
      paddingRight: (innerWidth - Math.max(R + W/2, W) - GAP) + 'px',
      paddingBottom: (innerHeight - Math.max(B + H/2, H) - GAP) + 'px',
    });
  }
  let resolveMe;
  $('[data-cmd="ok"]', box).onclick = event => doDelete(true);
  $('[data-cmd="cancel"]', box).onclick = event => doDelete(false);
  window.addEventListener('keydown', onKey);

  const stopScroll = {x: scrollX, y: scrollY};
  window.addEventListener('scroll', preventScroll);

  return new Promise(resolve => resolveMe = resolve);

  function doDelete(confirmed) {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('scroll', preventScroll);
    box.classList.add('lights-on');
    box.addEventListener('animationend', function _() {
      box.removeEventListener('animationend', _);
      box.dataset.display = false;
      box.classList.remove('lights-on');
    });
    Promise.resolve(confirmed && deleteStyle(id))
      .then(resolveMe);
  }

  function onKey(event) {
    if (!event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
    && (event.keyCode == 13 || event.keyCode == 27)) {
      event.preventDefault();
      doDelete(event.keyCode == 13);
    }
  }

  function preventScroll() {
    window.scrollTo(stopScroll.x, stopScroll.y);
  }
}
