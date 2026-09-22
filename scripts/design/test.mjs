import test from 'node:test';
import assert from 'node:assert/strict';
import {load,validateModel,cssName} from './build.mjs';
import {scanText} from './guard.mjs';
const model=load('design-system/ieum.tokens.json');
const known=new Set([...validateModel(model).flat.keys()].map(cssName));
for(const [name,text,ext,rule] of [
 ['named-color','.a{color:red}', 'css','unapproved-value'],
 ['radius-percent','.a{border-radius:50%}', 'css','unapproved-value'],
 ['gradient','.a{background:linear-gradient(red,blue)}','css','unapproved-effect'],
 ['hex','.a{color:#00ff00}', 'css','raw-color'],
 ['rgb','.a{color:rgb(0 255 0)}','css','raw-color'],
 ['primitive','.a{color:var(--ieum-primitive-color-neon)}','css','primitive-use'],
 ['override','.a{--ieum-semantic-color-action: red}','css','token-override'],
 ['unknown','.a{color:var(--ieum-semantic-unknown)}','css','unknown-token'],
 ['dimension','.a{padding:17px}','css','raw-dimension'],
 ['important','.a{color:inherit !important}','css','important'],
 ['inline','<div style={{color:"red"}}/>','tsx','inline-style'],
 ['utility','<div className="bg-[#fff]"/>','tsx','arbitrary-utility']
]) test('guard rejects '+name,()=>assert.ok(scanText(text,'test.'+ext,known).some(e=>e.rule===rule)));
test('guard accepts semantic usage',()=>assert.equal(scanText('.a{color:var(--ieum-semantic-color-text);padding:var(--ieum-semantic-space-4)}','a.css',known).length,0));
test('missing reference rejected',()=>{const m=structuredClone(model);m.semantic.color.text.$value='{primitive.color.not-found}';assert.throws(()=>validateModel(m))});
test('alias cycle rejected',()=>{const m=structuredClone(model);m.primitive.color.ink.$value='{primitive.color.ink}';assert.throws(()=>validateModel(m))});
test('semantic raw literal rejected',()=>{const m=structuredClone(model);m.semantic.color.text.$value=m.primitive.color.ink.$value;assert.throws(()=>validateModel(m))});
test('blurred shadows rejected',()=>{const m=structuredClone(model);m.primitive.shadow.raised.$value.blur.value=4;assert.throws(()=>validateModel(m))});
test('dimension type rejected',()=>{const m=structuredClone(model);m.primitive.space['4'].$value={value:'16',unit:'px'};assert.throws(()=>validateModel(m))});
