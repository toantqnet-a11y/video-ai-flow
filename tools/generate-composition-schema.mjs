/** Generate the standalone, portable JSON Schema used by future renderers.
 * Source of truth is the API composition schemas, not a handwritten copy.
 */
import {schemas} from '../packages/contracts/src/catalog.mjs';
import {writeFileSync,readFileSync} from 'node:fs';
// Historical revision reads may return v1 or v2; include transitive v2 refs
// without changing the v1 $ref or the v1 document shape.
const names=Object.keys(schemas).filter(name=>/^(Composition|TimedComposition)/.test(name));
const defs=Object.fromEntries(names.map(name=>[name,schemas[name]]));
const rewritten=JSON.parse(JSON.stringify(defs).replaceAll('#/components/schemas/','#/$defs/'));
const document={
  $schema:'https://json-schema.org/draft/2020-12/schema',
  $id:'https://contentstudio.local/schemas/composition-v1.schema.json',
  title:'ContentStudio engine-neutral composition v1',
  description:'Preview/published render input. A valid shape is NOT proof of asset file health; recheck pinned hashes at render time.',
  $ref:'#/$defs/CompositionDocument',$defs:rewritten
};
const json=JSON.stringify(document,null,2)+'\n';
const file='docs/contracts/composition-v1.schema.json';
if(process.argv.includes('--check')){
  if(readFileSync(file,'utf8')!==json){console.error('COMPOSITION_SCHEMA_DRIFT');process.exit(1)}
  console.log('COMPOSITION_SCHEMA_UP_TO_DATE');
}else {writeFileSync(file,json);console.log('GENERATED',file)}
