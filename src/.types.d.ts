declare var __: {
  API: 'API',
  BUILD: '' | 'chrome' | 'firefox',
  CLIENT_DATA: 'clientData',
  CM_PATH: string,
  /** bit mask, 1: general, 2: port, 4: life (keepAlive) */
  DEBUG: number,
  DEBUGLOG: typeof console.log,
  DEBUGPORT: typeof console.log,
  DEBUGTRACE: typeof console.trace,
  DEBUGWARN: typeof console.warn,
  DEV: boolean,
  ENTRY: 'offscreen' | 'sw' | 'worker' | string | boolean,
  IS_BG: boolean,
  JS: string,
  KEEP_ALIVE: <T>(job: T) => T,
  MV3: boolean,
  PAGE_BG: 'background' | 'sw',
  THEMES: Record<string, string>,
  ZIP: boolean,
}

declare interface StyleObj {
  enabled: boolean;
  id: number;
  name: string;
  sections: StyleSection[];
  _id: string;
  _rev: number;
  /* optional */
  author?: string;
  customName?: string;
  exclusions?: string[];
  inclusions?: string[];
  /** override style's own specifiers */
  overridden?: boolean;
  installDate?: number;
  installationUrl?: string;
  md5Url?: string;
  originalDigest?: string;
  originalMd5?: string;
  preferScheme?: 'none' | 'dark' | 'light';
  sourceCode?: string;
  updatable?: boolean;
  updateDate?: number;
  updateUrl?: string;
  url?: string;
  usercssData?: UsercssData;
  _usw?: USWorldData;
}

type StyleDataMap = Map<number, StyleDataMapEntry>;

declare interface StyleDataMapEntry {
  style: StyleObj;
  preview?: StyleObj;
  urls: Set<string>;
}

declare interface StyleSection {
  code: string[];
  /** Non-enumerable, added internally on demand in styleMan */
  _empty?: boolean;
  urls?: string[];
  urlPrefixes?: string[];
  domains?: string[];
  regexps?: string[];
}

type TabCache = {[tabId:string]: TabCacheEntry};

declare interface TabCacheEntry {
  id: number;
  url: {[frameId: string]: string};
  incognito?: boolean;
  nonce?: {[frameId: string]: string};
  styleIds?: {
    url: string;
    styleIds: { [frameId: string]: number[] };
  };
  tabOvr?: {[styleId: string]: boolean},
}

declare namespace Injection {
  interface Response {
    cfg: Config;
    sections?: Sections[];
  }
  interface SectionsMap {
    [styleId: string]: Sections
  }
  interface Sections {
    id: number,
    code: string[] | string,
    name: string,
  }
  interface SectionsContent extends Sections {
    code: string,
    el: HTMLStyleElement|CSSStyleSheet;
  }
  interface Config {
    ass?: boolean;
    dark?: boolean;
    name?: boolean;
    nonce?: string;
    top?: boolean;
    topUrl?: string;
    off?: boolean;
    order?: Order;
    wake?: boolean;
  }
  interface Order {
    main: Record<string,number>;
    prio: Record<string,number>;
  }
}

declare namespace MatchCache {
  interface Entry {
    url: string;
    maybe?: Set<number>;
    sections: Injection.SectionsMap;
    tabOvr?: boolean;
  }
}

declare interface MatchQuery {
  url: string;
  domain?: string;
  isOwnPage?: boolean;
  urlWithoutHash?: string;
  urlWithoutParams?: string;
}

declare interface MatchUrlResult {
  empty: boolean;
  excluded: boolean;
  excludedScheme: boolean;
  included: boolean;
  /** true = using the overridden includes while not matching the original target sites */
  incOvr: boolean;
  matchedOvrs?: string;
  sloppy: boolean;
  style: StyleObj;
  /** truthy: included, false: excluded, nullish: no override */
  tabOvr?: boolean;
}

type StyleObjMatch = StyleObj & MatchUrlResult;

