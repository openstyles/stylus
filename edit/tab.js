'use strict';

(() => {
  for (const container of document.querySelectorAll('.tab-container')) {
    init(container);
  }

  function init(container) {
    const tabButtons = [...container.querySelector('.tab-bar').children];
    const tabPanels = [...container.querySelector('.tab-panel').children];
    tabButtons.forEach((button, i) => button.addEventListener('click', () => activate(i)));

    function activate(index) {
      const toggleActive = (button, i) => button.classList.toggle('active', i === index);
      tabButtons.forEach(toggleActive);
      tabPanels.forEach(toggleActive);
    }
  }
})();
