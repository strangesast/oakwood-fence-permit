import geometry from './geometry.js';
const host=document.getElementById('scene'),viewer=document.getElementById('viewer'),status=document.getElementById('viewstatus'),fallback=document.getElementById('fallback');
const houseCenter=[(Math.min(...geometry.house.map(p=>p[0]))+Math.max(...geometry.house.map(p=>p[0])))/2,(Math.min(...geometry.house.map(p=>p[1]))+Math.max(...geometry.house.map(p=>p[1])))/2];
const corner=geometry.lot[2],angle=56/60*Math.PI/180,ux=Math.sin(angle),uy=-Math.cos(angle);
const pos=(name,d)=>name==='east'?[corner[0]+ux*d,corner[1]+uy*d]:[corner[0]-d,corner[1]];
let state=window.fenceState,renderer,scene,camera,fence,THREE,target,mode='3d',materials=[],yaw=-.64,pitch=.65,distance=190,drag=null;
let buildingMode='normal';const buildingMeshes=[];const roadText=[];const pointers=new Map();let pinch=0;const handles={east:document.getElementById('handle-east'),north:document.getElementById('handle-north')};
function setLayers(next){mode=next;const is3d=next==='3d';host.hidden=!is3d;host.style.display=is3d?'block':'none';fallback.toggleAttribute('hidden',is3d);fallback.style.display=is3d?'none':'block';const labels=document.getElementById('road-labels');labels.hidden=true;labels.style.display='none';pointers.clear();drag=null;syncBuildingControl();}
function syncBuildingControl(){const button=document.getElementById('building-cycle'),names={normal:'Normal',ghost:'Ghost',footprint:'Footprint'},next={normal:'Ghost',ghost:'Footprint',footprint:'Normal'};button.disabled=mode!=='3d';button.textContent='Buildings: '+names[buildingMode]+' ↻';button.setAttribute('aria-label','House and shed: '+names[buildingMode]+'. Next: '+next[buildingMode]+'.');button.title=mode==='3d'?'Cycle building visibility':'2D always shows footprints; your 3D choice is kept.';}
function applyBuildingMode(){for(const mesh of buildingMeshes){mesh.visible=buildingMode!=='footprint';mesh.material=buildingMode==='ghost'?mesh.userData.ghostMaterial:mesh.userData.normalMaterial;}syncBuildingControl();renderScene();}
document.getElementById('building-cycle').onclick=()=>{buildingMode={normal:'ghost',ghost:'footprint',footprint:'normal'}[buildingMode];applyBuildingMode();};

