import '@/js/dom-init';
import configDialog from '@/js/dlg/config-dialog';
import {urlParams} from '@/js/dom';
import './index.css';

configDialog(+urlParams.get('id')).then(close);
