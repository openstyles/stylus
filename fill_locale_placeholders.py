#! python2
import io, os, json, re
from collections import OrderedDict

with io.open('_locales/en/messages.json', 'r', encoding='utf-8') as f:
    english_placeholders = [(k, v['placeholders']) for k,v in json.load(f).items()
                            if 'placeholders' in v]

for locale_name in os.listdir('_locales'):
    if locale_name == 'en':
        continue
    loc_path = '_locales/' + locale_name + '/messages.json'
    with io.open(loc_path, 'r+', encoding='utf-8') as f:
        loc = json.load(f, object_pairs_hook=OrderedDict)

        changed = 0
        for msgId, placeholder in english_placeholders:
            if msgId in loc and cmp(placeholder, loc[msgId].get('placeholders', None))!=0:
                loc[msgId]['placeholders'] = placeholder
                changed += 1

        if changed > 0:
            f.seek(0)
            json_str = json.dumps(loc, indent=1, ensure_ascii=False,
                                  separators=(',', ': '), encoding='utf-8')
            json_tabs = re.sub(r'^\s+', lambda s: s.group(0).replace(' ', '\t'),
                               json_str, flags=re.MULTILINE)
            f.write(json_tabs)
            f.truncate()
            print 'Placeholders added to %s: %d' % (locale_name, changed)
