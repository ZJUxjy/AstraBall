import {preciseRating,POSITIONS} from './football/players.js';
export const PLAYER_SORTS=[['number','号码'],['name','姓名'],['position','位置'],['age','年龄'],['wage','周薪'],['value','身价'],['ability','能力'],['goals','进球'],['assists','助攻'],['minutes','出场分钟'],['condition','体能']];
const order=Object.keys(POSITIONS);
const headerKeys={'号码':'number','球员':'name','位置':'position','年龄':'age','周薪':'wage','参考身价':'value','能力 / 200':'ability','体能':'condition','分钟':'minutes','进球':'goals','助攻':'assists'};
export function positionOrder(value){const index=order.includes(value)?order.indexOf(value):Object.values(POSITIONS).indexOf(value);return index<0?null:index;}
export function compareValues(a,b,direction='asc'){
 const missing=v=>v==null||v===''||v==='—'||typeof v==='number'&&!Number.isFinite(v);
 if(missing(a)||missing(b))return Number(missing(a))-Number(missing(b));
 const result=typeof a==='number'&&typeof b==='number'?a-b:String(a).localeCompare(String(b),'zh-CN',{numeric:true});
 return direction==='desc'?-result:result;
}
export function sortPlayers(players,{key='ability',direction='desc',wage=()=>null,value=()=>null,stats=new Map()}={}){
 const get=p=>key==='ability'?preciseRating(p):key==='position'?positionOrder(p.position):key==='wage'?wage(p):key==='value'?value(p):['goals','assists','minutes'].includes(key)?stats.get(p.id)?.[key]??0:p[key];
 return players.map((p,index)=>({p,index,value:get(p)})).sort((a,b)=>compareValues(a.value,b.value,direction)||a.index-b.index).map(row=>row.p);
}
export function sortControls(prefix,key,direction,fields=PLAYER_SORTS){
 return `<label>排序<select data-${prefix}-sort aria-label="排序字段">${fields.map(([id,label])=>`<option value="${id}" ${id===key?'selected':''}>${label}</option>`).join('')}</select></label><label>顺序<select data-${prefix}-direction aria-label="排序顺序"><option value="desc" ${direction==='desc'?'selected':''}>从高到低</option><option value="asc" ${direction==='asc'?'selected':''}>从低到高</option></select></label>`;
}
// Static data tables share keyboard-accessible header sorting. Paginated lists
// implement model sorting before slicing and opt out with data-model-sort.
export function cellValue(cell,header=''){
 if(!cell)return null;
 const raw=cell.dataset.sortValue??cell.querySelector('data[value]')?.getAttribute('value');
 if(raw!=null)return raw===''?null:Number.isFinite(Number(raw))?Number(raw):raw;
 const text=cell.textContent.trim();
 if(!text||['—','-','待赛','暂无'].includes(text))return null;
 if(header.includes('位置')){const position=positionOrder(text);if(position!=null)return position;}
 const numeric=text.replaceAll(',','').match(/^([+-]?\d+(?:\.\d+)?)\s*(亿|万)?(?:\s*(?:星元|%|cm|kg|岁|分|次|场|球))?$/);
 return numeric?Number(numeric[1])*(numeric[2]==='亿'?1e8:numeric[2]==='万'?1e4:1):text;
}
export function installTableSorting(root=document){
 const enhance=()=>{
  for(const list of root.querySelectorAll('[data-sort-list]:not([data-sort-ready])')){
   list.dataset.sortReady='true';
   const rows=Array.from(list.children);if(rows.length<2)continue;
   const fields=(list.dataset.sortList||'name').split(',').map(key=>[key,({name:'名称',year:'成立年份',population:'人口'})[key]||key]);
   const controls=document.createElement('div');controls.className='list-sort-controls';controls.innerHTML=sortControls('directory',fields[0][0],'asc',fields);list.before(controls);
   const reorder=()=>{const key=controls.querySelector('[data-directory-sort]').value,direction=controls.querySelector('[data-directory-direction]').value;const get=row=>key==='name'?row.dataset.name||row.querySelector('strong,b')?.textContent:row.dataset[key]==null?null:Number(row.dataset[key]);rows.sort((a,b)=>compareValues(get(a),get(b),direction));list.append(...rows);};controls.addEventListener('change',reorder);reorder();
  }
  for(const first of root.querySelectorAll(':is(.person-row,[data-player-list-row]):not([data-list-ready])')){
   if(first.dataset.listReady)continue;
   const rows=[];let row=first;while(row?.matches(':is(.person-row,[data-player-list-row]):not([data-list-ready])')){rows.push(row);row=row.nextElementSibling;}
   rows.forEach(row=>row.dataset.listReady='true');if(rows.length<2)continue;
   const wrapper=document.createElement('div');wrapper.className='sortable-person-list';
   const controls=document.createElement('div');controls.className='list-sort-controls';
   controls.innerHTML=sortControls('people','name','asc',PLAYER_SORTS.filter(([k])=>['name','age','position','wage','ability'].includes(k)));
   first.before(wrapper);wrapper.append(controls,...rows);
   const reorder=()=>{const key=controls.querySelector('[data-people-sort]').value,direction=controls.querySelector('[data-people-direction]').value;const get=row=>{const value=row.dataset[key];return value===''||value==null?null:key==='name'?value:Number(value);};rows.sort((a,b)=>compareValues(get(a),get(b),direction));wrapper.append(...rows);};
   controls.addEventListener('change',reorder);reorder();
  }
  for(const table of root.querySelectorAll('table:not([data-model-sort]):not([data-sort-ready])')){
   if(!table.tHead||!table.tBodies.length)continue;
   table.dataset.sortReady='true';
   for(const th of table.tHead.rows[table.tHead.rows.length-1].cells){
    if(th.colSpan!==1||th.querySelector('button,input,select')||!th.textContent.trim())continue;
    const label=th.textContent.trim(),button=document.createElement('button');button.type='button';button.className='table-sort-button';button.textContent=label;button.setAttribute('aria-label',`按${label}排序`);
    th.replaceChildren(button);th.setAttribute('aria-sort','none');
    const prefix=table.dataset.sortControl,key=headerKeys[label],field=prefix&&root.querySelector(`[data-${prefix}-sort]`),directionField=prefix&&root.querySelector(`[data-${prefix}-direction]`);
    if(field&&key===field.value)th.setAttribute('aria-sort',directionField.value==='asc'?'ascending':'descending');
    button.addEventListener('click',()=>{
     const direction=th.getAttribute('aria-sort')==='ascending'?'desc':'asc';
     if(field&&key&&directionField){field.value=key;directionField.value=direction;field.dispatchEvent(new Event('change',{bubbles:true}));return;}
     for(const h of table.tHead.querySelectorAll('[aria-sort]'))h.setAttribute('aria-sort','none');
     th.setAttribute('aria-sort',direction==='asc'?'ascending':'descending');
     for(const body of table.tBodies){
      const rows=Array.from(body.rows);
      // Group headings and empty-state cells are semantic boundaries.
      let group=[];const flush=before=>{group.sort((a,b)=>compareValues(cellValue(a.cells[th.cellIndex],label),cellValue(b.cells[th.cellIndex],label),direction));for(const row of group)body.insertBefore(row,before);group=[];};
      for(const row of rows){if(row.cells.length!==table.tHead.rows[0].cells.length||Array.from(row.cells).some(c=>c.colSpan!==1)){flush(row);}else group.push(row);}flush(null);
     }
    });
   }
  }
 };
 enhance();const observer=new MutationObserver(enhance);observer.observe(root,{childList:true,subtree:true});return ()=>observer.disconnect();
}
