/* global $ $$ API t prefs handleEvent installed exportToFile checkUpdate exportDropbox
   messageBox */
/* exported bulk */
'use strict';

const bulk = {

  init: () => {
    document.addEventListener('change', bulk.updateBulkFilters);
    $('#bulk-actions-select').onchange = bulk.handleSelect;
    $('#bulk-actions-apply').onclick = bulk.handleApply;
  },

  handleSelect: event => {
    event.preventDefault();
    $$('[data-bulk]').forEach(el => el.classList.add('hidden'));

    switch (event.target.value) {
      case 'enable':
        break;
      case 'disable':
        break;
      case 'export':
        $('[data-bulk="export"]').classList.remove('hidden');
        break;
      case 'update':
        $('[data-bulk="update"]').classList.remove('hidden');
        break;
      // case 'reset':
      //   break;
      case 'delete':
        break;
    }
  },

  handleApply: event => {
    event.preventDefault();
    let styles;
    const action = $('#bulk-actions-select').value;
    const entries = $$('.entry-filter-toggle:checked').map(el => el.closest('.entry'));

    switch (action) {
      case 'enable':
      case 'disable': {
        const isEnabled = action === 'enable';
        entries.forEach(entry => {
          const box = $('.entry-state-toggle', entry);
          entry.classList.toggle('enable', isEnabled);
          box.checked = isEnabled;
          handleEvent.toggle.call(box, event, entry);
        });
        break;
      }
      case 'export': {
        styles = entries.map(entry => entry.styleMeta);
        const destination = prefs.get('manage.export.destination');
        if (destination === 'dropbox') {
          return exportDropbox(styles);
        }
        return exportToFile(styles);
      }
      case 'update':
        styles = entries.map(entry => entry.styleMeta);
        checkUpdate(styles); // TO DO: don't check all styles
        break;
      // case 'reset':
      //   break;
      case 'delete':
        styles = entries.reduce((acc, entry) => {
          const style = entry.styleMeta;
          acc[style.name] = style.id;
          return acc;
        }, {});
        bulk.deleteBulk(event, styles);
        $('#toggle-all-filters').checked = false;
        break;
    }
    $('#bulk-actions-select').value = '';
  },

  updateBulkFilters: ({target}) => {
    // total is undefined until initialized
    if (installed.dataset.total) {
      // ignore filter checkboxes
      if (target.type === 'checkbox' && !target.dataset.filter && target.closest('#tools-wrapper, .entry')) {
        handleEvent.toggleBulkActions({hidden: false});
        const bulk = $('#toggle-all-filters');
        const state = target.checked;
        const visibleEntries = $$('.entry-filter-toggle')
          .filter(entry => !entry.closest('.entry').classList.contains('hidden'));
        bulk.indeterminate = false;
        if (target === bulk) {
          visibleEntries.forEach(entry => {
            entry.checked = state;
          });
        } else {
          if (visibleEntries.length === visibleEntries.filter(entry => entry.checked === state).length) {
            bulk.checked = state;
          } else {
            bulk.checked = false;
            bulk.indeterminate = true;
          }
        }
      }
      const count = $$('.entry-filter-toggle').filter(entry => entry.checked).length;
      $('#bulk-filter-count').textContent = count || '';

      if (count > 0 && $('#bulk-actions-select').value !== '') {
        $('#bulk-actions-apply').removeAttribute('disabled');
      } else {
        $('#bulk-actions-apply').setAttribute('disabled', true);
      }
    }
  },

  deleteBulk: (event, styles) => {
    messageBox({
      title: t('deleteStyleConfirm'),
      contents: Object.keys(styles).join(', '),
      className: 'danger center',
      buttons: [t('confirmDelete'), t('confirmCancel')],
    })
    .then(({button}) => {
      if (button === 0) {
        Object.values(styles).forEach(id => API.deleteStyle(id));
        installed.dataset.total -= Object.keys(styles).length;
        bulk.updateBulkFilters({target: $('#toggle-all-filters')});
      }
    });
  }

};
