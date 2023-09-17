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
  description?: string;
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
  urls?: string[];
  urlPrefixes?: string[];
  domains?: string[];
  regexps?: string[];
}

declare interface CachedInjectedStyles {
  maybeMatch: Set<number>;
  sections: InjectedStyles;
}

declare interface InjectedStyles {
  [styleId: string]: InjectedStyle
}

declare interface InjectedStyle {
  id: number,
  code: string[],
  name: string,
}

declare interface InjectionConfig {
  name?: boolean;
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
  created_at: number;
  description: string;
  display_name: string;
  homepage: string;
  id: number;
  license: string;
  mirror_url: string;
  name: string;
  notes: string;
  original: string;
  preview_url: string;
  token: string;
  updated_at: number;
  user_id: number;
  username: string;
}
