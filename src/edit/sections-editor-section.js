import {kCodeMirror, kEditorSettings} from '@/js/consts';
import {$toggleDataset} from '@/js/dom';
import {setupLivePrefs} from '@/js/dom-util';
import {templateCache, htmlToTemplate, template} from '@/js/localization';
import * as prefs from '@/js/prefs';
import {FROM_CSS, TO_CSS} from '@/js/sections-util';
import {debounce} from '@/js/util';
import {CodeMirror} from '@/cm';
import {initBeautifyButton} from './beautify';
import cmFactory from './codemirror-factory';
import editor from './editor';
import * as linterMan from './linter';
import {htmlEditorSettings} from './settings';
import {helpPopup, htmlAppliesTo, trimCommentLabel} from './util';

const RX_META1 = /^!?\s*==userstyle==\s*$/i;

export default class EditorSection {
  /**
   * @param {StyleSection} sectionData
   * @param {function():number} genId
   * @param {EditorScrollInfo} [si]
   */
  constructor(sectionData, genId, si) {
    const me = this; // for tocEntry.removed
    const el = this.el = templateCache.section.cloneNode(true);
    const elLabel = this.elLabel = el.$('.code-label');
    const at = this.targetsEl = el.$('.applies-to');
    // TODO: find another way other than `el[kCodeMirror]` for getAssociatedEditor
    const cm = this.cm = el[kCodeMirror] = cmFactory.create(wrapper => {
      const ws = wrapper.style;
      const h = editor.loading
        // making it tall during initial load so IntersectionObserver sees only one adjacent CM
        ? ws.height = si ? si.height : '100vh'
        : ws.height;
      el.style.setProperty('--cm-height', h);
      at[prefs.__values['editor.targetsFirst'] ? 'after' : 'before'](wrapper);
    }, {
      value: sectionData.code,
      finishInit(_) {
        editor.applyScrollInfo(_, si);
      },
    });
    this.elLabelText = elLabel.lastChild;
    cm.el = el;
    cm.editorSection = this;
    el.me = this;
    cm.setSize = EditorSection.onSetSize;
    this.genId = genId;
    this.id = genId();
    this.changeListeners = new Set();
    this.changeGeneration = cm.changeGeneration();
    this.removed = false;
    this.tocEntry = {
      label: '',
      get removed() {
        return me.removed; // using `me` because of different `this`
      },
    };
    this.targets = /** @type {SectionTarget[]} */ [];
    this.targetsListEl = el.$('.applies-to-list');
    this.targetsEl.on('change', this);
    this.targetsEl.on('input', this);
    this.targetsEl.on('click', this);
    cm.on('changes', EditorSection.onCmChanges);
    for (const propName in TO_CSS) {
      const arr = sectionData[propName];
      const cssName = TO_CSS[propName];
      if (cssName && arr) for (const v of arr) this.addTarget(cssName, v);
    }
    if (!this.targets.length) this.addTarget();
    initBeautifyButton(el.$('.beautify-section'), [cm]);
    prefs.subscribe('editor.toc.expanded', this.updateTocPrefToggled.bind(this), true);
    new ResizeGrip(cm); // eslint-disable-line no-use-before-define
    this.updateTocEntry();
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

  onChange(fn) {
    this.changeListeners.add(fn);
  }

  emitChange(origin) {
    for (const fn of this.changeListeners) {
      fn.call(this, origin);
    }
  }

  off(fn) {
    this.changeListeners.delete(fn);
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
    this.cm.eachLine(({text}) => {
      let i = 0;
      if (!inCmt) {
        i = text.search(/\S/);
        if (i < 0) return;
        inCmt = text[i] === '/' && text[i + 1] === '*';
        if (!inCmt) return true;
        i += 2;
      }
      const j = text.indexOf('*/', i);
      text = text.slice(i, j >= 0 ? j : text.length);
      cmt = trimCommentLabel(text);
      elUC = this.elUC;
      if (cmt && RX_META1.test(text)) {
        if (elUC) elUC = null;
        else {
          this.elLabelText.after(elUC = this.elUC = templateCache.usercssSection.cloneNode(true));
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
    const trgEl = el.closest('.applies-to-item');
    const trg = /** @type {SectionTarget} */ trgEl && trgEl.me;
    let tmp;
    switch (evt.type) {
      case 'click':
        if (cls.contains('add-applies-to')) {
          this.addTarget(trg.type, '', trg).el.$('input').focus();
        } else if (cls.contains('remove-applies-to')) {
          this.removeTarget(trg);
        } else if (!this.ati && (tmp = el.closest('label'))) {
          const chk = (templateCache[kEditorSettings] ??= htmlToTemplate(htmlEditorSettings))
            .$('#editor\\.targetsFirst');
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
    editor.dirty.add(res, res);
    if (targets.length > 1 && !targets[0].type) {
      this.removeTarget(targets[0]);
    }
    if (base) requestAnimationFrame(() => this.shrinkBy1());
    this.el.style.setProperty('--targets', targets.length);
    this.emitChange('apply');
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
    this.emitChange('apply');
  }

  shrinkBy1() {
    const {cm, el} = this;
    const cmEl = cm.display.wrapper;
    const cmH = cmEl.offsetHeight;
    const viewH = el.parentElement.offsetHeight;
    if (el.offsetHeight > viewH && cmH > Math.min(viewH / 2, cm.display.sizer.offsetHeight + 30)) {
      cmEl.style.height =
        (cmH - this.targetsEl.offsetHeight / (this.targets.length || 1) | 0) + 'px';
    }
  }

  static onCmChanges(cm) {
    const cur = cm.changeGeneration();
    const sec = /** @type {EditorSection} */ cm.editorSection;
    editor.dirty.modify(`section.${sec.id}.code`, sec.changeGeneration, cur);
    sec.changeGeneration = cur;
    sec.emitChange('code');
    sec.updateTocEntryLazy();
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
    this.el = (templateCache.appliesTo ??= htmlToTemplate(htmlAppliesTo)).cloneNode(true);
    this.el.me = this;
    this.section = section;
    this.dirt = `section.${section.id}.apply.${this.id}`;
    this.selectEl = this.el.$('.applies-type');
    this.valueEl = this.el.$('.applies-value');
    editor.toggleRegexp(this.valueEl, type);
    this.type = this.selectEl.value = type;
    this.value = this.valueEl.value = value;
    this.restore();
    this.toggleAll();
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

  toggleAll() {
    $toggleDataset(this.section.targetsEl, 'all', !this.type);
  }

  onSelectChange() {
    const sec = this.section;
    const val = this.selectEl.value;
    editor.dirty.modify(`${this.dirt}.type`, this.type, val);
    editor.toggleRegexp(this.valueEl, val);
    this.type = val;
    this.toggleAll();
    sec.emitChange('apply');
    sec.updateTocEntry('apply');
  }

  onValueChange() {
    const val = this.valueEl.value;
    editor.dirty.modify(`${this.dirt}.value`, this.value, val);
    this.value = val;
    this.section.emitChange('apply');
    this.section.updateTocEntry('apply');
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