function fallbackView(reason='2D plan · 3D unavailable'){setLayers('2d');status.textContent=reason;drawFallback();}
let planZoom=1,planCenter=[210,205],planPinch=0;const planPointers=new Map();function applyPlanZoom(factor){planZoom=Math.max(.6,Math.min(5,planZoom*factor));drawFallback();}const planPoint=p=>[100+p[0]*2.55,310-p[1]*2.55];
function drawFallback(){if(!state)return;const pw=420/planZoom,ph=410/planZoom;fallback.setAttribute('viewBox',`${planCenter[0]-pw/2} ${planCenter[1]-ph/2} ${pw} ${ph}`);document.getElementById('compass-needle').style.transform='rotate(0deg)';const poly=(points,fill,stroke)=>`<polygon points="${points.map(p=>planPoint(p).join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
const wx=y=>-y*Math.tan(angle);let svg=poly([[-100,-66],[150,-66],[150,0],[-100,0]],'#f1f0e9','#e0e2d9')+poly([[-49.5,0],[0,0],[wx(200),200],[wx(200)-49.5,200]],'#f1f0e9','#e0e2d9')+poly([[0,-6],[150,-6],[150,-2],[0,-2]],'#dedfd6','#d1d5ca')+poly([[-100,-6],[-49.5,-6],[-49.5,-2],[-100,-2]],'#dedfd6','#d1d5ca')+poly([[-100,-64],[150,-64],[150,-60],[-100,-60]],'#dedfd6','#d1d5ca')+poly([[-47.5,0],[-43.5,0],[wx(200)-43.5,200],[wx(200)-47.5,200]],'#dedfd6','#d1d5ca')+poly([[-6,0],[-2,0],[wx(200)-2,200],[wx(200)-6,200]],'#dedfd6','#d1d5ca')+poly(geometry.lot,'#edf1e6','#a2b297')+geometry.porches.map(p=>poly(p,'#abb7ad','#7c8e82')).join('')+poly(geometry.house,'#586c6c','#405756')+poly(geometry.shed.roof_corners,'#d7dfd8','#7c8e82')+poly(geometry.shed.corners,'#586c6c','#405756');
for(const r of state.c.runs){for(const s of r.segments){const a=planPoint(pos(r.key,s.start)),b=planPoint(pos(r.key,s.start+s.length));svg+=`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${s.height===6?'#b6986d':'#dccbaa'}" stroke-width="7"/>`;}for(const p of r.posts){const q=planPoint(pos(r.key,p.distance));svg+=`<rect x="${q[0]-3}" y="${q[1]-3}" width="6" height="6" fill="#24372d"/>`;if(p.isTransition)svg+=`<circle cx="${q[0]}" cy="${q[1]}" r="9" fill="none" stroke="#b06b26" stroke-width="2"/>`;}}
if(state.c.posts){const q=planPoint(corner);svg+=`<rect x="${q[0]-4}" y="${q[1]-4}" width="8" height="8" fill="#24372d"/>`;}
svg+=`<text x="145" y="370" font-size="12" fill="#697b6b">OAKWOOD · SOUTH</text><text x="42" y="205" transform="rotate(-90 42 205)" font-size="12" fill="#697b6b">PAINE · WEST</text><text x="76" y="326" font-size="11" fill="#697b6b">SW</text><text x="265" y="50" font-size="11" fill="#697b6b">NE corner</text>`;fallback.innerHTML=svg;
const roadLine=pts=>`<polyline points="${pts.map(p=>planPoint(p).join(',')).join(' ')}" fill="none" stroke="#b8b8a4" stroke-width="1" stroke-dasharray="7 6"/>`;fallback.innerHTML+=roadLine([[-100,-33],[150,-33]])+roadLine([[-24.75,0],[wx(200)-24.75,200]]);
const w=viewer.clientWidth,h=viewer.clientHeight,scale=Math.min(w/420,h/350),ox=(w-420*scale)/2,oy=(h-350*scale)/2;for(const name of ['east','north']){const p=planPoint(pos(name,state.v[name]));place(name,ox+p[0]*scale,oy+p[1]*scale);}}
function place(name,x,y){}
function updateRoadLabels(){for(const mesh of roadText){const a=mesh.position.clone(),b=a.clone().add(new THREE.Vector3(Math.cos(mesh.userData.baseRotation),0,-Math.sin(mesh.userData.baseRotation))),pa=a.project(camera),pb=b.project(camera);mesh.rotation.z=mesh.userData.baseRotation+(pb.x<pa.x?Math.PI:0);}}
function updateCamera(){if(!camera)return;camera.position.set(target.x+distance*Math.cos(pitch)*Math.sin(yaw),distance*Math.sin(pitch),target.z+distance*Math.cos(pitch)*Math.cos(yaw));camera.lookAt(target);camera.updateMatrixWorld();renderScene();}
function fit(){if(mode==='2d'){planZoom=1;planCenter=[210,205];drawFallback();return;}yaw=-.64;pitch=.65;target.set(houseCenter[0],7,-houseCenter[1]);distance=viewer.clientWidth/viewer.clientHeight<1.4?160:115;updateCamera();}
function renderScene(){if(mode!=='3d'||!renderer)return;updateRoadLabels();renderer.render(scene,camera);const cp=new THREE.Vector3(target.x,0,target.z).project(camera),np=new THREE.Vector3(target.x,0,target.z-10).project(camera);const bearing=Math.atan2((np.x-cp.x)*viewer.clientWidth,-(cp.y-np.y)*viewer.clientHeight)*180/Math.PI;document.getElementById('compass-needle').style.transform='rotate('+bearing+'deg)';for(const name of ['east','north']){const q=pos(name,state.v[name]),r=state.c.runs.find(r=>r.key===name),h=r?.segments.at(-1)?.height||4,p=new THREE.Vector3(q[0],h/2,-q[1]);p.project(camera);place(name,(p.x+1)/2*viewer.clientWidth,(-p.y+1)/2*viewer.clientHeight);}}
function rebuild(){if(mode==='2d'){drawFallback();return;}if(!scene)return;while(fence.children.length){const child=fence.children[0];child.geometry?.dispose();fence.remove(child);}materials.forEach(m=>m.dispose());materials=[];const {v,c}=state;
const postMat=new THREE.MeshStandardMaterial({color:0x243a2c,roughness:1}),railMat=new THREE.MeshStandardMaterial({color:0xa98c62,roughness:1}),picketMat=new THREE.MeshStandardMaterial({color:0xdbc59e,roughness:1}),shortMat=new THREE.MeshStandardMaterial({color:0xecdaba,roughness:1}),transitionMat=new THREE.MeshBasicMaterial({color:0xb67531});materials=[postMat,railMat,picketMat,shortMat,transitionMat];
const box=(w,h,d,p,y,mat,rotation=0)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(p[0],y,-p[1]);mesh.rotation.y=rotation;fence.add(mesh);return mesh;};
const post=(p,h)=>{box(v.post/12,h+.25,v.post/12,p,(h+.25)/2,postMat);box(v.post/12*1.25,.12,v.post/12*1.25,p,h+.29,postMat);};
for(const r of c.runs){const isEast=r.key==='east',rotation=isEast?-Math.PI/2+angle:Math.PI;
for(const p of r.posts){const q=pos(r.key,p.distance);post(q,p.height);if(p.isTransition){const ring=new THREE.Mesh(new THREE.TorusGeometry(.9,.1,6,24),transitionMat);ring.rotation.x=-Math.PI/2;ring.position.set(q[0],.08,-q[1]);fence.add(ring);}}
for(const s of r.segments){for(let b=0;b<s.bays;b++)for(let level=0;level<s.rails;level++){const y=.7+(s.height-1.4)*(s.rails===1?.5:level/(s.rails-1));box(s.bayLength,.29,.13,pos(r.key,s.start+(b+.5)*s.bayLength),y,railMat,rotation);}
const geom=new THREE.BoxGeometry(v.width/12,s.height,.06),mesh=new THREE.InstancedMesh(geom,s.height===6?picketMat:shortMat,s.pickets),dummy=new THREE.Object3D();for(let i=0;i<s.pickets;i++){const q=pos(r.key,s.start+Math.min(s.length,(i+.5)*s.length/s.pickets));dummy.position.set(q[0]+(isEast?.22*Math.cos(angle):0),s.height/2,-q[1]+(isEast?-.22*Math.sin(angle):-.22));dummy.rotation.y=rotation;dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}fence.add(mesh);}}
if(c.posts)post(corner,c.cornerHeight);status.textContent='3D · SW street-corner view';renderScene();}
function groundPoint(e){const rect=viewer.getBoundingClientRect(),p=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),ray=new THREE.Raycaster();ray.setFromCamera(p,camera);return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());}
host.addEventListener('pointerdown',e=>{if(mode!=='3d')return;host.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const p=[...pointers.values()];pinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}});host.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||mode!=='3d')return;const old=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1){yaw-=(e.clientX-old.x)*.007;pitch=Math.max(.15,Math.min(1.4,pitch+(e.clientY-old.y)*.007));}else{const p=[...pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(d>1&&pinch>1)distance=Math.min(600,Math.max(20,distance*pinch/d));pinch=d;}updateCamera();});for(const type of ['pointerup','pointercancel','lostpointercapture'])host.addEventListener(type,e=>pointers.delete(e.pointerId));host.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(20,Math.min(600,distance*Math.exp(e.deltaY*.001)));updateCamera();},{passive:false});
document.getElementById('fit').onclick=fit;document.getElementById('fit').textContent='SW view';document.getElementById('zoomIn').onclick=()=>{if(mode==='2d'){applyPlanZoom(1.25);return;}distance=Math.max(20,distance*.8);updateCamera();};document.getElementById('zoomOut').onclick=()=>{if(mode==='2d'){applyPlanZoom(.8);return;}distance=Math.min(600,distance*1.25);updateCamera();};
const toggle=document.createElement('button');toggle.textContent='2D';toggle.setAttribute('aria-label','Switch between 2D plan and 3D view');document.querySelector('.viewtools').prepend(toggle);toggle.onclick=()=>{if(mode==='3d'){fallbackView('2D survey plan');toggle.textContent='3D';}else if(renderer){setLayers('3d');toggle.textContent='2D';rebuild();fit();}};
window.addEventListener('fencechange',e=>{state=e.detail;rebuild();});window.addEventListener('fencefit',fit);new ResizeObserver(()=>{if(renderer&&camera){camera.aspect=viewer.clientWidth/viewer.clientHeight;camera.updateProjectionMatrix();renderer.setSize(viewer.clientWidth,viewer.clientHeight);}if(mode==='2d')drawFallback();else renderScene();}).observe(viewer);
try{THREE=await import('./vendor/three.module.js');renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(viewer.clientWidth,viewer.clientHeight);host.replaceChildren(renderer.domElement);setLayers('3d');scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(40,viewer.clientWidth/viewer.clientHeight,1,2000);target=new THREE.Vector3(houseCenter[0],0,-houseCenter[1]);scene.add(new THREE.HemisphereLight(0xffffff,0x758566,2.4));const sun=new THREE.DirectionalLight(0xfff6df,2);sun.position.set(-40,80,60);scene.add(sun);fence=new THREE.Group();scene.add(fence);
const polygon=(points,color,height)=>{const shape=new THREE.Shape();points.forEach((p,i)=>i?shape.lineTo(...p):shape.moveTo(...p));shape.closePath();const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));mesh.rotation.x=-Math.PI/2;mesh.position.y=height;scene.add(mesh);return mesh;};
const far=10000,westX=y=>-y*Math.tan(angle);
// Partition pavement around sidewalks rather than stacking almost-coplanar planes.
const roadRegions=[
 [[-far,-60],[far,-60],[far,-6],[-far,-6]],
 [[-far,-66],[far,-66],[far,-64],[-far,-64]],
 [[-far,-2],[-49.5,-2],[-49.5,0],[-far,0]],
 [[0,-2],[far,-2],[far,0],[0,0]],
 [[-49.5,-6],[0,-6],[0,0],[-49.5,0]],
 ...[[-49.5,-47.5],[-43.5,-6],[-2,0]].map(([a,b])=>[[a,0],[b,0],[westX(far)+b,far],[westX(far)+a,far]])];
