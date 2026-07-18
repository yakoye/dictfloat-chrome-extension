const $ = (id) => document.getElementById(id);
const defaults = { selectionMode:'bubble', fontSize:12, panelWidth:380, theme:'system', onlineLookup:true };
const defaultDictionaries = () => [
  { id:'pcie-starter', name:'PCIe Starter', enabled:true, builtIn:true, createdAt:0 },
  { id:'my-glossary', name:'My Glossary', enabled:true, builtIn:false, createdAt:Date.now() }
];
let entries=[];
let dictionaries=[];

init();
async function init(){
  const data=await chrome.storage.local.get(['dictFloatSettings','dictFloatEntries','dictFloatDictionaries']);
  const settings={...defaults,...(data.dictFloatSettings||{})};
  entries=(Array.isArray(data.dictFloatEntries)?data.dictFloatEntries:[]).map(entry=>({...entry,dictionaryId:entry.dictionaryId||inferDictionaryId(entry)}));
  dictionaries=normalizeDictionaries(data.dictFloatDictionaries);
  for(const key of Object.keys(defaults)){ if ($(key).type === 'checkbox') $(key).checked=!!settings[key]; else $(key).value=settings[key]; }
  ['selectionMode','fontSize','panelWidth','theme','onlineLookup'].forEach(id=>$(id).addEventListener('change',saveSettings));
  $('exportJson').addEventListener('click',exportJson); $('exportCsv').addEventListener('click',exportCsv); $('importFile').addEventListener('change',importFile); $('clearEntries').addEventListener('click',clearEntries); $('addDictionary').addEventListener('click',addDictionary);
  renderDictionaries();
  await chrome.storage.local.set({dictFloatDictionaries:dictionaries,dictFloatEntries:entries});
}

async function saveSettings(){
  const settings={selectionMode:$('selectionMode').value,fontSize:clamp(+$('fontSize').value,10,15),panelWidth:clamp(+$('panelWidth').value,320,520),theme:$('theme').value,onlineLookup:$('onlineLookup').checked,themeLockedByUser:true};
  await chrome.storage.local.set({dictFloatSettings:settings});
  status('Saved. Open windows update immediately.');
}

function renderDictionaries(){
  const list=$('dictionaryList'); list.textContent='';
  dictionaries.forEach(dictionary=>{
    const row=document.createElement('div'); row.className='dictionary-item';
    const enabled=document.createElement('input'); enabled.type='checkbox'; enabled.checked=dictionary.enabled!==false; enabled.title='Include this glossary in search';
    enabled.addEventListener('change',async()=>{dictionary.enabled=enabled.checked;await saveDictionaries();status(`${dictionary.name} ${enabled.checked?'enabled':'disabled'}.`)});
    const info=document.createElement('div'); info.className='dictionary-info';
    const name=document.createElement('div'); name.className='dictionary-name'; name.textContent=dictionary.name;
    const count=entries.filter(entry=>entry.dictionaryId===dictionary.id).length;
    const meta=document.createElement('div'); meta.className='dictionary-meta'; meta.textContent=`${count} ${count===1?'entry':'entries'}${dictionary.builtIn?' · built-in':''}`;
    info.append(name,meta);
    const actions=document.createElement('div'); actions.className='dictionary-actions';
    if(!dictionary.builtIn){
      const rename=document.createElement('button'); rename.textContent='Rename'; rename.addEventListener('click',()=>renameDictionary(dictionary));
      const remove=document.createElement('button'); remove.className='delete'; remove.textContent='Delete'; remove.addEventListener('click',()=>deleteDictionary(dictionary));
      actions.append(rename,remove);
    }
    row.append(enabled,info,actions); list.append(row);
  });
}

async function addDictionary(){
  const name=prompt('New glossary name:'); if(!name?.trim()) return;
  dictionaries.push({id:crypto.randomUUID(),name:name.trim(),enabled:true,builtIn:false,createdAt:Date.now()});
  await saveDictionaries(); renderDictionaries(); status(`Created “${name.trim()}”.`);
}
async function renameDictionary(dictionary){
  const name=prompt('Glossary name:',dictionary.name); if(!name?.trim()||name.trim()===dictionary.name) return;
  dictionary.name=name.trim(); await saveDictionaries(); renderDictionaries(); status('Glossary renamed.');
}
async function deleteDictionary(dictionary){
  const count=entries.filter(entry=>entry.dictionaryId===dictionary.id).length;
  if(!confirm(`Delete “${dictionary.name}” and its ${count} local ${count===1?'entry':'entries'}?`)) return;
  entries=entries.filter(entry=>entry.dictionaryId!==dictionary.id); dictionaries=dictionaries.filter(item=>item.id!==dictionary.id);
  await chrome.storage.local.set({dictFloatEntries:entries,dictFloatDictionaries:dictionaries}); renderDictionaries(); status('Glossary deleted.');
}
async function saveDictionaries(){await chrome.storage.local.set({dictFloatDictionaries:dictionaries});}

