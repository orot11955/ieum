import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {createContext,useContext} from 'react';
import type {Me,Problem,Row} from '../../../../packages/contracts/src';
export class ApiError extends Error{constructor(public problem:Problem){super(problem.detail);}}
export async function request<T=Record<string,unknown>>(path:string,options:{method?:string;body?:unknown;key?:string;signal?:AbortSignal}={}):Promise<T>{
 const response=await fetch(path,{method:options.method??'GET',credentials:'same-origin',headers:{'content-type':'application/json','x-ieum-request':'1',...(options.method&&options.method!=='GET'?{'idempotency-key':options.key??crypto.randomUUID()}:{})},...(options.body!==undefined?{body:JSON.stringify(options.body)}:{}),...(options.signal?{signal:options.signal}:{})});
 if(!response.ok){let p:Problem;try{p=await response.json() as Problem;}catch{p={status:response.status,code:'REQUEST_FAILED',detail:'요청을 처리하지 못했습니다.'};}throw new ApiError({...p,detail:p.detail??(p as unknown as {message:string}).message??'요청을 확인해 주세요.'});}
 return response.json() as Promise<T>;
}
export const AccountContext=createContext<Me|null>(null);
export function useAccount(){const value=useContext(AccountContext);if(!value)throw new Error('Account provider missing');return value;}
export function useBase(){return '/api/v1/workspaces/'+useAccount().workspace.id;}
export function useData<T=Record<string,unknown>>(path:string){const account=useAccount();return useQuery({queryKey:['private',account.user.id,account.workspace.id,path],queryFn:({signal})=>request<T>(path,{signal}),retry:false});}
export function useItems(path:string){return useData<{items:Row[]}>(path);}
export function useAction(){const q=useQueryClient();return useMutation({mutationFn:({path,body,method='POST'}:{path:string;body?:unknown;method?:string})=>request(path,{method,...(body===undefined?{}:{body})}),onSuccess:async()=>{await q.invalidateQueries({queryKey:['private']});}});}
export function str(row:Row,key:string){const value=row[key];return typeof value==='string'?value:value instanceof Date?value.toISOString():'';}
export function num(row:Row,key:string){const n=Number(row[key]);return Number.isFinite(n)?n:0;}
export function textError(error:unknown){return error instanceof Error?error.message:'요청을 처리하지 못했습니다.';}
export function formatDate(value:unknown){if(!value)return '—';const date=new Date(String(value));return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short'}).format(date):String(value);}
export async function download(path:string,name:string){const r=await fetch(path,{credentials:'same-origin'});if(!r.ok){const p=await r.json() as Problem;throw new ApiError(p);}const blob=await r.blob(),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
