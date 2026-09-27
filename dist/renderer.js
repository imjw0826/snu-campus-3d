import * as THREE from 'three';
import { OrbitControls } from './assets/OrbitControls.js';
import { createBuildingStructure } from './building-structures.js?v=20260927-doosan8c';
import { roadsideTrees } from './landscape.js';

const UP = new THREE.Vector3(0,1,0);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const material = color => new THREE.MeshStandardMaterial({color,roughness:.92,metalness:0});
const signedArea = p => p.reduce((a,x,i)=>{const y=p[(i+1)%p.length];return a+x[0]*y[1]-y[0]*x[1]},0)/2;
function shapeOf(points,holes=[]){
  const shape=new THREE.Shape(points.map(([x,z])=>new THREE.Vector2(x,-z)));
  holes.forEach(p=>shape.holes.push(new THREE.Path(p.map(([x,z])=>new THREE.Vector2(x,-z)))));
  return shape;
}
function geometryOf(points,height,holes=[]){
  const g=height?new THREE.ExtrudeGeometry(shapeOf(points,holes),{depth:height,bevelEnabled:false,steps:1}):new THREE.ShapeGeometry(shapeOf(points,holes));
  g.rotateX(-Math.PI/2);return g;
}
function stroke(points,width,vertices,y){
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<.01)continue;
    const ox=-dz/len*width/2,oz=dx/len*width/2;
    vertices.push(a[0]+ox,y,a[1]+oz,a[0]-ox,y,a[1]-oz,b[0]+ox,y,b[1]+oz,b[0]+ox,y,b[1]+oz,a[0]-ox,y,a[1]-oz,b[0]-ox,y,b[1]-oz);
  }
}
function meshFromVertices(vertices,color){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();
  return new THREE.Mesh(g,new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));
}

