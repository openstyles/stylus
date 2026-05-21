import {CLIENT_DATA_PREFIX} from '@/js/consts';
import {describeClient} from './util';

document.write(`<script src="${CLIENT_DATA_PREFIX}${
  new URLSearchParams(/*@__INLINE__*/describeClient())
}"></script>`
);
