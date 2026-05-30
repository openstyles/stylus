import './autocomplete';
import './drafts';
import './global-search';
import './unload';
import {showLintHelp} from './linter/dialogs';
import {toggle as toggleTester} from './regexp-tester';

export {showLintConfig} from './linter/dialogs';
export {keymapHelp} from './keymap-help';

$id('testRE').onclick = () => toggleTester();
$id('lint-help').onclick = () => showLintHelp() && false/*prevent toggling of <details>*/;
