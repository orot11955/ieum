import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { root, load, validateModel, cssName, digest } from './build.mjs';

export function themeOutputs() {
  const base = load('design-system/ieum.tokens.json');
  const theme = load('design-system/themes.json');
  const { flat, resolved } = validateModel(base);
  const colorKeys = [...flat].filter(([key,t])=>key.startsWith('semantic.') && t.$type==='color').map(([key])=>key).sort();
  if (JSON.stringify(Object.keys(theme.dark).sort()) !== JSON.stringify(colorKeys)) throw Error('DARK_THEME_COVERAGE');
  if (base.$extensions['dev.ieum'].version !== theme.baseVersion) throw Error('THEME_BASE_VERSION');
  const parse = hex => {
    if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) throw Error('INVALID_THEME_COLOR');
    return { colorSpace:'srgb', components:[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255), alpha:hex.length===9?parseInt(hex.slice(7),16)/255:1 };
  };
  const dark = new Map();
  const resolve = key => {
    if (dark.has(key)) return dark.get(key);
    const t=flat.get(key); if (!t) throw Error('UNKNOWN_THEME_TOKEN '+key);
    const ref=typeof t.$value==='string'?t.$value.match(/^\{([^{}]+)\}$/):null;
    const v=theme.dark[key]?parse(theme.dark[key]):ref?resolve(ref[1]):resolved.get(key);
    dark.set(key,v); return v;
  };
  for(const key of flat.keys()) resolve(key);
  const luminance=v=>v.components.map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
  const contrasts=[];
  for(const p of load('design-system/policy.json').contrastPairs) {
    // In dark mode the outer focus ring sits on the dark offset gap, not on neon.
    const background=p.name==='focus outline action'?'semantic.color.focus-gap':p.background;
    const a=resolve(p.foreground),b=resolve(background);
    const ratio=(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
    contrasts.push({name:p.name,background,ratio:Number(ratio.toFixed(3)),minimum:p.minimum});
    if(ratio+1e-10<p.minimum)throw Error('DARK_CONTRAST_FAIL '+p.name+' '+ratio);
  }
  const stamp=`Paper Terminal ${theme.version}; generated from themes.json ${digest(JSON.stringify(theme))}`;
  let css=`/* ${stamp} */\nhtml[data-ieum-theme="paper-light"]{color-scheme:light}\nhtml[data-ieum-theme="paper-dark"]{\n  color-scheme:dark;\n`;
  for(const key of colorKeys)css+=`  ${cssName(key)}: ${theme.dark[key]};\n`;
  css+='}\nhtml[data-ieum-theme="paper-dark"] :focus-visible { box-shadow: 0 0 0 var(--ieum-semantic-border-strong) var(--ieum-semantic-color-focus-gap); }\n';
  css+='@media print { html[data-ieum-theme] { color-scheme:light;\n';
  for(const key of colorKeys) {
    const v=resolved.get(key);css+=`  ${cssName(key)}: rgb(${v.components.map(x=>Math.round(x*255)).join(' ')} / ${v.alpha??1});\n`;
  }
  css+='}\n}\n';
  return {css,contrasts,version:theme.version};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {css,contrasts,version}=themeOutputs();
  const target=path.join(root,'design-system/themes.css');
  if(process.argv.includes('--check')) {
    if(readFileSync(target,'utf8')!==css)throw Error('GENERATED_THEME_DRIFT');
    const lock=load('design-system/themes.lock.json');
    for(const [p,hash] of Object.entries(lock.files))if(digest(readFileSync(path.join(root,p)))!==hash)throw Error('FROZEN_THEME_CHANGED '+p);
  } else writeFileSync(target,css);
  console.log(JSON.stringify({version,darkContrastPairs:contrasts,errors:[]},null,2));
}
