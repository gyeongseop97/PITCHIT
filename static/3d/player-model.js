import * as THREE from './vendor/three.module.min.js';

// Metre-scale, original baseball character. The garment and limbs are skinned
// to the same joints used by the gameplay choreography, including elbow/knee
// blend weights. No remote assets, loading step or per-frame mesh rebuilding.
const skinColors = ['#c99472', '#af7955', '#e0b391', '#966246'];
const unitSphere = new THREE.SphereGeometry(1, 20, 16);
const clamp = THREE.MathUtils.clamp;

function combine(parts) {
 const positions=[], normals=[], uvs=[];
 for (const {geometry, position=[0,0,0], scale=[1,1,1], rotation=[0,0,0]} of parts) {
  const g=geometry.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(...scale))).toNonIndexed();
  positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);uvs.push(...g.attributes.uv.array);g.dispose();
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));return g;
}
function oval(position,scale) { return {geometry:unitSphere,position,scale}; }
function surface(parent,geometry,material) {const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function standard(color,roughness=.8) {return new THREE.MeshStandardMaterial({color,roughness});}
function bone(parent,x,y,z,bones) {const b=new THREE.Bone();b.position.set(x,y,z);parent.add(b);b.userData.index=bones.length;bones.push(b);return b;}

function bodyGeometry() {
 const positions=[],indices=[],skinIndices=[],skinWeights=[],groups=[];
 const seams=[];
 // Monotone cubic sections soften the silhouette without bulging past a
 // wrist/knee measurement. Shared seam normals avoid a hard vertical stripe.
 function roundProfile(profile) {
  const slope=(i,axis)=>{
   const delta=k=>(profile[k+1][axis]-profile[k][axis])/(profile[k+1][0]-profile[k][0]);
   if(i===0)return delta(0);if(i===profile.length-1)return delta(i-1);
   const a=delta(i-1),b=delta(i);return a*b<=0?0:2*a*b/(a+b);
  };
  const rounded=[];
  for(let i=0;i<profile.length-1;i++){
   const a=profile[i],b=profile[i+1],height=b[0]-a[0],steps=Math.max(2,Math.ceil(height/.025));
   for(let j=0;j<steps;j++){const t=j/steps,t2=t*t,t3=t2*t;
    rounded.push([a[0]+height*t,...[1,2].map(axis=>(2*t3-3*t2+1)*a[axis]+(t3-2*t2+t)*height*slope(i,axis)+(-2*t3+3*t2)*b[axis]+(t3-t2)*height*slope(i+1,axis))]);
   }
  }
  rounded.push(profile.at(-1));return rounded;
 }
 // Profiles are elliptical cross sections [height, half width, half depth].
 function loft(profile,cx,cz,material,weights) {
  profile=roundProfile(profile);
  const start=positions.length/3,first=indices.length,n=20;
  for(let r=0;r<profile.length;r++)seams.push([start+r*(n+1),start+r*(n+1)+n]);
  for(const [y,rx,rz] of profile)for(let j=0;j<=n;j++){
   const angle=j/n*Math.PI*2;positions.push(cx+Math.sin(angle)*rx,y,cz+Math.cos(angle)*rz);
   const [a,b,w]=weights(y);skinIndices.push(a,b,0,0);skinWeights.push(1-w,w,0,0);
  }
  for(let r=0;r<profile.length-1;r++)for(let j=0;j<n;j++){const a=start+r*(n+1)+j,b=a+1,d=a+n+1,c=d+1;indices.push(a,b,c,a,c,d)}
  groups.push([first,indices.length-first,material]);
 }
 // Bone order: pelvis, chest, neck/head; L shoulder, elbow, hand; R same;
 // L thigh, shin, ankle; R same. Keep the body weighted across the waist.
 loft([[.77,.16,.095],[.82,.20,.125],[.88,.19,.12],[.915,.18,.115]],0,0,1,()=>[0,0,0]);
 loft([[.895,.192,.128],[.94,.19,.13],[1.02,.186,.129],[1.12,.20,.137],[1.24,.224,.148],[1.34,.237,.139],[1.39,.222,.122],[1.43,.175,.095],[1.465,.069,.068]],0,0,0,y=>[0,1,clamp((y-.92)/.22,0,1)]);
 loft([[1.445,.052,.05],[1.49,.057,.052],[1.55,.06,.056]],0,.012,2,()=>[1,2,.25]);
 for(const [x,shoulder,elbow,hand] of [[.245,3,4,5],[-.245,6,7,8]]){
  loft([[1.14,.071,.068],[1.18,.077,.075],[1.25,.086,.082],[1.34,.088,.084],[1.40,.079,.076],[1.445,.041,.042],[1.45,.002,.002]],x,0,0,()=>[shoulder,shoulder,0]);
  loft([[.735,.043,.037],[.78,.05,.045],[.87,.068,.059],[.95,.076,.065],[1.025,.064,.061],[1.06,.063,.06],[1.13,.064,.059],[1.19,.064,.058]],x,0,2,y=>[shoulder,elbow,clamp((1.125-y)/.12,0,1)]);
 }
 for(const [x,thigh,shin] of [[.13,9,10],[-.13,12,13]]){
  loft([[.1,.062,.061],[.17,.069,.07],[.24,.079,.077],[.34,.082,.078],[.40,.081,.081],[.44,.087,.087],[.54,.101,.108],[.66,.114,.121],[.77,.119,.12],[.85,.103,.10]],x,0,1,y=>[thigh,shin,clamp((.485-y)/.13,0,1)]);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndices,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(skinWeights,4));g.setIndex(indices);g.computeVertexNormals();
 const normal=g.getAttribute('normal');for(const [a,b] of seams){const v=new THREE.Vector3().fromBufferAttribute(normal,a).add(new THREE.Vector3().fromBufferAttribute(normal,b)).normalize();normal.setXYZ(a,v.x,v.y,v.z);normal.setXYZ(b,v.x,v.y,v.z);}
 for(const [s,c,m] of groups)g.addGroup(s,c,m);return g;
}

export function createPlayerFactory(scene) {
 const body=bodyGeometry(),leather=standard('#845732'),laces=standard('#cfab72'),dark=standard('#182532'),pants=standard('#e7e6df');
 const faceGeometry=combine([oval([0,0,0],[.105,.14,.105]),oval([0,-.048,.034],[.088,.08,.083]),oval([0,-.018,.108],[.023,.029,.036]),oval([-.108,-.005,0],[.022,.038,.018]),oval([.108,-.005,0],[.022,.038,.018])]);
 const faceDetails=combine([oval([-.038,.023,.100],[.014,.006,.004]),oval([.038,.023,.100],[.014,.006,.004]),oval([-.038,.045,.095],[.025,.005,.006]),oval([.038,.045,.095],[.025,.005,.006]),oval([0,-.070,.109],[.024,.003,.003])]);
 const shoeGeometry=combine([oval([0,-.002,.047],[.075,.067,.137]),oval([0,-.036,.048],[.078,.023,.143])]);
 const handGeometry=combine([oval([0,-.012,.009],[.045,.057,.032]),oval([-.038,.008,.018],[.017,.033,.022])]);
 const capGeometry=combine([{geometry:new THREE.SphereGeometry(1,20,12,0,Math.PI*2,0,Math.PI*.53),position:[0,.059,0],scale:[.118,.102,.117]},oval([0,.066,.121],[.12,.011,.10])]);
 const helmetGeometry=combine([{geometry:new THREE.SphereGeometry(1,20,12,0,Math.PI*2,0,Math.PI*.62),position:[0,.065,-.005],scale:[.126,.111,.128]},oval([0,.049,.13],[.116,.014,.093]),oval([-.116,-.02,0],[.02,.075,.072]),oval([.116,-.02,0],[.02,.075,.072])]);
 const gloveGeometry=combine([oval([0,0,.025],[.10,.10,.034]),...[-2,-1,0,1,2].map(i=>oval([i*.036,.068-Math.abs(i)*.012,.02],[.026,.072,.035])),oval([-.10,-.005,.04],[.048,.074,.046])]);
 const mittGeometry=combine([oval([0,.012,.02],[.15,.16,.04]),oval([-.12,-.01,.04],[.045,.10,.042])]);
 function createGlove(parent,mitt=false) {
  const g=new THREE.Group();g.position.set(0,-.015,.035);parent.add(g);surface(g,mitt?mittGeometry:gloveGeometry,leather);
  const stitches=[];const count=mitt?24:18;for(let i=0;i<count;i++){const a=i/count*Math.PI*2;stitches.push(oval([Math.sin(a)*(mitt?.13:.09),Math.cos(a)*(mitt?.14:.115),.055],[.009,.005,.005]))}
  surface(g,combine(stitches),laces);surface(g,combine([oval([.015,.004,.054],mitt?[.096,.105,.008]:[.06,.068,.008])]),standard('#614125'));return g;
 }
 const bodyVariants=new Map();
 function shapedBody(build){
  if(bodyVariants.has(build.id))return bodyVariants.get(build.id);
  const g=body.clone(),pos=g.attributes.position,skin=g.attributes.skinIndex;
  for(let i=0;i<pos.count;i++){
   let x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);const bone=skin.getX(i);
   if([3,4,6,7].includes(bone)){const center=bone<6?.245:-.245;x=center+(x-center)*build.arm;z*=build.arm;y+=build.torsoExtra;}
   else if([9,10,12,13].includes(bone)){const center=bone<12?.13:-.13;x=center+(x-center)*build.leg;z*=build.leg;}
   else{const u=clamp((y-.92)/.46,0,1);if(y<1.445){x*=THREE.MathUtils.lerp(build.waist,build.chest,u);z*=build.depth;}y+=build.torsoExtra*u;}
   pos.setXYZ(i,x,y,z);
  }
  g.computeVertexNormals();bodyVariants.set(build.id,g);return g;
 }
 const badgeTextures=new Map();
 function lettering(text) {
  if(badgeTextures.has(text))return badgeTextures.get(text);
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;const c=canvas.getContext('2d');c.font=text==='PITCHIT'?'italic 800 49px Arial':'900 92px Arial';c.textAlign='center';c.textBaseline='middle';c.fillStyle='#fff';c.fillText(text,128,68);const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;badgeTextures.set(text,t);return t;
 }
 function player(color,x,z,number,role='fielder') {
  const root=new THREE.Group();scene.add(root);const bones=[];
  const hip=bone(root,0,.86,0,bones),torso=bone(hip,0,.09,0,bones),head=bone(torso,0,.68,.012,bones);
  const left={},right={};for(const [arm,x] of [[left,.245],[right,-.245]]){arm.pivot=bone(torso,x,.43,0,bones);arm.elbow=bone(arm.pivot,0,-.32,0,bones);arm.hand=bone(arm.elbow,0,-.31,0,bones)}
  const legs=[];for(const x of [.13,-.13]){const leg={};leg.pivot=bone(hip,x,-.05,0,bones);leg.knee=bone(leg.pivot,0,-.39,0,bones);leg.foot=bone(leg.knee,0,-.34,0,bones);legs.push(leg)}
  const jersey=standard(color,.94),kit=standard(color,.48),trim=standard('#eee5cc'),skin=standard(skinColors[(parseInt(number)||0)%skinColors.length],.83);
  const bindPositions=bones.map(b=>b.position.clone());let bodyBuild={id:'balanced',name:'균형형',chest:1,waist:1,depth:1,arm:1,leg:1,torsoExtra:0};
  const bodyMesh=new THREE.SkinnedMesh(body,[jersey,role==='umpire'?dark:pants,skin]);bodyMesh.castShadow=bodyMesh.receiveShadow=true;bodyMesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,1,0),2.3);root.add(bodyMesh);root.updateMatrixWorld(true);bodyMesh.bind(new THREE.Skeleton(bones));
  surface(head,faceGeometry,skin);surface(head,faceDetails,dark);
  const hat=surface(head,role==='batter'||role==='runner'||role==='catcher'?helmetGeometry:capGeometry,kit);
  for(const arm of [left,right])surface(arm.hand,handGeometry,role==='batter'||role==='runner'?pants:skin);
  for(const leg of legs){surface(leg.foot,shoeGeometry,dark);surface(leg.foot,combine([oval([0,.018,.07],[.057,.007,.06])]),trim);}
  // Belt, placket and collar sit on the garment and follow their own bones.
  const belt=surface(hip,new THREE.CylinderGeometry(.204,.204,.036,32),dark);belt.scale.z=.70;belt.position.y=.04;
  const buckle=surface(hip,new THREE.BoxGeometry(.047,.03,.015),standard('#b6b4a5',.35));buckle.position.set(0,.04,.153);
  const shirtDetails=[];for(let i=0;i<4;i++)shirtDetails.push(oval([0,.13+i*.065,.14],[.006,.006,.004]));
  const buttons=surface(torso,combine(shirtDetails),trim);
  const collar=surface(torso,new THREE.TorusGeometry(.064,.011,6,24),trim);collar.rotation.x=Math.PI/2;collar.position.y=.507;
  const badge=new THREE.Group();torso.add(badge);
  for(const [text,w,h,y,z,ry] of [['PITCHIT',.32,.13,.285,.151,0],[number,.23,.26,.26,-.147,Math.PI]]){const m=surface(badge,new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:lettering(text),color:'#f9f5e7',transparent:true,depthWrite:false,side:THREE.DoubleSide}));m.position.set(0,y,z);m.rotation.y=ry;m.castShadow=false;}
  const gear=[];
  if(role==='catcher'||role==='umpire'){
   const armor=standard(role==='catcher'?'#753d35':'#202833');
   if(role==='catcher'){
    const chest=combine([oval([0,.28,.15],[.186,.217,.054]),oval([-.175,.40,.03],[.067,.069,.088]),oval([.175,.40,.03],[.067,.069,.088])]);gear.push(surface(torso,chest,armor));
    const ribs=[];for(let i=0;i<5;i++)ribs.push(oval([0,.135+i*.058,.202],[.14,.012,.009]));surface(torso,combine(ribs),dark);
    for(const leg of legs){gear.push(surface(leg.knee,combine([oval([0,0,.072],[.092,.088,.053]),oval([0,-.165,.078],[.079,.158,.042])]),armor));}
   }
   const cage=[];for(const y of [-.08,-.025,.03,.085]){const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(-.12,y,.065),new THREE.Vector3(-.085,y,.13),new THREE.Vector3(0,y,.15),new THREE.Vector3(.085,y,.13),new THREE.Vector3(.12,y,.065)]);cage.push({geometry:new THREE.TubeGeometry(curve,12,.007,5,false)})}
   for(const x of [-.08,.08])cage.push({geometry:new THREE.CylinderGeometry(.007,.007,.2,6),position:[x,0,.134]});
   surface(head,combine(cage),standard('#66717a',.42));
  }
  root.position.set(x,0,z);
  function setUniform(color) {jersey.color.set(color);const light=jersey.color.getHSL({}).l>.5;kit.color.set(light?'#243848':color).multiplyScalar(light?.9:.62);trim.color.set(light?'#283d50':'#f3e9d6');badge.children.forEach(m=>m.material.color.copy(trim.color));}
  function setBuild(build){
   if(!build||bodyBuild.id===build.id)return;bodyBuild={...build};
   const pose=bones.map(b=>({position:b.position.clone(),rotation:b.quaternion.clone()}));
   bones.forEach((b,i)=>{b.position.copy(bindPositions[i]);b.quaternion.identity();});
   head.position.y+=build.torsoExtra;left.pivot.position.y+=build.torsoExtra;right.pivot.position.y+=build.torsoExtra;
   root.updateWorldMatrix(true,true);bodyMesh.skeleton.dispose();bodyMesh.geometry=shapedBody(build);bodyMesh.bind(new THREE.Skeleton(bones));
   // Restore animation without undoing the new shoulder/head bind positions.
   bones.forEach((b,i)=>{if(![2,3,6].includes(i))b.position.copy(pose[i].position);b.quaternion.copy(pose[i].rotation);});
   belt.scale.set(build.waist,1,.70*build.depth);buckle.position.z=.153*build.depth;buttons.position.set(0,build.torsoExtra*.5,.14*(build.depth-1));collar.position.y=.507+build.torsoExtra;
   for(const m of badge.children)m.position.z=(m.rotation.y?-.147:.151)*build.depth;
  }
  setUniform(color);
  return {root,hip,torso,head,left,right,legs,badge,bodyMesh,role,hat,gear,setBuild,get build(){return {...bodyBuild}},get uniformColor(){return jersey.color.getStyle()},setUniform};
 }
 return {player,createGlove};
}
