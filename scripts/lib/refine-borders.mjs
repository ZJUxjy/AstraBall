// Refine the shared administrative graph once, then reuse each edge in both
// directions. Coastlines and junctions stay fixed; this is cartographic detail,
// not additional surveyed terrain or a new assignment of the source cells.
export function refineBorders(provinceShapes, regionShapes) {
  const key=p=>p.join(','), edgeKey=(a,b)=>a<b?`${a}|${b}`:`${b}|${a}`;
  const nodes=new Map(),edges=new Map();
  for(const polygons of Object.values(provinceShapes))for(const ring of polygons)for(let i=0;i<ring.length;i++){
    const p=ring[i],q=ring[(i+1)%ring.length],a=key(p),b=key(q),id=edgeKey(a,b);
    if(!nodes.has(a))nodes.set(a,{point:p,neighbors:new Set()});
    if(!nodes.has(b))nodes.set(b,{point:q,neighbors:new Set()});
    nodes.get(a).neighbors.add(b);nodes.get(b).neighbors.add(a);
    if(edges.has(id))edges.get(id).count++;
    else edges.set(id,{a:a<b?a:b,b:a<b?b:a,count:1});
  }
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const hash=text=>{let n=2166136261;for(const c of text)n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0)/4294967295*2-1;};
  const paths=new Map();
  for(const [id,edge] of edges){
    const {a,b}=edge,p=nodes.get(a).point,q=nodes.get(b).point;
    if(edge.count===1){paths.set(id,[p,q]);continue;}
    const length=distance(p,q);
    const control=(from,to)=>{
      const node=nodes.get(from),start=node.point,end=nodes.get(to).point;
      const other=node.neighbors.size===2?[...node.neighbors].find(n=>n!==to):null;
      const previous=other?nodes.get(other).point:start;
      const dx=end[0]-previous[0],dy=end[1]-previous[1],norm=Math.hypot(dx,dy)||1;
      const handle=Math.min(length,other?distance(start,previous):length)*.24;
      return [start[0]+dx/norm*handle,start[1]+dy/norm*handle];
    };
    const c=control(a,b),d=control(b,a),steps=Math.max(8,Math.ceil(length/.5));
    const normal=[-(q[1]-p[1])/length,(q[0]-p[0])/length];
    const bend=hash(id),detail=hash(id+'detail');
    const points=[p];
    for(let j=1;j<steps;j++){
      const t=j/steps,s=1-t;
      // Smooth, non-periodic-looking bends, tapering to zero at shared junctions.
      const offset=Math.sin(Math.PI*t)**2*length*.065*(bend+detail*.4*Math.sin(3*Math.PI*t));
      points.push([0,1].map(k=>Math.round((s**3*p[k]+3*s*s*t*c[k]+3*s*t*t*d[k]+t**3*q[k]+normal[k]*offset)*10000)/10000));
    }
    points.push(q);paths.set(id,points);
  }
  const refine=shapes=>Object.fromEntries(Object.entries(shapes).map(([id,polygons])=>[id,polygons.map(ring=>ring.flatMap((p,i)=>{
    const a=key(p),b=key(ring[(i+1)%ring.length]),path=paths.get(edgeKey(a,b));
    if(!path)throw new Error(`Missing shared border: ${a}, ${b}`);
    return (a<b?path:[...path].reverse()).slice(0,-1);
  }))]));
  return {provinceShapes:refine(provinceShapes),regionShapes:refine(regionShapes)};
}
