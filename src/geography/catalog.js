// 固定世界设定。坐标为 1440 × 800 的等距经纬投影；人口单位为亿。
export const WORLD = {
  id: 'astra', name: '阿斯特拉', seed: 3180916, version: 3,
  width: 1440, height: 800, radiusKm: 12500, population: 500,
};

export const REGION_CATALOG = [
  { id: 'metro', name: '大都会区', en: 'METROPOLIS', population: 10, color: '#d5bc7d', capital: 'crown-city',
    text: '经济最发达。三个平级职业联赛共同角逐星冠季后赛。', terrain: '中央高原 · 温带海湾', culture: '皇家学院 / 商业联盟 / 地方俱乐部',
  },
  { id: 'lima', name: '利玛区', en: 'LIMA', population: 155, color: '#82b6b6', capital: 'haimen',
    text: '西部海岸与群岛大区。港口贸易、海洋工程和跨城足球网络发达。', terrain: '海岸平原 · 季风群岛', culture: '港口俱乐部 / 海运网络 / 街区青训',
  },
  { id: 'liberlin', name: '利柏林区', en: 'LIBERLIN', population: 165, color: '#b7a395', capital: 'iron-city',
    text: '东部大陆的工业大区。铁路连接矿业、制造业与港口城市，俱乐部青训历史较长。', terrain: '北部针叶林 · 工业平原 · 东岸港口', culture: '工业俱乐部 / 铁路城市 / 名宿青训',
  },
  { id: 'sichuan', name: '新四川区', en: 'NEW SICHUAN', population: 170, color: '#a4ba83', capital: 'rong-city',
    text: '南部盆地与山地大区。河网连接人口密集的城市群，球员主要通过地方青训进入职业赛事。', terrain: '西部山脉 · 中央盆地 · 南部河口', culture: '省际联赛 / 城市青训 / 同乡网络',
  },
];

