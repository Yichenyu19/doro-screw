import test from 'node:test';
import assert from 'node:assert/strict';
import {freshSave,loadSave,loadSaveAsync,persistSave,SAVE_KEY} from '../src/storage';
import {flushJournal} from '../src/journal';

class MemoryStorage implements Storage {
  private values=new Map<string,string>();
  blocked=false;
  get length(){return this.values.size;}
  clear(){this.values.clear();}
  getItem(key:string){return this.values.get(key)??null;}
  key(index:number){return[...this.values.keys()][index]??null;}
  removeItem(key:string){this.values.delete(key);}
  setItem(key:string,value:string){if(this.blocked)throw new DOMException('The quota has been exceeded.','QuotaExceededError');this.values.set(key,String(value));}
}

async function isolated(run:(storage:MemoryStorage)=>void|Promise<void>):Promise<void>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const storage=new MemoryStorage();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
  try{persistSave(freshSave());await flushJournal();storage.clear();await run(storage);}
  finally{
    storage.blocked=false;persistSave(freshSave());await flushJournal();
    if(original)Object.defineProperty(globalThis,'localStorage',original);
    else Reflect.deleteProperty(globalThis,'localStorage');
  }
}

test('没有 IndexedDB 时进度仍写入 localStorage，并能再次读出',()=>isolated(async()=>{
  const idb=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');
  Reflect.deleteProperty(globalThis,'indexedDB');
  try{
    const save=freshSave();save.materialBalance=11;save.tutorialSeen=['l1-open'];
    assert.equal(persistSave(save),true);
    assert.ok(localStorage.getItem(SAVE_KEY));
    const loaded=loadSave();
    assert.equal(loaded.data.materialBalance,11);
    assert.deepEqual(loaded.data.tutorialSeen,['l1-open']);
    const asyncLoaded=await loadSaveAsync();
    assert.equal(asyncLoaded.data.materialBalance,11);
  }finally{
    if(idb)Object.defineProperty(globalThis,'indexedDB',idb);
  }
}));

test('本地空间写满时保存失败且不覆盖已有进度',()=>isolated(storage=>{
  const save=freshSave();save.materialBalance=4;
  assert.equal(persistSave(save),true);
  const previous=storage.getItem(SAVE_KEY);
  storage.blocked=true;
  const next=freshSave();next.materialBalance=99;
  assert.equal(persistSave(next),false);
  assert.equal(storage.getItem(SAVE_KEY),previous);
}));
