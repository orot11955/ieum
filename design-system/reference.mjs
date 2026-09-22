// Static design demonstration. No network, persistence, authentication or product mutations.
const screens=[...document.querySelectorAll('[data-screen]')];
function show(view) {
 if(!screens.some(s=>s.dataset.screen===view))view='gallery';
 for(const s of screens)s.hidden=s.dataset.screen!==view;
 for(const a of document.querySelectorAll('.ieum-nav [data-view]')) {
  if(a.dataset.view===view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
 }
}
window.addEventListener('hashchange',()=>show(location.hash.slice(1)));
show(location.hash.slice(1));
for(const button of document.querySelectorAll('[data-filter]')) {
 const label=button.textContent.replace(/^✓\s*/, '');
 button.addEventListener('click',()=>{
  const pressed=button.getAttribute('aria-pressed')!=='true';
  button.setAttribute('aria-pressed',String(pressed));
  button.textContent=(pressed?'✓ ':'')+label;
 });
}
const busy=document.querySelector('#busy-demo');
busy.addEventListener('click',()=>{if(busy.getAttribute('aria-disabled')==='true')return;busy.setAttribute('aria-disabled','true');busy.dataset.loading='true';busy.textContent='처리 중…';setTimeout(()=>{busy.setAttribute('aria-disabled','false');delete busy.dataset.loading;busy.textContent='처리 상태 시연';document.querySelector('#busy-result').textContent='시연 완료 · 실제 자료는 변경하지 않았습니다.'},700)});
const dialog=document.querySelector('#dialog');let returnFocus=null;
for(const id of ['open-dialog','review-demo','resolve-dialog'])document.getElementById(id).addEventListener('click',e=>{returnFocus=e.currentTarget;dialog.showModal()});
for(const id of ['close-dialog','confirm-dialog'])document.getElementById(id).addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>returnFocus?.focus());
document.querySelector('#login-form').addEventListener('submit',e=>{e.preventDefault();document.querySelector('#login-error').hidden=false});
document.querySelector('#conflict-demo').addEventListener('click',()=>document.querySelector('#conflict-notice').hidden=false);
const editor=document.querySelector('#editor-body');let composing=false;
editor.addEventListener('compositionstart',()=>{composing=true});
editor.addEventListener('compositionend',()=>{composing=false;document.querySelector('#save-state').textContent='시연: 입력 변경됨 · 서버 저장은 수행하지 않습니다.'});
editor.addEventListener('input',()=>{if(!composing)document.querySelector('#save-state').textContent='시연: 입력 변경됨 · 서버 저장은 수행하지 않습니다.'});

dialog.addEventListener('keydown',e=>{
 if(e.key!=='Tab')return;
 const nodes=[...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')].filter(x=>x.getClientRects().length);
 const first=nodes[0],last=nodes[nodes.length-1];
 if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
 else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
});
