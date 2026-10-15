const $ = id => document.getElementById(id);
const canvas=$('scene'), ctx=canvas.getContext('2d'), game=$('game');
const cat=new Image(); cat.src='assets/cat-states.png';
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let best=0;try{best=Number(localStorage.getItem('brush-the-cat-best'))||0;}catch{}
$('best').textContent=best;
let score=0,heat=0,state='calm',lastBrush=-10,warningAt=0,now=0,lastTime=0;
let width=500,height=650,ready=false,deadAt=0,deathShown=false,restartReady=false;
let pointer={x:260,y:350,down:false,inside:false},previous=null,distance=0,keyboard=false,keyPhase=0;
let particles=[],hairDistance=0,brushAngle=.35,targetAngle=.35,strokePulse=0,lastNoise=-10,warningLimit=94+Math.random()*12;
let catFrames=[],biteHead=null,biteBody=null,biteBreath=0;
// Essential head growth remains visible with reduced motion, at a gentler speed.
const BITE_LUNGE_SECONDS=reduced?.78:.52,DEATH_FADE_START=BITE_LUNGE_SECONDS+.18;
let soundOn=true,audio,purrGain,master,noiseBuffer;

function audioStart(){
  if(!audio){
    try{
      audio=new (window.AudioContext||window.webkitAudioContext)();
      master=audio.createGain();master.gain.value=soundOn?.5:0;master.connect(audio.destination);
      noiseBuffer=audio.createBuffer(1,audio.sampleRate,audio.sampleRate);
      const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
      const purr=audio.createOscillator();purr.type='triangle';purr.frequency.value=29;
      purrGain=audio.createGain();purrGain.gain.value=0;purr.connect(purrGain);purrGain.connect(master);purr.start();
    }catch{return;}
  }
  if(audio.state==='suspended')audio.resume().catch(()=>{});
}
function noise(duration,volume,frequency){
  if(!audio||!soundOn)return;
  const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();
  source.buffer=noiseBuffer;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.65;
  gain.gain.setValueAtTime(volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
  source.connect(filter);filter.connect(gain);gain.connect(master);source.start();source.stop(audio.currentTime+duration);
}
function tone(from,to,duration,volume,type='sine'){
  if(!audio||!soundOn)return;
  const osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.frequency.setValueAtTime(from,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(to,audio.currentTime+duration);
  gain.gain.setValueAtTime(volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
  osc.connect(gain);gain.connect(master);osc.start();osc.stop(audio.currentTime+duration);
}
$('sound').addEventListener('click',()=>{soundOn=!soundOn;audioStart();if(master)master.gain.setTargetAtTime(soundOn?.5:0,audio.currentTime,.03);$('sound').setAttribute('aria-pressed',String(!soundOn));$('sound').setAttribute('aria-label',soundOn?'Mute sound':'Enable sound');$('sound-label').textContent=soundOn?'SOUND ON':'SOUND OFF';});

function resize(){const r=game.getBoundingClientRect();width=r.width;height=r.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
new ResizeObserver(resize).observe(game);
cat.onload=()=>{prepareCatFrames();prepareBiteHead();ready=true;$('loading').hidden=true;$('loading').style.display='none';resize();};
cat.onerror=()=>{$('loading').textContent='The cat could not load. Please refresh.';};

function catBounds(){const h=height*.98,w=h*(600/1024);return{x:(width-w)/2+width*.055,y:height*.015,w,h};}
function onCat(x,y){const b=catBounds(),nx=(x-b.x)/b.w,ny=(y-b.y)/b.h;return ny>.12&&ny<.91&&nx>.05&&nx<.96&&(ny>.3||(nx>.14&&nx<.8));}
function mood(next){
  if(next===state)return;state=next;game.dataset.state=state;
  if(next==='warning'){warningAt=now;$('status').textContent='The cat is staring at you. Stop brushing.';tone(67,40,.55,.14,'triangle');}
  if(next==='calm'){$('status').textContent='The cat is calm again.';}
}
function stroke(){
  if(!ready||state==='biting'||state==='dead')return;
  score++;$('score').textContent=score;
  heat+=15+Math.min(score/40,3);lastBrush=now;strokePulse=1;
  if(score>best){best=score;$('best').textContent=best;try{localStorage.setItem('brush-the-cat-best',String(best));}catch{}}
  if(heat>=44&&state==='calm')mood('warning');
  if(heat>=warningLimit&&state==='warning'&&now-warningAt>.65)bite();
}
function brushing(amount,x,y){
  if(!onCat(x,y)||state==='biting'||state==='dead')return;
  lastBrush=now;distance+=amount;
  if(now-lastNoise>.11){noise(.16,.045,1650);lastNoise=now;}
  shedHair(amount,x,y);
  const step=height*.135;
  if(distance>=step){distance%=step;stroke();}
}
function shedHair(amount,x,y){
  // Emit by distance, not pointer-event rate. Hairs originate along the bristles.
  const spacing=height*.019;
  hairDistance+=amount;
  while(hairDistance>=spacing){
    hairDistance-=spacing;
    const f=amount>0?Math.min(1,hairDistance/amount):0;
    const ox=previous?previous.x+(x-previous.x)*(1-f):x;
    const oy=previous?previous.y+(y-previous.y)*(1-f):y;
    for(let i=0;i<2;i++){
      const along=(Math.random()-.65)*height*.12;
      const px=ox+Math.cos(brushAngle)*along,py=oy+Math.sin(brushAngle)*along+height*.008;
      if(!onCat(px,py))continue;
      const life=2.8+Math.random()*1.8;
      particles.push({x:px,y:py,vx:(Math.random()-.5)*height*.038,vy:height*(.006+Math.random()*.012),life,maxLife:life,age:0,angle:brushAngle+(Math.random()-.5)*2.2,spin:(Math.random()-.5)*.8,len:height*(.022+Math.random()*.043),curl:(Math.random()-.5)*height*.018,phase:Math.random()*Math.PI*2});
    }
  }
}
function move(e){
  const r=game.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  pointer.x=x;pointer.y=y;pointer.inside=x>=0&&x<=width&&y>=0&&y<=height;
  if(pointer.down&&previous){const dx=x-previous.x,dy=y-previous.y,travel=Math.hypot(dx,dy);if(travel>1){targetAngle=Math.max(-.35,Math.min(.9,dx*.015+.25));brushing(Math.min(travel,height*.19),x,y);}}
  previous={x,y};
}
game.addEventListener('pointerdown',e=>{if(!ready||state==='biting'||state==='dead'||e.button>0)return;e.preventDefault();game.focus({preventScroll:true});audioStart();pointer.down=true;previous=null;move(e);game.setPointerCapture(e.pointerId);});
game.addEventListener('pointermove',move);
function release(){pointer.down=false;previous=null;distance=0;hairDistance=0;keyboard=false;}
game.addEventListener('pointerup',release);game.addEventListener('pointercancel',release);game.addEventListener('lostpointercapture',release);
game.addEventListener('pointerleave',()=>{if(!pointer.down){pointer.inside=false;previous=null;}});
window.addEventListener('blur',release);
document.addEventListener('visibilitychange',()=>{if(document.hidden){release();if(purrGain)purrGain.gain.value=0;}});
document.addEventListener('keydown',e=>{
  if(e.code==='Space'&&e.target.tagName!=='BUTTON'&&e.target.tagName!=='A'){
    e.preventDefault();if(state==='dead'){if(restartReady&&!e.repeat)reset();return;}if(state==='biting')return;
    if(!keyboard){audioStart();keyboard=true;keyPhase=0;pointer.inside=true;game.focus({preventScroll:true});}
  }
  if((e.code==='Enter'||e.code==='KeyR')&&state==='dead'&&restartReady){e.preventDefault();reset();}
});
document.addEventListener('keyup',e=>{if(e.code==='Space'){keyboard=false;distance=0;}});

function bite(){
  biteBreath=reduced?0:Math.sin(now*1.7)*.0015;
  mood('biting');deadAt=now;pointer.down=false;keyboard=false;distance=0;
  $('status').textContent='The cat bit you. You died.';
  noise(.4,.36,700);tone(170,33,.65,.3,'sawtooth');
  setTimeout(()=>{if(state==='biting'||state==='dead'){tone(130.81,65.4,2.5,.16);tone(155.56,77.78,2.5,.09);}},DEATH_FADE_START*1000);
}
function reset(){
  score=0;heat=0;state='calm';game.dataset.state=state;lastBrush=now-10;warningAt=0;distance=0;hairDistance=0;particles=[];deadAt=0;deathShown=false;restartReady=false;warningLimit=94+Math.random()*12;pointer.down=false;keyboard=false;pointer.inside=false;previous=null;
  $('score').textContent='0';$('death').classList.remove('visible');$('death').setAttribute('aria-hidden','true');$('restart').disabled=true;$('status').textContent='The cat is calm. A fresh start.';game.focus({preventScroll:true});
}
$('restart').addEventListener('click',reset);

function drawBrush(x,y,angle,alpha=1){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);const scale=Math.min(height/760,.95);ctx.scale(scale,scale);ctx.globalAlpha=alpha;
  ctx.shadowColor='#00000029';ctx.shadowBlur=4;ctx.shadowOffsetY=3;
  ctx.fillStyle='#171719';ctx.beginPath();ctx.ellipse(-12,-12,53,20,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(30,-23);ctx.bezierCurveTo(55,-18,62,-16,94,-13);ctx.quadraticCurveTo(109,-11,109,-4);ctx.quadraticCurveTo(106,7,92,3);ctx.lineTo(30,-4);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  ctx.strokeStyle='#39383a';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(-12,-14,48,15,0,Math.PI,Math.PI*2);ctx.stroke();
  for(let i=0;i<25;i++){const bx=-60+i*4;const by=-10-Math.sin(i/24*Math.PI)*5;ctx.strokeStyle=i%2?'#101012':'#2c2c2e';ctx.lineWidth=2.3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(bx,by);ctx.quadraticCurveTo(bx-3,by+18,bx-7,by+34);ctx.stroke();ctx.fillStyle='#29292a';ctx.beginPath();ctx.arc(bx-7,by+34,1.7,0,7);ctx.fill();}
  ctx.restore();
}
function prepareCatFrames(){
  // The photographic sheet has unequal gutters; keep each complete silhouette
  // within its frame and align the two forward-facing heads.
  const crops=[{x:0,w:560,dx:15},{x:560,w:530,dx:55},{x:1090,w:446,dx:65}];
  const ratio=cat.naturalWidth/1536;
  catFrames=crops.map(({x,w,dx})=>{
    const c=document.createElement('canvas');c.width=600;c.height=1024;
    const h=c.getContext('2d');h.fillStyle='#fff';h.fillRect(0,0,600,1024);
    h.drawImage(cat,x*ratio,0,w*ratio,cat.naturalHeight,dx,0,w,1024);
    return c;
  });
}
function prepareBiteHead(){
  const sw=600,sh=1024;
  function layer(frame){const c=document.createElement('canvas');c.width=sw;c.height=sh;c.getContext('2d').drawImage(catFrames[frame],0,0);return c;}
  biteHead=layer(2);
  // Retain the warning pose's torso, paws and tail at their original scale.
  biteBody=layer(1);
  const mask=document.createElement('canvas');mask.width=sw;mask.height=sh;
  const m=mask.getContext('2d'),pixels=m.createImageData(sw,sh);
  for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){
    const across=(x/sw-.43)/.31;
    // Follow the jaw, rising at the cheeks so no shoulder enters the head layer.
    const jaw=.335+.115*Math.sqrt(Math.max(0,1-across*across));
    const t=Math.max(0,Math.min(1,(jaw+.018-y/sh)/.036));
    const i=(y*sw+x)*4;
    pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;
    pixels.data[i+3]=Math.round(255*t*t*(3-2*t));
  }
  m.putImageData(pixels,0,0);
  const head=biteHead.getContext('2d');head.globalCompositeOperation='destination-in';head.drawImage(mask,0,0);head.globalCompositeOperation='source-over';
  // Erase the previous face, keeping the stationary neck under the soft jaw.
  const body=biteBody.getContext('2d');
  body.globalCompositeOperation='destination-out';body.drawImage(mask,0,-sh*.04);body.globalCompositeOperation='source-over';
}
function bitePose(elapsed,b){
  const t=Math.max(0,Math.min(elapsed/BITE_LUNGE_SECONDS,1));
  // Grow around the original head's bounding-box center, not the mouth or
  // viewport center. Every feature moves in proportion to its original offset.
  const head={left:.14,top:.125,right:.72,bottom:.435};
  const originX=b.x+b.w*(head.left+head.right)/2;
  const originY=b.y+b.h*(head.top+head.bottom)/2;
  return {originX,originY,x:originX,y:originY,scale:1+3.2*Math.pow(t,1.1)};
}
function drawCat(){
  const b=catBounds(),attacking=state==='biting'||state==='dead';
  const frame=state==='warning'||attacking?1:0;
  ctx.save();
  const breathe=attacking?biteBreath:reduced?0:Math.sin(now*1.7)*.0015;
  ctx.translate(b.x+b.w*.5,b.y+b.h);ctx.scale(1+breathe,1+breathe);ctx.translate(-b.x-b.w*.5,-b.y-b.h);
  if(attacking&&biteHead&&biteBody){
    ctx.drawImage(biteBody,b.x,b.y,b.w,b.h);
    const p=bitePose(now-deadAt,b);
    ctx.save();ctx.translate(p.originX,p.originY);ctx.scale(p.scale,p.scale);ctx.translate(-p.originX,-p.originY);
    // One fully opaque head: the reference switches the mouth open, then grows it.
    ctx.drawImage(biteHead,b.x,b.y,b.w,b.h);
    ctx.restore();
  }else ctx.drawImage(catFrames[frame],b.x,b.y,b.w,b.h);
  ctx.restore();
}
function drawHair(dt){
  for(const p of particles){
    p.life-=dt;p.age+=dt;
    // Leave strands on the brushed patch briefly, then let them float down.
    if(p.age>.2){p.x+=(p.vx+Math.sin(p.age*2+p.phase)*height*.005)*dt;p.y+=p.vy*dt;p.vy+=height*.004*dt;p.angle+=p.spin*dt;}
    const opacity=Math.min(1,p.age/.08)*Math.min(1,Math.max(0,p.life)/.85)*.9;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-p.len/2,0);ctx.bezierCurveTo(-p.len*.2,p.curl,p.len*.25,p.curl*.65,p.len/2,0);
    // A faint dark edge keeps pale hairs visible after they leave the coat.
    ctx.strokeStyle=`rgba(82,74,63,${opacity*.19})`;ctx.lineWidth=Math.max(1,height*.0023);ctx.stroke();
    ctx.strokeStyle=`rgba(239,228,205,${opacity})`;ctx.lineWidth=Math.max(.65,height*.00125);ctx.stroke();ctx.restore();
  }
  particles=particles.filter(p=>p.life>0).slice(-200);
}
function tick(timestamp){
  const dt=Math.min((timestamp-lastTime)/1000||0,.05);lastTime=timestamp;now+=dt;
  ctx.clearRect(0,0,width,height);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
  if(ready){
    if(keyboard&&state!=='biting'&&state!=='dead'){
      keyPhase+=dt*7;const b=catBounds();const x=b.x+b.w*(.39+Math.sin(keyPhase)*.23),y=b.y+b.h*(.56+Math.sin(keyPhase)*.1);
      const travel=Math.hypot(x-pointer.x,y-pointer.y);pointer.x=x;pointer.y=y;targetAngle=.35+Math.cos(keyPhase)*.2;brushing(Math.min(travel,height*dt),x,y);
    }
    if(state==='calm'||state==='warning'){
      if(now-lastBrush>.65)heat=Math.max(0,heat-dt*19);
      if(state==='warning'&&heat<25&&now-warningAt>1)mood('calm');
      if(state==='warning'&&heat>=warningLimit&&now-warningAt>.65)bite();
    }
    drawCat();
    drawHair(dt);
    brushAngle+=(targetAngle-brushAngle)*Math.min(dt*15,1);strokePulse=Math.max(0,strokePulse-dt*5);
    if(state!=='dead'){
      if(pointer.inside)drawBrush(pointer.x,pointer.y,brushAngle);
      else if(score===0){const b=catBounds();drawBrush(b.x+b.w*.5,b.y+b.h*.59,.36);}
    }
    if(state==='biting'&&now-deadAt>DEATH_FADE_START&&!deathShown){deathShown=true;mood('dead');$('final-score').textContent=score;$('death').classList.add('visible');$('death').setAttribute('aria-hidden','false');}
    if(state==='dead'&&now-deadAt>2.85&&!restartReady){restartReady=true;$('restart').disabled=false;$('restart').focus({preventScroll:true});}
  }
  if(purrGain)purrGain.gain.setTargetAtTime(state==='calm'&&now-lastBrush<.24&&!document.hidden?.075:0,audio.currentTime,.12);
  requestAnimationFrame(tick);
}
game.dataset.state='calm';requestAnimationFrame(tick);
