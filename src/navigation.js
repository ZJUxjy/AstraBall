// One navigation model for the shell; feature views never own global navigation.
export function navigationModel(path='manager', {clubId='sky', watchCount=0}={}) {
 const [section, , detail]=path.replace(/^#/, '').split('/');
 const groups=[
  {id:'club',label:'俱乐部',items:[
   {id:'manager',label:'经理首页',path:'manager'},
   {id:'club',label:'俱乐部总览',path:`squad/${clubId}/overview`},
   {id:'squad',label:'球队阵容',path:`squad/${clubId}`},
   {id:'youth',label:'青训中心',path:'youth'},
   {id:'market',label:'转会与合同',path:'market'},
   {id:'finance',label:'俱乐部财政',path:'finance'},
  ]},
  {id:'competition',label:'赛事',items:[
   {id:'match',label:'比赛中心',path:'match'},
   {id:'leagues',label:'赛事与规则',path:'leagues/all'},
   {id:'history',label:'历史记录',path:'history'},
  ]},
  {id:'world',label:'世界资料',items:[
   {id:'world',label:'世界图鉴',path:'world/all'},
   {id:'ranking',label:'俱乐部排名',path:'ranking'},
   {id:'economy',label:'地方足球与经济',path:'economy'},
   {id:'watch',label:'关注名单',path:'watch',count:watchCount},
  ]},
 ];
 const active=section==='squad'&&detail==='overview'?'club':section==='friendly'?'squad':section==='coach'?'match':section;
 const group=groups.find(g=>g.items.some(i=>i.id===active));
 const item=group?.items.find(i=>i.id===active);
 const title=section==='player'?'球员档案':section==='friendly'?'友谊赛战术':section==='coach'?'执教比赛':item?.label||'经理首页';
 return {groups,active:item?.id||null,group:group?.label||'世界资料',title};
}
