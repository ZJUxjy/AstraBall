// A common bid factor raises the seller's fee and the player's wage together.
// Every ceiling is funded before it enters the auction. With no rival, the
// opening terms clear; extra cash alone is not a reason to pay a premium.
export function clearBids(bids,{fee,wage}){
 const ordered=bids.filter(b=>Number.isFinite(b.ceiling)&&b.ceiling>=1).sort((a,b)=>b.ceiling-a.ceiling||a.club.localeCompare(b.club));
 if(!ordered.length)return null;
 const winner=ordered[0],runner=ordered[1],factor=runner?Math.min(winner.ceiling,runner.ceiling+.02):1;
 return {club:winner.club,fee:Math.round(fee*factor),weeklyWage:Math.max(winner.minimumWage,Math.floor(wage*factor/7)*7),factor,bidders:ordered.map(b=>({club:b.club,ceiling:b.ceiling})),runnerUp:runner?.club||null};
}

export function fundedCeiling(upper,affordable){
 if(!affordable(1))return 0;
 let low=1,high=Math.max(1,upper);
 for(let i=0;i<28;i++){const mid=(low+high)/2;if(affordable(mid))low=mid;else high=mid;}
 return Math.floor(low*10000)/10000;
}
