import * as THREE from 'three';

// Geometry in each building's local survey frame: X along the long facade,
// +Z toward the campus courtyard. Dimensions beyond the mapped footprint are
// photo-derived estimates, not survey measurements. Keep the actual voids open.
const concrete = new THREE.MeshStandardMaterial({color:'#c9c7bb',roughness:.88});
const brick = new THREE.MeshStandardMaterial({color:'#886b53',roughness:.95});
const glass = new THREE.MeshStandardMaterial({color:'#648891',roughness:.3,metalness:.28});
const darkGlass = new THREE.MeshStandardMaterial({color:'#314d54',roughness:.32,metalness:.25});
const metal = new THREE.MeshStandardMaterial({color:'#a8b7b8',roughness:.48,metalness:.35});
const railMaterial = new THREE.MeshStandardMaterial({color:'#394647',roughness:.6});
const roofMaterial = new THREE.MeshStandardMaterial({color:'#d4d5cf',roughness:.85});

function builder(b) {
  const root=new THREE.Group();root.name=`building-${b.number}-structure`;
  root.position.set(b.box.center[0],0,b.box.center[1]);root.rotation.y=-b.box.angle;
  const unit=new THREE.BoxGeometry(1,1,1), batches=new Map(), picks=[];
  function box(name,x,y,z,w,h,d,mat=concrete,angle=0,pick=false) {
    if(pick){const mesh=new THREE.Mesh(unit,mat);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.rotation.y=angle;mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.id=b.id;root.add(mesh);picks.push(mesh);return mesh;}
    if(!batches.has(mat))batches.set(mat,[]);
    const m=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),angle),new THREE.Vector3(w,h,d));
    batches.get(mat).push(m);
  }
  function polygon(name,points,bottom,height,mat) {
    const shape=new THREE.Shape(points.map(([x,z])=>new THREE.Vector2(x,-z)));
    const geo=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false});geo.rotateX(-Math.PI/2);
    const m=new THREE.Mesh(geo,mat);m.position.y=bottom;m.name=name;m.castShadow=true;m.receiveShadow=true;m.userData.id=b.id;root.add(m);picks.push(m);return m;
  }
  function beam(name,a,c,width,mat=concrete) {
    const delta=new THREE.Vector3(...c).sub(new THREE.Vector3(...a));
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(width/2,width/2,delta.length(),8),mat);
    mesh.position.copy(new THREE.Vector3(...a).add(new THREE.Vector3(...c)).multiplyScalar(.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());mesh.name=name;root.add(mesh);
  }
  function finish(height,parts){
    for(const [mat,items] of batches){const m=new THREE.InstancedMesh(unit,mat,items.length);items.forEach((v,i)=>m.setMatrixAt(i,v));m.castShadow=true;m.receiveShadow=true;root.add(m);}
    root.userData={height,parts};return {group:root,picks,height};
  }
  return {root,box,polygon,beam,finish};
}

function localFootprint(b){const c=Math.cos(b.box.angle),s=Math.sin(b.box.angle);return b.footprint.slice(0,-1).map(([x,z])=>[(x-b.box.center[0])*c+(z-b.box.center[1])*s,-(x-b.box.center[0])*s+(z-b.box.center[1])*c]);}
function inset(points,factor){return points.map(([x,z])=>[x*factor,z*factor]);}
function perimeter(points,visit){for(let i=0;i<points.length;i++){const a=points[i],c=points[(i+1)%points.length],len=Math.hypot(c[0]-a[0],c[1]-a[1]);visit(a,c,len,-Math.atan2(c[1]-a[1],c[0]-a[0]),i);}}

function shinyang(b){
  const m=builder(b),{box,polygon,beam}=m;
  const guide=localFootprint(b);
  // Sparse map vertices describe the bowed courtyard facade. Interpolate this
  // frontage only; the side and rear survey edges stay straight.
  const curve=new THREE.CatmullRomCurve3(guide.slice(0,5).map(([x,z])=>new THREE.Vector3(x,0,z)),false,'centripetal');
  const outline=[...curve.getPoints(24).map(v=>[v.x,v.z]),...guide.slice(5)];
  // The map's articulated courtyard frontage is retained, rather than replaced
  // by the enclosing rectangle. Upper cladding projects past the ground glazing.
  const ground=inset(outline,.87), upper=outline, clerestory=inset(outline,.92);
  const groundTop=3.2,screenTop=15.0,roofBottom=17.0;
  polygon('ground-floor-recessed-glazing',ground,.3,groundTop-.3,darkGlass);
  polygon('upper-curtain-wall-volume',upper,groundTop,screenTop-groundTop,glass);
  polygon('setback-roof-level',clerestory,screenTop,roofBottom-screenTop,darkGlass);
  polygon('projecting-roof-soffit',inset(outline,1.07),roofBottom,.32,concrete);
  polygon('roof-edge-cap',inset(outline,1.075),roofBottom+.32,.18,roofMaterial);
  polygon('projecting-floor-edge',upper,groundTop-.16,.22,metal);
  const palette=['#92b0b3','#aebfb9','#84a6ae','#b9c6c1','#4d8797','#697e81','#559cad','#c1cac1'];
  const panelMaterials=palette.map(color=>new THREE.MeshStandardMaterial({color,roughness:.4,metalness:.18}));
  perimeter(upper,(a,c,len,angle,edge)=>{
    const dx=c[0]-a[0],dz=c[1]-a[1];
    const cols=Math.max(1,Math.round(len/1.55)),rows=9;
    for(let col=0;col<cols;col++){
      const t=(col+.5)/cols,x=a[0]+dx*t,z=a[1]+dz*t;
      box('curtain-wall-mullion',a[0]+dx*col/cols,(groundTop+screenTop)/2,a[1]+dz*col/cols,.065,screenTop-groundTop,.16,metal,angle);
      for(let row=0;row<rows;row++){
        const h=(screenTop-groundTop)/rows,y=groundTop+(row+.5)*h;
        const index=((Math.imul((col+1)*173+(row+1)*379+(edge+1)*701,2654435761)>>>0)%palette.length);
        box('individual-glass-panel',x,y,z,len/cols-.06,h-.06,.13,panelMaterials[index],angle);
      }
    }
    for(let row=0;row<=rows;row++)box('curtain-wall-transom',(a[0]+c[0])/2,groundTop+(screenTop-groundTop)*row/rows,(a[1]+c[1])/2,len,.055,.18,metal,angle);
  });
  perimeter(ground,(a,c,len,angle)=>{
    const n=Math.max(1,Math.round(len/3));
    for(let j=0;j<=n;j++)box('recessed-ground-frame',a[0]+(c[0]-a[0])*j/n,1.7,a[1]+(c[1]-a[1])*j/n,.1,2.8,.16,metal,angle);
    box('ground-window-transom',(a[0]+c[0])/2,1,(a[1]+c[1])/2,len,.09,.16,metal,angle);
  });
  perimeter(clerestory,(a,c,len,angle)=>{
    const n=Math.max(1,Math.round(len/3.5));
    for(let j=0;j<=n;j++)box('roof-level-frame',a[0]+(c[0]-a[0])*j/n,16,a[1]+(c[1]-a[1])*j/n,.12,2,.2,metal,angle);
  });
  // Round exposed supports under the projecting cladding, seen in the official photo.
  for(let i=0;i<=8;i++){const p=curve.getPoint(i/8);beam('round-ground-column',[p.x*.95,.2,p.z*.95],[p.x*.95,groundTop,p.z*.95],.55);}
  for(let i=0;i<=16;i++){const p=curve.getPoint(i/16);box('exposed-roof-rib',p.x,roofBottom-.12,p.z+.15,.11,.22,2.2,metal);}
  // Shallow entrance landing follows the courtyard edge, not a raised solid plinth.
  const a=guide[2],c=guide[4],length=Math.hypot(c[0]-a[0],c[1]-a[1]),angle=-Math.atan2(c[1]-a[1],c[0]-a[0]);
  for(let i=0;i<3;i++)box('entry-step',(a[0]+c[0])/2,.07+i*.1,(a[1]+c[1])/2+1.1-i*.25,length,.14,1.8-i*.4,concrete,angle);
  perimeter(inset(outline,1.015),(a,c,len,angle)=>{
    box('roof-guardrail',(a[0]+c[0])/2,18.05,(a[1]+c[1])/2,len,.055,.055,metal,angle);
    const n=Math.ceil(len/3);for(let j=0;j<n;j++)box('roof-rail-post',a[0]+(c[0]-a[0])*j/n,17.78,a[1]+(c[1]-a[1])*j/n,.045,.55,.045,metal);
  });
  return m.finish(18.08,['recessed-ground-floor','projecting-upper-volume','setback-roof-level','overhanging-roof','round-columns']);
}