export class CampusRenderer {
  constructor(container,labels,data,profiles,onSelect){
    this.container=container;this.data=data;this.profiles=profiles;this.onSelect=onSelect;this.view='3d';this.scope='all';this.detailed=true;this.selected=null;this.models=new Map();this.labelElements=[];this.picks=[];this.needsRender=true;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#ecf0ed');
    this.camera=new THREE.OrthographicCamera(-1000,1000,1000,-1000,1,14000);this.camera.position.set(-450,2600,2000);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));this.renderer.setClearColor('#edf0ed');this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.85;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label','서울대학교 캠퍼스 3D 지도');this.renderer.domElement.setAttribute('role','img');container.append(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.1;this.controls.minZoom=.45;this.controls.maxZoom=65;this.controls.maxPolarAngle=Math.PI*.46;this.controls.minPolarAngle=.015;this.controls.screenSpacePanning=true;this.controls.addEventListener('change',()=>{this.needsRender=true});
    this.scene.add(new THREE.HemisphereLight('#ffffff','#b2bcbd',2.25));
    const sun=new THREE.DirectionalLight('#ffffff',2.15);sun.position.set(-1000,2000,-600);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-1800,right:1800,top:2200,bottom:-2200,near:50,far:5000});sun.shadow.normalBias=1.1;sun.shadow.bias=-.0002;sun.shadow.radius=3;this.scene.add(sun);this.scene.add(sun.target);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(12000,12000),material('#e7ece7'));ground.rotation.x=-Math.PI/2;ground.position.y=-.5;ground.receiveShadow=true;this.scene.add(ground);
    this.createGround();this.createTrees();this.createBuildings();
    for(const b of data.buildings.filter(b=>b.review)){
      const el=document.createElement('button');el.className='map-label';el.textContent=b.number;el.setAttribute('tabindex','-1');el.title=`${b.number}동 ${b.name}`;el.addEventListener('click',e=>{e.stopPropagation();onSelect(b.id)});labels.append(el);this.labelElements.push({el,b});
    }
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();let pointerDown;
    this.renderer.domElement.addEventListener('pointerdown',e=>{pointerDown=[e.clientX,e.clientY]});
    this.renderer.domElement.addEventListener('pointerup',e=>{if(e.button!==0||!pointerDown||Math.hypot(e.clientX-pointerDown[0],e.clientY-pointerDown[1])>5)return;const rect=this.renderer.domElement.getBoundingClientRect();this.pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);const hit=this.raycaster.intersectObjects(this.picks,false).find(h=>this.isVisible(h.object));if(hit)this.onSelect(hit.object.userData.id)});
    this.frustum=2450;this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.resize();this.reset();this.renderer.setAnimationLoop(()=>this.frame());
    document.addEventListener('visibilitychange',()=>{this.needsRender=true});
  }
  isVisible(object){for(let item=object;item;item=item.parent)if(!item.visible)return false;return true;}
  createGround(){
    for(const p of this.data.boundary){const m=new THREE.Mesh(geometryOf(p,0),material('#dde5db'));m.position.y=-.3;m.receiveShadow=true;this.scene.add(m)}
    const colors={wood:'#c1d2bc',forest:'#c7d7c2',grass:'#d5dfcd',scrub:'#cedbc7',water:'#9fbfc2',pitch:'#bbcdb9',park:'#d0deca',garden:'#cdddc9'};
    this.data.land.forEach((l,i)=>{if(l.points.length<4)return;const m=new THREE.Mesh(geometryOf(l.points,0),material(colors[l.type]||'#d7e0d2'));m.position.y=-.2+(i%7)*.008;m.receiveShadow=true;this.scene.add(m);
      if(l.type==='pitch'){const v=[];stroke(l.points,1,v,.02);this.scene.add(meshFromVertices(v,'#f2f4e9'));}
    });
    // Carriageway, footway and stair are kept as three merged strips: enough to
    // read the circulation between the buildings without per-kerb geometry.
    const PEDESTRIAN=['footway','path','pedestrian','cycleway'];
    const carriage=[],kerb=[],paving=[],stairs=[],treads=[];
    for(const road of this.data.roads){
      const stepped=road.type==='steps';
      const walk=stepped||PEDESTRIAN.includes(road.type);
      const w=walk?(road.type==='pedestrian'?4.2:2.6):road.type==='service'?5.5:road.type==='primary'||road.type==='secondary_link'?10:9;
      stroke(road.points,w+(walk?.7:1.5),kerb,walk?.055:.03);
      stroke(road.points,w,stepped?stairs:walk?paving:carriage,walk?.1:.075);
      if(stepped)for(let i=1;i<road.points.length;i++){
        const a=road.points[i-1],c=road.points[i],dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz);
        for(let along=.8;along<length;along+=1.5){
          const t=along/length,mx=a[0]+dx*t,mz=a[1]+dz*t,ox=-dz/length*w/2,oz=dx/length*w/2;
          treads.push(mx+ox,.105,mz+oz,mx-ox,.105,mz-oz,mx+ox+dx/length*.16,.105,mz+oz+dz/length*.16,
                      mx+ox+dx/length*.16,.105,mz+oz+dz/length*.16,mx-ox,.105,mz-oz,mx-ox+dx/length*.16,.105,mz-oz+dz/length*.16);
        }
      }
    }
    this.scene.add(meshFromVertices(kerb,'#b8c1b6'));
    this.scene.add(meshFromVertices(carriage,'#cfd0c9'));
    this.scene.add(meshFromVertices(paving,'#e6dfd0'));
    this.scene.add(meshFromVertices(stairs,'#dcd8ca'));
    this.scene.add(meshFromVertices(treads,'#b5b0a1'));
    const boundaryLines=[];this.data.boundary.forEach(p=>stroke(p,1,boundaryLines,.06));this.scene.add(meshFromVertices(boundaryLines,'#b9caba'));
  }
  createTrees(){
    const positions=roadsideTrees(this.data);
    this.trees=new THREE.Group();
    const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.22,.3,2.5,5),material('#867e68'),positions.length);
    const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),material('#92aa7d'),positions.length);
    const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),tint=new THREE.Color();
    // Height, lean and tint vary per instance, so one shared crown mesh still
    // reads as a mixed planting. No extra draw call, no per-tree geometry.
    const foliage=['#8fa878','#7d9a6b','#9cb183','#869f74','#a3b489'];
    positions.forEach(([x,z],i)=>{
      const seed=(Math.imul(i+1,2654435761)>>>0);
      const size=1.55+(seed%7)*.11,lift=3.4+(seed>>3)%5*.22;
      rotation.setFromAxisAngle(new THREE.Vector3(0,1,0),(seed>>6)%628/100);
      trunks.setMatrixAt(i,matrix.compose(new THREE.Vector3(x,lift*.36,z),rotation,new THREE.Vector3(1,lift*.72/2.5,1)));
      crowns.setMatrixAt(i,matrix.compose(new THREE.Vector3(x,lift+size*.5,z),rotation,new THREE.Vector3(size,size*1.25,size)));
      crowns.setColorAt(i,tint.set(foliage[(seed>>9)%foliage.length]));
    });
    crowns.instanceColor.needsUpdate=true;
    this.trees.add(trunks,crowns);this.scene.add(this.trees);
  }
  createBuildings(){
    for(const b of this.data.buildings){
      const group=new THREE.Group();group.userData.id=b.id;
      const baseMat=material(b.review?'#72b1a7':b.geometryStatus==='schematic'?'#cab995':'#dce0df');const box=b.box;
      const base=new THREE.Mesh(new THREE.BoxGeometry(box.width,b.height,box.depth),baseMat);base.position.set(box.center[0],b.height/2,box.center[1]);base.rotation.y=-box.angle;base.castShadow=true;base.receiveShadow=true;base.userData.id=b.id;group.add(base);this.picks.push(base);
      const outline=new THREE.LineSegments(new THREE.EdgesGeometry(base.geometry),new THREE.LineBasicMaterial({color:b.review?'#59958b':'#b9c3c1',transparent:true,opacity:.45}));outline.position.copy(base.position);outline.rotation.copy(base.rotation);group.add(outline);
      const flat=new THREE.Mesh(geometryOf(b.footprint,0,b.holes),new THREE.MeshBasicMaterial({color:b.review?'#6eafa2':b.geometryStatus==='schematic'?'#d2bd96':'#c6cecd'}));flat.position.y=.7;flat.visible=false;flat.userData.id=b.id;group.add(flat);this.picks.push(flat);
      const flatOutline=new THREE.LineSegments(new THREE.EdgesGeometry(geometryOf(b.footprint,0,b.holes)),new THREE.LineBasicMaterial({color:b.review?'#448d7e':'#a2b0b0'}));flatOutline.position.y=.72;flatOutline.visible=false;group.add(flatOutline);
      const details=b.review?this.createDetailed(b):null;if(details)group.add(details);
      this.models.set(b.id,{group,base,outline,flat,flatOutline,details});this.scene.add(group);
    }
    this.updateMode();
  }
  createDetailed(b){
    const structure=createBuildingStructure(b);
    if(structure){b.detailHeight=structure.height;this.picks.push(...structure.picks);return structure.group;}
    const p=this.profiles[b.number]||{};const floors=p.floors||4;const height=floors*(p.floorHeight||3.6);b.detailHeight=height;
    const group=new THREE.Group();const wallMat=material(p.wall||'#a48070');
    const lifted=p.style==='pilotis'||p.style==='fins';const lift=lifted?7.2:0;
    const body=new THREE.Mesh(geometryOf(b.footprint,height-lift,b.holes),wallMat);body.position.y=lift;body.castShadow=true;body.receiveShadow=true;body.userData.id=b.id;group.add(body);this.picks.push(body);
    if(lifted){const inset=b.footprint.map(([x,z])=>[b.center[0]+(x-b.center[0])*.79,b.center[1]+(z-b.center[1])*.79]);const base=new THREE.Mesh(geometryOf(inset,p.style==='pilotis'?3.6:7.2),material('#587983'));base.userData.id=b.id;base.castShadow=true;group.add(base);this.picks.push(base);}
    const roof=new THREE.Mesh(geometryOf(b.footprint,0,b.holes),material(p.roof||'#c8cdca'));roof.position.y=height+.03;roof.receiveShadow=true;group.add(roof);
    const trimMat=material(p.trim||'#d5d5ca');const glassMat=new THREE.MeshStandardMaterial({color:p.glass||'#476373',roughness:.4,metalness:.15});
    const windows=[],bands=[],fins=[],panels=[];const matrix=new THREE.Matrix4();const pos=new THREE.Vector3();const quat=new THREE.Quaternion();const scale=new THREE.Vector3();
    const add=(arr,x,y,z,angle,w,h,d)=>{pos.set(x,y,z);quat.setFromAxisAngle(UP,angle);scale.set(w,h,d);matrix.compose(pos,quat,scale);arr.push(matrix.clone())};
    for(const ring of [b.footprint,...b.holes]){
      const pts=ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1]?ring.slice(0,-1):ring;const sign=signedArea(pts)>0?1:-1;
      for(let i=0;i<pts.length;i++){
        const a=pts[i],c=pts[(i+1)%pts.length],dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz);if(len<1)continue;const angle=-Math.atan2(dz,dx);const nx=sign*dz/len,nz=-sign*dx/len;
        const spacing=p.spacing||3.2;const count=Math.floor((len-1.4)/spacing);const ww=p.windowWidth||1.75;const wh=p.windowHeight||1.8;
        if(p.style==='mosaic'){
          const cols=Math.max(1,Math.round(len/1.7)),rows=Math.round(height/1.45);
          for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
            const t=(col+.5)/cols;add(panels,a[0]+dx*t+nx*.13,(row+.5)*height/rows,a[1]+dz*t+nz*.13,angle,len/cols-.06,height/rows-.06,.16);
          }
          continue;
        }
        for(let f=0;f<floors;f++){
          if(lifted&&f<2)continue;
          if(p.bands!==false)add(bands,(a[0]+c[0])/2+nx*.12,(f+1)*height/floors-.16,(a[1]+c[1])/2+nz*.12,angle,len+.05,p.bandHeight||.32,.28);
          for(let j=0;j<count;j++){
            const t=(j+1)/(count+1),x=a[0]+dx*t+nx*.10,z=a[1]+dz*t+nz*.10;
            const ww2=p.style==='vertical'?(j%3===0?ww*1.8:ww):p.topSmall&&f===floors-1?ww*.7:ww;
            add(windows,x,f*height/floors+height/floors*.57,z,angle,Math.min(ww2,len/count*.85),p.topSmall&&f===floors-1?wh*.7:wh,.12);
            if(p.fins)add(fins,x-ww*.68*dx/len,f*height/floors+height/floors*.54,z-ww*.68*dz/len,angle,.18,height/floors-.12,p.style==='fins'?1:.65);
            if(p.columns&&j%2===0)add(fins,x-ww*.67*dx/len,f*height/floors+height/floors/2,z-ww*.67*dz/len,angle,.23,height/floors,.3);
          }
        }
        add(bands,(a[0]+c[0])/2+nx*.08,height+.32,(a[1]+c[1])/2+nz*.08,angle,len+.3,.6,.34);
        if(p.roofOverhang)add(bands,(a[0]+c[0])/2+nx*.4,height+.12,(a[1]+c[1])/2+nz*.4,angle,len+1,.3,1.1);
        if(lifted){for(let j=0;j<Math.floor(len/7);j++){const t=(j+.5)/Math.floor(len/7);add(fins,a[0]+dx*t-nx*1.8,3.6,a[1]+dz*t-nz*1.8,angle,.7,7.2,.7);}}
      }
    }
    for(const [mat,arr] of [[glassMat,windows],[trimMat,bands],[trimMat,fins]]){if(!arr.length)continue;const m=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat,arr.length);arr.forEach((v,i)=>m.setMatrixAt(i,v));m.castShadow=false;group.add(m)}
    if(panels.length){const m=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({roughness:.38,metalness:.12}),panels.length);const palette=['#5d9299','#96b1ae','#bcc6c0','#7ca5a6','#416b78','#b4c2be'];panels.forEach((v,i)=>{m.setMatrixAt(i,v);m.setColorAt(i,new THREE.Color(palette[(i*7+Math.floor(i/5))%palette.length]))});group.add(m);}
    // Optional volumes are deliberately schematic. Their location/dimensions remain estimates.
    if(p.roofBox){const box=b.box;const m=new THREE.Mesh(new THREE.BoxGeometry(Math.min(box.width*.25,8),2.8,Math.min(box.depth*.35,7)),trimMat);m.position.set(box.center[0],height+1.4,box.center[1]);m.rotation.y=-box.angle;m.castShadow=true;group.add(m)}
    return group;
  }
  updateMode(){
    for(const [id,m] of this.models){const showDetail=!!m.details&&this.detailed&&this.view==='3d';m.base.visible=this.view==='3d'&&!showDetail;m.outline.visible=m.base.visible;m.flat.visible=this.view==='2d';m.flatOutline.visible=m.flat.visible;if(m.details)m.details.visible=showDetail;}
    this.needsRender=true;
  }
  setDetail(value){this.detailed=value;this.updateMode()}
  setView(view){if(this.view===view)return;this.view=view;this.isolate(null);this.controls.enableRotate=view==='3d';this.controls.mouseButtons.LEFT=view==='2d'?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;this.controls.touches.ONE=view==='2d'?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;const target=this.controls.target.clone();const distance=this.camera.position.distanceTo(target);this.camera.position.copy(target).add(view==='2d'?new THREE.Vector3(0,distance,.01):new THREE.Vector3(-.65,.95,1).normalize().multiplyScalar(distance));this.camera.up.set(0,1,0);this.controls.update();this.updateMode()}
  select(id){if(!id)this.isolate(null);this.selected=id;for(const {el,b} of this.labelElements)el.classList.toggle('selected',b.id===id);for(const [key,m] of this.models){m.flat.material.color.set(key===id?'#248b7c':this.data.buildings.find(b=>b.id===key).review?'#6eafa2':this.data.buildings.find(b=>b.id===key).geometryStatus==='schematic'?'#d2bd96':'#c6cecd');m.base.material.emissive.set(key===id?'#13453e':'#000000');m.base.material.emissiveIntensity=.15;}
    if(this.selectionOutline){this.scene.remove(this.selectionOutline);this.selectionOutline.geometry.dispose();this.selectionOutline.material.dispose()}
    const b=this.data.buildings.find(b=>b.id===id);if(b){const points=b.footprint.map(([x,z])=>new THREE.Vector3(x,this.view==='2d'?1:this.detailed&&['4','8','14'].includes(b.number)?.2:(this.detailed?b.detailHeight||b.height:b.height)+.8,z));this.selectionOutline=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#1f776d'}));this.scene.add(this.selectionOutline)}this.needsRender=true;
  }
  focus(b,close=true){
    this.isolate(null);
    const aspect=this.container.clientWidth/this.container.clientHeight;
    const span=close?Math.max(b.box.width,b.box.depth)*Math.max(3.0,1.65/aspect):700;
    const zoom=Math.min(25,this.frustum/span);
    const target=new THREE.Vector3(b.center[0],(b.detailHeight||b.height)*.45,b.center[1]);
    this.moveTo(this.offsetForInspector(target,zoom),zoom);
  }
  offsetForInspector(target,zoom){
    const panel=document.getElementById('inspector');if(!panel||panel.hidden)return target;
    const mobile=window.innerWidth<=760,worldHeight=this.frustum/zoom;
    const axis=new THREE.Vector3(mobile?0:1,mobile?1:0,0).applyQuaternion(this.camera.quaternion);
    const shift=mobile?-worldHeight*.20:worldHeight*(panel.offsetWidth+24)/this.container.clientHeight*.45;
    return target.addScaledVector(axis,shift);
  }
  facade(b,side=false){
    if(this.view!=='3d')return;
    this.isolate(b.id);this.facadeSide=side;
    const a=b.box.angle,local=(b.number==='8'?new THREE.Vector3(side?1:.65,.12,side?-.45:-1):new THREE.Vector3(side?-1:.15,.34,side?.65:1)).normalize();
    local.applyAxisAngle(UP,-a);
    const center=new THREE.Vector3(b.box.center[0],(b.detailHeight||b.height)*.5,b.box.center[1]);
    this.controls.target.copy(center);this.camera.position.copy(center).addScaledVector(local,1500);this.controls.update();
    const aspect=this.container.clientWidth/this.container.clientHeight;
    const zoom=this.frustum/Math.max((b.box.width+8)/aspect*1.8,(b.detailHeight||b.height)*2.4);
    this.moveTo(this.offsetForInspector(center,zoom),zoom);
  }
  isolate(id){
    this.isolated=id;
    this.trees.visible=!id&&this.view==='3d';
    for(const [key,m] of this.models)m.group.visible=!id||key===id;
    document.getElementById('map-description').textContent=id?'단독 구조 비교 · 주변 건물 숨김':this.view==='2d'?'지면 윤곽 · 북쪽 기준':'평면 지형 · 건물 높이 추정';
    this.needsRender=true;
  }
  reset(scope='all'){this.isolate(null);this.scope=scope;const b=this.data.buildings.filter(b=>scope==='review'?b.review:true);const minX=Math.min(...b.map(b=>b.center[0])),maxX=Math.max(...b.map(b=>b.center[0])),minZ=Math.min(...b.map(b=>b.center[1])),maxZ=Math.max(...b.map(b=>b.center[1]));const aspect=this.container.clientWidth/this.container.clientHeight;const span=Math.max((maxX-minX)/aspect,maxZ-minZ)*1.12;this.moveTo(new THREE.Vector3((minX+maxX)/2,0,(minZ+maxZ)/2),this.frustum/span);}
  moveTo(target,zoom){const offset=this.camera.position.clone().sub(this.controls.target);this.animation={start:performance.now(),fromTarget:this.controls.target.clone(),toTarget:target,offset,fromZoom:this.camera.zoom,toZoom:THREE.MathUtils.clamp(zoom,.45,65)};this.needsRender=true;if(reducedMotion)this.animation.start-=600;}
  zoom(factor){this.camera.zoom=THREE.MathUtils.clamp(this.camera.zoom*factor,.45,65);this.camera.updateProjectionMatrix();this.controls.update();this.needsRender=true;this.animation=null}
  north(){const d=this.camera.position.distanceTo(this.controls.target);this.camera.position.copy(this.controls.target).add(this.view==='2d'?new THREE.Vector3(0,d,.01):new THREE.Vector3(0,d*.8,d*.65));this.controls.update();this.needsRender=true}
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;const aspect=w/h;this.frustum=2450;this.camera.left=-this.frustum*aspect/2;this.camera.right=this.frustum*aspect/2;this.camera.top=this.frustum/2;this.camera.bottom=-this.frustum/2;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);this.needsRender=true;const mobile=window.innerWidth<=760;if(this.lastMobile!==undefined&&this.lastMobile!==mobile){const b=this.data.buildings.find(b=>b.id===this.selected);if(b){if(this.isolated)this.facade(b,this.facadeSide);else this.focus(b,true);}else this.reset(this.scope);}this.lastMobile=mobile;}
  frame(){
    // No document.hidden guard: requestAnimationFrame is already throttled in a
    // background tab, and some embedded hosts report a visible page as hidden,
    // which used to leave the canvas permanently blank.
    if(!this.needsRender&&!this.animation)return;
    if(this.animation){const a=this.animation;const t=Math.min((performance.now()-a.start)/650,1),e=1-Math.pow(1-t,3);this.controls.target.lerpVectors(a.fromTarget,a.toTarget,e);this.camera.position.copy(this.controls.target).add(a.offset);this.camera.zoom=THREE.MathUtils.lerp(a.fromZoom,a.toZoom,e);this.camera.updateProjectionMatrix();if(t===1)this.animation=null;this.needsRender=true;}
    this.controls.update();if(!this.needsRender)return;this.renderer.render(this.scene,this.camera);
    const w=this.container.clientWidth,h=this.container.clientHeight;const taken=[];
    for(const {el,b} of this.labelElements){if(this.isolated&&this.isolated!==b.id){el.hidden=true;continue;}const p=new THREE.Vector3(b.center[0],this.view==='2d'?2:(b.detailHeight||b.height)+9,b.center[1]).project(this.camera);const x=(p.x+1)*w/2,y=(-p.y+1)*h/2;const overlap=taken.some(q=>Math.hypot(q[0]-x,q[1]-y)<27);const show=p.z<1&&p.z>-1&&x>12&&x<w-12&&y>12&&y<h-30&&(!overlap||this.selected===b.id);el.hidden=!show;el.style.transform=`translate(${x-14}px,${y-30}px)`;if(show)taken.push([x,y]);}
    const widthMetres=(this.camera.right-this.camera.left)/this.camera.zoom;const unit=widthMetres>1200?200:widthMetres>600?100:widthMetres>200?50:20;document.getElementById('scale-label').textContent=`${unit} m`;document.getElementById('scale-bar').style.width=`${unit/widthMetres*w}px`;
    const azimuth=this.controls.getAzimuthalAngle();document.querySelector('#north svg').style.transform=`rotate(${-azimuth}rad)`;this.needsRender=false;
  }
}
