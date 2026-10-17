/** Schema for v2 uses the same catalog as OpenAPI and typed SDK. */
import {schemas} from '../packages/contracts/src/catalog.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
const names=['CompositionAssetPin','CompositionVoice','CompositionVisual','CompositionCue','CompositionSource','CompositionProfile','CompositionBlocker','CompositionReadiness',...Object.keys(schemas).filter(s=>s.startsWith('TimedComposition'))];
const defs=JSON.parse(JSON.stringify(Object.fromEntries(names.map(n=>[n,schemas[n]]))).replaceAll('#/components/schemas/','#/$defs/'));
const json=JSON.stringify({$schema:'https://json-schema.org/draft/2020-12/schema',$id:'https://contentstudio.local/schemas/composition-v2.schema.json',title:'ContentStudio FFprobe measured timing v2',description:'No synthetic word alignment; all files reverified at render dispatch.',$ref:'#/$defs/TimedCompositionDocument',$defs:defs},null,2)+'\n';
const file='docs/contracts/composition-v2.schema.json';
if(process.argv.includes('--check')){if(readFileSync(file,'utf8')!==json){console.error('TIMED_SCHEMA_DRIFT');process.exit(1)}console.log('TIMED_SCHEMA_UP_TO_DATE');}
else {writeFileSync(file,json);console.log('GENERATED',file)}