function humanities14(b){
  const m=builder(b),{box,beam}=m;
  const w=b.box.width,d=b.box.depth,front=d/2,back=-d/2;
  const frontWall=front-2.0,groundFront=front-4.3;
  // Two-storey glazed base is recessed under the upper three brick storeys.
  box('recessed-two-storey-glazed-base',1,3.6,-1.6,w-6,7.2,d-5.4,darkGlass,0,true);
  for(let x=-w/2+4;x<w/2-2;x+=2.1)box('ground-curtain-wall-mullion',x,3.6,groundFront,.085,7.2,.14,metal);
  for(const y of [1.1,3.6,6.7])box('ground-curtain-wall-transom',1,y,groundFront,w-6,.1,.18,metal);
  for(const x of [-w/2+1,w/2-1])box('cantilever-support-pier',x,3.6,front-1.5,.85,7.2,1.4,concrete,0,true);
  box('entrance-canopy',3,2.65,front-2.6,w*.64,.23,2.7,metal,0,true);
  for(let i=0;i<10;i++)box('entrance-stair',w/2-4,.09*(i+1),front+3.6-i*.36,5,.18*(i+1),.38,concrete);
  beam('stair-handrail',[w/2-6.3,1.05,front+3.8],[w/2-6.3,2.7,front+.1],.065,railMaterial);
  // Floor plates project out to the fins, leaving actual recessed balconies.
  for(const y of [7.2,10.8,14.4,18.0])box('projecting-floor-slab',0,y,0,w,.42,d,concrete,0,true);
  for(let floor=0;floor<3;floor++){
    const y=7.2+floor*3.6;
    box('brick-upper-floor-core',0,y+1.8,-1.0,w-1,3.18,d-3,brick,0,true);
    const count=28,spacing=(w-1.6)/count;
    for(let j=0;j<count;j++){
      const x=-w/2+.8+(j+.5)*spacing;
      box('recessed-tall-window',x,y+1.92,frontWall+.025,1.12,2.5,.12,glass);
      box('window-sill',x,y+.64,frontWall+.12,1.24,.12,.32,concrete);
      // The lowest brick storey has an open left balcony; full fins start above it.
      if(floor>0||j>=Math.floor(count*.5))box('deep-vertical-sun-fin',x-spacing/2,y+1.8,front-1,.18,3.18,2.1,concrete);
      else{
        box('balcony-post',x,y+.7,front-.25,.045,1.1,.045,railMaterial);
      }
    }
    if(floor===0)for(const dy of [.25,.6,.95])box('open-balcony-rail',-w/4,y+dy,front-.25,w/2,.04,.04,railMaterial);
    // End elevations differ from the long fin facade: ribbon window at level 3,
    // vertical openings and deep fins at levels 4–5.
    for(const side of [-1,1]){
      const x=side*w/2;
      if(floor===0){
        box('end-cantilever-lower-wall',x,y+.6,0,.38,1.2,d,concrete);
        box('end-cantilever-upper-wall',x,y+3,0,.38,1.2,d,concrete);
        box('end-ribbon-glazing',x+side*.04,y+1.8,0,.16,1.2,d-.8,glass);
        for(let z=back+1;z<front;z+=2.5)box('ribbon-window-frame',x+side*.15,y+1.8,z,.12,1.2,.065,metal);
      }else{
        for(let z=back+1;z<front-1;z+=1.9){box('end-upper-window',x+side*.02,y+1.9,z,.1,2.5,1.1,glass);box('end-sun-fin',x+side*.65,y+1.8,z-.8,1.3,3.18,.18,concrete);}
      }
    }
    for(let x=-w/2+1;x<w/2;x+=2.5)box('rear-window-estimated',x,y+1.9,back+.45,1.3,2.4,.12,glass);
  }
  // Sixth floor: a left glazed room plus a recessed rear room, with an OPEN
  // front/right terrace under a separate roof. No full-height outer solid here.
  box('sixth-floor-rear-room',0,19.8,back+(d-7)/2,w-1,3.6,d-7,concrete,0,true);
  box('sixth-floor-left-glazed-room',-w*.34,19.8,front-4.4,w*.3,3.6,7.6,glass,0,true);
  box('terrace-rear-glazing',w*.16,19.8,front-7+.1,w*.64,3.1,.14,darkGlass);
  for(let x=-w/2+1;x<w/2;x+=w/7){
    box('sixth-floor-roof-column',x,19.8,front-.7,.5,3.6,.6,concrete,0,true);
    box('roof-cross-beam',x,21.45,0,.45,.45,d,concrete);
  }
  for(let x=-w/2+.7;x<-w*.19;x+=2)box('sixth-floor-glass-mullion',x,19.8,front-.6,.075,3.6,.13,metal);
  box('terrace-deck',w*.15,18.27,front-3.7,w*.65,.13,6.1,new THREE.MeshStandardMaterial({color:'#8d7961',roughness:.95}));
  for(const y of [18.5,18.86,19.22])box('terrace-front-railing',w*.15,y,front-.2,w*.68,.045,.045,railMaterial);
  for(let x=-w*.18;x<w/2;x+=2.2)box('terrace-railing-post',x,18.66,front-.2,.045,1.12,.045,railMaterial);
  // Planters and roof supports are visible in the college's terrace photographs.
  for(const x of [-w*.12,w*.34])box('terrace-planter',x,18.5,front-1.4,5,.65,1.1,concrete);
  box('large-overhanging-roof',0,21.75,0,w+2.5,.48,d+2.4,concrete,0,true);
  box('roof-metal-edge',0,22.05,0,w+2.6,.16,d+2.5,roofMaterial);
  return m.finish(22.13,['recessed-glazed-base','cantilevered-upper-storeys','deep-fins','open-sixth-floor-terrace','separate-overhanging-roof','entrance-stair']);
}


// ---------------------------------------------------------------------------
// Shared vocabulary for the 1960s–70s humanities/education wings. Their common
// language is a brick infill held in a white cast-concrete frame: floor bands
// and pilasters stand PROUD of the brick, so every opening sits in a real
// recess. Dimensions are read off the official photographs, not surveyed.
// ---------------------------------------------------------------------------
const darkBrick  = new THREE.MeshStandardMaterial({color:'#6d5546',roughness:.96});
const warmBrick  = new THREE.MeshStandardMaterial({color:'#96604a',roughness:.95});
const tanBrick   = new THREE.MeshStandardMaterial({color:'#a8724c',roughness:.94});
const paleFrame  = new THREE.MeshStandardMaterial({color:'#e4e2d7',roughness:.87});
const agedFrame  = new THREE.MeshStandardMaterial({color:'#d8d4c4',roughness:.9});
const stoneBase  = new THREE.MeshStandardMaterial({color:'#b3ac9d',roughness:.97});
const panelClad  = new THREE.MeshStandardMaterial({color:'#d3d2cb',roughness:.62,metalness:.14});
const blackMetal = new THREE.MeshStandardMaterial({color:'#2f3134',roughness:.44,metalness:.42});
const steelColumn= new THREE.MeshStandardMaterial({color:'#b6bbbd',roughness:.34,metalness:.66});
const greenGlass = new THREE.MeshStandardMaterial({color:'#6f9e95',roughness:.22,metalness:.3});
const voidDark   = new THREE.MeshStandardMaterial({color:'#221f1d',roughness:.98});

