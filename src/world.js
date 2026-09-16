// 世界内容初稿。名称与历史是可编辑的样本，不连接旧项目存档。
export const YEAR = 318;
import { geography } from './geography/generate.js';
export const { regions, provinces, cities } = geography;
import {leagueSystems} from './competitions/catalog.js';
import {completeClubs} from './competitions/clubs.js';
import {generateName} from './football/names.js';
export const leagues = leagueSystems;
const originalClubs = [
  {id:'sky',name:'天穹俱乐部',city:'crown-city',league:'closed',short:'SKY',founded:288},
  {id:'silver-fc',name:'裴渡航星',city:'silver-city',league:'closed',short:'SIL',founded:288},
  {id:'crown-fc',name:'冠都竞技',city:'crown-city',league:'crown-league',short:'CRN',founded:231},
  {id:'bay-fc',name:'裴渡联队',city:'silver-city',league:'silver-league',short:'BAY',founded:248},
  {id:'harbor',name:'栾门俱乐部',city:'haimen',league:'lima-league',short:'HBR',founded:240},
  {id:'isles-fc',name:'网寮竞技',city:'isle-city',league:'lima-league',short:'ISL',founded:256},
  {id:'iron-fc',name:'铁原工联',city:'iron-city',league:'liberlin-league',short:'IRN',founded:219},
  {id:'pine-fc',name:'贺屯俱乐部',city:'pine',league:'liberlin-league',short:'PNE',founded:236},
  {id:'bridge',name:'江桥联队',city:'jiangqiao',league:'sichuan-league',short:'JQ',founded:243},
  {id:'rong-fc',name:'阳坝竞技',city:'rong-city',league:'sichuan-league',short:'RNG',founded:252},
];
export const clubs = completeClubs(originalClubs,cities,provinces);
export const academies = [
  {id:'morning',name:'皇家晨星体育学院',city:'east-crown',kind:'皇家学院',founded:276,text:'皇家资助，面向四区招生，提供通识教育与职业训练。'},
  {id:'horizon',name:'皇家远穹体育学院',city:'silver-city',kind:'皇家学院',founded:281,text:'位于裴渡，与晨星学院长期竞争。毕业生可参加星冠联盟选秀。'},
  {id:'bridge-academy',name:'江桥联队青训',city:'jiangqiao',kind:'俱乐部青训',founded:250,text:'江桥联队所属青训，主要培养本地球员。'},
  {id:'iron-academy',name:'铁原工联青训',city:'iron-city',kind:'俱乐部青训',founded:229,text:'铁原工联所属青训，退役名宿参与训练。'},
];
export const families = [
  {id:'lin',name:'江桥林家',origin:'jiangqiao',type:'普通家庭',text:'林承岳在江桥联队退役，儿子林知远效力大都会天穹俱乐部。',parent:null},
  {id:'royal',name:'星垣皇室',origin:'crown-city',type:'皇室家族',text:'皇家体育学院的资助家族。',parent:null},
  {id:'royal-bay',name:'星垣·裴枝',origin:'silver-city',type:'皇室分支',text:'星垣皇室的裴渡支系。',parent:'royal'},
];
const person = (id,name,age,position,city,club,academy,from,to,extra={}) => ({id,name,age,position,city,club,retired:false,reputation:50,number:8,skills:[['传球',72],['视野',74],['控球',70]],training:academy?[{academy,from,to,graduated:true}]:[],honors:[],career:[],...extra});
export const players = [
  person('lin','林知远',19,'中场','jiangqiao','sky','morning',313,317,{family:'lin',number:8,reputation:78,foot:'右脚',height:181,skills:[['传球',78],['视野',81],['控球',76]],honors:[{year:317,text:'星冠联盟选秀状元'}],career:[{year:313,text:'离开江桥，进入皇家晨星体育学院',type:'academy',target:'morning'},{year:317,text:'以总第 1 顺位被天穹选中',type:'draft',target:'317'},{year:318,text:'职业首个完整赛季 · 8 号',type:'club',target:'sky'}]}),
  person('father','林承岳',43,'中后卫','jiangqiao',null,'bridge-academy',287,292,{family:'lin',retired:true,number:5,reputation:65,lastClub:'bridge',skills:[['防守',71],['预判',75],['力量',70]],honors:[{year:305,text:'江桥联队赛季队长'}],career:[{year:292,text:'从江桥青训进入一线队',type:'club',target:'bridge'},{year:305,text:'出任江桥联队队长',type:'club',target:'bridge'},{year:312,text:'在江桥结束职业生涯',type:'club',target:'bridge'}]}),
  person('zhou','周砚',28,'中场','jiangqiao','bridge','bridge-academy',302,308,{number:10,reputation:86,honors:[{year:317,text:'新四川超级联赛助攻王'}],skills:[['传球',85],['视野',87],['控球',80]]}),
  person('xu','许照',25,'边锋','qinglu','harbor','bridge-academy',305,311,{number:11,reputation:81,honors:[{year:317,text:'利玛超级联赛最佳阵容'}],skills:[['速度',87],['盘带',82],['传中',78]]}),
  person('lu','陆明川',20,'前锋','rong-city','sky','morning',313,317,{number:19,reputation:64,honors:[{year:317,text:'晨星学院毕业生'}]}),
  person('shen','沈序',24,'门将','pine','silver-fc','morning',309,313,{number:1,reputation:83,skills:[['反应',84],['扑救',82],['出击',76]],honors:[{year:317,text:'星冠联盟最佳阵容'}]}),
  person('royal-player','星垣·裴枝 维安',22,'中场','silver-city','crown-fc','horizon',311,315,{family:'royal-bay',number:6,reputation:69,honors:[{year:317,text:'冠都竞技赛季突破球员'}]}),
  person('yan','严柏',30,'中后卫','iron-city','iron-fc','iron-academy',300,306,{number:4,reputation:88,honors:[{year:317,text:'利柏林超级联赛最佳球员'}]}),
  person('ji','季宁',21,'前锋','isle-city','isles-fc',null,0,0,{number:9,reputation:72,honors:[{year:317,text:'网寮竞技赛季最佳青年球员'}]}),
  person('tang','唐星禾',23,'边锋','south-rong','rong-fc',null,0,0,{number:7,reputation:75,honors:[{year:317,text:'阳坝竞技赛季最佳球员'}]}),
  person('wen','温澜',26,'中场','tide','bay-fc','horizon',307,312,{number:14,reputation:74,honors:[{year:317,text:'裴渡联队队长'}]}),
];
// 为演示“历届”查询，保存联盟创立至最近一年的全部状元，而不是读取新闻文案。
export const drafts = [];
const otherCities = ['crown-city','haimen','iron-city','rong-city','isle-city','pine','silver-city','south-rong'];

