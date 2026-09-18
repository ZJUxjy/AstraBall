// Relative purchasing power is a world-building assumption, not measured GDP.
export const REGIONAL_PURCHASING_POWER={metro:3.2,lima:1.15,liberlin:1,sichuan:.85};
export function cityMarket(city,province){
 const industry=/金融|科技|科研|航天|轨道港/.test(city.role)?1.25:/海运|贸易|商贸|自动化|机器人/.test(city.role)?1.15:/农业|林业|渔业/.test(city.role)?.85:1;
 const centrality=city.isRegionalCapital?1.2:city.isCapital?1.08:1;
 const purchasingPower=REGIONAL_PURCHASING_POWER[province.region]*industry*centrality;
 return {populationUnits:city.populationUnits,purchasingPower,demand:Math.sqrt(city.populationUnits)*purchasingPower};
}
