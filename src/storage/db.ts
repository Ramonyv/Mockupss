import type {ScreenAsset,Template,Project} from '../types';
const DB='forma-local-v1';
let pending:Promise<IDBDatabase>|null=null;
function db(){return pending??=new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{const d=req.result;d.createObjectStore('templates',{keyPath:'id'});d.createObjectStore('assets',{keyPath:'id'});d.createObjectStore('state');};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function act<T>(store:string,mode:IDBTransactionMode,fn:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(store,mode);const req=fn(tx.objectStore(store));tx.oncomplete=()=>resolve(req.result);tx.onabort=()=>reject(tx.error??Error('Local save was cancelled.'));tx.onerror=()=>reject(tx.error??Error('Local storage failed.'));});}
export const saveTemplate=(t:Template)=>act('templates','readwrite',s=>s.put(t));
export const allTemplates=()=>act<Template[]>('templates','readonly',s=>s.getAll());
export const saveAsset=(a:ScreenAsset)=>act('assets','readwrite',s=>s.put(a));
export const allAssets=()=>act<ScreenAsset[]>('assets','readonly',s=>s.getAll());
export const removeAsset=(id:string)=>act('assets','readwrite',s=>s.delete(id));
export const saveProject=(p:Project)=>act('state','readwrite',s=>s.put(p,'project'));
export const loadProject=()=>act<Project|undefined>('state','readonly',s=>s.get('project'));
