import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, load, validateModel, cssName } from './build.mjs';
// Deliberately a small source guard, not a full CSS/JSX parser or a security boundary.
export function scanText(text, filename, known) {
  const source=text.replace(/\/\*[\s\S]*?\*\//g,'');
  const errors=[];const report=(rule,message)=>errors.push({file:filename,rule,message});
  if (/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lch|lab|color)\s*\(/i.test(source)) report('raw-color','Use a semantic/component color token.');
  if (/var\(\s*--ieum-primitive-/.test(source)) report('primitive-use','Only semantic/component tokens may be consumed.');
  if (/--ieum-[\w-]+\s*:/.test(source)) report('token-override','Do not redefine IEUM tokens outside central recipes.');
  if (/gradient\s*\(|backdrop-filter\s*:|text-shadow\s*:/i.test(source)) report('unapproved-effect','No gradients, blur or text shadows in product styles.');
  if (/!\s*important\b/i.test(source)) report('important','Specificity escape is not permitted.');
  for (const m of source.matchAll(/var\(\s*(--ieum-[\w-]+)/g)) if(!known.has(m[1])) report('unknown-token',m[1]);
  if (/\.(css|scss|sass|less)$/.test(filename)) {
    if ([...source.matchAll(/(-?(?:\d*\.)?\d+)(?:px|rem|em)\b/g)].some(m=>Number(m[1])!==0)) report('raw-dimension','Use spacing/type/size tokens, not px/rem/em literals.');
    for (const match of source.matchAll(/(?:^|[;{])\s*(color|background(?:-color)?|border-color|fill|stroke|caret-color|accent-color|font-size|font-weight|font-family|border-radius|box-shadow)\s*:\s*([^;}]+)/gmi)) {
      const value=match[2].trim();
      if (!/^var\(--ieum-(semantic|component)-[\w-]+\)$/.test(value) && !/^(inherit|currentColor|transparent|none|0)$/.test(value)) report('unapproved-value',match[1]+': '+value);
    }
    if (/font-weight\s*:\s*[1-9]\d{2}|z-index\s*:\s*[1-9]\d*/i.test(source)) report('raw-number','Use weight/layer tokens.');
    if (/font-family\s*:\s*(?!var\(|inherit)[^;\n]+/i.test(source)) report('raw-font','Use the shared font stack.');
  }
  if (/\.(jsx|tsx)$/.test(filename)) {
    if (/\bstyle\s*=\s*\{/m.test(source)) report('inline-style','Use a shared recipe; reviewed runtime geometry exceptions must be recorded.');
    if (/(?:bg|text|border|rounded|shadow|p|px|py|m|mx|my|gap|w|h|z)-\[/.test(source)) report('arbitrary-utility','Do not bypass tokens with arbitrary utilities.');
  }
  return errors;
}
export function runGuard() {
 const policy=load('design-system/policy.json');
 const known=new Set([...validateModel(load('design-system/ieum.tokens.json')).flat.keys()].map(cssName));
 let files=0;const errors=[];const usedExceptions=new Set();
 const today=new Date().toISOString().slice(0,10);
 for(const e of policy.exceptions) if(!e.file||!e.rule||!e.reason||!e.review||!e.expires||e.expires<today) throw Error('Missing/expired policy exception');
 function walk(p) {if(!existsSync(p))return;for(const e of readdirSync(p,{withFileTypes:true})){
   const f=path.join(p,e.name);if(e.isDirectory())walk(f);else if(/\.(css|scss|sass|less|tsx|jsx)$/.test(f)) {
    files++;const relative=path.relative(root,f).replaceAll('\\','/');
    for(const error of scanText(readFileSync(f,'utf8'),relative,known)) {
      const ex=policy.exceptions.find(x=>x.file===relative&&x.rule===error.rule);
      if(ex)usedExceptions.add(ex.file+'|'+ex.rule);else errors.push(error);
    }
   }
 }}
 for(const p of policy.guardPaths)walk(path.join(root,p));
 return {files,errors,usedExceptions:[...usedExceptions],note:'Source guard only. No product files means no product style coverage, not proof of compliance.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const result=runGuard();console.log(JSON.stringify(result,null,2));if(result.errors.length)process.exit(1);
}
