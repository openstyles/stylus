import {API, onExtension} from '@/js/msg';
import {closeCurrentTab} from '@/js/util-webext';
import editor from './editor';

onExtension(request => {
  const {style} = request;
  switch (request.method) {
    case 'styleUpdated':
      if (editor.style.id === style.id) {
        handleExternalUpdate(request);
      }
      break;
    case 'styleDeleted':
      if (editor.style.id === style.id) {
        closeCurrentTab();
      }
      break;
  }
});

async function handleExternalUpdate({style, reason}) {
  if (reason === 'editPreview' ||
      reason === 'editPreviewEnd') {
    return;
  }
  if (reason === 'editSave' && editor.saving) {
    editor.saving = false;
    return;
  }
  if (reason === 'toggle') {
    if (editor.dirty.isDirty()) {
      editor.toggleStyle(style.enabled);
      // updateLivePreview is called by toggleStyle
    } else {
      Object.assign(editor.style, style);
      editor.updateLivePreview();
    }
    editor.updateMeta();
    return;
  }
  style = await API.styles.get(style.id);
  if (reason === 'config') {
    for (const key in editor.style) if (!(key in style)) delete editor.style[key];
    delete style.sourceCode;
    delete style.sections;
    delete style.name;
    delete style.enabled;
    Object.assign(editor.style, style);
    editor.updateLivePreview();
  } else {
    await editor.replaceStyle(style);
  }
  window.dispatchEvent(new Event('styleSettings'));
}
