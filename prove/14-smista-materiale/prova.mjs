import fs from 'fs';
const WF=JSON.parse(fs.readFileSync(new URL('../../backup-workflow/2026-11-23/tqeExphctRazwbR0.json', import.meta.url)));
const CODICE=Object.fromEntries(WF.nodes.filter(n=>n.parameters&&n.parameters.jsCode).map(n=>[n.name,n.parameters.jsCode]));
const cfg={SHEET_ID:'x',TELEGRAM_CHAT_ID:'1',MODALITA:process.argv[2]||'prova',NOME_CARTELLA:'Da smistare',MINUTI_QUIETE:10,ORA_RIEPILOGO:'09:00',INTERVALLO_MINUTI:15,MAX_SPOSTAMENTI_GIRO:30,MAX_SOTTOCARTELLE:40,ORE_SILENZIO_AVVISI:6};
const out={}; const executed=new Set(['Config','Avvio a mano']); out['Config']=[{json:cfg}];
const static_={};
let curIdx=0;
const ref=(name)=>({ first:()=>out[name][0], get item(){return out[name][curIdx]}, itemMatching:(i)=>out[name][i], all:()=>out[name], get isExecuted(){return executed.has(name)} });
function run(node,input,perItem){
  const code=CODICE[node];
  const res=[];
  const go=(idx)=>{ curIdx=idx; const it=input[idx];
    const f=new Function('$','$input','$json','$getWorkflowStaticData','$now', code);
    return f(ref,{all:()=>input,first:()=>input[0],item:it},it&&it.json,()=>static_,new Date()); };
  if(perItem){ input.forEach((_,i)=>{ const r=go(i); if(r) res.push(Array.isArray(r)?r[0]:r); }); }
  else { const r=go(0); (Array.isArray(r)?r:[r]).forEach(x=>res.push(x)); }
  out[node]=res; executed.add(node); return res;
}
const old='2026-11-20T10:00:00Z', now=new Date().toISOString();
const F=(id,name,mime,size,parent,t=old)=>({id,name,mimeType:mime,size:String(size),createdTime:t,modifiedTime:t,parents:[parent]});
const DIR='application/vnd.google-apps.folder';
// Clienti
const clienti={values:[['cliente','nome_locale','attivo','cartella_drive'],['c1','Pane Quotidiano','sì','https://drive.google.com/drive/folders/ROOTFOLDER123'],['c2','Bar Test','si','ROOTFOLDER123'],['c3','Spento','no','ZZZZZZZZZZZZ']]};
out['Leggi Clienti']=[{json:clienti}];
const cl=run('Clienti con cartella',out['Leggi Clienti']);
out['Nessun cliente?']=cl;
out['Cartelle del cliente']=[{json:{files:[{id:'SMI',name:'Da smistare'},{id:'POST',name:'post'},{id:'REEL',name:'reel'},{id:'STO',name:'storie',createdTime:old}]}}];
const tr=run('Trova le cartelle',out['Cartelle del cliente'],true);
out['Esiste Da smistare?']=tr;
out['Elenca Da smistare']=[{json:{files:[
 F('f1','foto1.jpg','image/jpeg',2e6,'SMI'), F('f2','IMG_1.HEIC','image/heic',2e6,'SMI'), F('f3','clip lunga.mov','video/quicktime',50e6,'SMI'),
 F('f4','nuova.jpg','image/jpeg',1e6,'SMI',now), F('f5','._foto.jpg','image/jpeg',4e3,'SMI'), F('f6','_nontoccare.jpg','image/jpeg',1e6,'SMI'),
 F('f7','.DS_Store','application/octet-stream',1,'SMI'), F('f8','documento.pdf','application/pdf',1e5,'SMI'), F('f9','enorme.mp4','video/mp4',400e6,'SMI'),
 F('d1','Brief pizza estate',DIR,0,'SMI'), F('d2','storie',DIR,0,'SMI'), F('d3','Carosello menu',DIR,0,'SMI'), F('d4','Misto',DIR,0,'SMI'), F('d5','Vuota',DIR,0,'SMI'), F('d6','Pronti',DIR,0,'SMI')]}}];
out['Contenuto delle sottocartelle']=[{json:{files:[
 F('a1','c1.mp4','video/mp4',30e6,'d1'),F('a2','c2.mp4','video/mp4',30e6,'d1'),F('a3','brief.txt','text/plain',100,'d1'),F('a4','musica.mp3','audio/mpeg',3e6,'d1'),
 F('b1','s1.jpg','image/jpeg',1e6,'d2'),F('b2','s2.mp4','video/mp4',20e6,'d2'),F('b3','s3.webp','image/webp',1e6,'d2'),
 F('e1','m1.jpg','image/jpeg',1e6,'d3'),F('e2','m2.png','image/png',1e6,'d3'),F('e3','brief.txt','text/plain',100,'d3'),
 F('g1','x.jpg','image/jpeg',1e6,'d4'),F('g2','y.mp4','video/mp4',1e6,'d4'), F('h1','z.jpg','image/jpeg',1e6,'d6')]}}];
out['Sottocartelle di reel']=[{json:{files:[{id:'R0',name:'clip lunga'}]}}];
const piano=run('Piano',out['Sottocartelle di reel'],true);
console.log(JSON.stringify(piano[0].json,null,1));
const riep=run('Riepilogo',piano); console.log('--- RIEPILOGO'); riep.forEach(r=>console.log(r&&r.json&&r.json.messaggio));
const az=run('Azioni',piano); console.log('--- AZIONI',JSON.stringify(az));
if(process.argv[2]==='attivo'){
 // simula esito: Sposta per item non-reel_nuovo, uno fallisce
 const ifFalse=az.filter(a=>a.json.tipo!=='reel_nuovo'); out['Serve una cartella nuova?']=ifFalse;
 const sp=ifFalse.map((a,i)=> i===1?{json:{error:{message:'Forbidden'},details:{httpCode:'403',description:'The user does not have sufficient permissions for this file.'}}}:{json:{id:a.json.file_id}});
 out['Sposta']=sp; const es=run('Esito spostamenti',sp); console.log('--- ESITO'); es.forEach(e=>console.log(e.json.messaggio)); console.log('static',JSON.stringify(static_));
 const nuovi=az.filter(a=>a.json.tipo==='reel_nuovo'); out['Serve una cartella nuova?']=nuovi;
 out['Crea la cartella del reel']=nuovi.map(()=>({json:{id:'NEWF'}}));
 const ev=run('Esito video',nuovi.map(()=>({json:{id:'f3',name:'01.mov'}}))); console.log('--- VIDEO'); ev.forEach(e=>console.log(e&&e.json&&e.json.messaggio));
}
