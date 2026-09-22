export class AppError extends Error {
  constructor(public status:number,public code:string,message:string,public details?:unknown){super(message);this.name='AppError';}
}
export function requireValue<T>(value:T|null|undefined,code='NOT_FOUND'):T {if(value==null)throw new AppError(404,code,'대상을 찾을 수 없거나 접근할 수 없습니다.');return value;}
export function invariant(condition:unknown,code:string,message:string,status=422):asserts condition {if(!condition)throw new AppError(status,code,message);}
