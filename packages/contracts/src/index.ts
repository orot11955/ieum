import {z} from 'zod';
export const uuid=z.uuid();
export const dateOnly=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00.000Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;},'유효한 날짜를 입력해 주세요.');
export const timeZone=z.string().max(100).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}},'유효한 시간대를 입력해 주세요.');
const title=z.string().trim().min(1).max(200),body=z.string().max(200000),version=z.number().int().positive();
export const tags=z.array(z.string().trim().min(1).max(40)).max(20).default([]);
export const captureInput=z.object({title,body,kind:z.enum(['NOTE','EXPERIENCE','KNOWLEDGE','QUESTION','RESULT']).default('NOTE'),tags,sourceId:uuid.optional()}).strict();
export const captureUpdate=captureInput.extend({baseVersion:version});
export const contextInput=z.object({name:title,purpose:z.string().trim().min(1).max(2000),kind:z.enum(['TOPIC','FLOW','PROJECT','COLLECTION']).default('TOPIC')}).strict();
export const dueInput=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('NONE')}).strict(),z.object({kind:z.literal('DATE'),date:dateOnly}).strict(),z.object({kind:z.literal('TIMED'),at:z.iso.datetime({offset:true}),timeZone}).strict(),
]);
export const originInput=z.discriminatedUnion('type',[
 z.object({type:z.literal('UNIT'),id:uuid,revision:version}).strict(),z.object({type:z.literal('DOCUMENT'),id:uuid,revision:version}).strict(),
]);
export const taskInput=z.object({title,description:body.default(''),due:dueInput.default({kind:'NONE'}),origin:originInput.optional(),contextId:uuid.optional()}).strict();
export const taskUpdate=z.object({title,description:body.default(''),due:dueInput.default({kind:'NONE'}),status:z.enum(['TODO','IN_PROGRESS','DONE','CANCELED']),baseVersion:version}).strict();
export const eventInput=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('TIMED'),title,startsAt:z.iso.datetime({offset:true}),endsAt:z.iso.datetime({offset:true}),timeZone,taskId:uuid.optional()}).strict().refine(v=>Date.parse(v.endsAt)>Date.parse(v.startsAt),{message:'종료는 시작 뒤여야 합니다.'}),
 z.object({kind:z.literal('ALL_DAY'),title,startDate:dateOnly,endDate:dateOnly,taskId:uuid.optional()}).strict().refine(v=>v.endDate>v.startDate,{message:'종료 날짜는 배타 종료일로 시작 뒤여야 합니다.'}),
]);
const publicUrl=z.url().max(2000).refine(v=>{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;},'HTTP(S) 출처만 허용합니다.');
export const sourceInput=z.object({title,url:publicUrl.optional(),author:z.string().max(200).default(''),excerpt:body.default(''),interpretation:body.default('')}).strict();
export const evidenceInput=z.object({type:z.enum(['UNIT','SOURCE','DOCUMENT']),id:uuid,revision:version,claim:z.string().max(1000).default(''),relation:z.enum(['RELATED','SUPPORTS','CONTRADICTS','AUTHOR_INTERPRETATION']).default('RELATED')}).strict();
export const publicMeta=z.object({slug:z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),summary:z.string().max(500).default(''),author:z.string().trim().max(100).default(''),tags,publicSources:z.array(z.object({title,author:z.string().max(200).default(''),url:publicUrl}).strict()).max(30).default([])}).strict();
export const documentInput=z.object({title,kind:z.enum(['WIKI','ARTICLE','NOTE']),body:body.default('')}).strict();
export const draftInput=z.object({title,body,baseVersion:version,sources:z.array(evidenceInput).max(100).default([]),publicMeta:publicMeta.nullable().default(null)}).strict();
export const pageQuery=z.object({q:z.string().max(200).default(''),limit:z.coerce.number().int().min(1).max(100).default(30),offset:z.coerce.number().int().min(0).max(100000).default(0)});
export type Evidence=z.infer<typeof evidenceInput>;
export interface Problem{status:number;code:string;detail:string;requestId?:string;fieldErrors?:{path:string;message:string}[]}
export interface Me{user:{id:string;name:string;email:string;twoFactorEnabled:boolean};workspace:{id:string;name:string};operator:boolean;requiresMfa:boolean;mailEnabled:boolean;deliveryPublic:boolean}
export type Row=Record<string,unknown>;
