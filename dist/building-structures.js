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
  const frontGrid=[
    '111104111113111140111111','112114111111131111111141','111111114131111101111111',
    '114111112111111114111111','111114111101141111113111','111011141111111411111111',
    '101111111140111111141111','011100111111001101111101','111111114111111111111141'
  ];
  const frontPoints=curve.getSpacedPoints(24);
  function cladding(a,c,col,front){
    const len=Math.hypot(c[0]-a[0],c[1]-a[1]),angle=-Math.atan2(c[1]-a[1],c[0]-a[0]);
    const x=(a[0]+c[0])/2,z=(a[1]+c[1])/2,h=(screenTop-groundTop)/9;
    box('curtain-wall-mullion',a[0],(groundTop+screenTop)/2,a[1],.055,screenTop-groundTop,.17,metal,angle);
    for(let row=0;row<9;row++){
      const material=front?panelMaterials[Number(frontGrid[row][col%24])]:panelMaterials[5];
      box('individual-glass-panel',x,groundTop+(row+.5)*h,z,len-.045,h-.045,.13,material,angle);
      box('curtain-wall-transom',x,groundTop+row*h,z,len,.055,.18,metal,angle);
    }
  }
  for(let i=0;i<24;i++)cladding([frontPoints[i].x,frontPoints[i].z],[frontPoints[i+1].x,frontPoints[i+1].z],i,true);
  const rear=[guide[4],...guide.slice(5),guide[0]];
  for(let i=1;i<rear.length;i++){
    const a=rear[i-1],c=rear[i],n=Math.ceil(Math.hypot(c[0]-a[0],c[1]-a[1])/1.55);
    for(let j=0;j<n;j++)cladding([a[0]+(c[0]-a[0])*j/n,a[1]+(c[1]-a[1])*j/n],[a[0]+(c[0]-a[0])*(j+1)/n,a[1]+(c[1]-a[1])*(j+1)/n],j,false);
  }
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
  // The photographed thin tubular canopy has curved knees, not a solid porch.
  for(let i=2;i<=19;i+=3){
    const p=curve.getPoint(i/24),q=curve.getPoint(Math.min(1,i/24+.005));
    const dx=q.x-p.x,dz=q.z-p.z,len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
    const path=new THREE.CatmullRomCurve3([
      new THREE.Vector3(p.x+nx*1.25,.2,p.z+nz*1.25),
      new THREE.Vector3(p.x+nx*1.43,2.4,p.z+nz*1.43),
      new THREE.Vector3(p.x+nx*1.25,3.02,p.z+nz*1.25),
      new THREE.Vector3(p.x+nx*.35,3.08,p.z+nz*.35)]);
    const tube=new THREE.Mesh(new THREE.TubeGeometry(path,12,.052,6,false),concrete);tube.name='curved-entry-canopy-support';m.root.add(tube);
  }
  const headerPath=new THREE.CatmullRomCurve3(curve.getPoints(24).map(p=>new THREE.Vector3(p.x,3.08,p.z+.4)));
  const header=new THREE.Mesh(new THREE.TubeGeometry(headerPath,40,.052,6,false),concrete);header.name='curved-canopy-header';m.root.add(header);
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
  const m=builder(b),{box,polygon}=m;
  const outline=localFootprint(b),sign=ringSign(outline);
  const fh=3.5,top=14,frame=new THREE.MeshStandardMaterial({color:'#dddcd2',roughness:.88});
  const wall=new THREE.MeshStandardMaterial({color:'#65564c',roughness:.97});
  wall.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vBrickWorld;');
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
      vec4 brickPosition=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
        brickPosition=instanceMatrix*brickPosition;
      #endif
      vBrickWorld=(modelMatrix*brickPosition).xyz;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vBrickWorld;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float row=floor(vBrickWorld.y/.085);
      float u=(vBrickWorld.x+vBrickWorld.z)/.25+mod(row,2.)*.5;
      float v=vBrickWorld.y/.085;
      vec2 joint=abs(fract(vec2(u,v))-.5);
      vec2 aa=max(fwidth(vec2(u,v)),vec2(.015));
      float mortar=max(smoothstep(.46-aa.x,.49+aa.x,joint.x),smoothstep(.445-aa.y,.49+aa.y,joint.y));
      float tint=fract(sin(dot(vec2(floor(u),row),vec2(12.9898,78.233)))*43758.5453);
      diffuseColor.rgb*=mix(.92,1.07,tint);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.48,.46,.42),mortar*.32);`);
  };
  wall.customProgramCacheKey=()=> 'humanities1-brick-20260927';
  const pane=new THREE.MeshStandardMaterial({color:'#829d9b',roughness:.32,metalness:.22});
  const stairGlass=new THREE.MeshStandardMaterial({color:'#97bab3',roughness:.16,metalness:.08,transparent:true,opacity:.38,depthWrite:false});
  const aluminium=new THREE.MeshStandardMaterial({color:'#b7c1bb',roughness:.52,metalness:.3});
  const foundation=new THREE.MeshStandardMaterial({color:'#aaa38f',roughness:1});
  // The survey contains ONE long wing. The other wing in the official courtyard
  // photo is neighbouring building 2; do not turn building 1 into an invented L.
  polygon('survey-stone-plinth',offsetRing(outline,sign,-.08),0,.55,foundation);
  for(let f=0;f<=4;f++)polygon(`floor-slab-${f}`,offsetRing(outline,sign,.24),.5+f*fh,.42,frame);
  const edges=[];facades(outline,sign,e=>edges.push(e));
  function piece(e,name,u,y,w,h,depth,material,offset=0,pick=false){
    const [x,z]=e.at(u/e.length);
    return box(name,x+e.nx*offset,y,z+e.nz*offset,w,h,depth,material,e.angle,pick);
  }
  function opening(e,u,y,w,h,name){
    // Actual masonry opening: recessed glazing, four deep reveals, split sash.
    piece(e,name+'-glass',u,y,w,h,.09,pane,-.26);
    for(const v of [-1,1]){
      piece(e,name+'-jamb',u+v*(w/2+.065),y,.13,h+.24,.46,aluminium,-.04);
      piece(e,name+'-head-sill',u,y+v*(h/2+.06),w+.25,.12,.48,aluminium,-.02);
    }
    piece(e,name+'-mullion',u,y,.065,h,.14,aluminium,-.16);
  }
  for(const e of edges){
    if(e.index===4||e.index===5)continue; // West balcony openings use a dedicated end elevation below.
    // The two main faces are indices 0 (south) and 3 (pond/north).
    const long=e.length>40;
    const bays=long?12:1,step=e.length/bays;
    for(let f=0;f<4;f++){
      const bottom=.92+f*fh,ceiling=.5+(f+1)*fh;
      const wh=f===3?1.1:1.8,wy=bottom+(f===3?1.76:1.52);
      const ww=long?(f===3?2.05:3.25):2.8;
      if(!long){
        // The angled end facets have broad blind brickwork, not repeated windows.
        piece(e,'end-brick-panel',e.length/2,(bottom+ceiling)/2,e.length,ceiling-bottom,.4,wall,-.16,true);
        continue;
      }
      for(let j=0;j<bays;j++){
        const u=(j+.5)*step;
        piece(e,'window-spandrel',u,(bottom+wy-wh/2)/2,step,wy-wh/2-bottom,.4,wall,-.16);
        piece(e,'window-lintel-brick',u,(wy+wh/2+ceiling)/2,step,ceiling-wy-wh/2,.4,wall,-.16);
        for(const s of [-1,1])piece(e,'window-brick-pier',u+s*(ww/2+(step-ww)/4),wy,(step-ww)/2,wh,.4,wall,-.16);
        opening(e,u,wy,ww,wh,`level-${f+1}-paired-window`);
      }
    }
    // Concrete frame has fewer, wider structural bays than the window rhythm.
    const columns=long?6:1;
    for(let j=0;j<=columns;j++)piece(e,'white-frame-column',j*e.length/columns,7.5,.42,14,.62,frame,.04);
  }
  polygon('deep-cantilever-roof',offsetRing(outline,sign,1.45),14.5,.65,frame);
  polygon('inset-flat-roof',offsetRing(outline,sign,-.3),15.15,.1,roofMaterial);
  // Open concrete roof rail visible in the pond and historic end-wall photographs.
  facades(offsetRing(outline,sign,.92),sign,e=>{
    piece(e,'roof-rail-top',e.length/2,15.98,e.length,.22,.22,frame);
    for(let j=0,n=Math.ceil(e.length/3);j<=n;j++)piece(e,'roof-rail-upright',j*e.length/n,15.57,.18,.65,.22,frame);
  });
  // Split the end wall around the balcony doors; no solid end cap behind glass.
  const ex=30.65,za=-10.49,zb=10.49,doorZ=2.3,doorW=2.8;
  for(let f=0;f<4;f++){
    const lo=.92+f*fh,hi=.5+(f+1)*fh;
    if(f<2)box('west-blind-brick-wall',ex,(lo+hi)/2,0,.4,hi-lo,zb-za,wall,0,true);
    else{
      const doorTop=lo+2.4;
      for(const [a,c] of [[za,doorZ-doorW/2],[doorZ+doorW/2,zb]])
        box('west-door-side-masonry',ex,(lo+hi)/2,(a+c)/2,.4,hi-lo,c-a,wall,0,true);
      box('west-door-lintel',ex,(doorTop+hi)/2,doorZ,.4,hi-doorTop,doorW,wall);
      box('west-balcony-recessed-door',ex-.16,lo+1.2,doorZ,.08,2.4,doorW,pane,0,true);
      for(const z of [doorZ-doorW/2,doorZ,doorZ+doorW/2])
        box('west-door-frame',ex+.04,lo+1.2,z,.42,2.4,.09,aluminium);
    }
  }
  for(const z of [za,zb])box('west-end-corner-column',ex,7.5,z,.62,14,.45,frame);
  // West end: two open projecting balcony boxes observed in n-b34f3844.
  // Broad end wall remains blind; no speculative third balcony behind foliage.
  const endX=30.65;
  for(const y of [7.5,11]){
    box('west-balcony-slab',endX+1.0,y,2.3,2.4,.27,4.15,frame,0,true);
    box('west-balcony-parapet',endX+2.05,y+.58,2.3,.23,.9,4.15,frame,0,true);
    for(const z of [.33,4.27])box('west-balcony-side',endX+1,y+.58,z,2.3,.9,.21,frame);
  }
  // East/north connection: green lift blade beside a white framed stair enclosure.
  // Placement is photo/map inference, explicitly documented in ANALYSIS.md.
  const tx=-25.7,tz=12.45,th=17.8;
  box('east-stair-back',tx,th/2,10.65,5.8,th,.25,frame,0,true);
  for(const x of [tx-2.9,tx+2.9])box('east-stair-side',x,th/2,tz,.26,th,3.6,frame,0,true);
  for(let f=0;f<5;f++){
    const y=.5+f*fh;
    box('east-stair-landing',tx,y,13.35,5.8,.28,1.75,frame);
    for(let s=0;s<12;s++)box('visible-stair-tread',tx-2.25+s*.4,y+s*.245,12.15,.44,.14,1.5,frame);
    box('east-stair-front-glass',tx,y+1.7,14.23,5.25,3.12,.075,stairGlass);
    box('east-stair-front-transom',tx,y,14.31,5.8,.36,.25,frame);
  }
  box('east-stair-cap',tx,th,12.5,6.2,.42,4.1,frame,0,true);
  const lift=new THREE.MeshStandardMaterial({color:'#398f8e',roughness:.21,metalness:.35});
  box('green-lift-shaft',tx+4.08,7.7,13.1,2.2,15.4,3.05,lift,0,true);
  for(const x of [tx+2.97,tx+4.08,tx+5.19])box('lift-vertical-frame',x,7.7,14.65,.075,15.4,.09,aluminium);
  for(let f=0;f<=8;f++)box('lift-horizontal-frame',tx+4.08,f*1.925,14.66,2.25,.075,.1,aluminium);
  return m.finish(18.05,['single-survey-wing','paired-recessed-windows','small-top-floor-windows','open-west-balconies','east-stair-and-lift','deep-eaves','open-concrete-roof-rail']);
}

// --- 2동 인문관2 -------------------------------------------------------------
// Continuous ribbon glazing on the lower office floors, small punched windows
// in the brick above, under an unusually deep white fascia.
// Reconstructed photographed elevations (2, 3, 5, 6, 7, 9, 10).
// Reuse construction primitives, not a solid box behind cosmetic recesses.
const photoMasonryCache=new Map();
function photoMasonry(color){
  if(photoMasonryCache.has(color))return photoMasonryCache.get(color);
  const mat=new THREE.MeshStandardMaterial({color,roughness:.96});
  mat.onBeforeCompile=s=>{
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vMasonry;');
    s.vertexShader=s.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
      vec4 p=vec4(transformed,1.);\n#ifdef USE_INSTANCING\n p=instanceMatrix*p;\n#endif
      vMasonry=(modelMatrix*p).xyz;`);
    s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vMasonry;');
    s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float row=floor(vMasonry.y/.085);
      vec2 uv=vec2((vMasonry.x+vMasonry.z)/.245+mod(row,2.)*.5,vMasonry.y/.085);
      vec2 a=max(fwidth(uv),vec2(.01));vec2 f=abs(fract(uv)-.5);
      float mortar=max(smoothstep(.455-a.x,.49+a.x,f.x),smoothstep(.445-a.y,.49+a.y,f.y));
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*1.35,mortar*.3);`);
  };mat.customProgramCacheKey=()=> 'photo-masonry-v1';photoMasonryCache.set(color,mat);return mat;
}
function photoWing(b,cfg){
  const m=builder(b),{box,polygon,beam}=m;
  const outline=localFootprint(b),sign=ringSign(outline),fh=cfg.fh||3.5,base=cfg.base||.35;
  const top=base+fh*cfg.floors;
  const masonry=photoMasonry(cfg.brick||'#65564c');
  const frame=new THREE.MeshStandardMaterial({color:cfg.frame||'#dfddd2',roughness:.88});
  const glazing=new THREE.MeshStandardMaterial({color:cfg.glass||'#809d9a',roughness:.3,metalness:.23});
  const sash=new THREE.MeshStandardMaterial({color:'#a6b2ac',roughness:.5,metalness:.25});
  const edges=[];facades(outline,sign,e=>edges.push(e));
  function part(e,name,u,y,w,h,d,mat,offset=0,pick=false){
    const [x,z]=e.at(u/e.length);return box(name,x+e.nx*offset,y,z+e.nz*offset,w,h,d,mat,e.angle,pick);
  }
  // Build masonry only in the complement of the rectangles. Deep openings
  // have side returns and a back wall, never an opaque extrusion in front.
  function face(e,lo,hi,holes=[]){
    const us=[...new Set([0,e.length,...holes.flatMap(h=>[h.u-h.w/2,h.u+h.w/2])])].sort((a,b)=>a-b);
    const ys=[...new Set([lo,hi,...holes.flatMap(h=>[h.y-h.h/2,h.y+h.h/2])])].sort((a,b)=>a-b);
    for(let i=1;i<us.length;i++)for(let j=1;j<ys.length;j++){
      const u=(us[i-1]+us[i])/2,y=(ys[j-1]+ys[j])/2;
      if(holes.some(h=>Math.abs(u-h.u)<h.w/2&&Math.abs(y-h.y)<h.h/2))continue;
      part(e,'brick-around-openings',u,y,us[i]-us[i-1],ys[j]-ys[j-1],.36,masonry,-.18);
    }
    for(const h of holes){
      const depth=h.depth||.3,balcony=h.kind==='loggia';
      part(e,balcony?'loggia-recessed-back':'recessed-glass',h.u,h.y,h.w,h.h,.09,balcony?masonry:glazing,-depth,!!h.pick);
      for(const side of [-1,1]){
        part(e,'opening-jamb',h.u+side*(h.w/2+.065),h.y,.13,h.h+.12,depth+.16,balcony?frame:sash,-depth/2);
        part(e,'opening-head-sill',h.u,h.y+side*(h.h/2+.055),h.w+.23,.11,depth+.16,balcony?frame:sash,-depth/2);
      }
      if(balcony){
        part(e,'loggia-glass-door',h.u,h.y,h.w*.74,h.h*.87,.08,glazing,-depth+.1);
        part(e,'loggia-open-rail',h.u,h.y-h.h/2+.95,h.w,.22,.27,frame,.05);
        for(const t of [-.32,.32])part(e,'loggia-rail-post',h.u+h.w*t,h.y-h.h/2+.45,.18,.78,.25,frame,.05);
      }else{
        const n=h.w>3?3:2;
        for(let i=1;i<n;i++)part(e,'window-sash',h.u+h.w*(i/n-.5),h.y,.07,h.h,.13,sash,-depth+.07);
      }
      if(h.hood){
        part(e,'projecting-window-head',h.u,h.y+h.h/2+.18,h.w+.5,.27,1.05,frame,.32);
        for(const side of [-1,1])part(e,'deep-window-fin',h.u+side*(h.w/2+.18),h.y,.25,h.h+.5,1.05,frame,.32);
      }
      if(h.bars){
        for(let i=0;i<=Math.floor(h.w/.22);i++)part(e,'ground-window-bar',h.u-h.w/2+i*.22,h.y,.024,h.h,.045,sash,.12);
        part(e,'ground-grille-crossbar',h.u,h.y,h.w,.045,.06,sash,.13);
      }
    }
  }
  polygon('stone-ground-plinth',offsetRing(outline,sign,-.06),0,base,stoneBase);
  for(let f=0;f<=cfg.floors;f++)polygon(`b${b.number}-floor-${f}`,offsetRing(outline,sign,.2),base+f*fh,.48,frame);
  for(const e of edges){
    const mid=e.at(.5),end=cfg.endSign&&mid[0]*cfg.endSign>b.box.width*.40&&Math.abs(e.nz)<.5;
    if(end)continue;
    const long=Math.abs(e.c[0]-e.a[0])>Math.abs(e.c[1]-e.a[1])*2;
    for(let f=0;f<cfg.floors;f++){
      const lo=base+f*fh+.48,hi=base+(f+1)*fh;
      const holes=[];
      if(long&&e.length>5){
        const count=Math.max(1,Math.round(e.length/(cfg.pitch||4.5))),step=e.length/count;
        for(let j=0;j<count;j++){
          const u=(j+.5)*step,xy=e.at(u/e.length),isFront=e.nz*(cfg.frontSign||1)>.6;
          const upper=f===cfg.floors-1;
          let w=Math.min(step-.85,upper?(cfg.topWindow||1.55):(cfg.wide||3.1));
          let h=upper?1.22:1.85,y=lo+(upper?1.68:1.46),depth=.3,kind='window';
          if(cfg.entry&&isFront&&Math.abs(xy[0]-cfg.entry.x)<step*.48){
            w=Math.min(step-.7,cfg.entry.width||4.5);
            if(f===0){h=hi-lo-.15;y=lo+h/2;depth=cfg.entry.depth||1.8;}
            else if(cfg.entry.loggias){h=hi-lo-.15;y=lo+h/2;depth=2.2;kind='loggia';}
          }
          holes.push({u,w,h,y,depth,kind,hood:!!cfg.hood&&f===1&&kind==='window',bars:!!cfg.bars&&f===0&&depth<1});
        }
      }
      face(e,lo,hi,holes);
    }
    const n=long?Math.max(1,Math.round(e.length/(cfg.framePitch||8.5))):1;
    for(let i=0;i<=n;i++)part(e,'white-structural-column',i*e.length/n,base+cfg.floors*fh/2,.5,cfg.floors*fh,.58,frame,.07);
    if(long){
      const n=Math.max(1,Math.round(e.length/9));
      for(let i=0;i<=n;i++){
        const [x,z]=e.at(i/n);
        beam('rainwater-downpipe',[x+e.nx*.42,base,z+e.nz*.42],[x+e.nx*.42,top-.8,z+e.nz*.42],.065,sash);
        beam('eave-drain-elbow',[x+e.nx*.42,top-.8,z+e.nz*.42],[x+e.nx*1.5,top-.1,z+e.nz*1.5],.065,sash);
      }
    }
  }
  const eave=cfg.eave||1.5;
  polygon('deep-white-eave',offsetRing(outline,sign,eave),top,.6,frame);
  polygon('flat-roof-surface',offsetRing(outline,sign,-.2),top+.6,.13,roofMaterial);
  facades(offsetRing(outline,sign,eave-.4),sign,e=>{
    const rail=cfg.metalRail?railMaterial:frame;
    part(e,'open-roof-rail',e.length/2,top+1.42,e.length,cfg.metalRail?.045:.2,cfg.metalRail?.045:.22,rail);
    if(cfg.metalRail)part(e,'roof-mid-rail',e.length/2,top+1.06,e.length,.04,.04,rail);
    for(let i=0,n=Math.ceil(e.length/3);i<=n;i++)part(e,'roof-rail-post',i*e.length/n,top+1.03,cfg.metalRail?.04:.17,.7,cfg.metalRail?.04:.2,rail);
  });
  const end=cfg.endSign?{length:b.box.depth,nx:cfg.endSign,nz:0,angle:-Math.PI/2,at:t=>[cfg.endSign*(b.box.width/2-.4),-b.box.depth/2+t*b.box.depth]}:null;
  return {m,outline,sign,fh,base,top,frame,glazing,sash,masonry,edges,end,part,face,finish:parts=>m.finish(top+1.46,parts)};
}
function endElevation(s,options){
  const {end:e,part,face,base,fh,top,frame}=s;
  const floors=Math.round((top-base)/fh),u=e.length*(options.at||.5),width=options.width||3.6;
  for(let f=0;f<floors;f++){
    const lo=base+f*fh+.48,hi=base+(f+1)*fh;
    const isEntry=f===0&&options.entry;
    const glazed=(options.glazedLevels||[]).includes(f);
    const open=f>0&&((options.levels||[1,2,3]).includes(f)||glazed);
    const holes=open||isEntry?[{u:isEntry?e.length*(options.entryAt||.5):u,w:isEntry?options.entry:width,h:hi-lo-.12,y:(lo+hi-.12)/2,depth:isEntry?1.8:(options.balcony||glazed)?.35:2.5,kind:isEntry||options.balcony||glazed?'window':'loggia',pick:true}]:[];
    face(e,lo,hi,holes);
    if(open&&options.balcony){
      const y=base+f*fh+.1;
      part(e,'projecting-balcony-floor',u,y,width+.55,.25,2.2,frame,.85,true);
      part(e,'projecting-balcony-front',u,y+.61,width+.55,1.0,.22,frame,1.85,true);
      for(const a of [-1,1])part(e,'projecting-balcony-side',u+a*(width/2+.18),y+.61,.22,1,2.1,frame,.85);
    }
  }
  for(const x of [0,e.length])part(e,'end-corner-frame',x,(base+top)/2,.52,top-base,.62,frame,.07);
  for(let f=0;f<=floors;f++)part(e,'end-horizontal-band',e.length/2,base+f*fh+.24,e.length,.48,.64,frame,.08);
}
function humanities2(b){
  const s=photoWing(b,{floors:4,endSign:-1,wide:3.9,topWindow:1.6,pitch:4.7,framePitch:9.4,bars:true,eave:1.8});
  endElevation(s,{balcony:true,levels:[1,2,3],width:3.1,at:.57,entry:5});
  return s.finish(['three-large-window-levels','small-top-windows','ground-grilles','end-balcony-stack','open-concrete-roof-rail']);
}
function humanities3(b){
  const s=photoWing(b,{floors:4,endSign:1,pitch:4.2,wide:2.4,topWindow:1.7,eave:2,bars:true,hood:true,entry:{x:0,width:4,depth:2.3}});
  endElevation(s,{balcony:true,levels:[2,3],width:3.25,at:.6});
  return s.finish(['four-storey-survey-wing','paired-punched-windows','deep-second-floor-fins','two-end-balconies','ground-entry-recess']);
}
function humanities5(b){
  const s=photoWing(b,{floors:4,endSign:1,wide:2.3,topWindow:1.65,eave:1.65,bars:true,entry:{x:b.box.width*.38,width:4.8,depth:1.2}});
  endElevation(s,{levels:[1],glazedLevels:[2,3],width:3.5,at:.57,entry:b.box.depth*.65,entryAt:.58});
  // Bridge toward parallel building 3; gap and attachment point are map/photo estimates.
  const e=s.edges.filter(e=>e.nz>.8&&e.length>20).sort((a,b)=>b.length-a.length)[0];
  const z=e.at(.5)[1],x=7,reach=14.8,y=s.base+s.fh;
  const {box,beam}=s.m;
  box('bridge-floor',x,y,z+reach/2,3.5,.3,reach,s.frame,0,true);
  box('bridge-roof',x,y+2.7,z+reach/2,4,.23,reach,s.frame,0,true);
  for(const side of [-1,1]){
    box('bridge-side-glazing',x+side*1.67,y+1.45,z+reach/2,.1,2.2,reach,s.glazing);
    for(let j=0;j<=7;j++)box('bridge-metal-frame',x+side*1.7,y+1.45,z+j*reach/7,.09,2.3,.08,s.sash);
    beam('round-bridge-support',[x+side*1.35,0,z+reach*.7],[x+side*1.35,y-.15,z+reach*.7],.48,s.frame);
  }
  const sx=b.box.width/2+2,sz=1;
  for(let i=0;i<12;i++)box('external-entry-stair',sx,.12+i*.28,sz+i*.32,3,.22,.34,s.frame);
  for(const sign of [-1,1])beam('stair-sloping-rail',[sx+sign*1.45,1,sz],[sx+sign*1.45,4.08,sz+3.52],.065,railMaterial);
  return s.finish(['corner-recessed-glass-lobby','single-open-end-landing','end-stair-glazing','glazed-bridge-with-round-supports','external-stair-rail']);
}
function humanities6(b){
  const s=photoWing(b,{floors:4,endSign:-1,brick:'#795a43',wide:3.8,topWindow:1.6,pitch:4.6,eave:1.7,bars:true});
  endElevation(s,{balcony:true,levels:[1,2,3],width:3.2,at:.52});
  return s.finish(['warm-brown-brick','blind-end-wall','three-open-projecting-balconies','wide-lower-small-upper-windows','deep-drained-eaves']);
}
function humanities7(b){
  const s=photoWing(b,{floors:3,endSign:-1,brick:'#67523c',wide:2.35,topWindow:2.35,eave:1.55,bars:true,base:.65});
  endElevation(s,{levels:[1,2],width:3.4,at:.53,entry:5.5,entryAt:.72});
  // Retaining edge stays local to the end entrance, not an invented wall along the whole wing.
  const {part,end:e,frame}=s;
  for(let i=0;i<6;i++)part(e,'end-entry-steps',e.length*.72,.1+i*.11,6,.16,.38,frame,3-i*.38);
  for(let i=0;i<=5;i++)part(e,'short-retaining-baluster',i*1.65,1,.22,1,.5,frame,3.5);
  part(e,'short-retaining-coping',4.12,1.6,8.5,.2,.6,frame,3.5);
  return s.finish(['three-storey-low-wing','two-true-end-loggias','recessed-ground-entrance','open-concrete-roof-rail','short-entry-retaining-edge']);
}
function education9(b){
  const s=photoWing(b,{floors:4,endSign:1,wide:2.5,topWindow:1.7,pitch:4.2,hood:true,eave:1.75,metalRail:true});
  endElevation(s,{levels:[1,2,3],width:3.4,at:.49,entry:8,entryAt:.5});
  for(let i=0;i<4;i++)s.part(s.end,'wide-entry-stair',s.end.length*.5,.08+i*.1,9,.13,.45,s.frame,2.3-i*.4);
  return s.finish(['three-storey-open-stair-slot','recessed-end-glass-entrance','second-floor-deep-hoods','metal-roof-rail']);
}
function education10(b){
  const s=photoWing(b,{floors:4,base:.7,wide:3.25,topWindow:1.7,pitch:5.3,framePitch:5.3,hood:true,eave:1.8,metalRail:true,frontSign:-1,entry:{x:3,width:4.8,depth:2.3,loggias:true}});
  const e=s.edges.filter(e=>e.nz<-.8).sort((a,b)=>b.length-a.length)[0];
  const count=Math.max(1,Math.round(e.length/5.3)),step=e.length/count;
  const j=Math.max(0,Math.min(count-1,Math.round((3-e.a[0])/(e.c[0]-e.a[0])*count-.5))),u=(j+.5)*step;
  s.part(e,'entrance-projecting-canopy',u,s.base+3.05,7.2,.42,3.4,s.frame,1.3,true);
  for(let i=0;i<4;i++)s.part(e,'entrance-stair',u,.08+i*.14,7.5,.16,.4,s.frame,3.2-i*.37);
  for(const edge of s.edges){
    const n=Math.max(1,Math.round(edge.length/.8));
    for(let i=0;i<n;i++)s.part(edge,'granite-plinth-block',(i+.5)*edge.length/n,.33,edge.length/n-.04,.56,.12,stoneBase,.03);
  }
  return s.finish(['recessed-balconies-above-entry','deep-second-floor-window-fins','broad-entrance-canopy','coursed-granite-base','small-top-floor-windows']);
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
// 8동: explicit elevation schedules, traced from the archived front / end photos.
// Building 5 is beside local +X; the photographed long facade faces local -Z.
// All dimensions remain photo estimates within the mapped footprint.
function doosan8(b){
  const m=builder(b),{box,polygon}=m;
  const w=b.box.width,d=b.box.depth,x0=-w/2,x1=w/2,z0=-d/2,z1=d/2;
  const fh=3.5,roof=17.5,screen=21;
  const masonry=new THREE.MeshStandardMaterial({color:'#a18b77',roughness:.96});
  // Small physical-scale brick joints, shared across the individual wall pieces.
  masonry.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vBrickWorld;');
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
      vec4 brickPosition=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
        brickPosition=instanceMatrix*brickPosition;
      #endif
      vBrickWorld=(modelMatrix*brickPosition).xyz;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vBrickWorld;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float row=floor(vBrickWorld.y/.085);
      float u=(vBrickWorld.x+vBrickWorld.z)/.25+mod(row,2.)*.5;
      float v=vBrickWorld.y/.085;
      vec2 joint=abs(fract(vec2(u,v))-.5);
      vec2 aa=max(fwidth(vec2(u,v)),vec2(.015));
      float mortar=max(smoothstep(.46-aa.x,.49+aa.x,joint.x),smoothstep(.445-aa.y,.49+aa.y,joint.y));
      float tint=fract(sin(dot(vec2(floor(u),row),vec2(12.9898,78.233)))*43758.5453);
      diffuseColor.rgb*=mix(.92,1.07,tint);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.48,.46,.42),mortar*.32);`);
  };
  masonry.customProgramCacheKey=()=> 'doosan-brick-20260927';
  const zinc=new THREE.MeshStandardMaterial({color:'#38434b',roughness:.67,metalness:.24});
  const glazing=new THREE.MeshStandardMaterial({color:'#72909b',roughness:.28,metalness:.35});
  const frame=new THREE.MeshStandardMaterial({color:'#909da0',roughness:.62,metalness:.3});
  const recess=new THREE.MeshStandardMaterial({color:'#64594e',roughness:.98});
  // The entry wraps the near (+X/-Z) corner. No full-volume box behind this void.
  const entryLeft=w*.10,entryBack=z1-3.0;
  box('lower-rear-masonry',0,3.5,(entryBack+z1)/2,w,7,z1-entryBack,masonry,0,true);
  box('lower-front-solid-wing',(x0+entryLeft)/2,3.5,(z0+entryBack)/2,entryLeft-x0,7,entryBack-z0,masonry,0,true);
  box('entry-corner-brick-pier',x1-.85,3.5,z0+.85,1.7,7,1.7,masonry,0,true);
  box('entry-soffit',(entryLeft+x1)/2,7.04,(z0+entryBack)/2,x1-entryLeft,.16,entryBack-z0,zinc,0,true);
  box('entry-recess-back-wall',(entryLeft+x1)/2,3.5,entryBack-.10,x1-entryLeft,7,.20,recess,0,true);
  box('entry-interior-side-wall',entryLeft+.02,3.5,(z0+entryBack)/2,.08,7,entryBack-z0,recess);
  box('entry-recess-glass-doors',(entryLeft+x1)/2,1.48,entryBack-.23,4.5,2.95,.12,glazing);
  for(let i=-2;i<=2;i++)box('entry-door-mullion',(entryLeft+x1)/2+i*.9,1.48,entryBack-.32,.055,2.95,.08,zinc);
  box('entry-door-transom',(entryLeft+x1)/2,2.65,entryBack-.33,4.5,.06,.08,zinc);
  // Interior floor plates stop at the inside of the facade. Outer cladding is
  // assembled from wall panels around openings, so reveals have actual depth.
  box('upper-inset-core',0,12.25,0,w-1.05,10.5,d-1.05,masonry,0,true);
  for(const y of [7,10.5,14,17.5])box('internal-floor-plate',0,y,0,w-.35,.16,d-.35,zinc);
  // Front schedules run left to right as viewed from outside (-Z).
  // Wide blind end wall; progressively narrower vertical slots and broad piers.
  const frontRows=[
    [[.04,.032],[.12,.034],[.20,.036],[.28,.042],[.36,.032],[.44,.034],[.52,.036],[.60,.04],[.68,.033],[.76,.035]],
    [[.05,.034],[.13,.028],[.21,.037],[.29,.038],[.37,.035],[.45,.04],[.53,.03],[.61,.038],[.69,.034],[.77,.03]],
    [[.045,.03],[.125,.033],[.205,.035],[.285,.04],[.365,.029],[.445,.037],[.525,.043],[.605,.03],[.685,.036],[.765,.032]]
  ];
  const endRows=[[[.12,.05],[.40,.065],[.68,.16]],[[.18,.05],[.49,.11],[.75,.055]],[[.13,.13],[.47,.045],[.73,.14]]];
  // Local side parameter reversal puts the projecting bay at the entry end.
  function elevation(name,length,origin,angle,rows,reverse=false){
    const c=Math.cos(angle),s=Math.sin(angle);
    const place=(part,t,y,ww,hh,depth,offset,mat,pick=false)=>{
      const u=(t-.5)*length;
      box(name+'-'+part,origin[0]+c*u+s*offset,y,origin[1]-s*u+c*offset,ww,hh,depth,mat,angle,pick);
    };
    for(let f=0;f<3;f++){
      const slots=rows[f].map(([t,ww])=>[reverse?1-t:t,ww]).sort((a,b)=>a[0]-b[0]);
      let start=0;const y=7+f*fh;
      for(const [t,ww] of slots){
        const left=t-ww/2,right=t+ww/2;
        if(left>start)place('brick-pier',(start+left)/2,y+fh/2,(left-start)*length,fh-.10,.46,0,masonry,true);
        place('full-height-slot',t,y+fh/2,ww*length,fh-.1,.16,-.13,zinc);
        const gh=fh*.64,gy=y+fh*.53;
        place('recessed-glass',t,gy,ww*length-.13,gh,.075,-.035,glazing);
        for(const side of [-1,1])place('thin-window-jamb',t+side*(ww/2-.025/length),gy,.045,gh+.08,.09,.01,frame);
        for(const yy of [gy-gh/2,gy+gh/2])place('thin-window-transom',t,yy,ww*length,.055,.09,.01,frame);
        if(ww*length>1.5)place('opening-light-mullion',t+ww*.22,gy,.045,gh,.09,.01,frame);
        start=right;
      }
      if(start<1)place('brick-end-wall',(1+start)/2,y+fh/2,(1-start)*length,fh-.1,.46,0,masonry,true);
      place('horizontal-metal-joint',.5,y,length,.065,.13,.25,zinc);
    }
    place('roof-edge-band',.5,roof,length,.10,.16,.24,zinc);
    return place;
  }
  const front=elevation('courtyard',w,[0,z0],Math.PI,frontRows,true);
  const end=elevation('entry-end',d,[x1,0],Math.PI/2,endRows);
  // Back elevations are deliberately restrained: available photos only show
  // parts behind building 7. No copied random all-around window treatment.
  elevation('rear',w,[0,z1],0,[[[.12,.045],[.8,.06]],[[.12,.045],[.8,.06]],[[.12,.045],[.8,.06]]]);
  elevation('far-end',d,[x0,0],-Math.PI/2,[[[.18,.06],[.82,.05]],[[.18,.06],[.82,.05]],[[.18,.06],[.82,.05]]]);
  // Thin joints across the otherwise predominantly solid two-storey base.
  for(const y of [0.1,3.5]){
    box('base-long-horizontal-joint',(x0+entryLeft)/2,y,z0-.025,entryLeft-x0,.065,.11,zinc);
    box('base-side-horizontal-joint',x1+.025,y,(entryBack+z1)/2,.11,.065,z1-entryBack,zinc);
  }
  for(const x of [x0+3,x0+7,x0+11])box('base-panel-joint',x,3.5,z0-.025,.035,6.9,.07,zinc);
  box('base-vent',x0+4,1.65,z0-.07,1,2.35,.12,zinc);
  for(let y=.55;y<2.8;y+=.13)box('vent-louvre',x0+4,y,z0-.15,.92,.035,.09,frame);
  // The projecting dark bay occupies TWO upper levels, near the entrance end,
  // rather than a three-storey block in the middle of the elevation.
  const bayX=x1-4.0,bayW=2.65,bayBottom=10.5,bayTop=17.5;
  box('two-level-projecting-bay',bayX,(bayBottom+bayTop)/2,z0-.65,bayW,bayTop-bayBottom,1.30,zinc,0,true);
  for(const y of [12.5,16.0]){
    box('bay-glass',bayX,y,z0-1.315,bayW-.28,2.05,.07,glazing);
    box('bay-vertical-mullion',bayX+.43,y,z0-1.36,.055,2.05,.06,zinc);
    box('bay-horizontal-mullion',bayX,y+.42,z0-1.36,bayW-.28,.06,.06,zinc);
  }
  // Sixth level: open framed terrace screen, with a continuous top lintel.
  // Solid wide end panels alternate with openings; no crenellated roof teeth.
  function screenWall(place,slots,length){
    let start=0;
    for(const [t,ww] of slots){
      const l=t-ww/2,r=t+ww/2;
      if(l>start)place('terrace-brick-panel',(start+l)/2,19.25,(l-start)*length,3.5,.42,0,masonry,true);
      place('terrace-low-metal-guard',t,18.15,ww*length,1.15,.13,-.04,zinc);
      start=r;
    }
    if(start<1)place('terrace-solid-end',(start+1)/2,19.25,(1-start)*length,3.5,.42,0,masonry,true);
    place('continuous-top-lintel',.5,screen,length,.13,.46,0,zinc,true);
  }
  screenWall(front,[[.12,.08],[.25,.07],[.39,.06],[.51,.05],[.63,.06],[.74,.05]],w);
  screenWall(end,[[.12,.13],[.40,.13],[.72,.13]],d);
  // Roof floor set below the screen, with a setback enclosed room at the rear.
  box('terrace-floor',0,17.52,0,w-.8,.16,d-.8,roofMaterial);
  box('setback-sixth-floor',-2,19.2,4,w*.57,3.3,d*.48,masonry,0,true);
  box('setback-roof',-2,20.89,4,w*.57+.1,.12,d*.48+.1,zinc,0,true);
  box('rear-rooftop-equipment',x0+3,21.5,z1-4,4.6,3.0,4.2,zinc,0,true);
  // Modest entrance approach; campus terrain is still flat and not surveyed.
  for(let j=0;j<5;j++)box('entry-threshold-step',(entryLeft+x1)/2,.08*(j+1),z0-2+j*.4,x1-entryLeft,.16*(j+1),.42,concrete);
  return m.finish(23,['explicit-floor-window-schedules','recessed-full-height-slots','two-storey-open-corner-entry','two-level-offset-metal-bay','continuous-terrace-lintel','setback-roof-room']);
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

