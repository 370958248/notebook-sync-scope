"""Build the self-contained entry and reproducible marketplace archive."""
from pathlib import Path
import json,zipfile,hashlib,re,struct

ROOT=Path(__file__).resolve().parent
manifest=json.loads((ROOT/'plugin.json').read_text(encoding='utf-8'))
assert manifest['name']=='notebook-sync-scope'
assert manifest['url']=='https://github.com/370958248/notebook-sync-scope'
assert manifest['disabledInPublish'] is True
assert re.fullmatch(r'\d+\.\d+\.\d+',manifest['version'])
for key in ['displayName','description','readme']:
    assert manifest[key].get('default')
    assert all('_' not in lang for lang in manifest[key])
modules={name:(ROOT/'plugin'/name).read_text(encoding='utf-8') for name in ['core.js','io.js','ui.js']}
modules['entry.js']=(ROOT/'src/entry.js').read_text(encoding='utf-8')
bundle="'use strict';\nconst hostRequire=require;\nmodule.exports=(function(){\nconst factories={\n"
bundle+=',\n'.join(json.dumps('./'+name)+':function(module,exports,require){\n'+content+'\n}' for name,content in modules.items())
bundle+='\n};\nconst cache={};function load(name){if(name===\"siyuan\")return hostRequire(name);if(!Object.prototype.hasOwnProperty.call(factories,name))throw Error(\"Unsupported module\");if(!cache[name]){const item={exports:{}};cache[name]=item;factories[name](item,item.exports,load);}return cache[name].exports;}return load(\"./entry.js\");})();\n'
(ROOT/'index.js').write_text(bundle,encoding='utf-8',newline='\n')
files=['index.js','index.css','plugin.json','README.md','LICENSE','icon.png','preview.png']
for name,dimensions,limit in [('icon.png',(160,160),65536),('preview.png',(1024,768),524288)]:
    data=(ROOT/name).read_bytes()
    assert data[:8]==b'\x89PNG\r\n\x1a\n'
    assert struct.unpack('>II',data[16:24])==dimensions and len(data)<=limit
for name in files:
    if name.endswith(('.js','.json','.css','.md')):
        text=(ROOT/name).read_text(encoding='utf-8')
        assert not re.search(r'\b\d{14}-[a-z0-9]{7}\b',text),'Personal notebook ID in '+name
        assert not re.search(r'(?i)\b[a-z]:[\\/]',text),'Local machine path in '+name
output=ROOT/'package.zip'
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
    for name in sorted(files):
        info=zipfile.ZipInfo(name,(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16
        z.writestr(info,(ROOT/name).read_bytes())
with zipfile.ZipFile(output) as z: assert z.testzip() is None and sorted(z.namelist())==sorted(files)
print(json.dumps({'version':manifest['version'],'files':len(files),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}))
