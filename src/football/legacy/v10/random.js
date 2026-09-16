export const clamp=(x,lo=0,hi=1)=>Math.max(lo,Math.min(hi,x));
export function hash(value){let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
export function rng(seed,savedState){let state=savedState??hash(seed);return {snapshot(){return state;},next(){state+=0x6D2B79F5;let t=state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;},int(a,b){return a+Math.floor(this.next()*(b-a+1));},normal(){return Math.sqrt(-2*Math.log(Math.max(1e-12,this.next())))*Math.cos(2*Math.PI*this.next());},pick(items,weight=()=>1){const weights=items.map(p=>Math.max(0,weight(p))),total=weights.reduce((a,b)=>a+b,0);if(!items.length||!total)throw Error('无可用候选球员');let v=this.next()*total;for(let i=0;i<items.length;i++){v-=weights[i];if(v<=0)return items[i];}return items.at(-1);}};}
export const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
export const sigmoid=x=>1/(1+Math.exp(-x));
export const logit=p=>Math.log(clamp(p,.001,.999)/(1-clamp(p,.001,.999)));
