// Competition identities stay stable; ruleset 2 adopts the supplied league reference.
export const RULESET_VERSION=2;
export const METRO_SYSTEMS=['closed','crown-league','silver-league'];
export const isMetroLeague=id=>METRO_SYSTEMS.includes(id);
const tiebreak=['积分','净胜球','进球数','同分球队相互积分','相互净胜球','公平竞赛分','赛季抽签序号'];
const roster={max:25,homegrown:8,under21Exempt:true,bench:12,subs:5,windows:3,foreignLimit:null};
const discipline={yellowThreshold:5,yellowBan:1,redBan:1,reset:'每项赛事独立累计；赛季结束清除黄牌，未执行停赛顺延'};
const level=(id,name,teams,legs=2,tier=1)=>({id,name,teams,legs,tier,rounds:(teams%2?teams:teams-1)*legs,matches:teams*(teams-1)*legs/2,promotion:null,relegation:0});
const base=(id,name,region)=>({id,name,region,tier:1,provinces:null,calendar:{start:3,end:11,breakMonth:6,registration:['1—2 月','7 月']},points:{win:3,draw:1,loss:0},tiebreak,roster,discipline,cup:null,draft:null,globalSlots:0});
const draft={month:1,rounds:3,teams:36,picks:108,minAge:18,maxAge:23,eligibility:'本年度年满18—23岁、完成学院学业且未签职业合同；只可报名一次',order:'三联赛36队按上一季综合排名逆序；每轮各队一签，冠军最后选择。',rightsYears:1,contract:'被选中不自动签约；一年内未签约恢复自由身，落选者立即可自由签约'};
const closed=(id,name,region,teams,playoffs,globalSlots)=>({...base(id,name,region),system:'封闭联赛',description:`${teams}队单循环，前${playoffs}名参加季后赛；无升降级。`,levels:[level(id,name,teams,1)],playoffs:{kind:'championship',teams:playoffs,legs:1,pairs:Array.from({length:playoffs/2},(_,i)=>[i+1,playoffs-i]),home:'决赛中立场，其余由常规赛高排名球队主场',tied:'加时30分钟，仍平点球决胜',champion:'季后赛冠军为年度总冠军；常规赛第一另记常规赛冠军'},globalSlots,entry:'俱乐部青训、自由签约与转会；无自动升降级。'});
export const leagueSystems=[
 ...METRO_SYSTEMS.map((id,i)=>({...base(id,['大都会星冠联盟','冠都超级联赛','裴渡超级联赛'][i],'metro'),system:'平级封闭联赛',description:'12队主客场双循环；前四进入星冠季后赛，无升降级。',levels:[level(id,['星冠常规赛','冠都超级联赛','裴渡超级联赛'][i],12)],playoffs:null,championship:'metro-champions',globalSlots:i===0?6:0,draft,entry:'三个联赛平级，共36支会员俱乐部；共同参与学院选秀。'})),
 {...closed('sichuan-league','新四川超级联赛','sichuan',36,8,4),finalName:'新四川季后赛'},
 {...closed('lima-league','利玛超级联赛','lima',40,16,4),finalName:'利玛季后赛'},
 {...base('liberlin-league','利柏林超级联赛','liberlin'),system:'升降级体系',description:'超级联赛20队、甲级联赛20队、地区联赛18队、地方联赛47队。',globalSlots:2,
  levels:[level('liberlin-league','利柏林超级联赛',20),level('liberlin-league-2','利柏林甲级联赛',20,2,2),level('liberlin-league-3','利柏林地区联赛',18,2,3),level('liberlin-league-4','利柏林地方联赛',47,1,4)].map((d,i)=>({...d,promotion:i?{automatic:i===3?2:3,places:i===3?2:3,playoff:[]}:null,relegation:i===0||i===1?3:i===2?2:0})),
  playoffs:null,entry:'俱乐部青训、自由签约与转会；前三层双循环、地方联赛单循环，地方联赛前二与地区联赛末二交换。'},
];
export const METRO_CHAMPIONS={id:'metro-champions',name:'星冠季后赛',trophy:'星冠杯',teams:12,advance:4,rounds:8,matches:48,knockoutMatches:3,qualification:'三个平级联赛各取常规赛前四；争冠组每队对阵另外两联赛的8队，四强淘汰争夺星冠杯。'};
export const GLOBAL_CUP={id:'global-cup',name:'全球冠军杯',teams:16,groups:4,groupSize:4,groupLegs:1,advance:2,groupMatches:24,knockoutMatches:7,month:6,interval:4,firstYear:318,qualification:'四年一届；星冠季后赛前六、新四川四队、利玛四队、利柏林前二。首届使用创始资格名单。',draw:'四档抽签，每组每档一队，同赛区最多两队。',final:'八强起单场淘汰，加时后点球，全部中立场。',tiebreak};
export const isGlobalCupYear=year=>(year-GLOBAL_CUP.firstYear)%GLOBAL_CUP.interval===0;
export const getSystem=id=>leagueSystems.find(l=>l.id===id);
export const getDivision=id=>leagueSystems.flatMap(s=>s.levels).find(l=>l.id===id);
export const championshipName=id=>id==='metro-champions'?METRO_CHAMPIONS.name:id==='global-cup'?GLOBAL_CUP.name:leagueSystems.find(s=>`${s.id}-playoffs`===id)?.finalName||id;