const sidewalkRegions=[[[0,-6],[far,-6],[far,-2],[0,-2]],[[-far,-6],[-49.5,-6],[-49.5,-2],[-far,-2]],[[-far,-64],[far,-64],[far,-60],[-far,-60]],[[-47.5,0],[-43.5,0],[westX(far)-43.5,far],[westX(far)-47.5,far]],[[-6,0],[-2,0],[westX(far)-2,far],[westX(far)-6,far]]];
for(const points of roadRegions){const mesh=polygon(points,0xf1f0e9,-.25);mesh.name='road-surface';mesh.userData.plan=points;}
for(const points of sidewalkRegions){const mesh=polygon(points,0xdedfd6,-.015);mesh.name='sidewalk-surface';mesh.userData.plan=points;}

for(const points of [[[-far,-33],[far,-33]],[[-24.75,0],[westX(far)-24.75,far]]]){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(p[0],-.20,-p[1]))),new THREE.LineDashedMaterial({color:0xb8b8a4,dashSize:8,gapSize:7}));line.name='street-centerline';line.computeLineDistances();scene.add(line);}
for(const points of [[[0,-6],[far,-6]],[[-far,-6],[-49.5,-6]],[[-far,-60],[far,-60]],[[-6,0],[westX(far)-6,far]],[[-43.5,0],[westX(far)-43.5,far]]]){const curb=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(p[0],.025,-p[1]))),new THREE.LineBasicMaterial({color:0xc9cec3}));curb.name='street-curb';scene.add(curb);}polygon(geometry.lot,0xe5eddb,0);geometry.porches.forEach(p=>polygon(p,0xa7b5a5,.025));polygon(geometry.house,0x5f726c,.045);polygon(geometry.shed.corners,0x70899a,.06);
const sh=geometry.shed,shed=new THREE.Group();shed.name='scaled-shed';shed.position.set(sh.center[0],0,-sh.center[1]);shed.rotation.y=sh.angle_rad;scene.add(shed);
const wallMaterial=new THREE.MeshStandardMaterial({color:0xbcc5bf,roughness:.95}),roofMaterial=new THREE.MeshStandardMaterial({color:0x40565e,roughness:.9,side:THREE.DoubleSide});
const walls=new THREE.Mesh(new THREE.BoxGeometry(sh.width_ft,sh.wall_height_ft,sh.depth_ft),wallMaterial);walls.name='shed-walls';walls.position.y=sh.wall_height_ft/2;shed.add(walls);
const hw=sh.width_ft/2,hd=sh.depth_ft/2,o=sh.overhang_ft,r=sh.ridge_height_ft,e=sh.wall_height_ft-o*((r-sh.wall_height_ft)/hd);
function shedFace(name,coords,mat){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));geo.computeVertexNormals();const m=new THREE.Mesh(geo,mat);m.name=name;shed.add(m);}
for(const side of [-1,1]){const z=side*(hd+o),x=hw+o;shedFace('shed-roof-'+side,[-x,e,z,x,e,z,x,r,0,-x,e,z,x,r,0,-x,r,0],roofMaterial);}
for(const side of [-1,1]){const x=side*hw;shedFace('shed-gable-'+side,[x,sh.wall_height_ft,-hd,x,sh.wall_height_ft,hd,x,r,0],new THREE.MeshStandardMaterial({color:0xbcc5bf,roughness:.95,side:THREE.DoubleSide}));}

