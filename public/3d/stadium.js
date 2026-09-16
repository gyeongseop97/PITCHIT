import * as THREE from './vendor/three.module.min.js';

// A closed ballpark, including the areas seen from the pitching/field cameras.
// Repeated seats, spectators and structure use instances instead of thousands
// of individual meshes. All decoration stays outside the playing diamond.
export function createStadium(scene) {
 const root=new THREE.Group();root.name='PITCHIT Ballpark';scene.add(root);
 const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{zenith:{value:new THREE.Color('#507fa2')},horizon:{value:new THREE.Color('#c1d7d7')}},vertexShader:'varying float altitude; void main(){altitude=position.y/230.0;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform vec3 zenith; uniform vec3 horizon; varying float altitude; void main(){gl_FragColor=vec4(mix(horizon,zenith,smoothstep(0.0,0.8,altitude)),1.0);\n #include <tonemapping_fragment>\n #include <colorspace_fragment>\n}'});
 const sky=new THREE.Mesh(new THREE.SphereGeometry(230,24,16),skyMaterial);sky.position.z=-28;sky.renderOrder=-10;root.add(sky);
 const batches=new Map(),dummy=new THREE.Object3D();
 const cube=new THREE.BoxGeometry(1,1,1),ball=new THREE.SphereGeometry(1,8,5);
 const mats={concrete:new THREE.MeshStandardMaterial({color:'#9a9e99',roughness:1}),paint:new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.83}),metal:new THREE.MeshStandardMaterial({color:'#4a5b60',roughness:.55}),glass:new THREE.MeshStandardMaterial({color:'#24464e',roughness:.25,metalness:.35}),light:new THREE.MeshBasicMaterial({color:'#fff1c3'})};
 const stats={sections:0,seats:0,spectators:0,dugouts:2,outfieldRadius:100,wallHeight:3.3};
 function block(pos,scale,color='#fff',material='paint',rotation=0,geometry=cube,key=material) {
  if(!batches.has(key))batches.set(key,{geometry,material:mats[material],items:[]});
  batches.get(key).items.push({pos,scale,color,rotation});
 }
 function local(origin,angle,x,y,z) {return [origin[0]+Math.cos(angle)*x+Math.sin(angle)*z,y,origin[1]-Math.sin(angle)*x+Math.cos(angle)*z]}
 function piece(origin,angle,p,scale,color,material='paint') {block(local(origin,angle,...p),scale,color,material,angle)}
 function rod(a,b,r=.04,color='#657875') {
  const v1=new THREE.Vector3(...a),v2=new THREE.Vector3(...b),g=new THREE.CylinderGeometry(r,r,v1.distanceTo(v2),6),m=new THREE.Mesh(g,mats.metal);m.position.copy(v1).add(v2).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v2.sub(v1).normalize());root.add(m);return m;
 }
 function sign(text,w,h,pos,angle=0,bg='#123e37',fg='#ede8cf') {
  const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,1024,256);ctx.fillStyle=fg;ctx.font=`800 ${Math.min(100,900/(text.length*.59))}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,132);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture}));m.position.set(...pos);m.rotation.y=angle;root.add(m);return m;
 }
 const boundary=[[0,14],[9,11],[18,3],[31,-12],[45,-30],[60,-50],[70.71,-70.71]];
 for(let i=1;i<=16;i++){const a=Math.PI/4-i*Math.PI/32;boundary.push([Math.sin(a)*stats.outfieldRadius,-Math.cos(a)*stats.outfieldRadius]);}
 boundary.push([-60,-50],[-45,-30],[-31,-12],[-18,3],[-9,11]);
 function instanceSection(geometry,material,entries) {const mesh=new THREE.InstancedMesh(geometry,material,entries.length);for(const [i,e] of entries.entries()){dummy.position.set(...e.pos);dummy.scale.set(...e.scale);dummy.rotation.set(0,e.rotation||0,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new THREE.Color(e.color));}mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.receiveShadow=true;root.add(mesh);return mesh;}
 // Seat backs and cushions share one tiny mesh; spectators are silhouettes
 // rather than full player rigs because most are only a handful of pixels.
 function boxesGeometry(parts) {const pos=[],normal=[];for(const [position,scale] of parts){const g=cube.clone().scale(...scale).translate(...position).toNonIndexed();pos.push(...g.attributes.position.array);normal.push(...g.attributes.normal.array);g.dispose()}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));return g;}
 const seatGeometry=boxesGeometry([[[0,0,0],[.46,.07,.43]],[[0,.23,.18],[.46,.45,.07]]]);
 const personGeometry=(()=>{const pos=[],norm=[];for(const [p,s] of [[[0,.21,0],[.145,.24,.115]],[[0,.53,0],[.10,.12,.10]]]){const g=ball.clone().scale(...s).translate(...p).toNonIndexed();pos.push(...g.attributes.position.array);norm.push(...g.attributes.normal.array);g.dispose()}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));return g;})();
 for(let i=0;i<boundary.length;i++){
  const a=boundary[i],b=boundary[(i+1)%boundary.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),angle=-Math.atan2(dz,dx),origin=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  const outfield=origin[1]<-65,back=origin[1]>2,rows=outfield?9:12,seats=[],crowd=[];stats.sections++;
  // Warning track, padded wall, concrete terraces and the exterior facade.
  piece(origin,angle,[0,.035,-1.8],[length+.4,.06,3.3],'#b48969');
  piece(origin,angle,[0,outfield?1.65:back?.45:.8,0],[length+.1,outfield?3.3:back?.9:1.6,.4],'#244b43');
  piece(origin,angle,[0,outfield?3.32:back?.93:1.63,0],[length+.1,.13,.5],'#d2b382');
  for(let row=0;row<rows;row++){
   const y=(outfield?3.4:back?1.0:1.8)+row*.64,z=1.1+row*.95;
   piece(origin,angle,[0,y-.32,z],[length-.1,.65,1.03],row%2?'#9a9f98':'#b1b6ac','concrete');
   for(let col=0;col<Math.floor((length-1.4)/.64);col++){
    const x=-length/2+.9+col*.64;if(Math.abs(x)<.58)continue;
    const pos=local(origin,angle,x,y+.14,z),seatColor=outfield?'#416c6b':i%3?'#355568':'#853e3c';seats.push({pos,scale:[1,1,1],rotation:angle,color:seatColor});
    if((col*13+row*7+i*11)%7<4)crowd.push({pos:local(origin,angle,x,y+.18,z-.06),scale:[1,1,1],rotation:angle,color:['#d2bc91','#365977','#97664b','#e4dfc8','#923f38','#68856e'][(row+col*3+i)%6]});
   }
   // Bright stair nosings divide the rows and read from moving cameras.
   piece(origin,angle,[0,y+.025,z-.40],[1,.05,.12],'#d9cda3');
  }
  stats.seats+=seats.length;stats.spectators+=crowd.length;instanceSection(seatGeometry,mats.paint,seats);instanceSection(personGeometry,mats.paint,crowd);
  const top=(outfield?3.4:back?1.0:1.8)+rows*.64,edge=1.1+rows*.95;
  piece(origin,angle,[0,top-.12,edge+1.1],[length+.2,.3,2.4],'#bdc2b7','concrete');
  piece(origin,angle,[0,top/2,edge+2.5],[length+.15,top,.7],'#546b6a');
  for(const x of [-length*.38,length*.38])piece(origin,angle,[x,top*.47,edge+2.89],[1.4,2.5,.06],'#203d3d');
  piece(origin,angle,[0,top+.55,edge+.1],[length,.07,.07],'#ffffff','metal');
  for(const x of [-length/2,0,length/2])piece(origin,angle,[x,top+.25,edge+.1],[.07,.65,.07],'#ffffff','metal');
  if(!outfield){
   // A second concourse / covered upper deck behind home and along both sides.
   piece(origin,angle,[0,top+1,edge+2],[length,.38,5.2],'#455e5f');
   piece(origin,angle,[0,top+3.4,edge+1.1],[length+.6,.2,7.7],'#314b50');
   piece(origin,angle,[0,top+3.56,edge+1.1],[length+.8,.14,7.9],'#adb6ae');
   for(const x of [-length*.42,length*.42])piece(origin,angle,[x,top+1.6,edge-1.3],[.18,3.2,.18],'#d0d1ba','metal');
   if(back){piece(origin,angle,[0,top+1.9,edge+2],[length-.8,1.5,.16],'#ffffff','glass');sign('PITCHIT  •  CLUB LEVEL',length*.76,.65,local(origin,angle,0,top+2.8,edge-2.85),angle+Math.PI);}
  }
  if(outfield&&i%3===0)sign(i===12?'100m':i%2?'PITCHIT BASEBALL':'PLAY THE MOMENT',Math.min(length-1,11),1.2,local(origin,angle,0,1.9,-.23),angle+Math.PI);
 }
 // Home/visitor dugouts: open fronts, sunken floors, benches, rack and coolers.
 for(const side of [-1,1]){
  const origin=[side*22,-9],angle=side*.86;
  piece(origin,angle,[0,.03,.65],[15.8,.18,4.2],'#5b716b');
  piece(origin,angle,[0,1.22,2.45],[15.8,2.5,.25],'#183e38');
  for(const x of [-7.8,7.8])piece(origin,angle,[x,1.22,.6],[.22,2.5,3.9],'#254c43');
  piece(origin,angle,[0,2.55,.6],[16.5,.26,4.5],'#344d50');
  piece(origin,angle,[0,2.72,.6],[16.7,.08,4.7],'#b7bdac');
  for(const x of [-6.3,0,6.3])piece(origin,angle,[x,1.2,-1.12],[.10,2.4,.10],'#b1bbaa','metal');
  piece(origin,angle,[0,.49,1.42],[13.6,.13,.58],'#bb956a');piece(origin,angle,[0,.85,1.76],[13.6,.54,.08],'#bb956a');
  for(const x of [-5.6,-2.8,0,2.8,5.6])piece(origin,angle,[x,.24,1.42],[.12,.45,.48],'#697b70','metal');
  piece(origin,angle,[0,.65,-1.25],[14.8,.09,.09],'#e1dbbd','metal');
  for(let x=-7;x<=7;x+=1.4)piece(origin,angle,[x,.34,-1.25],[.06,.65,.06],'#d0d8ca','metal');
  for(const x of [5.2,6.3]){piece(origin,angle,[x,.50,.3],[.65,.85,.65],side<0?'#437b93':'#ae5b3d');piece(origin,angle,[x,.96,.3],[.7,.12,.7],'#eee7d1');}
  for(let j=0;j<7;j++)piece(origin,angle,[-6.7+j*.16,.66,.4],[.045,1.2,.045],'#d7b785');
  const reserves=[];for(let j=0;j<7;j++)reserves.push({pos:local(origin,angle,-4.8+j*1.35,.52,1.3),scale:[1.2,1.25,1.2],rotation:angle,color:side<0?'#466383':'#983f3a'});instanceSection(personGeometry,mats.paint,reserves);
  sign(side<0?'HOME  /  PITCHIT':'VISITORS  /  PITCHIT',12,.46,local(origin,angle,0,2.37,-1.68),angle+Math.PI);
 }
 // Fine safety net behind home; the ball and selection zone remain in front.
 const netPositions=[];for(const [a,b] of [[[-17,3],[-9,11]],[[-9,11],[0,14]],[[0,14],[9,11]],[[9,11],[17,3]]]){
  for(const p of [a,b])rod([p[0],1.6,p[1]],[p[0],7,p[1]],.045);
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let y=1.8;y<=7;y+=.28)netPositions.push(a[0],y,a[1],b[0],y,b[1]);for(let j=0;j<=length/.28;j++){const t=j*.28/length,x=THREE.MathUtils.lerp(a[0],b[0],t),z=THREE.MathUtils.lerp(a[1],b[1],t);netPositions.push(x,1.6,z,x,7,z);}
 }
 const ng=new THREE.BufferGeometry();ng.setAttribute('position',new THREE.Float32BufferAttribute(netPositions,3));root.add(new THREE.LineSegments(ng,new THREE.LineBasicMaterial({color:'#92a5a0',transparent:true,opacity:.2,depthWrite:false})));
 // Bullpens, batter's eye, scoreboard and six light towers complete the bowl.
 for(const side of [-1,1]){block([side*66,.04,-52],[6,.08,13],'#b69875');for(const z of [-48,-55])block([side*66,.10,z],[.6,.1,.17],'#f0e7cb');rod([side*69,0,-45],[side*69,3,-45]);rod([side*69,0,-59],[side*69,3,-59]);}
 block([0,6.1,-108],[20,12,.7],'#142f2c');
 block([0,15,-114],[24,10,1],'#263a3b');sign('PITCHIT FIELD',21,2,[0,18,-113.4]);sign('WELCOME TO THE BALLPARK',21,2.3,[0,15.1,-113.4],0,'#142b2a','#e4d8a7');sign('ENJOY EVERY PITCH',21,1.4,[0,12.5,-113.4],0,'#142b2a','#8dbab3');
 for(const x of [-70.71,70.71]){rod([x,0,-70.71],[x,15,-70.71],.11);block([x,9,-70.71],[.4,7,.12],'#e2be4c');}
 for(const [x,z] of [[-47,7],[47,7],[-77,-40],[77,-40],[-63,-102],[63,-102]]){rod([x,0,z],[x,27,z],.22);block([x,27,z],[6,2,.6],'#38494d');for(let i=0;i<6;i++)for(let row=0;row<2;row++)block([x-2.5+i,26.55+row*.9,z+.34],[.67,.65,.08],'#fff','light');}
 for(const {geometry,material,items} of batches.values()){const mesh=instanceSection(geometry,material,items);mesh.castShadow=material!==mats.light;}
 return {root,stats,horizon:skyMaterial.uniforms.horizon.value,setTheme(theme){const colors={classic:['#507fa2','#c1d7d7'],night:['#101b36','#53677e'],retro:['#857057','#d9c8a5'],neon:['#292644','#807a9e']}[theme]||['#507fa2','#c1d7d7'];skyMaterial.uniforms.zenith.value.set(colors[0]);skyMaterial.uniforms.horizon.value.set(colors[1]);}};
}