const signedArea = points => points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2;
const ringSign = points => signedArea(points)>0?1:-1;
function edgeNormal(a,c,sign){const dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz)||1;return [sign*dz/len,-sign*dx/len];}
// True parallel offset: each vertex slides along its angle bisector, so a long
// thin wing keeps a constant band projection instead of scaling unevenly.
function offsetRing(points,sign,distance){
  const n=points.length,out=[];
  for(let i=0;i<n;i++){
    const previous=points[(i-1+n)%n],current=points[i],next=points[(i+1)%n];
    const n1=edgeNormal(previous,current,sign),n2=edgeNormal(current,next,sign);
    let bx=n1[0]+n2[0],bz=n1[1]+n2[1];const length=Math.hypot(bx,bz);
    if(length<1e-6){out.push([current[0]+n1[0]*distance,current[1]+n1[1]*distance]);continue;}
    bx/=length;bz/=length;
    const cosHalf=Math.max(.34,n1[0]*bx+n1[1]*bz);
    out.push([current[0]+bx*distance/cosHalf,current[1]+bz*distance/cosHalf]);
  }
  return out;
}
const edgeLength=(a,c)=>Math.hypot(c[0]-a[0],c[1]-a[1]);
function longestEdge(points){let best=0,length=0;for(let i=0;i<points.length;i++){const l=edgeLength(points[i],points[(i+1)%points.length]);if(l>length){length=l;best=i;}}return best;}
// A re-entrant corner is where the courtyard stair towers actually sit.
function reflexVertex(points,sign){
  const n=points.length;
  for(let i=0;i<n;i++){
    const a=points[(i-1+n)%n],p=points[i],c=points[(i+1)%n];
    const cross=(p[0]-a[0])*(c[1]-p[1])-(p[1]-a[1])*(c[0]-p[0]);
    if(cross*sign>0)return i;
  }
  return -1;
}
const hash=(...v)=>(Math.imul(v.reduce((a,x,i)=>a+x*(97+i*131),7),2654435761)>>>0);

// Walks every facade edge, handing back an outward frame so callers can place
// openings without repeating the trigonometry.
function facades(points,sign,visit){
  for(let i=0;i<points.length;i++){
    const a=points[i],c=points[(i+1)%points.length],length=edgeLength(a,c);
    if(length<1.2)continue;
    const [nx,nz]=edgeNormal(a,c,sign);
    visit({a,c,length,nx,nz,angle:-Math.atan2(c[1]-a[1],c[0]-a[0]),index:i,
      at:t=>[a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t]});
  }
}

// The common wing: brick infill set back behind projecting white floor bands,
// pilasters on the structural grid, and a deep cantilevered roof fascia.
function framedBrickWing(m,b,cfg){
  const {box,polygon,beam}=m;
  const outline=cfg.outline||localFootprint(b);
  const sign=ringSign(outline);
  const floors=cfg.floors,fh=cfg.floorHeight||3.55,bandH=cfg.bandHeight||.62;
  const base=cfg.base||0;
  const brickMat=cfg.brick||darkBrick,frameMat=cfg.frame||paleFrame;
  const brickFace=-0.3,bandFace=cfg.bandProjection||.2;
  const top=base+floors*fh;
  const brickRing=offsetRing(outline,sign,brickFace);
  const bandRing=offsetRing(outline,sign,bandFace);

  if(base>0)polygon('ground-plinth',offsetRing(outline,sign,-.05),0,base,cfg.plinth||stoneBase);
  polygon('ground-floor-slab',offsetRing(outline,sign,bandFace),base,.34,frameMat);

  for(let f=0;f<floors;f++){
    const y=base+f*fh;
    const solid=cfg.solidFloor&&cfg.solidFloor(f);
    polygon(`level-${f+1}-brick-infill`,brickRing,y,fh-bandH,solid===false?frameMat:brickMat);
    polygon(`level-${f+1}-floor-band`,bandRing,y+fh-bandH,bandH,frameMat);
  }
  // Pilasters on the structural bay, standing proud like the floor bands.
  if(cfg.pilasterSpacing!==0){
    const spacing=cfg.pilasterSpacing||7.6;
    facades(outline,sign,({a,c,length,nx,nz,angle,at})=>{
      const bays=Math.max(1,Math.round(length/spacing));
      for(let j=0;j<=bays;j++){
        if(cfg.skipPilaster&&cfg.skipPilaster(j,bays))continue;
        const [x,z]=at(j/bays);
        box('structural-pilaster',x+nx*(bandFace-.08),base+(top-base)/2,z+nz*(bandFace-.08),.78,top-base,.5,frameMat,angle);
      }
    });
  }
  // Openings sit on the brick face, so the bands above and pilasters beside
  // them read as the real shadow-casting recess seen in the photographs.
  facades(outline,sign,edge=>{
    const {a,c,length,nx,nz,angle,at,index}=edge;
    const style=cfg.windowStyle?cfg.windowStyle(index,length,edge):'punched';
    if(style==='blank')return;
    for(let f=0;f<floors;f++){
      const y=base+f*fh;
      if(cfg.skipFloor&&cfg.skipFloor(f,index))continue;
      const rowStyle=cfg.floorStyle?cfg.floorStyle(f,index,style):style;
      if(rowStyle==='blank')continue;
      if(rowStyle==='ribbon'){
        const inner=Math.max(1.2,length-2.6);
        const [mx,mz]=at(.5);
        box('ribbon-window',mx+nx*(brickFace+.14),y+fh*.52,mz+nz*(brickFace+.14),inner,fh*.46,.2,glass,angle);
        const mullions=Math.max(1,Math.round(inner/2.3));
        for(let j=1;j<mullions;j++){const [x,z]=at(.5+((j/mullions)-.5)*(inner/length));
          box('ribbon-mullion',x+nx*(brickFace+.2),y+fh*.52,z+nz*(brickFace+.2),.11,fh*.46,.14,frameMat,angle);}
        continue;
      }
      const spacing=cfg.windowSpacing||3.25;
      const count=Math.floor((length-2.2)/spacing);
      if(count<1)continue;
      const ww=cfg.windowWidth||1.6,wh=cfg.windowHeight||1.75;
      for(let j=0;j<count;j++){
        const t=(j+1)/(count+1),[x,z]=at(t);
        const wide=rowStyle==='wide';
        const w=Math.min(wide?ww*1.9:ww,length/(count+1)*.92);
        box('recessed-window',x+nx*(brickFace+.12),y+fh*.5,z+nz*(brickFace+.12),w,wh,.18,glass,angle);
        if(cfg.windowHoods)box('window-hood',x+nx*(brickFace+.55),y+fh*.5+wh/2+.22,z+nz*(brickFace+.55),w+.5,.22,1.5,frameMat,angle);
        if(cfg.windowSurrounds){
          box('window-surround-head',x+nx*(brickFace+.5),y+fh*.5+wh/2+.2,z+nz*(brickFace+.5),w+.9,.4,1.05,frameMat,angle);
          box('window-surround-sill',x+nx*(brickFace+.5),y+fh*.5-wh/2-.2,z+nz*(brickFace+.5),w+.9,.4,1.05,frameMat,angle);
          for(const side of [-1,1]){const [sx,sz]=at(t+side*(w/2+.25)/length);
            box('window-surround-jamb',sx+nx*(brickFace+.5),y+fh*.5,sz+nz*(brickFace+.5),.42,wh+.8,1.05,frameMat,angle);}
        }
      }
    }
  });
  // Deep cantilevered roof: the single strongest shared feature of these wings.
  const eave=cfg.eave||1.15;
  polygon('cantilevered-roof-fascia',offsetRing(outline,sign,eave),top,cfg.fasciaHeight||.72,frameMat);
  polygon('roof-deck',offsetRing(outline,sign,-.12),top+(cfg.fasciaHeight||.72),.14,roofMaterial);
  if(cfg.roofRail){
    facades(offsetRing(outline,sign,-.5),sign,({a,c,length,angle,at})=>{
      const [mx,mz]=at(.5);
      box('roof-guardrail',mx,top+1.72,mz,length,.05,.05,metal,angle);
      const posts=Math.ceil(length/2.6);
      for(let j=0;j<posts;j++){const [x,z]=at(j/posts);box('roof-rail-post',x,top+1.36,z,.05,.86,.05,metal);}
    });
  }
  return {outline,sign,top,fh,floors,base,brickRing,bandRing,brickFace,bandFace};
}