// Low-poly massing from the supplied survey footprint and four reference photos.
// Heights, pitches and unseen rear roof junctions are explicitly approximate.
const house=new THREE.Group();house.name='low-poly-house';scene.add(house);
const lightWall=new THREE.MeshStandardMaterial({color:0xc6ceca,roughness:1,side:THREE.DoubleSide}),darkRoof=new THREE.MeshStandardMaterial({color:0x434b4e,roughness:1,side:THREE.DoubleSide}),trim=new THREE.MeshStandardMaterial({color:0xe8ebe4,roughness:1}),glass=new THREE.MeshStandardMaterial({color:0x435962,roughness:.65}),shutters=new THREE.MeshStandardMaterial({color:0x30373c}),redTrim=new THREE.MeshStandardMaterial({color:0x7e4847});
const H=(x,y,h)=>[x,h,-y];
function hPanels(name,panels,mat=lightWall){const pos=[];for(const points of panels)for(let i=1;i<points.length-1;i++)pos.push(...points[0],...points[i],...points[i+1]);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();const m=new THREE.Mesh(g,mat);m.name=name;house.add(m);return m;}
function hFace(name,points,mat=lightWall){return hPanels(name,[points],mat);}
function hBox(name,w,h,d,x,y,z,mat){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,z,-y);m.name=name;house.add(m);return m;}
// One roof-height function drives the wraparound roof, its enclosed walls and
// the small closures under the upper house. Keep the surveyed ground outline.
const porchRoofOutline=[[25.9,60.6],[33.8,61.4],[33.6,77],[39,77],[49,77],[49,84.7],[25.9,84.7]],hipSum=25.9+84.7;
const porchRoofHeight=(x,y)=>Math.min(8+(x-25.9)*.12,8+(84.7-y)*.12);
function underPorchRoof(p){let inside=false;for(let i=0,j=porchRoofOutline.length-1;i<porchRoofOutline.length;j=i++){const a=porchRoofOutline[i],b=porchRoofOutline[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function porchWallSpans(a,b){
 const dx=b[0]-a[0],dy=b[1]-a[1],cuts=[0,1],cross=(x,y,u,v)=>x*v-y*u;
 // Split at the hip and roof perimeter so no triangle bridges two slopes or
 // lowers a neighboring wall that lies outside the porch roof.
 const hipT=(hipSum-a[0]-a[1])/(dx+dy);if(hipT>0&&hipT<1)cuts.push(hipT);
 for(let i=0;i<porchRoofOutline.length;i++){const c=porchRoofOutline[i],d=porchRoofOutline[(i+1)%porchRoofOutline.length],ex=d[0]-c[0],ey=d[1]-c[1],den=cross(dx,dy,ex,ey);if(Math.abs(den)<1e-10)continue;const t=cross(c[0]-a[0],c[1]-a[1],ex,ey)/den,u=cross(c[0]-a[0],c[1]-a[1],dx,dy)/den;if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t);}
 const ts=[...new Set(cuts)].sort((a,b)=>a-b),point=t=>[a[0]+dx*t,a[1]+dy*t],spans=[];
 for(let i=0;i<ts.length-1;i++){if(ts[i+1]-ts[i]<1e-9)continue;const p=point(ts[i]),q=point(ts[i+1]),covered=underPorchRoof(point((ts[i]+ts[i+1])/2)),height=p=>covered?Math.min(9,porchRoofHeight(...p)):9;spans.push([H(...p,0),H(...q,0),H(...q,height(q)),H(...p,height(p))]);}return spans;
}
geometry.house.forEach((a,i)=>{const b=geometry.house[(i+1)%geometry.house.length];hPanels('survey-wall-'+i,i>=6&&i<=12?porchWallSpans(a,b):[[H(...a,0),H(...b,0),H(...b,9),H(...a,9)]]);});
// Main two-storey gable: three upper windows and front entrance face Oakwood.
function gable(name,x0,x1,y0,y1,eave,ridge,overhang=.7){
 hFace(name+'-west',[H(x0,y0,9),H(x0,y1,9),H(x0,y1,eave),H(x0,y0,eave)]);
 hFace(name+'-east',[H(x1,y0,9),H(x1,y1,9),H(x1,y1,eave),H(x1,y0,eave)]);
 for(const y of [y0,y1])hFace(name+'-gable',[H(x0,y,9),H(x1,y,9),H(x1,y,eave),H((x0+x1)/2,y,ridge),H(x0,y,eave)]);
 const slope=(ridge-eave)/((x1-x0)/2),low=eave-overhang*slope;
 hFace(name+'-roof-west',[H(x0-overhang,y0-overhang,low),H((x0+x1)/2,y0-overhang,ridge),H((x0+x1)/2,y1+overhang,ridge),H(x0-overhang,y1+overhang,low)],darkRoof);
 hFace(name+'-roof-east',[H((x0+x1)/2,y0-overhang,ridge),H(x1+overhang,y0-overhang,low),H(x1+overhang,y1+overhang,low),H((x0+x1)/2,y1+overhang,ridge)],darkRoof);
}
gable('main',29.73,50.32,35.35,61.55,18,25);
gable('rear-assumed',33.31,49.96,61.55,77.44,16,21.5);
// Close the thin strip below each upper wall down to the same roof surface.
// These are attachment walls, not a second roof or a raised porch parapet.
for(const [name,a,b] of [['west',[33.31,61.55],[33.31,77.44]],['north',[33.31,77.44],[49,77.44]],['south',[29.73,61.55],[33.31,61.55]]]){
 const t=(hipSum-a[0]-a[1])/(b[0]+b[1]-a[0]-a[1]),points=[a];if(t>0&&t<1)points.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);points.push(b);
 hPanels('porch-house-closure-'+name,points.slice(1).map((q,i)=>{const p=points[i];return [H(...p,porchRoofHeight(...p)),H(...q,porchRoofHeight(...q)),H(...q,9),H(...p,9)];}));
}
// Lower rear extension and side projections retain their footprint scale.

hFace('east-wing-roof',[H(49.7,47.8,11),H(55.8,47.9,9),H(55.6,62.7,9),H(49.5,62.6,11)],darkRoof);
for(const [a,b] of [[[26.6,48.2],[30,48.25]],[[30,48.25],[29.9,57.2]],[[29.9,57.2],[26.5,57.15]],[[26.5,57.15],[26.6,48.2]]])hFace('west-bay-hip',[H(...a,9.1),H(...b,9.1),H(28.3,52.7,10.8)],darkRoof);
// Shallow porch roofs, square posts and a few rails, without high-poly siding.
const front=geometry.porches[0],fp=[H(30.4,27.8,8.2),H(50,27.8,8.2),H(50,35.3,8.2),H(30.4,35.3,8.2)],ra=H(37.9,35.3,9.5),rb=H(42.5,35.3,9.5);hFace('front-porch-hip-front',[fp[0],fp[1],rb,ra],darkRoof);hFace('front-porch-hip-east',[fp[1],fp[2],rb],darkRoof);hFace('front-porch-hip-west',[fp[3],fp[0],ra],darkRoof);
for(const x of [31,39.5,49.4])hBox('porch-post',.38,7.8,.38,x,29.1,3.9,trim);
hBox('porch-deck',18.6,.4,6.7,40.2,31.8,.8,lightWall);
for(const z of [2,3.4])hBox('porch-front-rail',12.2,.16,.16,37.1,28.85,z,trim);
for(const x of [31.5,33,34.5,36,37.5,39,40.5,42,43])hBox('porch-baluster',.13,1.4,.13,x,28.85,2.7,trim);
for(let i=0;i<3;i++)hBox('porch-step',5.5,.25,1.1,46,27.8-i*.85,.65-i*.2,lightWall);
const rearPorch=geometry.porches[1];
function clipHip(poly,side){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],fa=(a[0]+a[1]-hipSum)*side,fb=(b[0]+b[1]-hipSum)*side;if(fa>=-1e-8)out.push(a);if((fa>0&&fb<0)||(fa<0&&fb>0)){const t=fa/(fa-fb);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}return out;}
for(const [name,side] of [['west',-1],['north',1]]){const points=clipHip(porchRoofOutline,side),shape=new THREE.Shape();points.forEach((p,i)=>i?shape.lineTo(...p):shape.moveTo(...p));shape.closePath();const geo=new THREE.ShapeGeometry(shape),pa=geo.attributes.position;for(let i=0;i<pa.count;i++){const x=pa.getX(i),y=pa.getY(i),h=porchRoofHeight(x,y);pa.setXYZ(i,x,h,-y);}geo.computeVertexNormals();const roof=new THREE.Mesh(geo,darkRoof);roof.name='hipped-'+name+'-porch-roof';house.add(roof);}
for(const q of [rearPorch[0],rearPorch[5]])hBox('rear-porch-post',.35,8,.35,q[0],q[1],4,trim);
function frontWindow(x,height){hBox('window-burgundy-trim',3.3,5.4,.12,x,35.15,height,redTrim);hBox('window-white-frame',2.8,4.9,.14,x,35.07,height,trim);hBox('window-glass',2.4,4.5,.15,x,34.99,height,glass);hBox('window-sash',2.5,.12,.18,x,34.88,height,trim);for(const side of [-1,1])hBox('window-shutter',.9,5.3,.15,x+side*2.1,35.05,height,shutters);}
for(const x of [33.8,40,46.2])frontWindow(x,14.2);for(const x of [33.8,40])frontWindow(x,4.5);
for(const y of [40.2,57])for(const z of [4.7,14.2]){hBox('west-window-trim',.16,5.4,3.3,29.55,y,z,redTrim);hBox('west-window',.18,4.8,2.7,29.44,y,z,glass);}for(const y of [50,54.7]){hBox('bay-window-trim',.16,5.4,2.5,27.05,y,5,redTrim);hBox('bay-window',.18,4.8,2.1,26.94,y,5,glass);}
hBox('front-door-frame',3.5,7,.18,46.2,35.05,4,trim);hBox('front-door',2.9,6.5,.2,46.2,34.9,4,shutters);


