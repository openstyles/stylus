import {CodeMirror} from '@/cm';
import {
  kCodeMirror, kEditorSettings, pArrowKeysTraverse, pFavicons, pLintReportDelay,
} from '@/js/consts';
import {$toggleDataset} from '@/js/dom';
import {setupLivePrefs} from '@/js/dom-prefs';
import {template} from '@/js/localization';
import * as prefs from '@/js/prefs';
import {FROM_CSS, RX_META1, TO_CSS} from '@/js/style-util';
import {debounce} from '@/js/util';
import {
  C_ITEM, C_LIST, C_TYPE, C_VALUE, iconize, tplAppliesTo, tplAppliesToItem,
} from './applies-to';
import {initBeautifyButton} from './beautify';
import cmFactory from './codemirror-factory';
import editor from './editor';
import * as linterMan from './linter';
import livePreview from './live-preview';
import {helpPopup, trimCommentLabel} from './util';

let headerOffset; // in compact mode the header is at the top so it reduces the available height
let cmExtrasHeight; // resize grip + borders

/**
 * @typedef {HTMLElement} EditorSectionElement
 * @prop {EditorSection} me
 */
/** @prop {EditorSectionElement} el */
export default class EditorSection {
  /**
   * @param {StyleSection} sectionData
   * @param {function():number} genId
   * @param {EditorScrollInfo} [si]
   */
  constructor(sectionData, genId, si) {
    const me = this; // for tocEntry.removed
    const el = me.el = template.section.cloneNode(true);
    const elLabel = me.elLabel = el.$('.code-label');
    const elTargets = this.elTargets = tplAppliesTo.cloneNode(true);
    const wrapper = $tag('div');
    wrapper.className = kCodeMirror;
    elLabel.after(elTargets);
    elTargets[prefs.__values['editor.targetsFirst'] ? 'after' : 'before'](wrapper);
    el.me = me;
    me.id = genId();
    me.genId = genId;
    me.elLabelText = elLabel.lastChild;
    me.init = sectionData;
    me.si = si;
    me.targets = /** @type {SectionTarget[]} */ [];
    me.targetsListEl = el.$(C_LIST);
    me.tocEntry = {
      label: '',
      get removed() {
        return me.removed; // using `me` because of different `this`
      },
    };
    for (const propName in TO_CSS) {
      const arr = sectionData[propName];
      const cssName = TO_CSS[propName];
      if (cssName && arr) for (const v of arr) me.addTarget(cssName, v);
    }
    this.updateTocEntry();
  }

  get cm() {
    return this.create();
  }

  create(inView) {
    const {el, elTargets, si, init} = this;
    // TODO: find another way other than `el[kCodeMirror]` for getAssociatedEditor
    const {code} = init;
    const cm = el[kCodeMirror] = cmFactory.create(wrapper => {
      const ws = wrapper.style;
      const h = editor.loading
        // making it tall during initial load so IntersectionObserver sees only one adjacent CM
        ? ws.height = si ? si.height : '100vh'
        : ws.height;
      el.style.setProperty('--cm-height', h);
      el.$('.' + kCodeMirror).replaceWith(wrapper);
    }, {
      value: code,
    }, _ => editor.applyScrollInfo(_, si));
    Object.defineProperty(this, 'cm', {value: cm});
    cm.el = el;
    cm.editorSection = this;
    cm.setSize = EditorSection.onSetSize;
    this.changeGeneration = cm.changeGeneration();
    this.removed = false;
    elTargets.on('change', this);
    elTargets.on('input', this);
    elTargets.on('click', this);
    cm.on('changes', EditorSection.onCmChanges);
    if (!this.targets.length) this.addTarget();
    else if (prefs.__values[pFavicons]) iconize(this.targetsListEl);
    initBeautifyButton(el.$('.beautify-section'), [cm]);
    prefs.subscribe('editor.toc.expanded', this.updateTocPrefToggled.bind(this), true);
    if (prefs.__values[pArrowKeysTraverse]) this.toggleTraverse(true);
    setTimeout(linterMan.enableForEditor, prefs.__values[pLintReportDelay], cm, code);
    new ResizeGrip(cm); // eslint-disable-line no-use-before-define
    if (inView && (!si || !si.height))
      resizeCM(cm);
    this.si = this.init = null;
    return cm;
  }

