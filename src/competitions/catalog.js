// Fictional competition rules. IDs of the original six top flights are stable.
const open = (id,name,region,counts,globalSlots,provinces=null) => ({
  id,name,region,tier:1,system:'升降级体系',description:`三级联赛，主客场双循环；每级之间升三降三。`,
  provinces,globalSlots,calendar:{start:3,end:11,breakMonth:6,registration:['1—2 月','7 月']},
  points:{win:3,draw:1,loss:0},tiebreak:['积分','净胜球','进球数','同分球队相互积分','相互净胜球','公平竞赛分','赛季抽签序号'],
  levels:counts.map((teams,i)=>({id:i===0?id:`${id}-${i+1}`,tier:i+1,name:i===0?name:name.replace('超级联赛',i===1?'甲级联赛':'地区联赛'),teams,legs:2,rounds:(teams-1)*2,matches:teams*(teams-1),promotion:i?{automatic:2,playoff:[3,4,5,6],places:3}:null,relegation:i<counts.length-1?3:0})),
  playoffs:{kind:'promotion',legs:1,pairs:[[3,6],[4,5]],home:'联赛排名较高者主场；决赛同理',tied:'加时 30 分钟，仍平点球决胜'},
  cup:{id:`${id}-cup`,name:name.replace('超级联赛','足协杯'),eligibility:'本体系全部三级球队',legs:1,draw:'按赛季种子随机抽签；首轮补齐至 2 的幂，空签轮空',final:'中立场单场决赛',tied:'加时后点球，无客场进球规则'},
  roster:{max:25,homegrown:8,under21Exempt:true,bench:12,subs:5,windows:3,foreignLimit:null},
  discipline:{yellowThreshold:5,yellowBan:1,redBan:1,reset:'每项赛事独立累计；赛季结束清除黄牌，未执行停赛顺延'},
  entry:'俱乐部青训、自由签约与转会；本体系不设选秀。底层无自动降级，新俱乐部须经联赛扩容或退出席位准入。',
});
export const leagueSystems = [
  {id:'closed',name:'大都会星冠联盟',region:'metro',tier:1,system:'封闭联盟',description:'16 队常规赛与八强季后赛；皇家学院选秀，无升降级。',globalSlots:8,
   provinces:null,calendar:{start:3,end:11,breakMonth:6,registration:['1—2 月','7 月']},points:{win:3,draw:1,loss:0},
   tiebreak:['积分','净胜球','进球数','同分球队相互积分','相互净胜球','公平竞赛分','赛季抽签序号'],
   levels:[{id:'closed',tier:1,name:'星冠常规赛',teams:16,legs:2,rounds:30,matches:240,promotion:null,relegation:0}],
   playoffs:{kind:'championship',teams:8,legs:1,pairs:[[1,8],[4,5],[2,7],[3,6]],home:'八强与半决赛：常规赛排名较高者主场；决赛：中立场',tied:'加时 30 分钟，仍平点球决胜',champion:'季后赛冠军为联盟总冠军；常规赛第一另获常规赛冠军'},
   cup:null,roster:{max:25,homegrown:8,under21Exempt:true,bench:12,subs:5,windows:3,foreignLimit:null},
   discipline:{yellowThreshold:5,yellowBan:1,redBan:1,reset:'常规赛和季后赛独立累计；未执行停赛顺延'},
   draft:{month:1,rounds:3,teams:16,picks:48,minAge:18,maxAge:23,eligibility:'本年度年满 18—23 岁、已完成皇家体育学院学业、未曾被选中且未签职业合同；只可报名一次',order:'第一轮：未进季后赛八队按逆战绩进行前三签加权抽签；其余签按逆战绩。第二、三轮全部逆战绩。',lotteryWeights:[24,20,16,12,10,8,6,4],rightsYears:1,contract:'被选中不自动签约；一年内未签约恢复自由身，落选者立即可自由签约'},
   entry:'16 家会员俱乐部，无自动升降级；通过学院选秀、自由签约及转会补充球员。会员变更须联盟批准。'},
  open('crown-league','冠都超级联赛','metro',[12,12,16],4,['crown','skylake','whitepeak']),
  open('silver-league','裴渡超级联赛','metro',[12,12,16],4,['silver','aurora','outerring']),
  open('lima-league','利玛超级联赛','lima',[16,16,20],5),
  open('liberlin-league','利柏林超级联赛','liberlin',[18,18,20],5),
  open('sichuan-league','新四川超级联赛','sichuan',[20,20,24],6),
];
export const GLOBAL_CUP={id:'global-cup',name:'全球冠军杯',teams:32,groups:8,groupSize:4,groupLegs:1,advance:2,groupMatches:48,knockoutMatches:15,month:6,qualification:'上一赛季资格，本赛季六月集中举办。星冠按常规赛排名，其余按顶级联赛排名；地区杯不额外占名额。',draw:'按上赛季联赛名次、体系 ID 排序分四档，每组每档一队；同体系每组最多两队。',final:'十六强起单场淘汰、加时及点球；无三四名赛，全部中立场。',tiebreak:['积分','净胜球','进球数','相互积分','相互净胜球','公平竞赛分','抽签序号']};
export const getSystem=id=>leagueSystems.find(l=>l.id===id);
export const getDivision=id=>leagueSystems.flatMap(s=>s.levels).find(l=>l.id===id);