const shedTrim=new THREE.MeshStandardMaterial({color:0xe7ece7}),shedDoor=new THREE.MeshStandardMaterial({color:0xb8c2bf}),fasciaMat=new THREE.MeshStandardMaterial({color:0xbf9b6e});
function shBox(name,w,h,d,x,y,z,mat){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.name=name;shed.add(m);return m;}
shBox('shed-front-trim',.12,6.3,2.8,-hw-.03,3.15,0,shedTrim);shBox('shed-double-door',.14,5.9,2.4,-hw-.1,3.15,0,shedDoor);shBox('shed-door-center',.16,5.9,.07,-hw-.19,3.15,0,shedTrim);
shBox('shed-side-trim',2.6,6.3,.12,2.3,3.15,hd+.03,shedTrim);shBox('shed-side-door',2.2,5.9,.14,2.3,3.15,hd+.1,shedDoor);
for(const x of [-hw,hw])for(const z of [-hd,hd])shBox('shed-corner-trim',.16,7,.16,x,3.5,z,shedTrim);
for(const x of [-hw-o,hw+o])for(const side of [-1,1]){const length=Math.hypot(hd+o,r-e),m=shBox('shed-rake',.14,.2,length,x,(r+e)/2,side*(hd+o)/2,fasciaMat);m.rotation.x=side*Math.atan2(r-e,hd+o);}
for(const z of [-hd-o,hd+o])shBox('shed-eave',sh.width_ft+2*o,.2,.14,0,e,z,fasciaMat);

