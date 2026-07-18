const $ = (id) => document.getElementById(id);
const defaults = { selectionMode:'bubble', fontSize:12, panelWidth:380, theme:'light' };
let entries=[];

init();
async function init(){
  const data=await chrome.storage.local.get(['dictFloatSettings','dictFloatEntries']);
  const settings={...defaults,...(data.dictFloatSettings||{})}; entries=Array.isArray(data.dictFloatEntries)?data.dictFloatEntries:[];
  for(const key of Object.keys(defaults)) $(key).value=settings[key];
  ['selectionMode','fontSize','panelWidth','theme'].forEach(id=>$(id).addEventListener('change',saveSettings));
  $('exportJson').addEventListener('click',exportJson); $('exportCsv').addEventListener('click',exportCsv); $('importFile').addEventListener('change',importFile); $('clearEntries').addEventListener('click',clearEntries);
}
async function saveSettings(){ const settings={selectionMode:$('selectionMode').value,fontSize:clamp(+$('fontSize').value,10,15),panelWidth:clamp(+$('panelWidth').value,320,520),theme:$('theme').value}; await chrome.storage.local.set({dictFloatSettings:settings}); status('Saved. Refresh an existing page to apply selection behavior immediately.'); }
function exportJson(){ download('dictfloat-glossary.json',JSON.stringify({format:'dictfloat-glossary',version:1,entries},null,2),'application/json'); status(`Exported ${entries.length} entries as JSON.`); }
function exportCsv(){ const headers=['term','aliases','chinese','definition','tags','category','source']; const csv=[headers.join(','),...entries.map(e=>headers.map(k=>csvEscape(Array.isArray(e[k])?e[k].join(', '):(e[k]||''))).join(','))].join('\n');download('dictfloat-glossary.csv',csv,'text/csv;charset=utf-8');status(`Exported ${entries.length} entries as CSV.`); }
async function importFile(e){const file=e.target.files?.[0]; if(!file)return;try{const text=await file.text();let incoming=[];if(file.name.toLowerCase().endsWith('.json')){const json=JSON.parse(text);incoming=Array.isArray(json)?json:(json.entries||[]);}else incoming=parseCsv(text);incoming=incoming.map(normalizeEntry).filter(x=>x.term&&x.definition);if(!incoming.length)throw new Error('No valid entries found.');const byKey=new Map(entries.map(x=>[x.term.toLowerCase(),x]));for(const item of incoming)byKey.set(item.term.toLowerCase(),item);entries=[...byKey.values()];await chrome.storage.local.set({dictFloatEntries:entries});status(`Imported ${incoming.length} entries. Total: ${entries.length}.`);}catch(err){status(`Import failed: ${err.message}`,true)}finally{e.target.value='';}}
async function clearEntries(){if(!confirm('Clear every DictFloat glossary entry? This cannot be undone unless you exported a backup.'))return;entries=[];await chrome.storage.local.set({dictFloatEntries:[]});status('All glossary entries cleared.');}
function normalizeEntry(x){return{id:x.id||crypto.randomUUID(),term:String(x.term||'').trim(),aliases:arr(x.aliases),chinese:String(x.chinese||'').trim(),definition:String(x.definition||'').trim(),tags:arr(x.tags),category:String(x.category||'').trim(),source:String(x.source||'').trim()||'Imported glossary',favorite:!!x.favorite,updatedAt:Date.now()};}
function arr(v){return Array.isArray(v)?v.map(String).map(x=>x.trim()).filter(Boolean):String(v||'').split(',').map(x=>x.trim()).filter(Boolean)}
function parseCsv(text){const rows=[];let row=[],cell='',q=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'&&q&&n==='"'){cell+='"';i++;continue}if(c==='"'){q=!q;continue}if(c===','&&!q){row.push(cell);cell='';continue}if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&n==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';continue}cell+=c}row.push(cell);if(row.some(x=>x.trim()))rows.push(row);const headers=(rows.shift()||[]).map(x=>x.trim().toLowerCase());return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]||''])))}
function csvEscape(v){const s=String(v);return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s}
function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
function status(message,error=false){const n=$('status');n.textContent=message;n.style.color=error?'#b42318':'#0f766e'}
function clamp(n,min,max){return Math.min(max,Math.max(min,Number.isFinite(n)?n:min))}