// 15-1: pale-stone teaching wing and an open gateway, from the archived front photo.
// Heights, concealed elevations and the exact portal alignment remain estimates.
function lawLecture151(b){
  const m=builder(b),{box,polygon}=m;
  const stone=new THREE.MeshStandardMaterial({color:'#d3d3cb',roughness:.86});
  const joint=new THREE.MeshStandardMaterial({color:'#aaaead',roughness:.9});
  const glazing=new THREE.MeshStandardMaterial({color:'#6f9299',metalness:.3,roughness:.25});
  const railGlass=new THREE.MeshStandardMaterial({color:'#9bc4bd',transparent:true,opacity:.48,roughness:.2,depthWrite:false,side:THREE.DoubleSide});
  const frame=new THREE.MeshStandardMaterial({color:'#c1cac9',metalness:.35,roughness:.45});
  const pts=localFootprint(b),front=-26.37,back=-19.6,top=14.2;
  // Divide the wall around holes instead of covering windows or the passage with a solid box.
  function facade(z,holes){
    const xs=[-31.1,32.1,...holes.flatMap(h=>[h[0],h[1]])].sort((a,b)=>a-b);
    const ys=[.25,top,...holes.flatMap(h=>[h[2],h[3]])].sort((a,b)=>a-b);
    for(let i=1;i<xs.length;i++)for(let j=1;j<ys.length;j++){
      const x=(xs[i]+xs[i-1])/2,y=(ys[j]+ys[j-1])/2,w=xs[i]-xs[i-1],h=ys[j]-ys[j-1];
      if(w<.01||h<.01||holes.some(r=>x>r[0]&&x<r[1]&&y>r[2]&&y<r[3]))continue;
      box('stone-facade-segment',x,y,z,w,h,.36,stone,0,true);
      for(let yy=Math.ceil(ys[j-1]/.7)*.7;yy<ys[j];yy+=.7)box('stone-horizontal-joint',x,yy,z-.19,w,.015,.01,joint);
      for(let xx=Math.ceil(xs[i-1]/1.7)*1.7;xx<xs[i];xx+=1.7)box('stone-vertical-joint',xx,y,z-.19,.014,h,.01,joint);
    }
    for(const [a,c,lo,hi,open] of holes){
      if(open)continue;
      box('recessed-glass', (a+c)/2,(lo+hi)/2,z+.28,c-a,hi-lo,.12,glazing,0,true);
      for(let x=a;x<=c;x+=1.35)box('window-mullion',x,(lo+hi)/2,z+.16,.055,hi-lo,.13,frame);
      box('window-sill',(a+c)/2,lo,z,c-a,.12,.7,stone);
      box('window-head',(a+c)/2,hi,z,c-a,.1,.6,stone);
      box('window-transom',(a+c)/2,lo+(hi-lo)*.28,z+.15,c-a,.05,.15,frame);
    }
  }
  const portal=[-2.8,16.8,.25,5.4,true],windows=[[-26,-12,1.3,4.9],[-6.5,17.2,6.6,9.8],[23,31,1.4,4.7]];
  const slits=[9,11.3,13.6,15.9].map(x=>[x,x+.68,11.2,13.05]);
  facade(front,[portal,...windows,...slits]);
  facade(back,[portal,[-8,18,6.6,9.8]]);
  // Portal soffit is above the opening; the full width remains walkable below.
  box('gateway-soffit',7,5.55,(front+back)/2,19.6,.3,back-front,stone,0,true);
  for(const x of [-3.05,17.05])box('gateway-return',x,2.8,(front+back)/2,.5,5.1,back-front,stone,0,true);
  box('gateway-upper-floor',.5,10.05,(front+back)/2,63.2,.3,back-front,stone,0,true);
  box('gateway-end-wall',32.1,7.2,(front+back)/2,.36,13.9,back-front,stone,0,true);
  box('gateway-end-wall',-31.1,7.2,(front+back)/2,.36,13.9,back-front,stone,0,true);
  box('gateway-roof',.5,14.35,(front+back)/2,64,.3,back-front+.5,roofMaterial,0,true);
  for(const x of [-6.8,-5.5,17.6,18.9]){
    box('paired-portal-pier',x,4.85,front-.5,.63,9.1,.9,stone,0,true);
    box('pier-cap',x,9.45,front-.5,.95,.24,1.14,stone);
    box('pier-base',x,.55,front-.5,.91,.35,1.15,stone);
  }
  // The return wing follows the measured L-shaped outline, leaving the court open.
  const wing=[pts[0],pts[1],pts[2],[-31.1,back+.4],[-13.5,back+.4],pts[7]];
  polygon('return-wing-mass',wing,.25,13.95,stone);
  polygon('return-wing-roof',wing,14.2,.35,roofMaterial);
  for(let z=-15;z<24;z+=3.2){
    box('courtyard-recess-shadow',-13.65,4.6,z,.14,6,2.6,darkGlass);
    box('courtyard-window',-13.54,4.6,z,.1,5.65,2.35,glazing);
    box('courtyard-window-transom',-13.45,4.6,z,.12,.07,2.35,frame);
  }
  for(const z of [front-.05,back+.05]){
    box('roof-glass-balustrade',.5,15.02,z,63.5,1.02,.1,railGlass);
    box('roof-handrail',.5,15.57,z,63.8,.07,.1,frame);
    for(let x=-31;x<33;x+=1.65)box('roof-rail-post',x,15,z,.055,1.17,.11,frame);
  }
  box('passage-paving',7,.13,(front+back)/2,19.6,.15,back-front+2,concrete);
  return m.finish(15.65,['L-shaped-stone-wing','open-gateway','paired-entry-piers','upper-window-band','four-upper-slits','glass-roof-rail']);
}


