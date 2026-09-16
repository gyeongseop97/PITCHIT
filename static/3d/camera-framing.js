// Keep each pitch in one stable baseball view. The pitching lens is set back
// behind the mound: a longer lens compresses the pitcher/plate distance without
// moving either player or changing the real 18.44 m pitch path.
export function cameraFrame(view,aspect,pitchSign=1,batSign=1,height=580) {
 const portrait=aspect<.9;
 // About 174 screen pixels tall even on a short phone: each selectable row
 // stays usable. Optical zoom keeps the actual strike zone/pitch path intact.
 const pitchFov=Math.max(1.4,Math.min(2.05,2*Math.atan(.73*height/(144*174))*180/Math.PI));
 const frames={
  zone:{pos:[0,1.23,Math.max(1.85,.52/(Math.tan(Math.PI/8)*Math.max(.45,aspect)))],look:[0,.9,0],fov:45},
  batter:{pos:[.1*batSign,1.55,3.7],look:[-.25*batSign,.77,-.45],fov:portrait?42:35},
  pitcher:{pos:[-1.4*pitchSign,5.5,-72],look:[-.18*batSign,.88,0],fov:pitchFov},
  broadcast:{pos:portrait?[6,15,29]:[0,8,13],look:[0,.9,-13],fov:45},
  side:{pos:[-39,22,-8],look:[0,.7,-15],fov:45},
  catcher:{pos:[2.7*batSign,2.1,3.5],look:[0,1,.7],fov:45},
 };
 return frames[view]||frames.batter;
}