declare interface UsercssData {
  name: string;
  namespace: string;
  version: string;
  /* optional fields */
  author?: string;
  description?: string;
  homepageURL?: string;
  license?: string;
  preprocessor?: 'default' | 'uso' | 'less' | 'stylus';
  supportURL?: string;
  updateURL?: string;
  vars?: {[name: string]: UsercssVar};
}

declare type UsercssVar =
  UsercssVarBase |
  UsercssVarRange |
  UsercssVarSelect;

declare type UsercssVarValue = string | number | boolean | null;

declare interface UsercssVarBase {
  type: string;
  label: string;
  name: string;
  value: UsercssVarValue;
  default: UsercssVarValue;
}

declare interface UsercssVarRange extends UsercssVarBase {
  value: number | null;
  min?: number;
  max?: number;
  step?: number;
  units?: string;
}

declare interface UsercssVarSelect extends UsercssVarBase {
  default: string | null;
  value: string | null;
  options: {
    name: string,
    label: string,
    value: UsercssVarValue,
    isDefault?: boolean
  }[];
}

declare interface USWorldData {
  id: number;
  token: string;
  /* for sectioned styles */
  description?: string;
  license?: string;
  name?: string;
  namespace?: string;
  username?: string;
}

declare interface RemotePortEvent extends MessageEvent {
  _transfer?: Transferable[];
}

declare interface IDBObjectStoreMany extends PromisifiedMembers<IDBObjectStore> {
  deleteMany: (ids: any[]) => Promise<any[]>;
  getMany: (ids: any[]) => Promise<any[]>;
  putMany: (items: any[], ids?: any[]) => Promise<any[]>;
}

declare interface StyleEntryElement<T=StyleObj> extends HTMLElement {
  styleId: number;
  styleMeta: T;
}

declare var $: typeof document.querySelector;
declare var $$: typeof document.querySelectorAll;
declare var $id: typeof document.getElementById;
declare var $root: typeof document.documentElement;
declare var $rootCL: typeof document.documentElement.classList;
declare var $tag: typeof document.createElement;
declare var on: typeof EventTarget.prototype.addEventListener;
declare var off: typeof EventTarget.prototype.removeEventListener;

interface Document {
  $: typeof Document.prototype.querySelector;
  $$: typeof Document.prototype.querySelectorAll;
}
interface DocumentFragment {
  $: typeof DocumentFragment.prototype.querySelector;
  $$: typeof DocumentFragment.prototype.querySelectorAll;
}
interface Element {
  $: typeof Element.prototype.querySelector;
  $$: typeof Element.prototype.querySelectorAll;
}
interface EventTarget {
  on: typeof EventTarget.prototype.addEventListener;
  off: typeof EventTarget.prototype.removeEventListener;
}

/** https://stackoverflow.com/a/57386444 */
type OmitMatchingProps<T,M> = Omit<T,{
  [K in keyof T]-?: T[K] extends M ? K : never
}[keyof T]>;

type PickMatchingProps<T,M> = Pick<T,{
  [K in keyof T]-?: T[K] extends M ? K : never
}[keyof T]>;

/** https://stackoverflow.com/a/74852313 */
type PickStartingWith<T, S extends string> = {
    [K in keyof T as K extends `${S}${infer R}` ? K : never]: T[K]
}

type PromisifiedMembers<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<R>
    : never;
};

type WritableElementProps = PickMatchingProps<HTMLElement,String>
  & OmitMatchingProps<HTMLOrSVGElement,Function>
  & PickStartingWith<GlobalEventHandlers,'on'>;

type AppendableChild = String | Node;
type AppendableChildren = Iterable<AppendableChild>;
type AppendableElementGuts = AppendableChild | AppendableChildren
  | {on: {[key in keyof GlobalEventHandlersEventMap]: EventListenerOrEventListenerObject | Function}};
type ElementTags = keyof HTMLElementTagNameMap;