// Shared construction fittings, not shared building masses. All openings are
// cut into the wall grid; no opaque box is placed behind the glazing.
function campusElevation(m,e,lo,hi,holes,wall,trim=concrete){
  const piece=(name,u,y,w,h,d,mat,offset=0,pick=false)=>{
    const [x,z]=e.at(u/e.length);return m.box(name,x+e.nx*offset,y,z+e.nz*offset,w,h,d,mat,e.angle,pick);
  };
  const valid=holes.filter(h=>h.u-h.w/2>=0&&h.u+h.w/2<=e.length&&h.y-h.h/2>=lo&&h.y+h.h/2<=hi);
  const us=[...new Set([0,e.length,...valid.flatMap(h=>[h.u-h.w/2,h.u+h.w/2])])].sort((a,b)=>a-b);
  const ys=[...new Set([lo,hi,...valid.flatMap(h=>[h.y-h.h/2,h.y+h.h/2])])].sort((a,b)=>a-b);
  for(let i=1;i<us.length;i++)for(let j=1;j<ys.length;j++){
    const u=(us[i-1]+us[i])/2,y=(ys[j-1]+ys[j])/2;
    if(valid.some(h=>Math.abs(u-h.u)<h.w/2&&Math.abs(y-h.y)<h.h/2))continue;
    piece('masonry-between-openings',u,y,us[i]-us[i-1],ys[j]-ys[j-1],.38,wall,-.19,true);
  }
  for(const h of valid){
    const d=h.depth||.42;
    piece('recessed-window-pane',h.u,h.y,h.w,h.h,.08,h.material||glass,-d,true);
    for(const side of [-1,1]){
      piece('deep-window-jamb',h.u+side*(h.w/2+.055),h.y,.11,h.h+.16,d+.12,trim,-d/2);
      piece('window-head-sill',h.u,h.y+side*(h.h/2+.055),h.w+.2,.11,d+.12,trim,-d/2);
    }
    for(let k=1,n=Math.max(2,Math.ceil(h.w/1.4));k<n;k++)piece('window-mullion',h.u+h.w*(k/n-.5),h.y,.055,h.h,.12,metal,-d+.1);
    piece('window-transom',h.u,h.y-h.h*.22,h.w,.05,.12,metal,-d+.1);
  }
  return piece;
}
function slimRail(m,x,y,z,w){
  m.box('terrace-handrail',x,y+1.05,z,w,.045,.045,railMaterial);
  m.box('terrace-midrail',x,y+.53,z,w,.035,.035,railMaterial);
  for(let t=-w/2;t<=w/2;t+=1.35)m.box('terrace-rail-post',x+t,y+.5,z,.04,1,.04,railMaterial);
}
function shinyang161(b){
  const m=builder(b),{box,polygon}=m,w=b.box.depth,d=b.box.width,front=d/2;
  m.root.rotation.y+=Math.PI/2; // Short end is the photographed entrance facade.
  const raw=new THREE.MeshStandardMaterial({color:'#bcbeb5',roughness:.96});
  const black=new THREE.MeshStandardMaterial({color:'#283d40',roughness:.6});
  const pts=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]],sign=ringSign(pts),edges=[];facades(pts,sign,e=>edges.push(e));
  // Parking is empty below a raised entrance terrace. The ground lobby is inset.
  for(const x of [-w/2+1,w/2-1])for(const z of [-d/2+2,d/2-2])box('parking-pilotis',x,1.65,z,.65,3.3,.65,raw,0,true);
  polygon('raised-entrance-deck',offsetRing(pts,sign,1),3.15,.4,raw);
  for(const e of edges){
    const count=Math.max(1,Math.round(e.length/2.4));
    const holes=[{u:e.length/2,w:e.length-1.25,y:5.45,h:3.35,depth:1.3}];
    campusElevation(m,e,3.55,7.65,holes,raw,black);
  }
  for(const y of [7.65,11.75,15.85])polygon('exposed-concrete-floor-edge',pts,y,.65,raw);
  for(const e of edges){
    for(let level=0;level<2;level++){
      const y=8.3+level*4.1,frontFace=e.nz>.8,holes=[];
      if(frontFace)holes.push({u:e.length/2,w:e.length-2,h:3.35,y:y+1.675,depth:.72});
      else if(e.length>3)for(let j=0,n=Math.max(1,Math.floor(e.length/1.8));j<n;j++)holes.push({u:(j+.5)*e.length/n,w:e.length/n-.65,h:3.35,y:y+1.675,depth:.4});
      const part=campusElevation(m,e,y,y+3.45,holes,raw,black);
      if(frontFace)for(let k=0;k<7;k++)part('horizontal-sun-louvre',e.length/2,y+2.25+k*.16,e.length-2,.07,.34,black,.18);
    }
  }
  polygon('flat-concrete-roof',pts,16.5,.22,roofMaterial);
  for(const x of [-w/2+.45,w/2-.45])box('full-height-concrete-side-frame',x,12.15,front,.9,8.6,1.4,raw,0,true);
  // Wide central approach, with solid cheeks and a genuinely open space below the terrace.
  for(let i=0;i<19;i++){const h=(i+1)*3.5/19;box('broad-entrance-stair',3,h/2,front+9.4-i*.44,7,h,.47,raw,0,true);}
  for(const x of [-.7,6.7])m.beam('stair-side-handrail',[x,1.05,front+9.6],[x,4.55,front+1.2],.065,railMaterial);
  slimRail(m,-w/4-1,3.55,front+.9,w/2-3);slimRail(m,w/2-4,3.55,front+.9,6);
  slimRail(m,0,16.72,-d/2+.3,w-1);
  return m.finish(17.8,['raised-pilotis-terrace','broad-approach-stair','inset-glazed-ground-floor','concrete-upper-frame','horizontal-louvres','narrow-side-window-fins']);
}
function law17(b){
  const m=builder(b),pts=localFootprint(b),sign=ringSign(pts),edges=[];facades(pts,sign,e=>edges.push(e));
  const red=photoMasonry('#846554'),frame=new THREE.MeshStandardMaterial({color:'#d3d3c8',roughness:.88}),black=new THREE.MeshStandardMaterial({color:'#353b40',roughness:.5,metalness:.25});
  for(let f=0;f<=5;f++)m.polygon('law-floor-slab',pts,.35+f*3.6,.3,f===5?frame:red);
  for(const e of edges)for(let f=0;f<5;f++){
    const lo=.65+f*3.6,hi=.35+(f+1)*3.6,holes=[];
    if(e.length>4)for(let j=0,n=Math.max(1,Math.round(e.length/4.1));j<n;j++)holes.push({u:(j+.5)*e.length/n,w:Math.min(e.length/n-.9,f===4?3:2.2),y:lo+1.55,h:f===4?2.7:1.85,depth:.55});
    if(f===0&&e.nz>.8&&e.a[0]<2&&e.c[0]>2){
      const u=(2-e.a[0])/(e.c[0]-e.a[0])*e.length;
      for(let k=holes.length-1;k>=0;k--)if(Math.abs(holes[k].u-u)<5)holes.splice(k,1);
      holes.push({u,w:6.2,y:(lo+hi)/2,h:hi-lo-.12,depth:1.2});
    }
    campusElevation(m,e,lo,hi,holes,f===4?frame:red,frame);
  }
  m.polygon('broad-law-roof-eave',offsetRing(pts,sign,1.4),18.35,.4,frame);
  const x=2,z=12.3;
  // The glass bay is suspended above the deeply recessed entrance, not grounded as a tower.
  for(const xx of [x-4.1,x+4.1])m.box('tall-dark-entry-jamb',xx,9.5,z+1.7,.72,18.5,3.6,black,0,true);
  for(let f=1;f<5;f++){
    const y=.35+f*3.6;
    m.box('projecting-glass-bay',x,y+1.8,z+3.43,7.5,3.3,.16,glass,0,true);
    m.box('projecting-bay-floor-band',x,y,z+1.7,8.6,.36,3.6,black,0,true);
    m.box('bay-centre-mullion',x,y+1.8,z+3.55,.08,3.3,.12,metal);
    for(const xx of [x-3.77,x+3.77])m.box('bay-side-glass',xx,y+1.8,z+1.7,.12,3.3,3.4,glass);
  }
  m.box('entry-portal-header',x,3.65,z+4.5,11,.8,1,black,0,true);
  for(const xx of [x-5.1,x+5.1])m.box('entry-portal-column',xx,1.95,z+4.5,.75,3.9,1,black,0,true);
  m.box('recessed-entry-door',x,1.8,z+.2,6,2.8,.14,darkGlass,0,true);
  for(let i=0;i<4;i++)m.box('entry-step',x,.1+i*.13,z+6-i*.4,10,.2,.45,frame);
  return m.finish(19,['stepped-survey-footprint','deep-red-brick-window-reveals','light-glazed-top-storey','suspended-glazed-entry-bay','open-dark-portal','overhanging-roof']);
}
function pharmacy20(b){
  const m=builder(b),{box,polygon}=m,w=b.box.width,d=b.box.depth,front=d/2,pts=localFootprint(b),sign=ringSign(pts);
  const warm=photoMasonry('#947657'),dark=new THREE.MeshStandardMaterial({color:'#333a3c',roughness:.5}),stone=new THREE.MeshStandardMaterial({color:'#b7b3a1',roughness:.88});
  // Low podium and inset glazed ground floor carry two brick-clad upper wings.
  box('low-stone-podium',0,1.45,0,w,2.9,d,stone,0,true);
  for(const y of [2.9,6.5,10.5,14.5,18.5,22.5])polygon('pharmacy-floor-plate',pts,y,.25,stone);
  const edges=[];facades(pts,sign,e=>edges.push(e));
  for(const e of edges){
    const n=Math.max(1,Math.floor(e.length/2.5)),holes=Array.from({length:n},(_,j)=>({u:(j+.5)*e.length/n,w:e.length/n-.2,y:4.8,h:3.2,depth:1.1}));
    campusElevation(m,e,3.15,6.5,holes,stone,dark);
    for(let f=0;f<4;f++){
      const lo=6.75+f*4,upper=[];
      for(let j=0,k=Math.max(1,Math.round(e.length/1.7));j<k;j++)upper.push({u:(j+.5)*e.length/k,w:Math.min(.78,e.length/k-.4),y:lo+1.85,h:3.5,depth:.32});
      if(e.nz>.8&&Math.min(e.a[0],e.c[0])<-3.5&&Math.max(e.a[0],e.c[0])>3.5){
        const u=-e.a[0]/(e.c[0]-e.a[0])*e.length;
        for(let k=upper.length-1;k>=0;k--)if(Math.abs(upper[k].u-u)<4)upper.splice(k,1);
        upper.push({u,w:6.4,y:lo+1.875,h:3.7,depth:1.3,material:darkGlass});
      }
      campusElevation(m,e,lo,lo+3.75,upper,warm,dark);
    }
  }
  // Tall central recess and separate projecting oriel stacks are the photo's strongest cues.
  for(const x of [-3.5,3.5])box('central-recess-return',x,14.5,front+.55,.45,16,1.3,dark,0,true);
  for(const x of [-43,-33,-23,-13,13,23,33,43])for(let f=0;f<3;f++){
    const y=8.5+f*4;
    box('oriel-projecting-glass-front',x,y,front+1.15,2.9,3.05,.12,glass,0,true);
    for(const xx of [x-1.47,x+1.47])box('oriel-glazed-side',xx,y,front+.55,.1,3.05,1.15,glass);
    for(const yy of [y-1.62,y+1.62])box('oriel-slab-cap',x,yy,front+.55,3.2,.18,1.35,stone);
    for(const xx of [x-1.45,x,x+1.45])box('oriel-vertical-frame',xx,y,front+1.23,.05,3.15,.09,dark);
  }
  box('continuous-ground-canopy',0,6.6,front+.85,w+1,.35,2.8,stone,0,true);
  box('setback-roof-service-core',0,24,0,11,3,8,dark,0,true);
  // Open pergola: individual rafters and columns; no filled roof pavilion.
  for(const x of [-27,-18,-9,9,18,27])for(const z of [-6,6])box('rooftop-pergola-post',x,24,z,.16,3,.16,metal);
  for(const z of [-7,7])box('pergola-long-edge',0,25.6,z,56,.2,.24,metal);
  for(let x=-28;x<=28;x+=2)box('open-rooftop-rafter',x,25.5,0,.14,.16,14,metal);
  for(let x=-w/2+2;x<w/2;x+=2.4)if(Math.abs(x)>29)box('roof-plant-unit',x,23.1,-5,1.4,.9,1.3,metal);
  slimRail(m,0,3.15,front+1.7,w-1);
  return m.finish(25.8,['long-stone-podium','inset-glass-base','narrow-brick-piers','three-level-projecting-oriels','central-dark-recess','open-roof-pergola']);
}
function pharmacy21(b){
  const s=photoWing(b,{floors:4,base:.8,brick:'#625d57',wide:3.5,topWindow:2,pitch:4.7,framePitch:9.4,eave:2.1,hood:true,bars:true,entry:{x:14,width:4.1,depth:1.9}});
  const {box,beam}=s.m,z=b.box.depth/2,x=14;
  box('deep-entry-canopy',x,4.05,z+2.2,11,.75,4.4,s.frame,0,true);
  for(const xx of [x-5.15,x+5.15])box('canopy-support-return',xx,2.15,z+1.1,.6,4.1,2.2,s.frame,0,true);
  for(let j=0;j<7;j++)box('wide-entry-stair',x,(j+1)*.11,z+5-j*.42,11,(j+1)*.22,.45,concrete,0,true);
  for(const xx of [x-5.6,x+5.6])beam('entry-stair-side-rail',[xx,.95,z+5],[xx,2.1,z+2.1],.07,railMaterial);
  for(let xx=x-4.5;xx<x+5;xx+=1.5)box('canopy-soffit-rib',xx,3.62,z+2.1,.15,.22,3.9,s.frame);
  return s.finish(['grey-brick-wing','white-structural-frame','deep-window-fins','coffered-entrance-canopy','wide-steps-and-side-rails']);
}
function naturalScience22(b){
  const s=photoWing(b,{floors:3,base:.5,brick:'#746957',wide:4.1,topWindow:3.3,pitch:5.1,framePitch:10.2,eave:2.3,bars:true,entry:{x:-10,width:4.7,depth:1.4}});
  const {box}=s.m,z=b.box.depth/2,x=-3.2;
  // Narrow, continuous glazed stair strip with visible half-landings.
  for(const xx of [x-1.65,x+1.65])box('stair-strip-concrete-fin',xx,5.5,z+.58,.38,10.2,1.45,s.frame,0,true);
  box('continuous-stair-glazing',x,5.6,z+1.28,2.95,10.1,.13,glass,0,true);
  for(let y=1.1;y<10.7;y+=1.75){box('stair-half-landing',x,y,z+.38,2.9,.13,1.8,concrete);box('blue-stair-transom',x,y,z+1.4,3.3,.1,.17,railMaterial);}
  box('recessed-entry-canopy',-10,3.55,z+1.35,8.7,.35,3,s.frame,0,true);
  for(let j=0;j<4;j++)box('science-entry-step',-10,.13+j*.13,z+3.5-j*.4,8.5,.22,.42,concrete);
  return s.finish(['three-storey-brick-wing','continuous-glazed-stair-strip','half-landing-transoms','deep-cantilevered-eave','barred-ground-windows','recessed-entrance']);
}


