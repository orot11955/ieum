import { readFileSync } from 'node:fs';
import path from 'node:path';
import { root,load,digest,validateModel,outputs } from './build.mjs';
import { runGuard } from './guard.mjs';
const model=load('design-system/ieum.tokens.json');
const {flat,resolved}=validateModel(model);
const policy=load('design-system/policy.json');
const lock=load('design-system/baseline.lock.json');
const errors=[];
if(model.$extensions['dev.ieum'].version!==policy.version||lock.version!==policy.version)errors.push('VERSION_MISMATCH');
for(const [p,expected] of Object.entries(lock.files)) {
 if(digest(readFileSync(path.join(root,p)))!==expected)errors.push('FROZEN_BASELINE_CHANGED '+p);
}
for(const [p,expected]of outputs()) {
 let actual='';try{actual=readFileSync(path.join(root,p),'utf8')}catch{}
 if(actual!==expected)errors.push('GENERATED_DRIFT '+p);
}
function lum(v){return v.components.map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0)}
const contrasts=policy.contrastPairs.map(p=>{
 const a=resolved.get(p.foreground),b=resolved.get(p.background);
 if(!a||!b||a.alpha!==1||b.alpha!==1)throw Error('Contrast tests require opaque known colors: '+p.name);
 const ratio=(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
 if(ratio+1e-10<p.minimum) errors.push('CONTRAST_FAIL '+p.name);
 return {name:p.name,ratio:Number(ratio.toFixed(3)),minimum:p.minimum,pass:ratio>=p.minimum};
});
const cssNames=new Set([...flat.keys()].map(k=>'--ieum-'+k.replaceAll('.','-')));
for(const m of readFileSync(path.join(root,'design-system/recipes.css.in'),'utf8').matchAll(/var\(\s*(--ieum-[\w-]+)/g))if(!cssNames.has(m[1]))errors.push('RECIPE_UNKNOWN_TOKEN '+m[1]);
const matrix=load('design-system/screen-matrix.json');
if(JSON.stringify(matrix.map(x=>x.id).sort())!==JSON.stringify(policy.requiredScreens))errors.push('SCREEN_MATRIX_COVERAGE');
for(const row of matrix)if(!row.components.length||!row.edgeCases.length||!row.mobile)errors.push('INCOMPLETE_SCREEN '+row.id);
const guard=runGuard();errors.push(...guard.errors.map(e=>`${e.rule}: ${e.file}`));
console.log(JSON.stringify({version:policy.version,tokenCount:flat.size,screenCount:matrix.length,contrastCount:contrasts.length,contrasts,productFilesScanned:guard.files,errors,limitations:['DTCG subset validation only, not a general DTCG implementation.','Color pairs are design constraints, not full WCAG conformance.','Product auth/DB/API/React components are not implemented by this package.']},null,2));
if(errors.length)process.exit(1);
