import createWorker from '/js/worker-host';

export const cms = new Map();
export const linters = [];
export const lintingUpdatedListeners = [];
export const unhookListeners = [];
/** @type {EditorWorker} */
export const worker = createWorker('editor-worker');