// Remove only near-collinear survey vertices so one long facade does not gain
// invented piers at arbitrary OSM vertices. Corners and re-entrant bays remain.
function cleanSurveyRing(points){
  const out=points.map(p=>[...p]);let changed=true;
  while(changed&&out.length>3){changed=false;for(let i=0;i<out.length;i++){
    const a=out[(i+out.length-1)%out.length],b=out[i],c=out[(i+1)%out.length];
    const len=edgeLength(a,c);if(len<.01)continue;
    const dist=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/len;
    if(dist<.16&&(b[0]-a[0])*(b[0]-c[0])+(b[1]-a[1])*(b[1]-c[1])<=0){out.splice(i,1);changed=true;break;}
  }}return out;
}
function science23(b){
  const m=builder(b),pts=cleanSurveyRing(localFootprint(b)),sign=ringSign(pts),top=14.6;
  const brown=photoMasonry('#625b4d'),pale=new THREE.MeshStandardMaterial({color:'#d5d4c8',roughness:.9});
  for(let f=0;f<=4;f++)m.polygon('science23-floor-band',offsetRing(pts,sign,.12),.5+f*3.5,.48,pale);
  facades(pts,sign,e=>{
    const long=e.length>25,n=Math.max(1,Math.round(e.length/4.1)),step=e.length/n;
    for(let f=0;f<4;f++){
      const lo=.98+f*3.5,hi=.5+(f+1)*3.5,holes=[];
      if(long)for(let j=0;j<n;j++)holes.push({u:(j+.5)*step,w:f>=2?1.8:step-.85,y:lo+1.5,h:f>=2?1.55:2.3,depth:.38});
      campusElevation(m,e,lo,hi,holes,brown,pale);
    }
    const nCols=Math.max(1,Math.round(e.length/8.2));
    for(let j=0;j<=nCols;j++){const [x,z]=e.at(j/nCols);m.box('science23-full-height-pier',x,7.5,z,.52,14,.66,pale,e.angle);}
  });
  m.polygon('science23-deep-eave',offsetRing(pts,sign,1.5),top,.55,pale);
  facades(offsetRing(pts,sign,1.3),sign,e=>{
    const [x,z]=e.at(.5);m.box('science23-open-roof-rail',x,16,z,e.length,.2,.23,pale,e.angle);
    for(let j=0,n=Math.ceil(e.length/3.7);j<=n;j++){const [x,z]=e.at(j/n);m.box('science23-roof-rail-post',x,15.57,z,.2,.7,.25,pale);}
  });
  // The planted pergola in the photograph is landscape, not a building wing.
  return m.finish(16.1,['four-storey-dark-brick-frame','two-upper-punched-window-levels','wide-lower-glazing','deep-white-eave','open-concrete-roof-rail']);
}
function science251(b){
  const m=builder(b),{box,polygon}=m;
  const red=photoMasonry('#956550'),pale=new THREE.MeshStandardMaterial({color:'#d0d3cc',roughness:.83});
  const pane=new THREE.MeshStandardMaterial({color:'#89b4b0',roughness:.28,metalness:.2});
  const front=2.6,back=-18.4;
  // Double-height opening below the central wing; columns are independent solids.
  const west=[[-34.8,-18.4],[-14.8,-18.4],[-14.8,2.6],[-34.8,2.6]];
  facades(west,ringSign(west),e=>{
    const holes=e.nz>.8?[
      {u:4,w:5.6,y:2.4,h:3.8,depth:.45,material:pane},
      {u:11,w:5.6,y:2.4,h:3.8,depth:.45,material:pane},
      {u:17,w:3.5,y:6.15,h:1.65,depth:.4,material:pane}
    ]:[];
    campusElevation(m,e,.1,8,holes,red,pale);
  });
  box('east-grounded-service-wing',27,4,-9,15.5,8,18.8,red,0,true);
  for(const x of [-11,-3,5,13])for(const z of [-15,1.8])box('double-height-pilotis',x,4,z,.82,8,.85,pale,0,true);
  // Four teaching levels, with the west end stepping back at the upper two.
  for(let f=0;f<4;f++){
    const left=f>=2?-26.5:-34.6,right=34.7,lo=8+f*3.65,hi=lo+3.65;
    const ring=[[left,back],[right,back],[right,front],[left,front]];
    polygon('stepped-teaching-floor',ring,lo,.28,pale);
    facades(ring,ringSign(ring),e=>{
      const n=Math.max(1,Math.round(e.length/7)),step=e.length/n;
      const holes=Array.from({length:n},(_,j)=>({u:(j+.5)*step,w:step-.55,y:lo+2.2,h:2.0,depth:.25,material:pane}));
      campusElevation(m,e,lo+.28,hi,holes,red,pale);
    });
    if(f===3)polygon('upper-brick-parapet-cap',ring,hi,.3,roofMaterial);
  }
  // Rounded lower lecture room is traced by the bulging part of the footprint.
  const arc=[];for(let i=0;i<=12;i++){const t=Math.PI*i/12;arc.push([19.5+11*Math.cos(t),5+12.8*Math.sin(t)]);}arc.push([8.5,-1],[30.5,-1]);
  polygon('curved-lecture-room-foundation',arc,.1,.35,concrete);
  facades(arc,ringSign(arc),e=>{
    const holes=e.index<12&&e.index%2===0?[{u:e.length/2,w:.72,y:2.5,h:.85,depth:.3,material:pane}]:[];
    campusElevation(m,e,.45,4.5,holes,red,pale);
  });
  polygon('curved-lecture-room-window-sill',arc,4.5,.2,pale);
  facades(arc,ringSign(arc),e=>{
    if(e.length<1.4){const [x,z]=e.at(.5);box('curved-room-glazing',x,5.9,z,e.length,2.6,.12,pane,e.angle,true);}
    else campusElevation(m,e,4.7,7.3,[{u:e.length/2,w:e.length-.55,y:6,h:2.5,depth:.18,material:pane}],red,metal);
  });
  polygon('curved-brick-fascia',arc,7.3,.9,red);polygon('curved-lecture-roof',arc,8.2,.16,roofMaterial);
  for(const x of [-26,25]){
    box('pale-rooftop-stair-core',x,23.6,-9,6.6,4.8,7.1,pale,0,true);
    for(let y=21.5;y<26;y+=.9)box('core-panel-horizontal-joint',x,y,-5.4,6.6,.025,.018,metal);
    for(const xx of [x-2.2,x,x+2.2])box('core-panel-vertical-joint',xx,23.6,-5.4,.025,4.8,.018,metal);
  }
  box('pilotis-paving',1,.08,-5,27,.15,22,concrete);
  for(let i=0;i<5;i++)box('approach-step',0,.1+i*.12,front+4-i*.45,21,.22,.48,concrete);
  return m.finish(26,['stepped-red-brick-upper-wing','double-height-open-pilotis','continuous-pale-green-window-bands','curved-lower-lecture-room','two-pale-rooftop-cores']);
}
function science28(b){
  const m=builder(b),{box,polygon,beam}=m,pts=cleanSurveyRing(localFootprint(b)),sign=ringSign(pts);
  const limestone=new THREE.MeshStandardMaterial({color:'#d3d1c5',roughness:.88});
  const charcoal=new THREE.MeshStandardMaterial({color:'#303a3c',roughness:.53});
  const blue=new THREE.MeshStandardMaterial({color:'#6392a9',metalness:.35,roughness:.2});
  // The footprint is irregular. Keep its chamfers instead of filling the bounding box.
  polygon('low-stone-entrance-deck',pts,.1,.4,limestone);
  facades(pts,sign,e=>{
    const n=Math.max(1,Math.floor(e.length/3));
    const holes=Array.from({length:n},(_,j)=>({u:(j+.5)*e.length/n,w:e.length/n-.24,y:2.15,h:3.0,depth:.8,material:blue}));
    campusElevation(m,e,.5,4.0,holes,limestone,charcoal);
  });
  polygon('garden-terrace-slab',pts,4,.45,limestone);
  // Curved glass lobby, recessed far inside the upper cantilever.
  const lobby=Array.from({length:48},(_,i)=>{const t=2*Math.PI*i/48;return [Math.cos(t)*15,Math.sin(t)*8];});
  polygon('curved-lobby-floor',lobby,4.45,.15,limestone);
  for(let i=0;i<lobby.length;i++){
    const a=lobby[i],c=lobby[(i+1)%lobby.length],len=edgeLength(a,c),ang=-Math.atan2(c[1]-a[1],c[0]-a[0]);
    box('curved-lobby-glass',(a[0]+c[0])/2,6.65,(a[1]+c[1])/2,len,4.1,.09,blue,ang,true);
    box('curved-lobby-mullion',a[0],6.65,a[1],.055,4.2,.055,charcoal);
  }
  const supports=[[-19,-7,-17,-9],[-8,-11,-8,-11],[5,-11,5,-11],[16,-7,14,-9],[12,7,11,5],[-12,7,-11,5]];
  for(const [x,z,tx,tz] of supports)beam('round-inclined-pilotis',[x,4.45,z],[tx,9.2,tz],.95,limestone);
  polygon('floating-middle-soffit',pts,9,.5,charcoal);
  // Two visually separate stone volumes, divided by a recessed glass/terrace belt.
  for(const [lo,hi,upper] of [[9.5,16.1,false],[19,25,true]]){
    const ring=upper?offsetRing(pts,sign,-1.1):pts;
    polygon('stone-volume-floor',ring,lo,.3,limestone);
    facades(ring,ringSign(ring),e=>{
      const holes=[],long=e.length>19;
      if(long){
        if(upper){
          const start=e.length*.31,end=e.length-1.6;
          holes.push({u:(start+end)/2,w:end-start,y:(lo+hi)/2,h:hi-lo-1.5,depth:.5,material:blue});
          for(let u=2;u<start-1;u+=1.6)holes.push({u,w:.72,y:(lo+hi)/2,h:hi-lo-1.2,depth:.4,material:blue});
        }else{
          for(let u=2;u<e.length*.38;u+=1.65)holes.push({u,w:.68,y:(lo+hi)/2,h:hi-lo-1.3,depth:.5,material:blue});
          holes.push({u:e.length*.65,w:e.length*.28,y:(lo+hi)/2,h:hi-lo-1,depth:1.15,material:blue});
        }
      }else if(e.length>4){
        for(let u=1.3;u<e.length-1;u+=1.65)holes.push({u,w:.65,y:(lo+hi)/2,h:hi-lo-1.2,depth:.5,material:blue});
      }
      campusElevation(m,e,lo+.3,hi,holes,limestone,charcoal);
    });
    polygon('stone-volume-roof',ring,hi,.22,roofMaterial);
  }
  const belt=offsetRing(pts,sign,-1.7);
  facades(belt,ringSign(belt),e=>{
    const [x,z]=e.at(.5);box('setback-glazed-belt',x,17.6,z,e.length,2.4,.12,blue,e.angle,true);
    for(let j=0,n=Math.ceil(e.length/1.5);j<n;j++){const [x,z]=e.at(j/n);box('belt-mullion',x,17.6,z,.055,2.4,.055,charcoal);}
  });
  facades(offsetRing(pts,sign,-.3),sign,e=>{
    const [x,z]=e.at(.5);box('terrace-guardrail-top',x,17.3,z,e.length,.045,.045,metal,e.angle);
    for(let j=0,n=Math.ceil(e.length/.35);j<n;j++){const [x,z]=e.at(j/n);box('terrace-guardrail-post',x,16.85,z,.025,.9,.025,metal);}
  });
  // Only the photographed rooftop canopy area is raised; the remaining roof is flat.
  box('setback-roof-plant',-8,26,-3,9,1.8,6,charcoal,0,true);
  for(const x of [-16,-10,-4])for(const z of [-6,2])box('roof-screen-post',x,26.5,z,.12,2.3,.12,metal);
  for(let x=-17;x<=-3;x+=1)box('open-roof-screen-rafter',x,27.65,-2,.12,.12,10,metal);
  for(let i=0;i<9;i++)box('wide-garden-entrance-step',0,.1+i*.1,-15.2-(8-i)*.38,12,.2,.4,limestone);
  return m.finish(27.75,['irregular-chamfered-plan','recessed-curved-glass-lobby','inclined-round-pilotis','offset-stone-upper-volumes','deep-picture-window','recessed-glazed-terrace-belt','narrow-vertical-slits']);
}
function pharmacy29(b){
  const m=builder(b),{box,polygon}=m,pts=cleanSurveyRing(localFootprint(b)),sign=ringSign(pts),front=b.box.depth/2;
  const tile=new THREE.MeshStandardMaterial({color:'#d2cdb1',roughness:.85}),bronze=new THREE.MeshStandardMaterial({color:'#645244',roughness:.6}),pane=new THREE.MeshStandardMaterial({color:'#566465',roughness:.35,metalness:.16});
  polygon('low-basement-plinth',pts,.1,.35,concrete);
  facades(pts,sign,e=>{
    const n=Math.max(1,Math.round(e.length/4.5)),holes=[];
    for(let j=0;j<n;j++){
      const u=(j+.5)*e.length/n,pos=e.at(u/e.length),entry=e.nz>.8&&Math.abs(pos[0])<5.3;
      if(entry)continue;
      holes.push({u,w:Math.min(3.1,e.length/n-.7),y:1.25,h:1.05,depth:.4,material:pane});
      holes.push({u,w:Math.min(3.15,e.length/n-.7),y:4.7,h:2.1,depth:.4,material:pane});
    }
    if(e.nz>.8&&e.length>20){const u=-e.a[0]/(e.c[0]-e.a[0])*e.length;holes.push({u,w:7.5,y:3,h:3.8,depth:1.2,material:darkGlass});}
    const part=campusElevation(m,e,.45,7,holes,tile,bronze);
    for(let y=.7;y<7;y+=.24){
      const cuts=holes.filter(h=>Math.abs(y-h.y)<h.h/2+.12).map(h=>[Math.max(0,h.u-h.w/2-.12),Math.min(e.length,h.u+h.w/2+.12)]).sort((a,b)=>a[0]-b[0]);
      let start=0;for(const [a,c] of [...cuts,[e.length,e.length]]){if(a>start)part('ceramic-tile-horizontal-joint',(start+a)/2,y,a-start,.009,.012,concrete,.012);start=Math.max(start,c);}
    }
  });
  polygon('low-flat-roof',pts,7,.28,roofMaterial);
  const raised=[[-10,-5],[10,-5],[10,front],[-10,front]];
  facades(raised,ringSign(raised),e=>{
    const holes=e.nz>.8?[{u:e.length/2,w:5.2,y:9.05,h:2.9,depth:.45,material:pane},{u:3,w:2.1,y:8.6,h:2.2,depth:.4,material:pane},{u:e.length-3,w:2.1,y:8.6,h:2.2,depth:.4,material:pane}]:[];
    campusElevation(m,e,7.28,10.8,holes,tile,bronze);
  });
  polygon('raised-central-roof',raised,10.8,.2,roofMaterial);
  // Open porch framed by two tiled returns and a lintel.
  for(const x of [-4.4,4.4])box('tiled-porch-return',x,3.25,front+1.05,.68,4.6,2.2,tile,0,true);
  box('tiled-entrance-lintel',0,5.55,front+1.05,9.5,.75,2.2,tile,0,true);
  for(let i=0;i<7;i++)box('low-entrance-step',0,.1+i*.13,front+4-i*.42,9.2,.24,.44,concrete);
  for(let x=-25;x<=25;x+=5)if(Math.abs(x)>6){m.beam('facade-rainwater-pipe',[x,.5,front+.3],[x,7.15,front+.3],.065,metal);}
  return m.finish(11,['low-tiled-wings','raised-central-stair-hall','bronze-window-frames','recessed-porch-opening','broad-low-entrance-steps']);
}
function engineering30(b){
  const m=builder(b),{box,polygon}=m,pts=cleanSurveyRing(localFootprint(b)),sign=ringSign(pts),top=15;
  const orange=photoMasonry('#b5734b'),white=new THREE.MeshStandardMaterial({color:'#dad9cb',roughness:.9});
  for(let f=0;f<=4;f++)polygon('engineering-floor-band',pts,.4+f*3.6,.53,white);
  facades(pts,sign,e=>{
    const long=e.length>30,n=Math.max(1,Math.round(e.length/7.3)),step=e.length/n;
    for(let f=0;f<4;f++){
      const lo=.93+f*3.6,hi=.4+(f+1)*3.6,holes=[];
      for(let j=0;j<n;j++)holes.push({u:(j+.5)*step,w:step-.65,y:hi-1.02,h:1.65,depth:.32});
      if(f===0&&long&&e.nx>.8){const middle=Math.floor(n/2);holes[middle]={u:(middle+.5)*step,w:step-.8,y:(lo+hi)/2,h:hi-lo-.08,depth:1.3};}
      campusElevation(m,e,lo,hi,holes,orange,white);
    }
    for(let j=0;j<=n;j++){
      const [x,z]=e.at(j/n);box('tall-projecting-white-pier',x+e.nx*.25,7.65,z+e.nz*.25,.52,14.5,.85,white,e.angle);
      box('eave-bracket',x+e.nx*.65,14.6,z+e.nz*.65,.23,.95,1.5,white,e.angle);
    }
  });
  polygon('broad-engineering-eave',offsetRing(pts,sign,1.6),top,.65,white);
  facades(offsetRing(pts,sign,1.35),sign,e=>{
    const [x,z]=e.at(.5);box('open-engineering-roof-rail',x,16.5,z,e.length,.2,.22,white,e.angle);
    for(let j=0,n=Math.ceil(e.length/3);j<=n;j++){const [x,z]=e.at(j/n);box('roof-rail-post',x,16.05,z,.18,.72,.22,white);}
  });
  const x=b.box.width/2,z=-2;
  box('entrance-deep-white-canopy',x+1.1,3.65,z,3.5,.62,9,white,0,true);
  for(const zz of [z-4.2,z+4.2])box('entry-brick-side-return',x+.7,1.95,zz,2.7,3.3,.45,orange,0,true);
  return m.finish(16.6,['orange-brick-spandrels','wide-horizontal-window-bands','projecting-white-structural-piers','deep-eave-and-brackets','open-roof-rail','recessed-canopied-entrance']);
}