// Shared fittings -----------------------------------------------------------
function glazedEntrance(m,b,shell,edgeIndex,cfg={}){
  const {box}=m;const {outline,sign,base,fh}=shell;
  const a=outline[edgeIndex],c=outline[(edgeIndex+1)%outline.length];
  const length=edgeLength(a,c),[nx,nz]=edgeNormal(a,c,sign);
  const angle=-Math.atan2(c[1]-a[1],c[0]-a[0]);
  const t=cfg.at??.5,width=cfg.width||Math.min(length*.42,11);
  const x=a[0]+(c[0]-a[0])*t,z=a[1]+(c[1]-a[1])*t;
  box('entrance-glazing',x+nx*(shell.brickFace+.1),base+fh*.46,z+nz*(shell.brickFace+.1),width,fh*.82,.24,darkGlass,angle,true);
  const bays=Math.max(2,Math.round(width/2.2));
  for(let j=0;j<=bays;j++){
    const p=t+((j/bays)-.5)*(width/length);
    box('entrance-mullion',a[0]+(c[0]-a[0])*p+nx*(shell.brickFace+.22),base+fh*.46,a[1]+(c[1]-a[1])*p+nz*(shell.brickFace+.22),.12,fh*.82,.16,metal,angle);
  }
  if(cfg.canopy!==false)box('entrance-canopy',x+nx*(cfg.canopyReach||2.1),base+fh*.92,z+nz*(cfg.canopyReach||2.1),width+2.4,.32,(cfg.canopyReach||2.1)*2,cfg.canopyMat||paleFrame,angle,true);
  if(cfg.steps!==false)for(let i=0;i<4;i++)
    box('entrance-step',x+nx*(2.4+i*.42),base-.12-i*.16,z+nz*(2.4+i*.42),width+1.2,.2,.44,concrete,angle);
}

function glazedStairTower(m,shell,position,cfg={}){
  const {box}=m;const {top,base}=shell;
  const [x,z]=position;const height=cfg.height||top+cfg.rise||top+4.2;
  const w=cfg.width||5.2,d=cfg.depth||5.2,angle=cfg.angle||0;
  box('stair-tower-shaft',x,base+(height-base)/2,z,w,height-base,d,cfg.frameMat||paleFrame,angle,true);
  box('stair-tower-glazing',x,base+(height-base)/2,z+.02,w-1.1,height-base-1.4,d+.16,cfg.glassMat||greenGlass,angle);
  box('stair-tower-glazing-cross',x,base+(height-base)/2,z+.02,w+.16,height-base-1.4,d-1.1,cfg.glassMat||greenGlass,angle);
  const landings=Math.max(2,Math.round((height-base)/3.6));
  for(let i=1;i<landings;i++)box('stair-landing-band',x,base+i*(height-base)/landings,z,w+.22,.2,d+.22,cfg.frameMat||paleFrame,angle);
  box('stair-tower-cap',x,height+.28,z,w+.5,.56,d+.5,cfg.frameMat||paleFrame,angle,true);
}

function coveredBridge(m,shell,edgeIndex,cfg={}){
  const {box,beam}=m;const {outline,sign,base,fh}=shell;
  const a=outline[edgeIndex],c=outline[(edgeIndex+1)%outline.length];
  const [nx,nz]=edgeNormal(a,c,sign),angle=-Math.atan2(c[1]-a[1],c[0]-a[0]);
  const t=cfg.at??.5,reach=cfg.reach||16;
  const x=a[0]+(c[0]-a[0])*t,z=a[1]+(c[1]-a[1])*t;
  const y=base+fh*(cfg.level||1)+fh*.5;
  box('covered-walkway-deck',x+nx*reach/2,y-1.5,z+nz*reach/2,cfg.width||3.6,.34,reach,concrete,angle,true);
  box('covered-walkway-glazing',x+nx*reach/2,y,z+nz*reach/2,cfg.width||3.6,2.1,reach,glass,angle);
  box('covered-walkway-roof',x+nx*reach/2,y+1.3,z+nz*reach/2,(cfg.width||3.6)+.6,.3,reach,paleFrame,angle,true);
  const posts=Math.max(2,Math.round(reach/6));
  for(let j=1;j<=posts;j++){const r=reach*j/(posts+1);
    beam('walkway-column',[x+nx*r,0,z+nz*r],[x+nx*r,y-1.6,z+nz*r],.52,concrete);}
}

// --- 1동 인문관1 -------------------------------------------------------------
// Courtyard wings meeting at a re-entrant corner, where a glazed stair tower
// rises a full storey above the roof. Ground floor is open under the wing.
function humanities1(b){
  const m=builder(b),{box}=m;
  const outline=localFootprint(b),sign=ringSign(outline);
  const shell=framedBrickWing(m,b,{outline,floors:4,floorHeight:3.6,brick:darkBrick,
    eave:1.35,fasciaHeight:.8,pilasterSpacing:7.2,windowSpacing:3.1,windowWidth:1.5,
    skipFloor:(f,index)=>f===0&&index===longestEdge(outline)});
  const open=longestEdge(outline);
  const a=outline[open],c=outline[(open+1)%outline.length];
  const [nx,nz]=edgeNormal(a,c,sign),angle=-Math.atan2(c[1]-a[1],c[0]-a[0]);
  // Recessed, column-supported ground level along the courtyard face.
  for(let j=1;j<Math.round(edgeLength(a,c)/7.2);j++){
    const t=j/Math.round(edgeLength(a,c)/7.2);
    m.beam('ground-arcade-column',[a[0]+(c[0]-a[0])*t+nx*.1,0,a[1]+(c[1]-a[1])*t+nz*.1],
      [a[0]+(c[0]-a[0])*t+nx*.1,shell.fh,a[1]+(c[1]-a[1])*t+nz*.1],.62,paleFrame);
  }
  box('recessed-ground-glazing',(a[0]+c[0])/2+nx*-1.5,shell.fh*.5,(a[1]+c[1])/2+nz*-1.5,edgeLength(a,c)*.78,shell.fh*.8,.3,darkGlass,angle);
  const corner=reflexVertex(outline,sign);
  const at=corner>=0?outline[corner]:[(a[0]+c[0])/2+nx*2.4,(a[1]+c[1])/2+nz*2.4];
  glazedStairTower(m,shell,[at[0]+nx*1.4,at[1]+nz*1.4],{rise:4.6,width:5.6,depth:5.4,angle,
    glassMat:new THREE.MeshStandardMaterial({color:'#7fb0a6',roughness:.2,metalness:.3})});
  glazedEntrance(m,b,shell,(open+1)%outline.length,{width:7});
  return m.finish(shell.top+5.4,['courtyard-wings','open-ground-arcade','projecting-glazed-stair-tower','deep-roof-fascia']);
}

// --- 2동 인문관2 -------------------------------------------------------------
// Continuous ribbon glazing on the lower office floors, small punched windows
// in the brick above, under an unusually deep white fascia.
function humanities2(b){
  const m=builder(b);
  const outline=localFootprint(b),main=longestEdge(outline);
  const shell=framedBrickWing(m,b,{outline,floors:4,floorHeight:3.5,brick:darkBrick,
    eave:1.55,fasciaHeight:.86,bandProjection:.26,pilasterSpacing:8.4,
    windowSpacing:2.9,windowWidth:1.35,windowHeight:1.5,
    floorStyle:(f,index)=>index===main?(f<2?'ribbon':'punched'):(f<2?'wide':'punched')});
  const {sign,top,base}=shell;
  // Service grilles rather than glazing at the sunken ground band.
  facades(offsetRing(outline,sign,-.22),sign,({length,angle,at})=>{
    const bays=Math.max(1,Math.round(length/2.4));
    for(let j=0;j<bays;j++){const [x,z]=at((j+.5)/bays);
      m.box('basement-vent-grille',x,base+.55,z,length/bays-.35,.9,.14,blackMetal,angle);}
  });
  m.polygon('roof-parapet-upstand',offsetRing(outline,sign,-.55),top+.86,.5,paleFrame);
  glazedEntrance(m,b,shell,main,{at:.72,width:8.4});
  return m.finish(top+1.4,['ribbon-glazed-lower-floors','punched-brick-upper-floors','deep-white-fascia']);
}

