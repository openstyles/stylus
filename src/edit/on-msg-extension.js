import {onMessage} from '@/js/msg';
import {API} from '@/js/msg-api';
import {closeCurrentTab} from '@/js/util-webext';
import editor from './editor';

onMessage.set(request => {
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
  style = await API.styles.getCore({id: style.id, vars: true});
  if (reason === 'config') {
    for (const key in editor.style)
      if (key !== 'sourceCode' && key !== 'sections' && !(key in style))
        delete editor.style[key];
    delete style.name;
    delete style.enabled;
    Object.assign(editor.style, style);
    editor.updateLivePreview();
  } else {
    await editor.replaceStyle(style);
  }
  window.dispatchEvent(new Event('styleSettings'));
}
