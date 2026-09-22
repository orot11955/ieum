/** Deterministic lexical baseline. A ranking score is not a match probability. */
export interface MemberEvidence {id:string;originId:string;revision:number;text:string}
export interface ContextSnapshot {id:string;version:number;name:string;purpose:string;members:readonly MemberEvidence[]}
export interface QuerySnapshot {originId:string;text:string;contexts:readonly ContextSnapshot[]}
export interface Candidate {contextId:string;contextVersion:number;name:string;rankScore:number;matchProbability:null;policy:'CANDIDATE';matchedTerms:string[];memberRefs:{id:string;revision:number}[]}
export const engineVersion='lexical-observe-1.0.0';
export function terms(text:string):string[]{
 const normalized=text.normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/g,' ');
 const tokens=normalized.match(/[\p{L}\p{N}_+#.-]+/gu)??[];const out:string[]=[];
 for(const token of tokens){if(token.length>1)out.push(token);if(/[가-힣]/u.test(token))for(let n=2;n<=3;n++)for(let i=0;i+n<=token.length;i++)out.push(token.slice(i,i+n));}
 return out;
}
export function route(snapshot:QuerySnapshot,budget=32):{engineVersion:string;abstention:string|null;candidates:Candidate[]}{
 if(!Number.isInteger(budget)||budget<1||budget>100)throw new Error('Invalid candidate budget');
 const queryTokens=terms(snapshot.text);if(!queryTokens.length)return {engineVersion,abstention:'INSUFFICIENT_INPUT',candidates:[]};
 const contexts=snapshot.contexts.map(c=>({...c,members:c.members.filter(m=>m.originId!==snapshot.originId)}));
 const corpus=contexts.flatMap(c=>[terms(c.name+' '+c.purpose),...c.members.map(m=>terms(m.text))]);const frequency=new Map<string,number>();
 for(const doc of corpus)for(const t of new Set(doc))frequency.set(t,(frequency.get(t)??0)+1);
 const idf=(t:string)=>Math.log((corpus.length+1)/((frequency.get(t)??0)+1))+1;
 const vector=(ts:string[])=>{const counts=new Map<string,number>();for(const t of ts)counts.set(t,(counts.get(t)??0)+1);return new Map([...counts].map(([t,n])=>[t,(1+Math.log(n))*idf(t)]));};
 const q=vector(queryTokens);const norm=(v:Map<string,number>)=>Math.sqrt([...v.values()].reduce((a,b)=>a+b*b,0));const qn=norm(q);
 const sim=(text:string)=>{const ts=terms(text),v=vector(ts),vn=norm(v);return {value:qn&&vn?[...q].reduce((sum,[t,w])=>sum+w*(v.get(t)??0),0)/(qn*vn):0,terms:[...new Set(ts)].filter(t=>q.has(t)).sort()};};
 const candidates=contexts.map(c=>{const identity=sim(c.name+' '+c.purpose);const members=[...new Map(c.members.map(m=>[m.originId,m])).values()].map(m=>({m,...sim(m.text)})).sort((a,b)=>b.value-a.value||a.m.id.localeCompare(b.m.id)).slice(0,3);const memberMean=members.length?members.reduce((s,m)=>s+m.value,0)/members.length:0;
  return {contextId:c.id,contextVersion:c.version,name:c.name,rankScore:Math.min(1,Math.max(identity.value,memberMean)),matchProbability:null,policy:'CANDIDATE' as const,matchedTerms:[...new Set([...identity.terms,...members.flatMap(m=>m.terms)])].slice(0,12),memberRefs:members.filter(m=>m.value>0).map(m=>({id:m.m.id,revision:m.m.revision}))};}).filter(c=>c.rankScore>0).sort((a,b)=>b.rankScore-a.rankScore||a.contextId.localeCompare(b.contextId)).slice(0,budget);
 return {engineVersion,abstention:candidates.length?null:'NO_CONTENT_EVIDENCE',candidates};
}