// id / 名称 / 大区 / 人口权重 / 地形 / 产业 / 三座重要城市（首项为省会）。
const province = (id, name, region, weight, terrain, economy, cityRows) => ({
  id, name, region, weight, terrain, economy,
  cityRows: cityRows.map(([cityId, cityName, role]) => ({ id: cityId, name: cityName, role })),
});
export const PROVINCE_CATALOG = [
  province('crown','密承省','metro',25,'高原台地','行政、金融', [['crown-city','冠都','行政中心'],['east-crown','槐坊','教育中心'],['crown-north','尚源','金融中心']]),
  province('silver','昝津省','metro',23,'海湾平原','航运、总部经济', [['silver-city','裴渡','海运枢纽'],['whiteharbor','韩陂','金融中心'],['baygarden','吕仓','居住中心']]),
  province('skylake','沈渠省','metro',15,'高原湖区','科研、精密制造', [['skylake-city','柏寺','科研中心'],['mirrorwater','渠沿','精密制造'],['bluebank','淀口','能源中心']]),
  province('whitepeak','嵇里省','metro',9,'山前丘陵','装备、清洁能源', [['whitepeak-city','木井','装备制造'],['snowpass','石坂','铁路枢纽'],['cedar-city','桑坞','林业中心']]),
  province('aurora','岑阴省','metro',17,'滨海台地','航天、通信', [['aurora-city','顾坊','航天中心'],['starport','长矶','轨道港'],['dawnshore','柘梁','通信中心']]),
  province('outerring','杜集省','metro',11,'河谷平原','物流、食品科技', [['outerring-city','周渡','物流枢纽'],['southcourt','沈堰','食品科技'],['greenfield','吕屯','农业中心']]),

  province('coast','笪陵省','lima',20,'西岸河口','港口、船舶', [['haimen','栾门','海运枢纽'],['tide','蛏塘','船舶制造'],['oldquay','旧埠','商贸中心']]),
  province('isles','宓寮省','lima',9,'近海群岛','海洋工程、渔业', [['isle-city','网寮','群岛首府'],['deepblue','狗沙','海洋工程'],['reefharbor','乌洲','渔业中心']]),
  province('tidewater','麹门省','lima',17,'北部海岸','海运、盐化工', [['tidewater-city','勒口','海运枢纽'],['northquay','沙尾','盐化工'],['wavegate','旧炮','商贸中心']]),
  province('ember','郜里省','lima',12,'火山丘陵','地热、矿产', [['ember-city','灰灶','地热能源'],['basalt','黑石','矿业中心'],['redharbor','坑尾','矿产出口']]),
  province('delta','茭田省','lima',22,'河口冲积平原','农业、食品加工', [['delta-city','勒涌','农业中心'],['reedcity','茭堤','食品加工'],['canalcity','横围','内河港']]),
  province('windsea','罗门省','lima',13,'海岸风带','风能、航运', [['windsea-city','桅口','能源中心'],['galeport','乌泥','海运枢纽'],['sailbay','外坡','装备制造']]),
  province('saltbay','板塘省','lima',15,'盐湖与沿海平原','化工、储能', [['saltbay-city','泥湾','化工中心'],['saltlake','柯田','矿业中心'],['whitebeach','白灶','储能制造']]),
  province('westcape','綦门省','lima',12,'滨海丘陵','造船、机械', [['westcape-city','钉洲','造船中心'],['westanchor','缆口','机械制造'],['longshore','坡尾','海运枢纽']]),
  province('pearl','外沙省','lima',14,'南部海湾','海洋生物、贸易', [['pearl-city','狗眠','贸易中心'],['southreef','筻湾','海洋科研'],['coralbay','石角','渔业中心']]),
  province('estuary','栾溪省','lima',21,'内陆河谷','物流、轻工业', [['estuary-city','石埠','内河枢纽'],['tworivers','郜步','轻工业'],['stonequay','渡头','商贸中心']]),

  province('iron','耿甸省','liberlin',23,'中央工业平原','钢铁、重型装备', [['iron-city','铁原','行政与工业中心'],['furnace','炉山','钢铁中心'],['ironbridge','站南','铁路枢纽']]),
  province('north','闵甸省','liberlin',13,'北部针叶林','林业、纸业', [['pine','贺屯','林业中心'],['coldpine','老站','材料制造'],['forestgate','西沟','铁路枢纽']]),
  province('copper','翟窑省','liberlin',15,'西部山地','铜矿、电气制造', [['copper-city','倪庄','矿业中心'],['coppercreek','窑上','电气制造'],['orepass','坡底','运输枢纽']]),
  province('frost','卞甸省','liberlin',11,'寒温带平原','能源、储运', [['frost-city','翟站','能源中心'],['northlight','仓屯','储运枢纽'],['iceford','西厂','装备制造']]),
  province('redvalley','滕桥省','liberlin',18,'西南河谷','机械、轨道交通', [['redvalley-city','车坊','机械制造'],['redford','闸口','轨道交通'],['valleygate','南厂','物流中心']]),
  province('eastmarch','贺口省','liberlin',22,'东岸港口平原','出口制造、海运', [['eastmarch-city','大嘴','海运枢纽'],['eastdock','坞头','造船中心'],['eastwatch','栈西','出口制造']]),
  province('lakework','倪泊省','liberlin',18,'湖泊平原','化工、自动化', [['lakework-city','水头','自动化制造'],['blueforge','卞屯','化工中心'],['lakeport','老窑','内河港']]),
  province('granite','阎堡省','liberlin',14,'东北丘陵','石材、精密机械', [['granite-city','岗子','机械制造'],['stonehill','炮台','矿业中心'],['highfort','翟屯','材料中心']]),
  province('steppe','敖甸省','liberlin',16,'南部平原','农业、农机', [['steppe-city','卞集','农业中心'],['southrail','大车','农机制造'],['wheatfield','河沿','粮食储运']]),
  province('newforge','闵厂省','liberlin',15,'东南沿海','新材料、机器人', [['newforge-city','新屯','新材料中心'],['alloyport','港东','出口枢纽'],['machinebay','外岛','机器人制造']]),

  province('yunmin','冉坝省','sichuan',21,'西部山前河谷','水电、装备制造', [['jiangqiao','江桥','河运枢纽'],['qinglu','廖场','装备制造'],['minzhou','牟沱','水电中心']]),
  province('rong','蒲溪省','sichuan',29,'中央盆地','行政、科技、服务业', [['rong-city','阳坝','行政与科技中心'],['south-rong','封场','内河港'],['rong-east','勾滩','科研中心']]),
  province('jialing','牟江省','sichuan',24,'东部河谷','化工、商贸', [['jialing-city','向城','商贸中心'],['rivercross','蹇渡','内河枢纽'],['eastford','阳滩','化工中心']]),
  province('highshu','向坪省','sichuan',9,'西部高山','矿产、高原农业', [['highshu-city','冉坪','高原中心'],['cloudpass','廖沟','山地交通'],['snowriver','封梁','矿业中心']]),
  province('southbasin','勾坝省','sichuan',20,'南部盆地','农业、食品加工', [['southbasin-city','蓝坝','农业中心'],['ricebank','蒲场','食品加工'],['warmriver','牟堰','商贸中心']]),
  province('bamboo','覃溪省','sichuan',15,'湿润丘陵','林业、生物材料', [['bamboo-city','蹇场','林业中心'],['bambooriver','廖溪','生物材料'],['greenridge','冉林','食品加工']]),
  province('longmen','封州省','sichuan',14,'北部山前地带','交通、机械', [['longmen-city','勾口','铁路枢纽'],['northpass','阳坪','装备制造'],['ridgecity','冉铺','能源中心']]),
  province('minsource','蒲阴省','sichuan',10,'高原与河源','水源保护、水电', [['minsource-city','冉井','水电中心'],['springcity','牟坊','高原农业'],['sourceford','封渡','交通中心']]),
  province('eastshu','阳口省','sichuan',18,'东岸丘陵','海运、加工贸易', [['eastshu-city','覃港','海运枢纽'],['shuharbor','向湾','加工贸易'],['eastridge','封矶','制造中心']]),
  province('redsoil','廖坡省','sichuan',10,'红土丘陵','农业、陶瓷', [['redsoil-city','牟窑','农业中心'],['redclay','蓝坡','陶瓷中心'],['fruitgrove','覃坝','食品加工']]),
];