// --- 3동 인문관3 -------------------------------------------------------------
// The deepest eave of the group, carried on exposed diagonal brackets, with an
// open access balcony running along one end.
function humanities3(b){
  const m=builder(b),{box,beam}=m;
  const outline=localFootprint(b),sign=ringSign(outline),main=longestEdge(outline);
  const balcony=(main+2)%outline.length;
  const shell=framedBrickWing(m,b,{outline,floors:3,floorHeight:3.65,brick:darkBrick,frame:agedFrame,
    eave:2.0,fasciaHeight:.82,pilasterSpacing:6.8,windowSpacing:3.0,windowWidth:1.45,
    windowStyle:index=>index===balcony?'blank':'punched'});
  const {top,base,fh}=shell;
  // Exposed brackets under the eave, visible against the sky in the photograph.
  facades(outline,sign,({length,nx,nz,at})=>{
    const brackets=Math.max(2,Math.round(length/5.5));
    for(let j=0;j<=brackets;j++){const [x,z]=at(j/brackets);
      beam('eave-bracket',[x+nx*.2,top-1.5,z+nz*.2],[x+nx*2.0,top+.1,z+nz*2.0],.22,agedFrame);}
  });
  // Open external gallery: slabs and rails, with the wall left unglazed behind.
  const a=outline[balcony],c=outline[(balcony+1)%outline.length];
  const [bx,bz]=edgeNormal(a,c,sign),angle=-Math.atan2(c[1]-a[1],c[0]-a[0]);
  const length=edgeLength(a,c),mx=(a[0]+c[0])/2,mz=(a[1]+c[1])/2;
  for(let f=1;f<3;f++){
    const y=base+f*fh;
    box('access-balcony-slab',mx+bx*.95,y+.1,mz+bz*.95,length,.3,2.1,agedFrame,angle,true);
    box('access-balcony-parapet',mx+bx*1.9,y+.66,mz+bz*1.9,length,1.0,.22,agedFrame,angle);
    for(let j=1;j<Math.round(length/3);j++){const t=j/Math.round(length/3);
      box('balcony-door',a[0]+(c[0]-a[0])*t+bx*-.18,y+fh*.46,a[1]+(c[1]-a[1])*t+bz*-.18,1.1,2.2,.16,glass,angle);}
  }
  return m.finish(top+.96,['very-deep-eave','exposed-eave-brackets','open-access-gallery']);
}

// --- 5동 인문관4 -------------------------------------------------------------
// Glazed corner entrance hall under the overhanging upper floors, and the
// enclosed bridge that crosses to the neighbouring wing on round columns.
function humanities5(b){
  const m=builder(b),{box}=m;
  const outline=localFootprint(b),sign=ringSign(outline),main=longestEdge(outline);
  const corner=(main+1)%outline.length;
  const shell=framedBrickWing(m,b,{outline,floors:4,floorHeight:3.6,brick:darkBrick,
    eave:1.4,fasciaHeight:.78,pilasterSpacing:7.4,windowSpacing:3.0,windowWidth:1.5,
    floorStyle:(f,index)=>f===0?(index===main||index===corner?'wide':'punched'):'punched',
    skipFloor:(f,index)=>f===0&&index===corner});
  const {top,base,fh}=shell;
  // Two-edge glazed entrance hall wrapping the corner shown in the photograph.
  for(const index of [corner,main]){
    const a=outline[index],c=outline[(index+1)%outline.length];
    const [nx,nz]=edgeNormal(a,c,sign),angle=-Math.atan2(c[1]-a[1],c[0]-a[0]);
    const length=edgeLength(a,c),span=Math.min(length*.5,12);
    const t=index===corner?.3:.85;
    const x=a[0]+(c[0]-a[0])*t,z=a[1]+(c[1]-a[1])*t;
    box('corner-entrance-hall-glazing',x+nx*(shell.brickFace+.12),base+fh*.48,z+nz*(shell.brickFace+.12),span,fh*.86,.24,darkGlass,angle,true);
    const bays=Math.max(2,Math.round(span/2.1));
    for(let j=0;j<=bays;j++){const p=t+((j/bays)-.5)*(span/length);
      box('entrance-hall-mullion',a[0]+(c[0]-a[0])*p+nx*(shell.brickFace+.24),base+fh*.48,a[1]+(c[1]-a[1])*p+nz*(shell.brickFace+.24),.13,fh*.86,.16,metal,angle);}
  }
  coveredBridge(m,shell,(main+2)%outline.length,{at:.34,level:1,reach:14,width:3.8});
  // External escape stair with a steel rail, at the high end of the site.
  const a=outline[main],c=outline[(main+1)%outline.length];
  const [nx,nz]=edgeNormal(a,c,sign),angle=-Math.atan2(c[1]-a[1],c[0]-a[0]);
  const sx=a[0]+(c[0]-a[0])*.06,sz=a[1]+(c[1]-a[1])*.06;
  for(let i=0;i<11;i++)box('external-stair-tread',sx+nx*(1.1+i*.34),base+.2+i*.33,sz+nz*(1.1+i*.34),3.2,.2,.4,concrete,angle);
  box('external-stair-rail',sx+nx*2.6,base+2.5,sz+nz*2.6,3.4,.06,.06,railMaterial,angle);
  return m.finish(top+.78,['wrapping-corner-entrance-hall','enclosed-bridge-on-columns','external-stair']);
}

// --- 6동 인문관5 -------------------------------------------------------------
// Warmer red brick, with large unbroken brick panels on the gable ends and a
// stack of cantilevered balcony slabs at one corner.
function humanities6(b){
  const m=builder(b),{box}=m;
  const outline=localFootprint(b),sign=ringSign(outline),main=longestEdge(outline);
  const gable=(main+1)%outline.length,balconyEdge=(main+2)%outline.length;
  const shell=framedBrickWing(m,b,{outline,floors:4,floorHeight:3.5,brick:warmBrick,
    eave:1.3,fasciaHeight:.74,pilasterSpacing:8.8,windowSpacing:2.6,windowWidth:1.45,
    windowStyle:index=>index===gable?'blank':'punched',
    floorStyle:(f,index)=>index===main&&f>0?'ribbon':'punched'});
  const {top,base,fh}=shell;
  const a=outline[balconyEdge],c=outline[(balconyEdge+1)%outline.length];
  const [nx,nz]=edgeNormal(a,c,sign),angle=-Math.atan2(c[1]-a[1],c[0]-a[0]);
  const mx=(a[0]+c[0])/2,mz=(a[1]+c[1])/2,width=Math.min(edgeLength(a,c)*.46,7.5);
  for(let f=1;f<4;f++){
    const y=base+f*fh;
    box('cantilevered-balcony-slab',mx+nx*1.5,y+.08,mz+nz*1.5,width,.28,3.0,paleFrame,angle,true);
    box('balcony-parapet',mx+nx*2.9,y+.62,mz+nz*2.9,width,1.05,.2,paleFrame,angle);
    box('balcony-side-parapet',mx+nx*1.5+Math.cos(angle)*width/2,y+.62,mz+nz*1.5-Math.sin(angle)*width/2,.2,1.05,3.0,paleFrame,angle);
    box('balcony-door',mx+nx*(shell.brickFace+.1),y+fh*.46,mz+nz*(shell.brickFace+.1),1.5,2.3,.18,glass,angle);
  }
  return m.finish(top+.74,['blank-brick-gable','ribbon-glazed-long-facade','stacked-cantilevered-balconies']);
}

