// Roadside planting is illustrative, not a surveyed tree inventory.
function inside([x,z], polygon) {
  let result=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [ax,az]=polygon[i],[bx,bz]=polygon[j];
    if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)result=!result;
  }
  return result;
}
function distance(p,a,b){
  const dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
  const t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/length)):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);
}
function nearLine(p,points,radius){return points.some((v,i)=>i&&distance(p,points[i-1],v)<radius)}
const halfWidth=road=>['footway','path','steps','pedestrian','cycleway'].includes(road.type)?1.25:road.type==='service'?2.75:4.5;
// Avenues are planted first, then the wider walkways, so the limit is spent on
// the routes that actually shape the campus rather than on short back paths.
const PLANTED=[
  {match:road=>!['footway','path','steps','pedestrian','cycleway'].includes(road.type),spacing:20,gap:4.0},
  {match:road=>road.type==='pedestrian'||road.type==='footway',spacing:26,gap:3.4},
];
export function roadsideTrees(data,limit=420){
  const result=[];
  for(const pass of PLANTED)for(const road of data.roads){
    if(!pass.match(road))continue;
    for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
      if(length<pass.spacing*.6)continue;
      for(let along=10;along<length;along+=pass.spacing){
        for(const side of [-1,1]){
          const offset=(halfWidth(road)+pass.gap)*side;
          const p=[a[0]+dx*along/length-dz/length*offset,a[1]+dz*along/length+dx/length*offset];
          if(!data.boundary.some(poly=>inside(p,poly)))continue;
          if(data.buildings.some(b=>inside(p,b.footprint)||nearLine(p,b.footprint,5)))continue;
          if(data.roads.some(r=>nearLine(p,r.points,halfWidth(r)+2.7)))continue;
          if(result.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<11))continue;
          result.push(p);if(result.length>=limit)return result;
        }
      }
    }
  }
  return result;
}
