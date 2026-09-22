import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const digest = s => createHash('sha256').update(s).digest('hex');
export const load = p => JSON.parse(readFileSync(path.join(root, p), 'utf8'));
const types = new Set(['color','dimension','number','duration','fontWeight','fontFamily','cubicBezier','shadow']);
export function validateModel(model) {
  const flat = new Map();
  function visit(o, p = []) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw Error(`Invalid node: ${p.join('.')}`);
    if ('$value' in o) {
      if (!types.has(o.$type)) throw Error(`Unsupported type: ${p.join('.')}`);
      flat.set(p.join('.'), o); return;
    }
    for (const [k,v] of Object.entries(o)) {
      if (k.startsWith('$')) continue;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(k)) throw Error(`Invalid token name: ${k}`);
      visit(v,[...p,k]);
    }
  }
  visit(model);
  const resolved = new Map();
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const dimension = v => v && finite(v.value) && ['px','rem'].includes(v.unit);
  const color = v => v && v.colorSpace === 'srgb' && Array.isArray(v.components) && v.components.length === 3 && v.components.every(n=>finite(n)&&n>=0&&n<=1) && (v.alpha === undefined || finite(v.alpha)&&v.alpha>=0&&v.alpha<=1);
  function resolve(key, stack=[]) {
    if (stack.includes(key)) throw Error(`Alias cycle: ${[...stack,key].join(' -> ')}`);
    if (resolved.has(key)) return resolved.get(key);
    const t = flat.get(key); if (!t) throw Error(`Missing reference: ${key}`);
    let v=t.$value;
    const ref=typeof v==='string' ? v.match(/^\{([^{}]+)\}$/) : null;
    if (key.startsWith('semantic.') && (!ref || !ref[1].startsWith('primitive.'))) throw Error(`Semantic must alias primitive: ${key}`);
    if (key.startsWith('component.') && (!ref || !ref[1].startsWith('semantic.'))) throw Error(`Component must alias semantic: ${key}`);
    if (ref) {
      if (flat.get(ref[1])?.$type!==t.$type) throw Error(`Alias type mismatch: ${key}`);
      v=resolve(ref[1],[...stack,key]);
    }
    let ok=false;
    switch(t.$type) {
      case 'color': ok=color(v);break;
      case 'dimension':ok=dimension(v);break;
      case 'number':ok=finite(v);break;
      case 'duration':ok=v&&finite(v.value)&&v.value>=0&&['ms','s'].includes(v.unit);break;
      case 'fontWeight':ok=finite(v)&&v>=1&&v<=1000;break;
      case 'fontFamily':ok=Array.isArray(v)&&v.length>0&&v.every(x=>typeof x==='string'&&x.length>0);break;
      case 'cubicBezier':ok=Array.isArray(v)&&v.length===4&&v.every(finite)&&v[0]>=0&&v[0]<=1&&v[2]>=0&&v[2]<=1;break;
      case 'shadow':ok=v&&color(v.color)&&['offsetX','offsetY','blur','spread'].every(k=>dimension(v[k]))&&v.blur.value===0;break;
    }
    if (!ok) throw Error(`Invalid ${t.$type}: ${key}`);
    resolved.set(key,v); return v;
  }
  for (const key of flat.keys()) resolve(key);
  const names=[...flat.keys()].map(cssName); if (new Set(names).size!==names.length) throw Error('CSS name collision');
  return {flat,resolved};
}
export const cssName = key => '--ieum-'+key.replaceAll('.','-');
function colorCss(v) {return `rgb(${v.components.map(x=>Math.round(x*255)).join(' ')}${v.alpha!==undefined&&v.alpha!==1?' / '+v.alpha:''})`;}
function cssValue(type,v) {
  switch(type) {
    case 'color':return colorCss(v);
    case 'dimension':case 'duration':return `${v.value}${v.unit}`;
    case 'fontFamily':return v.map(n=>/^(system-ui|sans-serif|monospace|ui-monospace)$/.test(n)?n:JSON.stringify(n)).join(', ');
    case 'cubicBezier':return `cubic-bezier(${v.join(', ')})`;
    case 'shadow':return `${v.offsetX.value}${v.offsetX.unit} ${v.offsetY.value}${v.offsetY.unit} ${v.blur.value}${v.blur.unit} ${v.spread.value}${v.spread.unit} ${colorCss(v.color)}`;
    default:return String(v);
  }
}
export function outputs() {
  const source=readFileSync(path.join(root,'design-system/ieum.tokens.json'),'utf8');
  const model=JSON.parse(source); const {flat,resolved}=validateModel(model);
  const stamp=`IEUM Paper Terminal ${model.$extensions['dev.ieum'].version} | source sha256 ${digest(source)} | GENERATED: do not edit`;
  let css=`/* ${stamp} */\n:root, [data-ieum-theme="paper-light"] {\n`;
  for (const [key,t] of [...flat].sort(([a],[b])=>a.localeCompare(b,'en'))) {
    const ref=typeof t.$value==='string'?t.$value.match(/^\{([^{}]+)\}$/):null;
    css+=`  ${cssName(key)}: ${ref?`var(${cssName(ref[1])})`:cssValue(t.$type,resolved.get(key))};\n`;
  }
  css+='}\n';
  const media=Object.fromEntries(['small','wide'].map(n=>[n,cssValue('dimension',resolved.get('primitive.breakpoint.'+n))]));
  const recipe=readFileSync(path.join(root,'design-system/recipes.css.in'),'utf8')
      .replaceAll('__IEUM_SMALL__',media.small).replaceAll('__IEUM_WIDE__',media.wide);
  const refs=Object.fromEntries([...flat.keys()].filter(k=>!k.startsWith('primitive.')).sort().map(k=>[k,`var(${cssName(k)})`]));
  return new Map([
    ['design-system/tokens.css',css],
    ['design-system/ui.css',`/* ${stamp}; compiled responsive rules */\n`+recipe],
    ['design-system/tokens.ts',`// ${stamp}\nexport const media = ${JSON.stringify(media,null,2)} as const;\nexport const cssToken = ${JSON.stringify(refs,null,2)} as const;\nexport type TokenName = keyof typeof cssToken;\n`]
  ]);
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const check=process.argv.includes('--check');let errors=0;
  for(const [p,content] of outputs()) {
    if(check) {let actual='';try{actual=readFileSync(path.join(root,p),'utf8');}catch{}if(actual!==content){console.error('GENERATED_DRIFT',p);errors++;}}
    else writeFileSync(path.join(root,p),content);
  }
  if(errors) process.exit(1);
  console.log(check?'Generated files match source.':'Generated tokens.css, ui.css, tokens.ts.');
}
