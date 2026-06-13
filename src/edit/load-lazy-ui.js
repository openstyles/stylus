import './autocomplete';
import './drafts';
import './global-search';
import './unload';
import {toggle as toggleTester} from './regexp-tester';

$id('testRE').onclick = () => toggleTester();
