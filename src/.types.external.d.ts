import 'codemirror';

declare module 'codemirror' {
  interface Doc {
    mode: CodeMirror.Mode<T = any>;
  }
}

type CM = CodeMirror.DocOrEditor & {
  doc: CodeMirror.Doc;
  display: {
    cachedTextHeight: number;
    gutters: HTMLElement;
    input: HTMLElement;
    lastWrapHeight: number;
    lineDiv: HTMLElement;
    renderedView: {text: string}[];
    scroller: HTMLElement;
    sizer: HTMLElement;
    viewFrom: number;
    viewTo: number;
    wrapper: HTMLElement;
  };
};

namespace CM {
  interface Context {
    type: string;
    indent: string;
    prev: Context;
  }
  interface CSSState {
    context: Context;
    space: boolean;
    state: string;
    stateArg: any;
    tokenize?: Function;
  }
}