// --- 7동 인문관6 -------------------------------------------------------------
// The lowest of the group, on a cut slope. Deep unglazed loggia voids pierce
// the brick, and bare roof beams continue past the wall over an open bay.
function humanities7(b){
  const m=builder(b),{box,beam}=m;
  const outline=localFootprint(b),sign=ringSign(outline),main=longestEdge(outline);
  const loggia=(main+2)%outline.length;
  const shell=framedBrickWing(m,b,{outline,floors:3,floorHeight:3.55,brick:darkBrick,frame:agedFrame,
    base:.9,plinth:stoneBase,eave:1.45,fasciaHeight:.8,pilasterSpacing:7.0,
    windowSpacing:2.8,windowWidth:1.4,windowStyle:index=>index===loggia?'blank':'punched'});
  const {top,base,fh}=shell;
  // Recessed open bays: a dark void set well behind the wall plane, with the
  // floor edge and head beam left exposed, as photographed.
  const a=outline[loggia],c=outline[(loggia+1)%outline.length];
  const [nx,nz]=edgeNormal(a,c,sign),angle=-Math.atan2(c[1]-a[1],c[0]-a[0]);
  const length=edgeLength(a,c),bays=Math.max(2,Math.round(length/9));
  for(let f=0;f<3;f++)for(let j=0;j<bays;j++){
    if((f+j)%2===1)continue;
    const t=(j+.5)/bays,x=a[0]+(c[0]-a[0])*t,z=a[1]+(c[1]-a[1])*t;
    const y=base+f*fh,w=Math.min(length/bays*.52,4.6);
    box('recessed-loggia-void',x+nx*(shell.brickFace-1.5),y+fh*.5,z+nz*(shell.brickFace-1.5),w,fh*.66,2.6,voidDark,angle,true);
    box('loggia-head-beam',x+nx*(shell.brickFace+.16),y+fh*.5+fh*.33+.28,z+nz*(shell.brickFace+.16),w+1.3,.55,.6,agedFrame,angle);
    box('loggia-sill-slab',x+nx*(shell.brickFace+.3),y+fh*.5-fh*.33-.2,z+nz*(shell.brickFace+.3),w+1.3,.4,.9,agedFrame,angle);
  }
  // Roof beams running out past the wall over the open end bay.
  const e=outline[main],f2=outline[(main+1)%outline.length];
  const [ex,ez]=edgeNormal(e,f2,sign),eangle=-Math.atan2(f2[1]-e[1],f2[0]-e[0]);
  for(let j=0;j<=6;j++){const t=j/6*.42,x=e[0]+(f2[0]-e[0])*t,z=e[1]+(f2[1]-e[1])*t;
    box('exposed-roof-beam',x+ex*1.4,top+1.05,z+ez*1.4,.45,.5,5.4,agedFrame,eangle,true);}
  box('roof-beam-edge-rail',(e[0]+f2[0])/2*.42+e[0]*.58+ex*3.9,top+1.05,(e[1]+f2[1])/2*.42+e[1]*.58+ez*3.9,edgeLength(e,f2)*.44,.42,.42,agedFrame,eangle);
  // Cut-slope retaining wall along the road frontage only, with its coping.
  const r0=outline[main],r1=outline[(main+1)%outline.length];
  const [rx,rz]=edgeNormal(r0,r1,sign),rangle=-Math.atan2(r1[1]-r0[1],r1[0]-r0[0]);
  const rmx=(r0[0]+r1[0])/2,rmz=(r0[1]+r1[1])/2,rlen=edgeLength(r0,r1);
  box('road-retaining-wall',rmx+rx*5.6,.35,rmz+rz*5.6,rlen*.92,1.5,.55,stoneBase,rangle,true);
  const balusters=Math.max(4,Math.round(rlen/2.4));
  for(let j=0;j<=balusters;j++){const t=j/balusters;
    box('retaining-wall-baluster',r0[0]+(r1[0]-r0[0])*t+rx*5.6,1.35,r0[1]+(r1[1]-r0[1])*t+rz*5.6,.34,.85,.7,stoneBase,rangle);}
  box('retaining-wall-coping',rmx+rx*5.6,1.85,rmz+rz*5.6,rlen*.92,.24,.9,agedFrame,rangle);
  return m.finish(top+1.4,['deep-loggia-voids','exposed-roof-beams','cut-slope-plinth']);
}

// --- 9동 사범관1 -------------------------------------------------------------
// A strong white frame grid over brick, a recessed vertical stair slot with its
// cross-beams left visible, and projecting hoods over the long-facade windows.
function education9(b){
  const m=builder(b),{box}=m;
  const outline=localFootprint(b),sign=ringSign(outline),main=longestEdge(outline);
  const endEdge=(main+1)%outline.length;
  const shell=framedBrickWing(m,b,{outline,floors:4,floorHeight:3.6,brick:darkBrick,
    eave:1.25,fasciaHeight:.8,bandProjection:.28,pilasterSpacing:6.4,
    windowSpacing:3.0,windowWidth:1.5,windowHoods:true,roofRail:true,
    windowStyle:index=>index===endEdge?'blank':'punched'});
  const {top,base,fh}=shell;
  // The end elevation is a framed brick panel cut by one recessed slot.
  const a=outline[endEdge],c=outline[(endEdge+1)%outline.length];
  const [nx,nz]=edgeNormal(a,c,sign),angle=-Math.atan2(c[1]-a[1],c[0]-a[0]);
  const length=edgeLength(a,c),t=.74;
  const x=a[0]+(c[0]-a[0])*t,z=a[1]+(c[1]-a[1])*t,slot=Math.min(length*.3,5.4);
  box('recessed-stair-slot',x+nx*(shell.brickFace-1.3),base+(top-base)/2,z+nz*(shell.brickFace-1.3),slot,top-base,2.4,voidDark,angle,true);
  for(let f=0;f<=4;f++)box('slot-cross-beam',x+nx*(shell.brickFace-.35),base+f*fh,z+nz*(shell.brickFace-.35),slot,.55,1.1,paleFrame,angle);
  for(let f=0;f<4;f++)box('slot-glazing',x+nx*(shell.brickFace-1.05),base+f*fh+fh*.5,z+nz*(shell.brickFace-1.05),slot-1.4,fh*.62,.16,glass,angle);
  glazedEntrance(m,b,shell,main,{at:.5,width:10.5,canopy:false});
  return m.finish(top+2,['white-frame-grid','recessed-stair-slot','projecting-window-hoods','roof-guardrail']);
}

// --- 10동 사범관2 ------------------------------------------------------------
// Renovated: every opening is held in a thick white surround that stands well
// clear of the brick, over a rough granite block base.
function education10(b){
  const m=builder(b);
  const outline=localFootprint(b),main=longestEdge(outline);
  const shell=framedBrickWing(m,b,{outline,floors:4,floorHeight:3.5,brick:darkBrick,frame:paleFrame,
    base:1.5,plinth:stoneBase,eave:1.0,fasciaHeight:.7,bandProjection:.3,
    pilasterSpacing:6.0,windowSpacing:3.4,windowWidth:2.2,windowHeight:1.85,
    windowSurrounds:true});
  const {top,base,sign}=shell;
  // Coursed granite blocks at the base, scored to read as masonry not render.
  facades(offsetRing(outline,sign,.06),sign,({length,angle,at})=>{
    const blocks=Math.max(2,Math.round(length/1.6));
    for(let j=0;j<blocks;j++){const [x,z]=at((j+.5)/blocks);
      m.box('granite-base-block',x,base*.52,z,length/blocks-.09,base*.46,.1,stoneBase,angle);}
  });
  glazedEntrance(m,b,shell,main,{at:.62,width:9,canopyReach:3.0,canopyMat:paleFrame});
  return m.finish(top+.7,['thick-projecting-window-surrounds','granite-block-base','projecting-entrance-canopy']);
}

// --- 11동 사범관3 ------------------------------------------------------------
// The long teaching wing with its lettered fascia, plus the taller lighter
// stair-and-service block standing across its end.
function education11(b){
  const m=builder(b),{box}=m;
  const outline=localFootprint(b),sign=ringSign(outline),main=longestEdge(outline);
  const shell=framedBrickWing(m,b,{outline,floors:4,floorHeight:3.5,brick:warmBrick,
    eave:1.35,fasciaHeight:.82,pilasterSpacing:7.0,windowSpacing:3.0,windowWidth:1.55,roofRail:true});
  const {top,base,fh}=shell;
  const a=outline[main],c=outline[(main+1)%outline.length];
  const [nx,nz]=edgeNormal(a,c,sign),angle=-Math.atan2(c[1]-a[1],c[0]-a[0]);
  m.box('fascia-lettering-band',(a[0]+c[0])/2+nx*1.4,top+.42,(a[1]+c[1])/2+nz*1.4,edgeLength(a,c)*.46,.34,.12,
    new THREE.MeshStandardMaterial({color:'#2f4d86',roughness:.7}),angle);
  // Service block: taller, lighter brick, its own fenestration and canopy.
  const endEdge=(main+1)%outline.length;
  const e=outline[endEdge],f2=outline[(endEdge+1)%outline.length];
  const [ex,ez]=edgeNormal(e,f2,sign),eangle=-Math.atan2(f2[1]-e[1],f2[0]-e[0]);
  const mx=(e[0]+f2[0])/2,mz=(e[1]+f2[1])/2,tw=Math.min(edgeLength(e,f2)*.86,13),th=top+2.6;
  box('service-block-shaft',mx+ex*4.4,base+(th-base)/2,mz+ez*4.4,tw,th-base,8.8,tanBrick,eangle,true);
  for(let f=0;f<5;f++)for(let j=0;j<3;j++){
    const t=(j+.5)/3;
    box('service-block-window',mx+ex*8.85+Math.cos(eangle)*(t-.5)*tw,base+f*3.5+1.9,mz+ez*8.85-Math.sin(eangle)*(t-.5)*tw,tw/3-.7,1.7,.2,glass,eangle);
    box('service-block-window-band',mx+ex*8.82,base+f*3.5+3.15,mz+ez*8.82,tw,.5,.18,paleFrame,eangle);
  }
  box('service-block-cap',mx+ex*4.4,th+.4,mz+ez*4.4,tw+.9,.8,9.6,paleFrame,eangle,true);
  box('service-entrance-canopy',mx+ex*10.2,base+3.0,mz+ez*10.2,tw*.66,.3,2.9,paleFrame,eangle,true);
  box('service-entrance-glazing',mx+ex*8.9,base+1.45,mz+ez*8.9,tw*.5,2.7,.2,darkGlass,eangle);
  return m.finish(th+.8,['long-teaching-wing','taller-service-stair-block','fascia-lettering','roof-guardrail']);
}

