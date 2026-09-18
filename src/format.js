// Keep model amounts exact; compact only at the presentation boundary.
export function formatMoney(value,{currency=false}={}){
 if(!Number.isFinite(value))return '—';
 const abs=Math.abs(value),unit=abs>=99995000?1e8:abs>=9999.5?1e4:1;
 const digits=unit===1?0:abs/unit<10?2:1;
 const text=Number((value/unit).toFixed(digits)).toString()+(unit===1e8?'亿':unit===1e4?'万':'');
 return text+(currency?' 星元':'');
}
export const moneyData=value=>Number.isFinite(value)?`<data value="${value}">${formatMoney(value)}</data>`:'—';
