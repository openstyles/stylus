/* global $ $$ API t prefs handleEvent installed exportToFile checkUpdateBulk exportDropbox
   messageBox */
/* exported bulk */
'use strict';

const bulk = {

  init: () => {
    document.addEventListener('change', bulk.updateBulkFilters);
    $('#bulk-actions-select').onchange = bulk.handleSelect;
    $('#bulk-actions-apply').onclick = bulk.handleApply;
  },

  checkApply: () => {
    const checkedEntries = $$('.entry-filter-toggle').filter(entry => entry.checked);
    if (checkedEntries.length > 0 && $('#bulk-actions-select').value !== '') {
      $('#bulk-actions-apply').removeAttribute('disabled');
    } else {
      $('#bulk-actions-apply').setAttribute('disabled', true);
    }
    $('#bulk-filter-count').textContent = checkedEntries.length || '';
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
        checkUpdateBulk();
        break;
      // case 'reset':
      //   break;
      case 'delete': {
        styles = entries.reduce((acc, entry) => {
          const style = entry.styleMeta;
          acc[style.id] = style.name;
          return acc;
        }, {});
        bulk.deleteBulk(event, styles);
        const toggle = $('#toggle-all-filters');
        toggle.checked = false;
        toggle.indeterminate = false;
        break;
      }
    }
    $('#bulk-actions-select').value = '';
    $('#bulk-actions-apply').setAttribute('disabled', true);
  },

  updateBulkFilters: ({target}) => {
    // total is undefined until initialized
    if (installed.dataset.total) {
      // ignore filter checkboxes
      if (target.type === 'checkbox' && target.closest('.toggle-all, .entry-filter')) {
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
      bulk.checkApply();
    }
  },

  deleteBulk: (event, styles) => {
    messageBox({
      title: t('deleteStyleConfirm'),
      contents: Object.values(styles).join(', '),
      className: 'danger center',
      buttons: [t('confirmDelete'), t('confirmCancel')],
    })
    .then(({button}) => {
      if (button === 0) {
        Object.keys(styles).forEach(id => API.deleteStyle(Number(id)));
        installed.dataset.total -= Object.keys(styles).length;
        bulk.updateBulkFilters({target: $('#toggle-all-filters')});
      }
    });
  }

};
