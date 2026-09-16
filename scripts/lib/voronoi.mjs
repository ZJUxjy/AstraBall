// Adapted from Azgaar/Fantasy-Map-Generator src/generators/voronoi.ts and pack-generator.ts.
// Copyright 2017-2024 Max Haniyeu. MIT license: ../../third_party/azgaar/LICENSE.
import Delaunator from 'delaunator';
export function voronoi(points,boundary){
  const all=points.concat(boundary),d=Delaunator.from(all),cells=points.map(()=>({v:[],c:[],b:false})),vertices=[];
  const next=e=>e%3===2?e-2:e+1;
  for(let e=0;e<d.triangles.length;e++){
    const p=d.triangles[next(e)];
    if(p<points.length&&!cells[p].v.length){
      const edges=[];let incoming=e;
      do{edges.push(incoming);incoming=d.halfedges[next(incoming)];}while(incoming!==-1&&incoming!==e&&edges.length<20);
      cells[p].v=edges.map(e=>Math.floor(e/3));
      cells[p].c=edges.map(e=>d.triangles[e]).filter(i=>i<points.length);
      cells[p].b=edges.length>cells[p].c.length;
    }
    const t=Math.floor(e/3);if(vertices[t])continue;
    const [a,b,c]=[0,1,2].map(i=>all[d.triangles[t*3+i]]);
    const ad=a[0]**2+a[1]**2,bd=b[0]**2+b[1]**2,cd=c[0]**2+c[1]**2;
    const det=2*(a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1]));
    vertices[t]=[(ad*(b[1]-c[1])+bd*(c[1]-a[1])+cd*(a[1]-b[1]))/det,(ad*(c[0]-b[0])+bd*(a[0]-c[0])+cd*(b[0]-a[0]))/det];
  }
  return {cells,vertices};
}
export function rebuildPack(source){
  const {grid,h,t,f}=source,original=voronoi(grid.points,grid.boundary),points=[],heights=[];
  const add=(i,p)=>{points.push(p);heights.push(h[i]);};
  for(let i=0;i<grid.points.length;i++){
    if(h[i]<20&&t[i]!==-1&&t[i]!==-2)continue;
    if(t[i]===-2&&(i%4===0||grid.features[f[i]].type==='lake'))continue;
    add(i,grid.points[i]);
    if((t[i]===1||t[i]===-1)&&!original.cells[i].b){
      for(const j of original.cells[i].c){
        if(i>j||t[j]!==t[i])continue;
        const a=grid.points[i],b=grid.points[j];
        if((a[0]-b[0])**2+(a[1]-b[1])**2<grid.spacing**2)continue;
        add(i,[(Math.round((a[0]+b[0])*5))/10,(Math.round((a[1]+b[1])*5))/10]);
      }
    }
  }
  return {...voronoi(points,grid.boundary),points,heights};
}
