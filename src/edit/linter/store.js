import {createPortProxy} from '/js/port';
import {workerPath} from '/js/urls';

export const cms = new Map();
export const linters = [];
export const lintingUpdatedListeners = [];
export const unhookListeners = [];
/** @type {EditorWorker} */
export const worker = createPortProxy(workerPath);