for(let year=288;year<=317;year++) {
  const index=year-288;
  const id=year===317?'lin':year===298?'he':`historic-${year}`;
  const club=index%2?'sky':'silver-fc';
  const birthCity=id==='he'?'qinglu':otherCities[index%otherCities.length];
  const nameInfo=generateName({id,seed:'historical-draft',region:provinces.find(p=>p.id===cities.find(c=>c.id===birthCity).province).region});
  if(id!=='lin') {
    const selectedAge=id==='he'?22:19;
    const age=selectedAge+YEAR-year;
    const retired=age>=37;
    players.push(person(id,id==='he'?'何沅':nameInfo.name,age,index%3?'中场':'前锋',id==='he'?'qinglu':otherCities[index%otherCities.length],retired?null:club,index%2?'morning':'horizon',year-5,year,{...(id==='he'?{}:nameInfo),retired,lastClub:retired?club:undefined,reputation:id==='he'?91:67+(index%5)*4,number:9,skills:[['传球',79],['视野',81],['控球',78]],honors:[{year,text:'星冠联盟选秀状元'}],career:[{year,text:`以总第 1 顺位被${clubs.find(c=>c.id===club).name}选中`,type:'draft',target:String(year)},...(retired?[{year:year+15,text:'退役',type:'club',target:club}]:[])]}));
  }
  drafts.push({year,league:'closed',overall:1,round:1,player:id,club:id==='lin'?'sky':club,ageAtSelection:id==='he'?22:id==='lin'?18:19});
}
export const relationships = [{from:'father',to:'lin',forward:'儿子',reverse:'父亲'}];
export const byId = (list,id) => list.find(item=>item.id===id);
export const location = cityId => {const city=byId(cities,cityId);const province=byId(provinces,city.province);return {city,province,region:byId(regions,province.region)};};
export const playerLeague = player => player.club ? ({...byId(leagues,byId(clubs,player.club).league),tier:byId(leagues,byId(clubs,player.club).league).levels.find(d=>d.id===byId(clubs,player.club).division).tier}) : null;
export function inPlace(player,kind,id) {const loc=location(player.city);return loc[kind]?.id===id;}
export function hometownPlayers(subject,kind,id,mode='tier') {
  const league=playerLeague(subject);
  return players.filter(p=>p.id!==subject.id&&!p.retired&&inPlace(p,kind,id)&&(mode==='all'||(mode==='league'?league&&playerLeague(p)?.id===league.id:league&&playerLeague(p)?.tier===league.tier))).sort((a,b)=>b.reputation-a.reputation||a.id.localeCompare(b.id));
}
export const hometownDrafts=(kind,id)=>drafts.filter(d=>inPlace(byId(players,d.player),kind,id)).sort((a,b)=>a.year-b.year);
export const alumni=id=>players.filter(p=>p.training.some(t=>t.academy===id)).sort((a,b)=>b.reputation-a.reputation);
export function relatives(id) {return relationships.flatMap(r=>r.from===id?[{player:byId(players,r.to),label:r.forward}]:r.to===id?[{player:byId(players,r.from),label:r.reverse}]:[]);}
export function originStory(player) {const ds=hometownDrafts('province',location(player.city).province.id);const n=ds.findIndex(d=>d.player===player.id);return n>=0?`${location(player.city).province.name}第 ${n+1} 位状元`:player.honors[0]?.text||'暂无荣誉记录';}