function engineeringCafe302(b){
  const m=builder(b),pts=cleanSurveyRing(localFootprint(b)),sign=ringSign(pts);
  const cladding=new THREE.MeshStandardMaterial({color:'#a4a9aa',roughness:.7});
  const frame=new THREE.MeshStandardMaterial({color:'#d6d8cf',roughness:.48,metalness:.3});
  const pane=new THREE.MeshStandardMaterial({color:'#688d8e',roughness:.22,metalness:.27});
  m.polygon('cafe-raised-stone-base',pts,.08,.65,concrete);
  m.polygon('cafe-interior-floor',pts,.73,.15,concrete);
  facades(pts,sign,e=>{
    const outward=e.nz>.25,entry=e.nx<-.65&&e.nz<.2,holes=[];
    if(outward){
      const n=Math.max(1,Math.round(e.length/2.9)),step=e.length/n;
      for(let j=0;j<n;j++)holes.push({u:(j+.5)*step,w:step-.12,y:2.35,h:2.8,depth:.2,material:pane});
    }else if(entry)holes.push({u:e.length/2,w:Math.min(2.8,e.length-.7),y:2.15,h:2.54,depth:.75,material:darkGlass});
    else if(e.length>5)holes.push({u:e.length/2,w:1.3,y:2.1,h:1.35,depth:.22,material:pane});
    const part=campusElevation(m,e,.88,4.55,holes,cladding,frame);
    for(const h of holes)if(outward){
      for(const y of [1.2,1.7,3.24])part('cafe-glass-horizontal-transom',h.u,y,h.w,.055,.09,frame,-.08);
      part('cafe-lower-opening-sash',h.u,1.46,h.w-.2,.37,.07,metal,-.07);
      part('cafe-lower-opening-glass',h.u,1.46,h.w-.29,.27,.075,pane,-.025);
    }
    part('continuous-grey-parapet-seam',e.length/2,4.18,e.length,.022,.018,metal,.01);
    if(entry){
      part('recessed-entrance-canopy',e.length/2,3.55,3.5,.16,1.8,cladding,.52,true);
      for(let i=0;i<4;i++)part('four-entry-steps',e.length/2,.12+i*.19,3.3,.23,.45,concrete,1.8-i*.42);
    }
  });
  m.polygon('bent-low-cafe-roof',offsetRing(pts,sign,.22),4.55,.16,roofMaterial);
  return m.finish(4.75,['bent-single-storey-plan','segmented-full-height-glass-wall','lower-opening-sashes','grey-metal-parapet','recessed-side-door-and-four-steps']);
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
    case '15-1': return lawLecture151(b);
    case '16-1': return shinyang161(b);
    case '17': return law17(b);
    case '20': return pharmacy20(b);
    case '21': return pharmacy21(b);
    case '22': return naturalScience22(b);
    case '23': return science23(b);
    case '25-1': return science251(b);
    case '28': return science28(b);
    case '29': return pharmacy29(b);
    case '30': return engineering30(b);
    case '30-2': return engineeringCafe302(b);
    default: return null;
  }
}