  getModel() {
    /** @type {StyleSection} */
    const res = {code: this.cm.getValue()};
    for (const {type, value} of this.targets) {
      if (type) (res[FROM_CSS[type]] ??= []).push(value);
    }
    return res;
  }

  remove() {
    linterMan.disableForEditor(this.cm);
    this.el.classList.add('removed');
    this.removed = true;
    this.targets.forEach(_ => _.remove());
  }

  render() {
    this.cm.refresh();
  }

  destroy() {
    cmFactory.destroy(this.cm);
  }

  restore() {
    linterMan.enableForEditor(this.cm);
    this.el.classList.remove('removed');
    this.removed = false;
    this.targets.forEach(_ => _.restore());
    this.cm.refresh();
  }

  updateTocEntry(origin, sec = this) {
    const te = sec.tocEntry;
    let changed;
    if (origin === 'code' || !origin) {
      const label = sec.getLabelFromComment();
      if (te.label !== label) {
        te.label = sec.elLabelText.textContent = label;
        changed = true;
      }
    }
    if (!te.label) {
      const first = sec.targets[0];
      const target = first.type ? first.value : null;
      if (te.target !== target) {
        te.target = target;
        changed = true;
      }
      if (te.numTargets !== sec.targets.length) {
        te.numTargets = sec.targets.length;
        changed = true;
      }
    }
    if (changed) editor.updateToc([sec]);
  }

  updateTocEntryLazy() {
    debounce(this.updateTocEntry, 0, '', this);
  }

  updateTocFocus(evt) {
    editor.updateToc({focus: true, 0: evt ? this.me : this});
  }

  updateTocPrefToggled(key, val) {
    this.el[val ? 'on' : 'off']('focusin', this.updateTocFocus);
    if (val && this.el.contains(document.activeElement)) {
      this.updateTocFocus();
    }
  }

  getLabelFromComment() {
    let cmt = '';
    let inCmt;
    let elUC;
    (this.init ? {eachLine: fn => fn({text: this.init.code})} : this.cm).eachLine(({text}) => {
      let i = 0;
      if (!inCmt) {
        i = text.search(/\S/);
        if (i < 0) return;
        inCmt = text[i] === '/' && text[i + 1] === '*';
        if (!inCmt) return true;
      }
      const j = text.indexOf('*/', i + 2);
      text = text.slice(i, j >= 0 ? j : text.length);
      cmt = trimCommentLabel(text.slice(2));
      elUC = this.elUC;
      if (cmt && RX_META1.test(text)) {
        cmt = 'UserCSS';
        if (elUC) {
          elUC = null;
        } else {
          elUC = this.elUC = template.usercssSection.cloneNode(true);
          this.elLabelText.after(elUC);
        }
      } else if (elUC) {
        elUC.remove();
        elUC = this.elUC = false;
      }
      if (elUC != null) this.elLabel.classList.toggle('warn', elUC);
      return j >= 0 || cmt;
    });
    return cmt;
  }

  /**
   * Used by addEventListener implicitly
   * @param {MouseEvent} evt
   */
  handleEvent(evt) {
    const el = evt.target;
    const cls = el.classList;
    const trgEl = el.closest(C_ITEM);
    const trg = /** @type {SectionTarget} */ trgEl && trgEl.me;
    let tmp;
    switch (evt.type) {
      case 'click':
        if (cls.contains('add-applies-to')) {
          this.addTarget(trg.type, '', trg).el.$(C_VALUE).focus();
        } else if (cls.contains('remove-applies-to')) {
          this.removeTarget(trg);
        } else if (!this.ati && (tmp = el.closest('label'))) {
          const chk = template[kEditorSettings].$('#editor\\.targetsFirst');
          const chkLabel = chk.closest('label').cloneNode(true);
          const ati = this.ati = helpPopup.show(chkLabel, tmp.title, {}, 'ati');
          ati.onClose.add(() => delete this.ati);
          setupLivePrefs(chkLabel);
        }
        break;
      case 'change':
        if (el === trg.selectEl) trg.onSelectChange();
        break;
      case 'input':
        if (el === trg.valueEl) trg.onValueChange();
        break;
    }
  }

