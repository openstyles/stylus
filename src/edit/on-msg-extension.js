import {onMessage} from '@/js/msg';
import {API} from '@/js/msg-api';
import {closeCurrentTab} from '@/js/util-webext';
import editor from './editor';

let replacing, replaceQueue;

onMessage.set(request => {
  if (!request.broadcast) // ignore duplicate message from broadcast() to this tab
    return;
  const {style} = request;
  switch (request.method) {
    case 'styleUpdated':
      if (editor.style.id === style.id) {
        handleExternalUpdate(style, request.reason, request.editorId);
      }
      break;
    case 'styleDeleted':
      if (editor.style.id === style.id) {
        closeCurrentTab();
      }
      break;
  }
});

function handleExternalUpdate(style, reason, editorId) {
  if (reason === 'editPreview' ||
      reason === 'editPreviewEnd') {
    return;
  }
  if (reason === 'editSave' && editor.msg.editorId === editorId) {
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
  (replaceQueue ??= []).push([style, reason]);
  replacing = replacing
    ? replacing.then(onReplaced, onReplaced)
    : onReplaced();
}

async function onReplaced() {
  let [style, reason] = replaceQueue.shift();
  style = await API.styles.getCore({id: style.id, src: true, vars: true});
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
