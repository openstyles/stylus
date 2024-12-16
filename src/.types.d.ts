declare var __: {
  API: 'API',
  BUILD: 'DEV' | 'chrome' | 'firefox',
  CLIENT_DATA: 'clientData',
  CM_PATH: string,
  DEBUG: boolean,
  DEBUGLOG: typeof console.log,
  DEBUGTRACE: typeof console.trace,
  DEBUGWARN: typeof console.warn,
  DEV: boolean,
  ENTRY: 'sw' | 'worker' | string | boolean,
  IS_BG: boolean,
  JS: string,
  KEEP_ALIVE: <T>(job: T) => T,
  MV3: boolean,
  PAGE_BG: 'background' | 'sw',
  PAGE_OFFSCREEN: 'offscreen',
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

declare interface StyleMapData {
  style: StyleObj;
  preview?: StyleObj;
  appliesTo: Set<string>;
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

declare interface CachedInjectedStyles {
  maybeMatch: Set<number>;
  sections: InjectedStyles;
}

declare interface Injection {
  cfg: InjectionConfig;
  sections?: InjectedStyle[];
}

declare interface InjectedStyles {
  [styleId: string]: InjectedStyle
}

declare interface InjectedStyle {
  id: number,
  code: string[],
  name: string,
  /** Added in style-injector */
  el?: HTMLStyleElement|CSSStyleSheet;
}

declare interface InjectionConfig {
  ass?: boolean;
  dark?: boolean;
  name?: boolean;
  nonce?: string;
  top?: string | false;
  off?: boolean;
  order?: InjectionOrder;
}

declare interface InjectionOrder {
  main: InjectionOrderGroup;
  prio: InjectionOrderGroup;
}

declare interface InjectionOrderGroup {
  [id: string]: number;
}

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

declare interface IDBObjectStoreMany extends IDBObjectStore {
  deleteMany: (ids: any[]) => Promise<any[]>;
  getMany: (ids: any[]) => Promise<any[]>;
  putMany: (items: any[]) => Promise<any[]>;
}
