import '@/js/dom-init';
import configDialog from '@/js/dlg/config-dialog';
import {urlParams} from '@/js/dom';
import './index.css';

const id = +urlParams.get('id');
if (id) configDialog(id).then(close);
