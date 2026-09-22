import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';
import type { Intent,Tone } from '../../../design-system/component-contracts';
export {ThemeProvider,useTheme} from './theme';

type ButtonProps=Omit<ButtonHTMLAttributes<HTMLButtonElement>,'style'|'color'|'className'> & {intent?:Intent;busy?:boolean;disabledReason?:string};
export const Button=forwardRef<HTMLButtonElement,ButtonProps>(function Button({intent='secondary',busy=false,disabled=false,disabledReason,children,onClick,type='button',...props},ref){
  return <span className="ieum-button-wrap"><button {...props} ref={ref} type={type} className="ieum-button" data-variant={intent} data-loading={busy} aria-busy={busy} aria-disabled={disabled||busy} disabled={disabled} onClick={e=>{if(disabled||busy){e.preventDefault();return;}onClick?.(e);}}>{busy?'처리 중…':children}</button>{disabledReason&&<small className="ieum-help">{disabledReason}</small>}</span>;
});
type FieldMeta={label:string;error?:string;help?:string};
export function Field({label,error,help,id,...props}:FieldMeta&Omit<InputHTMLAttributes<HTMLInputElement>,'style'|'className'|'color'>){
  const auto=useId();const key=id??auto;
  return <div className="ieum-stack-small"><label className="ieum-label" htmlFor={key}>{label}</label><input {...props} id={key} className="ieum-field" aria-invalid={Boolean(error)} aria-describedby={[error&&`${key}-error`,help&&`${key}-help`].filter(Boolean).join(' ')||undefined}/>{help&&<p id={`${key}-help`} className="ieum-help">{help}</p>}{error&&<p id={`${key}-error`} className="ieum-error" role="alert">{error}</p>}</div>;
}
export function TextArea({label,error,help,id,...props}:FieldMeta&Omit<TextareaHTMLAttributes<HTMLTextAreaElement>,'style'|'className'>){
  const auto=useId();const key=id??auto;
  return <div className="ieum-stack-small"><label className="ieum-label" htmlFor={key}>{label}</label><textarea {...props} id={key} className="ieum-field ieum-editor" aria-invalid={Boolean(error)} aria-describedby={[error&&`${key}-error`,help&&`${key}-help`].filter(Boolean).join(' ')||undefined}/>{help&&<p id={`${key}-help`} className="ieum-help">{help}</p>}{error&&<p id={`${key}-error`} className="ieum-error" role="alert">{error}</p>}</div>;
}
export function Select({label,children,id,...props}:{label:string}&Omit<SelectHTMLAttributes<HTMLSelectElement>,'style'|'className'>){const auto=useId();return <label className="ieum-label" htmlFor={id??auto}>{label}<select {...props} id={id??auto} className="ieum-field">{children}</select></label>;}
export function Check({label,...props}:{label:string}&Omit<InputHTMLAttributes<HTMLInputElement>,'style'|'className'|'type'>){return <label className="ieum-check"><input {...props} type="checkbox"/>{label}</label>;}
export function Status({tone='neutral',children}:{tone?:Tone;children:ReactNode}){return <span className="ieum-status" data-tone={tone}>{children}</span>;}
export function Notice({tone='info',children}:{tone?:Tone;children:ReactNode}){return <div className="ieum-notice" data-tone={tone} role={tone==='danger'?'alert':'status'}>{children}</div>;}
export function Card({title,children}:{title?:string;children:ReactNode}){return <section className="ieum-card">{title&&<header><h2>{title}</h2></header>}<div className="ieum-pad ieum-stack">{children}</div></section>;}
export function Page({title,eyebrow,actions,children}:{title:string;eyebrow?:string;actions?:ReactNode;children:ReactNode}){return <section className="ieum-stack"><header className="ieum-page-heading"><div>{eyebrow&&<p className="ieum-kicker">{eyebrow}</p>}<h1>{title}</h1></div>{actions&&<div className="ieum-cluster">{actions}</div>}</header>{children}</section>;}
export function Empty({children}:{children:ReactNode}){return <Card><p className="ieum-empty">{children}</p></Card>;}
export function Dialog({open,title,onClose,children}:{open:boolean;title:string;onClose:()=>void;children:ReactNode}){
  const ref=useRef<HTMLDialogElement>(null);const id=useId();
  useEffect(()=>{const dialog=ref.current;if(!dialog)return;const previous=document.activeElement;
    if(open&&!dialog.open){dialog.showModal();dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();}
    if(!open&&dialog.open)dialog.close();
    return()=>{if(dialog.open)dialog.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};
  },[open]);
  return <dialog ref={ref} className="ieum-dialog" aria-labelledby={id} onCancel={e=>{e.preventDefault();onClose();}} onClose={onClose}><div className="ieum-stack"><header className="ieum-page-heading"><h2 id={id}>{title}</h2><Button intent="ghost" onClick={onClose} data-autofocus>닫기</Button></header>{children}</div></dialog>;
}