// --- 13동 과학교육관 ---------------------------------------------------------
// Steps down a slope: a windowless brick mass at the high end, a grid of deeply
// recessed window bays along the front, and a detached green glass stair tower.
function education13(b){
  const m=builder(b),{box}=m;
  const outline=localFootprint(b),sign=ringSign(outline),main=longestEdge(outline);
  const gable=(main+1)%outline.length;
  const shell=framedBrickWing(m,b,{outline,floors:4,floorHeight:3.55,brick:darkBrick,
    base:1.1,plinth:stoneBase,eave:1.5,fasciaHeight:.78,pilasterSpacing:5.6,
    windowSpacing:3.2,windowWidth:1.5,windowSurrounds:true,
    windowStyle:index=>index===gable?'blank':'punched'});
  const {top,base,fh}=shell;
  // A second white beam floats clear above the roof line on short posts.
  facades(outline,sign,({length,nx,nz,angle,at,index})=>{
    if(index!==main)return;
    const [mx,mz]=at(.5);
    box('raised-roof-beam',mx+nx*1.3,top+2.0,mz+nz*1.3,length+1.2,.42,.62,paleFrame,angle,true);
    const posts=Math.max(2,Math.round(length/7));
    for(let j=0;j<=posts;j++){const [x,z]=at(j/posts);
      box('roof-beam-post',x+nx*1.3,top+1.35,z+nz*1.3,.34,1.3,.42,paleFrame,angle);}
  });
  // Blank gable with the projecting canopy slab at its foot.
  const a=outline[gable],c=outline[(gable+1)%outline.length];
  const [nx,nz]=edgeNormal(a,c,sign),angle=-Math.atan2(c[1]-a[1],c[0]-a[0]);
  const mx=(a[0]+c[0])/2,mz=(a[1]+c[1])/2,length=edgeLength(a,c);
  box('gable-foot-canopy',mx+nx*2.0,base+fh*1.08,mz+nz*2.0,length*.6,.42,4.0,paleFrame,angle,true);
  box('gable-under-canopy-glazing',mx+nx*(shell.brickFace+.1),base+fh*.52,mz+nz*(shell.brickFace+.1),length*.5,fh*.8,.2,darkGlass,angle);
  glazedStairTower(m,shell,[mx+nx*8.6,mz+nz*8.6],{rise:1.6,width:4.6,depth:5.0,angle,
    frameMat:panelClad,glassMat:greenGlass});
  return m.finish(top+2.3,['sloped-site-plinth','recessed-window-bays','floating-roof-beam','detached-glass-stair-tower']);
}

// --- 8동 두산인문관 ----------------------------------------------------------
// Contemporary infill: tan brick cut by vertical window slots of deliberately
// uneven width, a black metal bay hung off the corner, a two-storey entrance
// void, and an open brick screen standing above the top floor.
function doosan8(b){
  const m=builder(b),{box,polygon}=m;
  const outline=localFootprint(b),sign=ringSign(outline),main=longestEdge(outline);
  const floors=6,fh=3.55,top=floors*fh;
  const wall=offsetRing(outline,sign,-.12);
  polygon('brick-volume',wall,0,top,tanBrick);
  polygon('floor-edge-reveal',offsetRing(outline,sign,.03),0,.1,blackMetal);
  // Vertical slots: width, height and floor span vary per bay from a fixed hash,
  // reproducing the syncopated rhythm without inventing a regular grid.
  facades(outline,sign,({length,nx,nz,angle,at,index})=>{
    const bays=Math.max(3,Math.round(length/2.45));
    for(let j=0;j<bays;j++){
      const seed=hash(index+1,j+1);
      const t=(j+.5)/bays,[x,z]=at(t);
      const wide=(seed>>3)%5===0;
      const w=Math.min(length/bays*.84,wide?2.3:(seed%3)*.22+.82);
      for(let f=0;f<floors;f++){
        const tall=(hash(index+1,j+1,f+1)>>5)%4===0;
        if((hash(index+1,j+1,f+2)>>7)%7===0)continue;
        const h=tall?fh*.78:fh*.52;
        box('vertical-window-slot',x+nx*.16,f*fh+fh*.5,z+nz*.16,w+.34,h+.34,.2,blackMetal,angle);
        box('window-glazing',x+nx*.26,f*fh+fh*.5,z+nz*.26,w,h,.16,glass,angle);
      }
    }
  });
  // Cantilevered black bay beside the entrance.
  const a=outline[main],c=outline[(main+1)%outline.length];
  const [nx,nz]=edgeNormal(a,c,sign),angle=-Math.atan2(c[1]-a[1],c[0]-a[0]);
  const length=edgeLength(a,c);
  const bx=a[0]+(c[0]-a[0])*.34,bz=a[1]+(c[1]-a[1])*.34;
  box('cantilevered-metal-bay',bx+nx*1.35,fh*3.5,bz+nz*1.35,5.4,fh*3,2.9,blackMetal,angle,true);
  for(let f=2;f<5;f++)box('metal-bay-glazing',bx+nx*2.85,f*fh+fh*.5,bz+nz*2.85,3.9,fh*.62,.16,glass,angle);
  // Two-storey entrance void cut into the base under the overhanging brick.
  const ex=a[0]+(c[0]-a[0])*.52,ez=a[1]+(c[1]-a[1])*.52,evw=Math.min(length*.3,12);
  box('entrance-void',ex+nx*-1.9,fh,ez+nz*-1.9,evw,fh*2,4.2,voidDark,angle,true);
  box('entrance-void-head',ex+nx*.2,fh*2+.35,ez+nz*.2,evw+1.6,.7,1.2,blackMetal,angle);
  box('entrance-lobby-glazing',ex+nx*-3.4,fh*.62,ez+nz*-3.4,evw*.8,fh*1.1,.2,darkGlass,angle);
  // Open brick screen: fins with real gaps, so sky shows through at roof level.
  facades(outline,sign,({length,nx,nz,angle,at})=>{
    const fins=Math.max(3,Math.round(length/2.2));
    for(let j=0;j<fins;j++){
      if((hash(Math.round(length),j)>>4)%4===0)continue;
      const [x,z]=at((j+.5)/fins);
      box('open-roof-screen-fin',x+nx*.05,top+1.55,z+nz*.05,length/fins*.62,3.1,.42,tanBrick,angle);
    }
  });
  polygon('roof-deck',offsetRing(outline,sign,-.6),top,.2,roofMaterial);
  box('rooftop-plant-enclosure',0,top+1.5,0,b.box.width*.2,3,b.box.depth*.34,blackMetal,0,true);
  return m.finish(top+3.1,['uneven-vertical-window-slots','cantilevered-metal-bay','two-storey-entrance-void','open-brick-roof-screen']);
}