  /**
   * @param {string} [type]
   * @param {string} [value]
   * @param {SectionTarget} [base]
   * @return {SectionTarget}
   */
  addTarget(type, value, base) {
    const {targets} = this;
    const res = new SectionTarget(this, type, value); // eslint-disable-line no-use-before-define
    targets.splice(base ? targets.indexOf(base) + 1 : targets.length, 0, res);
    this.targetsListEl.insertBefore(res.el, base ? base.el.nextSibling : null);
    if (!this.init)
      editor.dirty.add(res, res);
    if (targets.length > 1 && !targets[0].type) {
      this.removeTarget(targets[0]);
    }
    if (base) requestAnimationFrame(() => this.shrinkBy1());
    this.el.style.setProperty('--targets', targets.length);
    livePreview();
    return res;
  }

  /**
   * @param {SectionTarget} target
   */
  removeTarget(target) {
    const {targets} = this;
    targets.splice(targets.indexOf(target), 1);
    editor.dirty.remove(target, target);
    target.remove();
    target.el.remove();
    if (!targets.length) this.addTarget();
    this.el.style.setProperty('--targets', targets.length);
    livePreview();
  }

  toggleTraverse(state) {
    this.cm.display.wrapper[state ? 'on' : 'off']('keydown', traverse, true);
  }

  shrinkBy1() {
    const {cm, el} = this;
    const cmEl = cm.display.wrapper;
    const cmH = cmEl.offsetHeight;
    const viewH = el.parentElement.offsetHeight;
    if (el.offsetHeight > viewH && cmH > Math.min(viewH / 2, cm.display.sizer.offsetHeight + 30)) {
      cmEl.style.height =
        (cmH - this.elTargets.offsetHeight / (this.targets.length || 1) | 0) + 'px';
    }
  }

  static onCmChanges(cm) {
    const cur = cm.changeGeneration();
    const sec = /** @type {EditorSection} */ cm.editorSection;
    editor.dirty.modify(`section.${sec.id}.code`, sec.changeGeneration, cur);
    sec.changeGeneration = cur;
    sec.updateTocEntryLazy();
    livePreview();
  }

  static onSetSize(w, h) {
    const cm = this;
    CodeMirror.prototype.setSize.call(cm, w, h);
    cm.el.style.setProperty('--cm-height', cm.display.wrapper.style.height);
  }
}

class SectionTarget {
  /**
   * @param {EditorSection} section
   * @param {string} type
   * @param {string} value
   */
  constructor(section, type = '', value = '') {
    this.id = section.genId();
    this.el = tplAppliesToItem.cloneNode(true);
    this.el.me = this;
    $toggleDataset(this.el, 'type', type);
    this.section = section;
    this.dirt = `section.${section.id}.apply.${this.id}`;
    this.selectEl = this.el.$(C_TYPE);
    this.valueEl = this.el.$(C_VALUE);
    editor.toggleRegexp(this.valueEl, type);
    this.type = this.selectEl.value = type;
    this.value = this.valueEl.value = value;
    if (!section.init)
      this.restore();
  }

  remove() {
    if (!this.type) return;
    editor.toggleRegexp(this.valueEl);
    editor.dirty.remove(`${this.dirt}.type`, this.type);
    editor.dirty.remove(`${this.dirt}.value`, this.value);
  }

  restore() {
    if (!this.type) return;
    editor.dirty.add(`${this.dirt}.type`, this.type);
    editor.dirty.add(`${this.dirt}.value`, this.value);
  }

  onSelectChange() {
    const sec = this.section;
    const val = this.selectEl.value;
    editor.dirty.modify(`${this.dirt}.type`, this.type, val);
    editor.toggleRegexp(this.valueEl, val);
    $toggleDataset(this.el, 'type', val);
    this.type = val;
    sec.updateTocEntry('apply');
    if (prefs.__values[pFavicons]) iconize(this.el, true);
    livePreview();
  }

  onValueChange() {
    const val = this.valueEl.value;
    editor.dirty.modify(`${this.dirt}.value`, this.value, val);
    this.value = val;
    this.section.updateTocEntry('apply');
    if (prefs.__values[pFavicons]) iconize(this.el, true);
    livePreview();
  }
}

class ResizeGrip {
  constructor(cm) {
    const wrapper = this.wrapper = cm.display.wrapper;
    const el = template.resizeGrip.cloneNode(true);
    wrapper.classList.add('resize-grip-enabled');
    wrapper.appendChild(el);
    this.cm = cm;
    this.lastClickTime = 0;
    this.lastHeight = 0;
    this.minHeight = 0;
    this.lastY = 0;
    el.on('mousedown', {me: this, handleEvent: ResizeGrip.onMouseDown});
    this.onResize = {me: this, handleEvent: ResizeGrip.resize};
    this.onStop = {me: this, handleEvent: ResizeGrip.resizeStop};
  }

