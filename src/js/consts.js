/**
 * WARNING!
 * Used in limited contexts such as the offscreen document.
 * All values are unconditionally inlined via webpack-inline-constant-exports-plugin.
 * Only for pure declarations with no side effects or marked with /*@__PURE__*/
/** */// TODO: collect consts from the entire code

export const CLIENT_DATA_PREFIX = 'data?';
export const UCD = 'usercssData';
export const kAboutBlank = 'about:blank';
export const kAppJson = 'application/json';
export const kAppUrlencoded = 'application/x-www-form-urlencoded';
export const kApplyPort = 'apply';
export const kBadFavs = 'badFavs';
export const kCodeMirror = 'CodeMirror';
export const kContentType = 'content-type'; // must be lowercase!
export const kCssPropSuffix = ': ';
export const kDark = 'dark';
export const kDisableAll = 'disableAll';
export const kEditorScrollInfo = 'editorScrollInfo';
export const kEditorSettings = 'editorSettings';
export const kEditorState = 'editor';
export const kExclusions = 'exclusions';
export const kHocused = 'focusedViaClick';
export const kHocusedAttr = 'data-focused-via-click';
export const kInclusions = 'inclusions';
export const kInjectionOrder = 'injectionOrder';
export const kInvokeAPI = 'invokeAPI';
export const kMainFrame = 'main_frame';
export const kOverridden = 'overridden';
export const kPopup = 'popup';
export const kResolve = 'resolve';
export const kSidebar = 'sidebar';
export const kStyleIdPrefix = 'style-';
export const kStyleIds = 'styleIds';
export const kSubFrame = 'sub_frame';
export const kTabOvr = 'tabOvr';
export const kTabOvrToggle = kTabOvr + '*';
export const kUrl = 'url';
export const kUrls = 'urls';
export const k_busy = '_busy';
export const k_deepCopy = '_deepCopy';
export const k_msgExec = '_msgExec';
export const k_size = '_size';

export const CACHE_DB = 'cache';
export const DB = 'stylish';
export const STATE_DB = 'state';

export const IMPORT_THROTTLE = 100; //ms

export const BIT_DARK = 1;
export const BIT_SYS_DARK = 2;

export const BIT_COLOR_COMMA = 1;
export const BIT_COLOR_NAME_A = 2;
export const BIT_COLOR_PCT_X = 4;
export const BIT_COLOR_PCT_Y = 8;
export const BIT_COLOR_PCT_Z = 16;
export const BIT_COLOR_PCT_A = 32;
export const BIT_COLOR_NONE_X = 64;
export const BIT_COLOR_NONE_Y = 128;
export const BIT_COLOR_NONE_Z = 256;
export const BIT_COLOR_NONE_A = 512;

export const COLOR_HEX = 1;
export const COLOR_RGB = 2;
export const COLOR_HSL = 3;
export const COLOR_HWB = 4;
export const COLOR_HSV = 5;

export const HEX_RETAIN_CASE = 2;

//#region CSS
export const kAtRuleNoUnknown = 'at-rule-no-unknown';
export const kDeclValue = 'declaration-property-value-no-unknown';
export const kGradientDir = 'function-linear-gradient-no-nonstandard-direction';
export const kRulesOvr = 'rules:';
export const mimeLESS = 'text/x-less';
//#endregion

//#region prefs
export const pDisableAll = 'disableAll';
export const pEditorLinter = 'editor.linter';
export const pEditorTheme = 'editor.theme';
export const pExposeIframes = 'exposeIframes';
export const pKeepAlive = 'keepAlive';
export const pManageNewUi = 'manage.newUI';
export const pFavicons = 'manage.newUI.favicons';
export const pFaviconsGray = 'manage.newUI.faviconsGray';
export const pKeyMap = 'editor.keyMap';
export const pLintReportDelay = 'editor.lintReportDelay';
export const pLivePreview = 'editor.livePreview';
export const pManageNewUiTargets = 'manage.newUI.targets';
export const pOpenEditInWindow = 'openEditInWindow';
export const pPatchCsp = 'patchCsp';
export const pStyleViaASS = 'styleViaASS';
export const pStyleViaXhr = 'styleViaXhr';
export const pSync = 'sync.enabled';
export const pUrlInstaller = 'urlInstaller';
//#endregion