// --- 12동 사범교육협력센터 ---------------------------------------------------
// A bowed mass lifted clear of the ground on round columns: glazed pavilion and
// planted terrace below, dark metal underbelly, deep concrete fins above.
function education12(b){
  const m=builder(b),{box,polygon,beam}=m;
  const guide=localFootprint(b);
  // The mapped outline is sparse; interpolate it into the continuous bow that
  // the photograph shows, rather than leaving a faceted rectangle.
  const loop=new THREE.CatmullRomCurve3(guide.map(([x,z])=>new THREE.Vector3(x,0,z)),true,'centripetal');
  const outline=loop.getPoints(Math.max(28,guide.length*6)).slice(0,-1).map(v=>[v.x,v.z]);
  const sign=ringSign(outline);
  const pilotis=5.6,bellyTop=9.0,finTop=17.4;
  // Ground: recessed glazed pavilion, well inside the column line.
  const pavilion=offsetRing(outline,sign,-3.6);
  polygon('ground-glazed-pavilion',pavilion,0,pilotis-1.1,glass);
  facades(pavilion,sign,({length,angle,at})=>{
    const bays=Math.max(2,Math.round(length/2.6));
    for(let j=0;j<=bays;j++){const [x,z]=at(j/bays);
      box('pavilion-mullion',x,(pilotis-1.1)/2,z,.14,pilotis-1.1,.16,metal,angle);}
  });
  // Round columns carrying the bowed volume.
  facades(outline,sign,({length,at,index})=>{
    const columns=Math.max(1,Math.round(length/7.5));
    for(let j=0;j<columns;j++){const [x,z]=at((j+.5)/columns);
      beam('round-pilotis-column',[x*.94,0,z*.94],[x*.94,pilotis+.6,z*.94],.92,panelClad);}
  });
  // Dark metal underbelly, overhanging the columns.
  polygon('metal-underbelly',offsetRing(outline,sign,.35),pilotis,bellyTop-pilotis,blackMetal);
  polygon('underbelly-soffit',offsetRing(outline,sign,.35),pilotis-.25,.3,blackMetal);
  // Two glazed floors held behind deep vertical fins.
  polygon('upper-glazed-floors',offsetRing(outline,sign,-.75),bellyTop,finTop-bellyTop,glass);
  facades(outline,sign,({length,nx,nz,angle,at})=>{
    const fins=Math.max(4,Math.round(length/2.3));
    for(let j=0;j<=fins;j++){const [x,z]=at(j/fins);
      box('deep-vertical-fin',x+nx*.25,(bellyTop+finTop)/2,z+nz*.25,.46,finTop-bellyTop,1.7,concrete,angle);}
    const [mx,mz]=at(.5);
    box('mid-floor-band',mx+nx*.1,bellyTop+(finTop-bellyTop)/2,mz+nz*.1,length,.42,1.1,concrete,angle);
  });
  polygon('roof-fascia',offsetRing(outline,sign,.5),finTop,.85,concrete);
  polygon('roof-deck',offsetRing(outline,sign,-.5),finTop+.85,.16,roofMaterial);
  // Planted terrace on the pavilion roof, with its steel rail and pots.
  const terrace=offsetRing(outline,sign,-1.4);
  polygon('terrace-deck',terrace,pilotis-1.1,.3,concrete);
  facades(terrace,sign,({length,angle,at})=>{
    const [mx,mz]=at(.5);
    for(const dy of [.45,.85,1.25])box('terrace-rail',mx,pilotis-.8+dy,mz,length,.05,.05,metal,angle);
    const posts=Math.max(2,Math.round(length/3));
    for(let j=0;j<posts;j++){const [x,z]=at(j/posts);box('terrace-rail-post',x,pilotis-.15,z,.05,1.3,.05,metal);}
    const pots=Math.max(1,Math.round(length/6));
    for(let j=0;j<pots;j++){const [x,z]=at((j+.5)/pots);
      box('terrace-planter',x,pilotis-.5,z,1.5,.9,1.5,stoneBase,angle);
      box('terrace-shrub',x,pilotis+.5,z,1.6,1.4,1.6,new THREE.MeshStandardMaterial({color:'#7d9a6d',roughness:.95}),angle);}
  });
  return m.finish(finTop+1.05,['bowed-plan','lifted-on-round-columns','dark-metal-underbelly','deep-concrete-fins','planted-terrace']);
}

// --- 15동 법학관1 ------------------------------------------------------------
// The one curtain-walled block of the group: a panel-and-glass grid fronted by
// full-height round steel columns, with a setback top floor and a glazed tower.
function law15(b){
  const m=builder(b),{box,polygon,beam}=m;
  const outline=localFootprint(b),sign=ringSign(outline),main=longestEdge(outline);
  const floors=5,fh=3.8,top=floors*fh,setback=top+fh*.82;
  polygon('curtain-wall-core',offsetRing(outline,sign,-.3),0,top,panelClad);
  // Panel-and-glass grid: spandrel panels and glazing alternate in each bay.
  facades(outline,sign,({length,nx,nz,angle,at,index})=>{
    const bays=Math.max(2,Math.round(length/2.75));
    for(let f=0;f<floors;f++){
      for(let j=0;j<bays;j++){
        const t=(j+.5)/bays,[x,z]=at(t);
        const w=length/bays-.14;
        box('vision-glazing',x+nx*.02,f*fh+fh*.62,z+nz*.02,w,fh*.6,.2,glass,angle);
        const louvre=(hash(index+2,j+1,f+1)>>6)%6===0;
        if(louvre)for(let k=0;k<4;k++)
          box('window-louvre',x+nx*.14,f*fh+fh*.62-fh*.2+k*fh*.13,z+nz*.14,w-.3,.11,.12,panelClad,angle);
        box('spandrel-panel',x+nx*.04,f*fh+fh*.18,z+nz*.04,w,fh*.34,.22,panelClad,angle);
      }
      for(let j=0;j<=bays;j++){const [x,z]=at(j/bays);
        box('curtain-wall-mullion',x+nx*.16,f*fh+fh/2,z+nz*.16,.13,fh,.2,panelClad,angle);}
      const [mx,mz]=at(.5);
      box('floor-line-transom',mx+nx*.16,f*fh,mz+nz*.16,length,.16,.22,panelClad,angle);
    }
  });
  // Free-standing round steel columns in front of the main elevation.
  const a=outline[main],c=outline[(main+1)%outline.length];
  const [nx,nz]=edgeNormal(a,c,sign);
  const length=edgeLength(a,c),columns=Math.max(3,Math.round(length/9));
  for(let j=0;j<=columns;j++){
    const t=j/columns,x=a[0]+(c[0]-a[0])*t,z=a[1]+(c[1]-a[1])*t;
    beam('free-standing-steel-column',[x+nx*1.5,0,z+nz*1.5],[x+nx*1.5,top+.6,z+nz*1.5],.58,steelColumn);
  }
  // Setback top floor with its clerestory band.
  const upper=offsetRing(outline,sign,-2.6);
  polygon('setback-top-floor',upper,top,setback-top,panelClad);
  facades(upper,sign,({length,nx,nz,angle,at})=>{
    const [mx,mz]=at(.5);
    box('clerestory-band',mx+nx*.08,top+(setback-top)*.58,mz+nz*.08,length-.6,(setback-top)*.5,.18,glass,angle);
    const bays=Math.max(2,Math.round(length/2.6));
    for(let j=0;j<=bays;j++){const [x,z]=at(j/bays);
      box('clerestory-mullion',x+nx*.16,top+(setback-top)*.58,z+nz*.16,.12,(setback-top)*.5,.14,panelClad,angle);}
  });
  polygon('main-roof-cap',offsetRing(outline,sign,.18),top,.42,panelClad);
  polygon('upper-roof-deck',offsetRing(upper,sign,.2),setback,.34,roofMaterial);
  // Glazed stair and lift tower rising past the parapet at one end.
  const endEdge=(main+1)%outline.length;
  const e=outline[endEdge],f2=outline[(endEdge+1)%outline.length];
  const [ex,ez]=edgeNormal(e,f2,sign),eangle=-Math.atan2(f2[1]-e[1],f2[0]-e[0]);
  const mx=(e[0]+f2[0])/2,mz=(e[1]+f2[1])/2,tw=Math.min(edgeLength(e,f2)*.5,8.6);
  box('glazed-lift-tower',mx+ex*3.2,(top+5.4)/2,mz+ez*3.2,tw,top+5.4,6.6,blackMetal,eangle,true);
  for(let f=0;f<Math.floor((top+4)/fh);f++)
    box('lift-tower-glazing',mx+ex*6.6,f*fh+fh*.5,mz+ez*6.6,tw-.9,fh-.5,.2,darkGlass,eangle);
  for(let k=0;k<5;k++)box('tower-top-louvre',mx+ex*6.6,top+3.1+k*.42,mz+ez*6.6,tw-.9,.24,.24,panelClad,eangle);
  box('lift-tower-cap',mx+ex*3.2,top+5.7,mz+ez*3.2,tw+.7,.6,7.2,panelClad,eangle,true);
  return m.finish(top+6.0,['panel-and-glass-curtain-wall','free-standing-steel-colonnade','setback-top-floor','glazed-lift-tower']);
}

export function createBuildingStructure(b){
  switch(b.number){
    case '1': return humanities1(b);
    case '2': return humanities2(b);
    case '3': return humanities3(b);
    case '4': return shinyang(b);
    case '5': return humanities5(b);
    case '6': return humanities6(b);
    case '7': return humanities7(b);
    case '8': return doosan8(b);
    case '9': return education9(b);
    case '10': return education10(b);
    case '11': return education11(b);
    case '12': return education12(b);
    case '13': return education13(b);
    case '14': return humanities14(b);
    case '15': return law15(b);
    default: return null;
  }
}