function exportJson(){
  download('dictfloat-glossaries.json',JSON.stringify({format:'dictfloat-glossaries',version:2,dictionaries,entries},null,2),'application/json');
  status(`Exported ${entries.length} entries across ${dictionaries.length} glossaries.`);
}
function exportCsv(){
  const headers=['dictionary','term','aliases','chinese','definition','tags','category','source'];
  const csv=[headers.join(','),...entries.map(entry=>headers.map(key=>{
    const value=key==='dictionary'?(dictionaryFor(entry.dictionaryId)?.name||'My Glossary'):(Array.isArray(entry[key])?entry[key].join(', '):(entry[key]||''));
    return csvEscape(value);
  }).join(','))].join('\n');
  download('dictfloat-glossary.csv',csv,'text/csv;charset=utf-8'); status(`Exported ${entries.length} entries as CSV.`);
}
async function importFile(e){
  const file=e.target.files?.[0]; if(!file)return;
  try{
    const text=await file.text(); let incoming=[]; let incomingDictionaries=[];
    if(file.name.toLowerCase().endsWith('.json')){
      const json=JSON.parse(text); incoming=Array.isArray(json)?json:(json.entries||[]); incomingDictionaries=Array.isArray(json.dictionaries)?json.dictionaries:[];
    }else incoming=parseCsv(text).map(row=>({...row,dictionaryId:dictionaryIdByName(row.dictionary)||'my-glossary'}));
    incomingDictionaries.forEach(dictionary=>{if(!dictionaries.some(item=>item.id===dictionary.id)) dictionaries.push({...dictionary,id:String(dictionary.id||crypto.randomUUID()),name:String(dictionary.name||'Imported glossary'),enabled:dictionary.enabled!==false,builtIn:false});});
    incoming=incoming.map(normalizeEntry).filter(x=>x.term&&x.definition);
    if(!incoming.length)throw new Error('No valid entries found.');
    const byKey=new Map(entries.map(x=>[`${x.dictionaryId}:${x.term.toLowerCase()}`,x]));
    for(const item of incoming)byKey.set(`${item.dictionaryId}:${item.term.toLowerCase()}`,item);
    entries=[...byKey.values()];
    await chrome.storage.local.set({dictFloatEntries:entries,dictFloatDictionaries:dictionaries}); renderDictionaries(); status(`Imported ${incoming.length} entries. Total: ${entries.length}.`);
  }catch(err){status(`Import failed: ${err.message}`,true)}finally{e.target.value='';}
}
async function clearEntries(){if(!confirm('Clear every DictFloat glossary entry? This cannot be undone unless you exported a backup.'))return;entries=[];await chrome.storage.local.set({dictFloatEntries:[]});renderDictionaries();status('All glossary entries cleared.');}
function normalizeEntry(x){return{id:x.id||crypto.randomUUID(),dictionaryId:String(x.dictionaryId||dictionaryIdByName(x.dictionary)||'my-glossary'),term:String(x.term||'').trim(),aliases:arr(x.aliases),chinese:String(x.chinese||'').trim(),definition:String(x.definition||'').trim(),tags:arr(x.tags),category:String(x.category||'').trim(),source:String(x.source||'').trim()||'Imported glossary',favorite:!!x.favorite,updatedAt:Date.now()};}
function normalizeDictionaries(input){const result=Array.isArray(input)?input.filter(Boolean).map(item=>({id:String(item.id||crypto.randomUUID()),name:String(item.name||'Untitled glossary').trim()||'Untitled glossary',enabled:item.enabled!==false,builtIn:!!item.builtIn,createdAt:item.createdAt||Date.now()})):[]; defaultDictionaries().forEach(item=>{if(!result.some(dictionary=>dictionary.id===item.id))result.push(item)});return result;}
function inferDictionaryId(entry){return String(entry?.source||'').includes('DictFloat starter')?'pcie-starter':'my-glossary';}
function dictionaryFor(id){return dictionaries.find(dictionary=>dictionary.id===id);}
function dictionaryIdByName(name){const text=String(name||'').trim().toLowerCase();return dictionaries.find(dictionary=>dictionary.name.toLowerCase()===text)?.id;}
function arr(v){return Array.isArray(v)?v.map(String).map(x=>x.trim()).filter(Boolean):String(v||'').split(',').map(x=>x.trim()).filter(Boolean)}
function parseCsv(text){const rows=[];let row=[],cell='',q=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'&&q&&n==='"'){cell+='"';i++;continue}if(c==='"'){q=!q;continue}if(c===','&&!q){row.push(cell);cell='';continue}if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&n==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';continue}cell+=c}row.push(cell);if(row.some(x=>x.trim()))rows.push(row);const headers=(rows.shift()||[]).map(x=>x.trim().toLowerCase());return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]||''])))}
function csvEscape(v){const s=String(v);return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s}
function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
function status(message,error=false){const n=$('status');n.textContent=message;n.style.color=error?'#b42318':'#0f766e'}
function clamp(n,min,max){return Math.min(max,Math.max(min,Number.isFinite(n)?n:min))}
