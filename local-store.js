/* On-device storage for Calls to Cass.
   Documents (entries, settings) and screenshots live in IndexedDB on this phone.
   Exposes a small subset of a document-store API: doc(path).set / onSnapshot,
   collection(path).doc(id) / onSnapshot, plus blob storage for screenshots. */
(function(){
  "use strict";
  const DB_NAME="calls-to-cass",VERSION=1;
  let dbp=null;
  function open(){
    if(dbp)return dbp;
    dbp=new Promise((res,rej)=>{
      if(!("indexedDB" in window)){rej(new Error("no-idb"));return}
      const r=indexedDB.open(DB_NAME,VERSION);
      r.onupgradeneeded=()=>{const d=r.result;
        if(!d.objectStoreNames.contains("docs"))d.createObjectStore("docs");
        if(!d.objectStoreNames.contains("blobs"))d.createObjectStore("blobs");};
      r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);
    });
    return dbp;
  }
  function tx(store,mode,fn){return open().then(d=>new Promise((res,rej)=>{
    const t=d.transaction(store,mode);const s=t.objectStore(store);let out;
    Promise.resolve(fn(s,v=>{out=v})).catch(rej);
    t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error);
  }))}
  const req=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});

  const docListeners={},colListeners={};
  function snapDoc(path,data){return {id:path.split("/").pop(),exists:data!==undefined,data:()=>data,metadata:{fromCache:false,hasPendingWrites:false}}}
  async function readDoc(path){return tx("docs","readonly",(s,set)=>req(s.get(path)).then(set))}
  async function readCol(col){
    return tx("docs","readonly",(s,set)=>{
      const range=IDBKeyRange.bound(col+"/",col+"/￿");const out=[];
      return new Promise((res,rej)=>{const c=s.openCursor(range);
        c.onsuccess=()=>{const cur=c.result;if(cur){const rest=cur.key.slice(col.length+1);if(!rest.includes("/"))out.push(snapDoc(cur.key,cur.value));cur.continue()}else{set(out);res()}};
        c.onerror=()=>rej(c.error)});
    });
  }
  async function notify(path){
    (docListeners[path]||[]).forEach(async fn=>fn(snapDoc(path,await readDoc(path))));
    const col=path.slice(0,path.lastIndexOf("/"));
    if(colListeners[col]&&colListeners[col].length){const docs=await readCol(col);colListeners[col].forEach(fn=>fn({docs,size:docs.length,empty:!docs.length}))}
  }
  function docRef(path){
    return {id:path.split("/").pop(),path,
      get:async()=>snapDoc(path,await readDoc(path)),
      set:async data=>{await tx("docs","readwrite",s=>req(s.put(JSON.parse(JSON.stringify(data)),path)));notify(path)},
      delete:async()=>{await tx("docs","readwrite",s=>req(s.delete(path)));notify(path)},
      onSnapshot:(next,err)=>{(docListeners[path]=docListeners[path]||[]).push(next);
        readDoc(path).then(d=>next(snapDoc(path,d))).catch(e=>err&&err({code:"unavailable",message:String(e)}));
        return ()=>{docListeners[path]=docListeners[path].filter(f=>f!==next)}}};
  }
  function colRef(col){
    return {path:col,doc:id=>docRef(col+"/"+id),
      get:async()=>{const docs=await readCol(col);return {docs,size:docs.length,empty:!docs.length}},
      onSnapshot:(next,err)=>{(colListeners[col]=colListeners[col]||[]).push(next);
        readCol(col).then(docs=>next({docs,size:docs.length,empty:!docs.length})).catch(e=>err&&err({code:"unavailable",message:String(e)}));
        return ()=>{colListeners[col]=colListeners[col].filter(f=>f!==next)}}};
  }
  const blobs={
    put:async(blob,id)=>{id=id||("b"+Date.now().toString(36)+Math.random().toString(36).slice(2,10));
      await tx("blobs","readwrite",s=>req(s.put(blob,id)));return id},
    get:id=>tx("blobs","readonly",(s,set)=>req(s.get(id)).then(set))
  };
  window.LocalStore={
    ready:()=>open().then(()=>true),
    doc:docRef,collection:colRef,blobs,
    allDocs:()=>tx("docs","readonly",(s,set)=>new Promise((res,rej)=>{const out={};const c=s.openCursor();
      c.onsuccess=()=>{const cur=c.result;if(cur){out[cur.key]=cur.value;cur.continue()}else{set(out);res()}};c.onerror=()=>rej(c.error)}))
  };
})();
