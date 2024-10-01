import Bucket from './lib/bucket';
import Combinators from './lib/combinators';
import Matcher from './lib/matcher';
import Parser from './lib/parser';
import * as parserCache from './lib/parser-cache';
import Properties from './lib/properties';
import ScopedProperties from './lib/scoped-properties';
import StringSource from './lib/string-source';
import TokenStream from './lib/token-stream';
import Units, {UnitTypeIds} from './lib/units';
import {clipString, EventDispatcher, GlobalKeywords, isOwn, pick} from './lib/util';
import {validateProperty, vtExplode} from './lib/validation';
import VTComplex from './lib/validation-complex';
import VTFunctions from './lib/validation-functions';
import VTSimple from './lib/validation-simple';
import NamedColors from './lib/named-colors';
import Tokens, {TokenIdByCode} from './lib/tokens';

//#region Types

const parserlib = {
  css: {
    Combinators,
    GlobalKeywords,
    NamedColors,
    Parser,
    Properties,
    ScopedProperties,
    Tokens,
    TokenStream,
    Units,
  },
  util: {
    Bucket,
    EventDispatcher,
    Matcher,
    StringSource,
    TokenIdByCode,
    VTComplex,
    VTFunctions,
    VTSimple,
    UnitTypeIds,
    cache: parserCache,
    clipString,
    describeProp: vtExplode,
    isOwn,
    pick,
    validateProperty,
  },
};

export default parserlib;
