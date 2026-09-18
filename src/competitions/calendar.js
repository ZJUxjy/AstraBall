import {isGlobalCupYear} from './catalog.js';
// Colonisation years use the Gregorian month/week structure, in planet standard time.
export const dateOf=(year,month,day)=>`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
export const addDays=(date,n)=>new Date(Date.parse(`${date}T12:00:00Z`)+n*86400000).toISOString().slice(0,10);
export const daysBetween=(a,b)=>Math.round((Date.parse(`${b}T12:00:00Z`)-Date.parse(`${a}T12:00:00Z`))/86400000);
export function friendlyDates(year){
 return [dateOf(year,1,24),dateOf(year,2,14),...(!isGlobalCupYear(year)?[dateOf(year,6,14)]:[]),dateOf(year,12,13)];
}
export function seasonCalendar(year){
 const slots=[];
 for(let day=dateOf(year,3,1);day<=dateOf(year,11,1);day=addDays(day,1)){
  const weekday=new Date(`${day}T12:00:00Z`).getUTCDay();
  if(day.slice(5,7)!=='06'&&[3,6].includes(weekday))slots.push(day);
 }
 // Reserve recovery dates between league rounds.
 const cupIndices=[5,14,23,35,44],cup=[];
 const league=slots.filter((_,i)=>!cupIndices.includes(i));
 if(league.length<46)throw Error('赛历不足 46 轮');
 return {league,cup,regular:league.filter(d=>d<dateOf(year,9,1)),metro:league.filter(d=>d>=dateOf(year,9,1)),playoffs:[8,15,22,29].map(d=>dateOf(year,11,d)),
  global:[3,7,11,16,20,24].map(d=>dateOf(year,6,d)),
  events:[
   {date:dateOf(year,1,1),end:dateOf(year,2,28),name:'冬季注册窗口',kind:'window'},
   {date:dateOf(year,1,20),name:'大都会学院选秀日',kind:'draft'},
   {date:dateOf(year,1,24),name:'冬窗友谊赛',kind:'friendly'},
   {date:dateOf(year,2,1),end:dateOf(year,2,28),name:'季前备战',kind:'break'},
   {date:dateOf(year,2,14),name:'季前友谊赛',kind:'friendly'},
   {date:slots[0],name:'联赛开幕',kind:'league'},
   {date:dateOf(year,6,1),end:dateOf(year,6,30),name:'全球冠军杯举办窗口 · 国内休赛',kind:'global'},
   ...(!isGlobalCupYear(year)?[{date:dateOf(year,6,14),name:'夏季友谊赛',kind:'friendly'}]:[]),
   {date:dateOf(year,7,1),end:dateOf(year,7,31),name:'夏季注册窗口',kind:'window'},
   {date:league.at(-1),name:'常规赛末轮',kind:'league'},
   {date:dateOf(year,11,8),end:dateOf(year,11,29),name:'年度冠军淘汰赛',kind:'playoff'},
   {date:dateOf(year,12,1),name:'赛季结算',kind:'settlement'},
   {date:dateOf(year,12,2),end:dateOf(year,12,31),name:'休赛期',kind:'break'},
   {date:dateOf(year,12,13),name:'冬歇友谊赛',kind:'friendly'},
  ]};
}
export function roundDates(slots,rounds){
 if(rounds>slots.length||rounds<2)throw Error('轮次数量超出赛历');
 return Array.from({length:rounds},(_,i)=>slots[Math.round(i*(slots.length-1)/(rounds-1))]);
}