// Ghost materials are isolated from fence/ground materials and do not write depth.
for(const group of [house,shed])group.traverse(mesh=>{if(!mesh.isMesh)return;mesh.userData.normalMaterial=mesh.material;const ghost=mesh.material.clone();ghost.transparent=true;ghost.opacity=.14;ghost.depthWrite=false;ghost.forceSinglePass=true;mesh.userData.ghostMaterial=ghost;buildingMeshes.push(mesh);});
const boundary=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(geometry.lot.map(p=>new THREE.Vector3(p[0],.02,-p[1]))),new THREE.LineBasicMaterial({color:0x9aad8c}));scene.add(boundary);
// Ground-anchored street typography: depth tested, never forced over buildings or into view.
function streetText(name,text,x,z,rotation=0){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;const ctx=canvas.getContext('2d');ctx.font='400 64px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#697b6b';ctx.fillText(text,512,64);const material=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,opacity:.85,depthTest:true,depthWrite:false,side:THREE.DoubleSide});const mesh=new THREE.Mesh(new THREE.PlaneGeometry(25,3.125),material);mesh.name=name;mesh.rotation.x=-Math.PI/2;mesh.rotation.z=rotation;mesh.position.set(x,.025,z);mesh.userData.baseRotation=rotation;scene.add(mesh);roadText.push(mesh);return mesh;}
streetText('street-text-paine','PAINE ST · WEST',-15,-54,Math.PI/2);
streetText('street-text-oakwood','OAKWOOD AVE · SOUTH',31,19);
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();fallbackView('2D plan · graphics interrupted');});fit();rebuild();}catch(error){fallbackView();toggle.disabled=true;toggle.textContent='2D';}

fallback.addEventListener('wheel',e=>{e.preventDefault();applyPlanZoom(Math.exp(-e.deltaY*.001));},{passive:false});fallback.addEventListener('pointerdown',e=>{fallback.setPointerCapture(e.pointerId);planPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(planPointers.size===2){const p=[...planPointers.values()];planPinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}});fallback.addEventListener('pointermove',e=>{if(!planPointers.has(e.pointerId))return;const old=planPointers.get(e.pointerId);planPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(planPointers.size===2){const p=[...planPointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(d>1&&planPinch>1)applyPlanZoom(d/planPinch);planPinch=d;}else{const rect=fallback.getBoundingClientRect(),scale=Math.max(420/rect.width,410/rect.height)/planZoom;planCenter[0]-=(e.clientX-old.x)*scale;planCenter[1]-=(e.clientY-old.y)*scale;drawFallback();}});for(const type of ['pointerup','pointercancel','lostpointercapture'])fallback.addEventListener(type,e=>planPointers.delete(e.pointerId));