  static onMouseDown(evt) {
    const me = /** @type {ResizeGrip} */ this.me;
    me.lastHeight = me.wrapper.offsetHeight;
    me.lastY = evt.clientY;
    if (evt.button !== 0) {
      return;
    }
    evt.preventDefault();
    if (Date.now() - me.lastClickTime < 500) {
      me.lastClickTime = 0;
      me.toggleSectionHeight();
      return;
    }
    me.lastClickTime = Date.now();
    me.minHeight = me.cm.defaultTextHeight() +
      /* .CodeMirror-lines padding */
      me.cm.display.lineDiv.offsetParent.offsetTop +
      /* borders */
      me.wrapper.offsetHeight - me.wrapper.clientHeight;
    document.body.classList.add('resizing-v');
    document.on('mousemove', me.onResize);
    document.on('mouseup', me.onStop);
  }

  static resize(evt) {
    const me = /** @type {ResizeGrip} */ this.me;
    const height = Math.max(me.minHeight, me.lastHeight + evt.clientY - me.lastY);
    if (height !== me.lastHeight) {
      me.cm.setSize(null, height);
      me.lastHeight = height;
      me.lastY = evt.clientY;
    }
  }

  static resizeStop() {
    const me = /** @type {ResizeGrip} */ this.me;
    document.off('mouseup', me.onStop);
    document.off('mousemove', me.onResize);
    document.body.classList.remove('resizing-v');
  }

  toggleSectionHeight() {
    const {cm, wrapper} = this;
    if (cm.state.toggleHeightSaved) {
      // restore previous size
      cm.setSize(null, cm.state.toggleHeightSaved);
      cm.state.toggleHeightSaved = 0;
    } else {
      // maximize
      const allBounds = $id('sections').getBoundingClientRect();
      const pageExtrasHeight = allBounds.top + window.scrollY +
        parseFloat(getComputedStyle($id('sections')).paddingBottom);
      const sectionEl = wrapper.parentNode;
      const sectionExtrasHeight = sectionEl.clientHeight - wrapper.offsetHeight;
      cm.state.toggleHeightSaved = wrapper.clientHeight;
      cm.setSize(null, window.innerHeight - sectionExtrasHeight - pageExtrasHeight);
      const bounds = sectionEl.getBoundingClientRect();
      if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
        window.scrollBy(0, bounds.top);
      }
    }
  }
}

function traverse(event) {
  if (event.shiftKey || event.altKey || event.metaKey ||
      event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
    return;
  }
  let pos;
  let cm = this[kCodeMirror];
  const {line, ch} = cm.getCursor();
  if (event.key === 'ArrowUp') {
    cm = line === 0 && editor.prevEditor(cm, true);
    pos = cm && [cm.doc.size - 1, ch];
  } else {
    cm = line === cm.doc.size - 1 && editor.nextEditor(cm, true);
    pos = cm && [0, 0];
  }
  if (cm) {
    cm.setCursor(...pos);
    event.preventDefault();
    event.stopPropagation();
  }
}

function resizeCM(cm) {
  const {display: {wrapper, sizer}} = cm;
  const lineHeight = cm.defaultTextHeight();
  let contentHeight = sizer.offsetHeight;
  if (contentHeight < lineHeight) {
    return;
  }
  if (headerOffset == null) {
    headerOffset = Math.ceil($('#sections').getBoundingClientRect().top + scrollY);
  }
  if (cmExtrasHeight == null) {
    cmExtrasHeight = wrapper.offsetHeight - wrapper.clientHeight; // borders
  }
  contentHeight += cmExtrasHeight + lineHeight;
  const cmHeight = wrapper.offsetHeight;
  const appliesToHeight = Math.min(wrapper.parentNode.offsetHeight - cmHeight, innerHeight / 2);
  const maxHeight = Math.floor(window.innerHeight - headerOffset - appliesToHeight);
  const fit = Math.min(contentHeight, maxHeight);
  if (Math.abs(fit - cmHeight) > 1) {
    cm.setSize(null, fit);
  }
}
