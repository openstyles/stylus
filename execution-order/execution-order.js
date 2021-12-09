/* global prefs */
/* global API */

(async () => {
  const list = (await getOrderedStyles()).map(createLi);
  document.querySelector("#main").append(...list.map(l => l.el));

  function createLi(style) {
    const el = document.createElement("li");
    const dragger = document.createElement("span");
    dragger.class = "dragger";
    el.append(dragger, style.name);
    return {el};
  }

  async function getOrderedStyles() {
    const [styles, ] = await Promise.all([
      API.styles.getAll(),
      prefs.ready
    ]);
    const styleSet = new Set(styles);
    const uuidIndex = new Map;
    for (const s of styleSet) {
      uuidIndex.set(s._id, s);
    }
    const orderedStyles = [];
    for (const uid of prefs.get('styles.order')) {
      const s = uuidIndex.get(uid);
      if (s) {
        orderedStyles.push(s);
      }
    }
    orderedStyles.push(...styleSet);
    return orderedStyles;
  }
})();
