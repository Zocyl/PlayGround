(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const overlay = document.querySelector('#overlay');
  const title = document.querySelector('#overlayTitle');
  const message = document.querySelector('#overlayText');
  const startButton = document.querySelector('#startButton');
  const instructions = document.querySelector('#instructions');
  const bestNote = document.querySelector('#bestNote');
  const scoreNode = document.querySelector('#score');
  const progress = document.querySelector('#progress');
  const airText = document.querySelector('#airText');
  const airBar = document.querySelector('#airBar');
  const toast = document.querySelector('#toast');
  const pauseButton = document.querySelector('#pauseButton');
  const soundButton = document.querySelector('#soundButton');
  const TARGET = 12;
  const keys = new Set();
  const touch = new Set();
  let W = 800, H = 600, dpr = 1, state = 'intro', last = 0, elapsed = 0;
  let score = 0, air = 100, hearts = 3, hurtTimer = 0, toastTimer = 0, shake = 0;
  let player, pearls = [], hazards = [], bubbles = [], seaweed = [], fish = [];
  let soundOn = true, audio;
  let best = Number(localStorage.getItem('aero-reef-best') || 0);
  document.querySelector('#bestScore').textContent = best;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const lerp = (a, b, t) => a + (b - a) * t;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const oldW = W, oldH = H;
    W = Math.max(1, rect.width); H = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (player && oldW && oldH) {
      player.x *= W / oldW; player.y *= H / oldH;
      for (const o of [...pearls, ...hazards, ...bubbles, ...fish]) { o.x *= W / oldW; o.y *= H / oldH; }
    }
    if (!player) resetWorld();
  }
  function resetWorld() {
    player = { x: W * .5, y: H * .56, vx: 0, vy: 0, face: 1, r: clamp(Math.min(W,H) * .033, 15, 23), tail: 0 };
    hazards = Array.from({length: 7}, (_, i) => {
      let x, y, attempts = 0;
      do { x=rand(W*.12,W*.88); y=rand(H*.24,H*.75); attempts++; }
      while (attempts<80 && Math.hypot(x-player.x,y-player.y)<Math.min(W,H)*.24);
      return {x,y,baseY:y,phase:rand(0,7),r:rand(17,24),speed:rand(.35,.8),amp:rand(13,32),spin:rand(0,7),hue:i%2};
    });
    pearls = Array.from({length: TARGET}, (_, i) => {
      let x, y, attempts = 0;
      do { x=rand(W*.1,W*.9); y=rand(H*.2,H*.78); attempts++; }
      while (attempts<60 && (Math.hypot(x-player.x,y-player.y)<Math.min(W,H)*.12 || hazards.some(h=>Math.hypot(x-h.x,y-h.y)<h.r+28)));
      return {x,y,phase:rand(0,7),got:false,r:rand(8,11),tint:i%3};
    });
    bubbles = Array.from({length: 32}, () => ({x:rand(0,W),y:rand(0,H),r:rand(1.5,5),speed:rand(8,29),a:rand(.12,.45),phase:rand(0,6)}));
    seaweed = Array.from({length: Math.ceil(W/55)+2}, (_, i) => ({x:i*55+rand(-12,12),h:rand(H*.07,H*.19),phase:rand(0,6),width:rand(8,16),color:i%3}));
    fish = Array.from({length:8},(_,i)=>({x:rand(0,W),y:rand(H*.15,H*.72),speed:rand(12,33)*(i%2?1:-1),size:rand(9,17),phase:rand(0,6),color:i%4}));
  }
  function begin() {
    resetWorld(); score=0; air=100; hearts=3; hurtTimer=0; elapsed=0;
    updateHud(); state='playing'; overlay.classList.add('hidden'); last=performance.now();
    sound('start');
  }
  function updateHud() {
    scoreNode.textContent=score; progress.style.width=`${score/TARGET*100}%`;
    airText.textContent=`${Math.ceil(air)}%`; airBar.style.width=`${air}%`;
    airBar.parentElement.classList.toggle('low', air<28);
  }
  function showToast(text) {
    toast.textContent=text; toast.classList.add('show'); toastTimer=1.5;
  }
  function finish(win) {
    state=win?'won':'lost';
    if (score>best) { best=score; localStorage.setItem('aero-reef-best', best); }
    document.querySelector('#bestScore').textContent=best;
    title.innerHTML=win?'Reef <em>restored!</em>':'One more <em>dive?</em>';
    message.innerHTML=win?'The reef is glowing again.<br>You found every last pearl!':(air<=0?'You ran out of oxygen.<br>The reef will be here when you’re ready.':'A sea urchin caught you off guard.<br>Take a breath and try again.');
    instructions.style.display='none'; bestNote.style.display='block';
    startButton.innerHTML=win?'Dive again <span>↗</span>':'Try again <span>↗</span>';
    overlay.classList.remove('hidden'); sound(win?'win':'hurt');
  }
  function togglePause() {
    if (state==='playing') { state='paused'; title.innerHTML='Take a <em>breather</em>'; message.innerHTML='The reef will wait right here.<br>Ready when you are.'; instructions.style.display='none'; bestNote.style.display='none'; startButton.innerHTML='Keep swimming <span>↗</span>'; overlay.classList.remove('hidden'); }
    else if (state==='paused') { state='playing'; overlay.classList.add('hidden'); last=performance.now(); }
  }
  function sound(type) {
    if (!soundOn) return;
    try {
      audio ||= new (window.AudioContext||window.webkitAudioContext)();
      if (audio.state==='suspended') audio.resume();
      const osc=audio.createOscillator(), gain=audio.createGain();
      const now=audio.currentTime;
      const notes={start:[420,610],pearl:[650,980],hurt:[180,100],win:[520,920]};
      const pair=notes[type]||notes.pearl;
      osc.type=type==='hurt'?'triangle':'sine'; osc.frequency.setValueAtTime(pair[0],now); osc.frequency.exponentialRampToValueAtTime(pair[1],now+.16);
      gain.gain.setValueAtTime(.0001,now); gain.gain.exponentialRampToValueAtTime(type==='pearl'?.07:.05,now+.025); gain.gain.exponentialRampToValueAtTime(.0001,now+.28);
      osc.connect(gain); gain.connect(audio.destination); osc.start(now); osc.stop(now+.3);
    } catch (_) {}
  }
  function inputVector() {
    let x=0,y=0;
    if (keys.has('ArrowLeft')||keys.has('a')||keys.has('A')||touch.has('left')) x--;
    if (keys.has('ArrowRight')||keys.has('d')||keys.has('D')||touch.has('right')) x++;
    if (keys.has('ArrowUp')||keys.has('w')||keys.has('W')||touch.has('up')) y--;
    if (keys.has('ArrowDown')||keys.has('s')||keys.has('S')||touch.has('down')) y++;
    const n=Math.hypot(x,y)||1; return {x:x/n,y:y/n};
  }
  function update(dt) {
    elapsed += dt;
    air = Math.max(0,air-dt*.42);
    if (air<=0) { updateHud(); finish(false); return; }
    if (hurtTimer>0) hurtTimer-=dt;
    if (toastTimer>0 && (toastTimer-=dt)<=0) toast.classList.remove('show');
    if (shake>0) shake=Math.max(0,shake-dt*20);
    const input=inputVector(), speed=Math.min(W,H)*.39;
    const accel=1-Math.exp(-dt*5.2);
    player.vx=lerp(player.vx,input.x*speed,accel); player.vy=lerp(player.vy,input.y*speed,accel);
    player.x=clamp(player.x+player.vx*dt,player.r+8,W-player.r-8);
    player.y=clamp(player.y+player.vy*dt,player.r+70,H-player.r-15);
    if (Math.abs(player.vx)>4) player.face=player.vx>0?1:-1;
    player.tail+=dt*8;
    for (const b of bubbles) { b.y-=b.speed*dt; b.x+=Math.sin(elapsed*.8+b.phase)*dt*5; if(b.y<-8){b.y=H+8;b.x=rand(0,W);} }
    for (const f of fish) { f.x+=f.speed*dt; f.y+=Math.sin(elapsed*1.4+f.phase)*dt*5; if(f.x<-35)f.x=W+35;if(f.x>W+35)f.x=-35; }
    for (const h of hazards) h.y=h.baseY+Math.sin(elapsed*h.speed+h.phase)*h.amp;
    for (const p of pearls) if (!p.got) { p.phase+=dt*2; if(Math.hypot(player.x-p.x,player.y-p.y)<player.r+p.r+4){p.got=true;score++;air=Math.min(100,air+1.6);sound('pearl');showToast(['Lovely find!','A little more light.','The reef says thanks!'][score%3]);if(score>=TARGET){updateHud();finish(true);return;} } }
    if(hurtTimer<=0){for(const h of hazards){if(Math.hypot(player.x-h.x,player.y-h.y)<player.r+h.r*.72){hearts--;hurtTimer=1.5;shake=8;player.vx*=-.6;player.vy-=70;sound('hurt');showToast(hearts?`${hearts} ${hearts===1?'heart':'hearts'} left — watch those urchins!`:'Careful, little swimmer!');if(!hearts){finish(false);return;}break;}}}
    updateHud();
  }
  function roundedRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function drawBackground(t) {
    const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#73dbea');sky.addColorStop(.38,'#4fc3d5');sky.addColorStop(.72,'#238cae');sky.addColorStop(1,'#146382');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    const glow=ctx.createRadialGradient(W*.5,-H*.1,5,W*.5,H*.14,H*.82);glow.addColorStop(0,'#eaffd080');glow.addColorStop(.25,'#b4fff54c');glow.addColorStop(1,'#74e8ff00');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H*.85);
    ctx.save();ctx.globalAlpha=.12;ctx.translate(W*.5,0);for(let i=-6;i<=6;i++){ctx.beginPath();ctx.moveTo(i*58,-20);ctx.lineTo(i*115+Math.sin(t*.15+i)*35,H*.72);ctx.lineTo(i*115+45,H*.72);ctx.closePath();ctx.fillStyle=i%2?'#e7ffe3':'#dfffff';ctx.fill();}ctx.restore();
    // distant reef ridges
    ctx.fillStyle='#267f99';ctx.globalAlpha=.30;ctx.beginPath();ctx.moveTo(0,H*.79);for(let x=0;x<=W+20;x+=20)ctx.lineTo(x,H*.76+Math.sin(x*.012+t*.15)*12);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.fill();ctx.globalAlpha=1;
    // sandy bottom
    const floor=ctx.createLinearGradient(0,H*.88,0,H);floor.addColorStop(0,'#68c8bf');floor.addColorStop(.27,'#70c8aa');floor.addColorStop(1,'#b0dca1');ctx.fillStyle=floor;ctx.beginPath();ctx.moveTo(0,H*.91);for(let x=0;x<=W+10;x+=12)ctx.lineTo(x,H*.9+Math.sin(x*.015)*3);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.fill();
    for(let i=0;i<seaweed.length;i++){const s=seaweed[i], sway=Math.sin(t*1.2+s.phase)*12;ctx.strokeStyle=['#258e83','#39a99a','#56b8a0'][s.color];ctx.lineWidth=s.width;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(s.x,H+5);ctx.quadraticCurveTo(s.x+sway,H-s.h*.45,s.x+sway*.5,H-s.h);ctx.stroke();ctx.strokeStyle='#a5e3b584';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(s.x-2,H);ctx.quadraticCurveTo(s.x+sway-3,H-s.h*.5,s.x+sway*.5-2,H-s.h+4);ctx.stroke();}
    // little coral clusters
    for(let i=0;i<Math.ceil(W/190)+1;i++){const x=i*190+35+(i%2)*38;ctx.fillStyle=i%2?'#ee8f91':'#f1a783';ctx.globalAlpha=.82;for(let j=0;j<3;j++){ctx.beginPath();ctx.arc(x+j*10,H*.91-j%2*4,7-j,Math.PI,0);ctx.fill();}ctx.globalAlpha=1;}
  }
  function drawBubbles(t){for(const b of bubbles){ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fillStyle=`rgba(222,255,255,${b.a*.35})`;ctx.fill();ctx.strokeStyle=`rgba(235,255,255,${b.a})`;ctx.lineWidth=1;ctx.stroke();ctx.beginPath();ctx.arc(b.x-b.r*.3,b.y-b.r*.3,Math.max(1,b.r*.2),0,Math.PI*2);ctx.fillStyle=`rgba(255,255,255,${b.a*.85})`;ctx.fill();}}
  function drawFish(f,t){ctx.save();ctx.translate(f.x,f.y);if(f.speed<0)ctx.scale(-1,1);const c=['#b5f484','#ffc96e','#f7a9a0','#99eddf'][f.color];ctx.globalAlpha=.45;ctx.fillStyle=c;ctx.beginPath();ctx.ellipse(0,0,f.size*1.15,f.size*.65,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(-f.size,0);ctx.lineTo(-f.size*1.65,-f.size*.55*Math.sin(t*9+f.phase));ctx.lineTo(-f.size*1.65,f.size*.55*Math.sin(t*9+f.phase));ctx.closePath();ctx.fill();ctx.fillStyle='#176c81';ctx.beginPath();ctx.arc(f.size*.5,-2,1.4,0,7);ctx.fill();ctx.restore();}
  function drawPearl(p,t){const bob=Math.sin(t*2.2+p.phase)*4, x=p.x,y=p.y+bob;ctx.save();ctx.shadowColor='#9bfff2';ctx.shadowBlur=20;const g=ctx.createRadialGradient(x-p.r*.35,y-p.r*.4,1,x,y,p.r*1.45);g.addColorStop(0,'#fff');g.addColorStop(.3,p.tint===1?'#d8fffb':'#eaffff');g.addColorStop(.7,p.tint===2?'#91f1dc':'#83dcec');g.addColorStop(1,'#39adcb');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,p.r+Math.sin(t*3+p.phase)*1.3,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(x-p.r*.28,y-p.r*.34,p.r*.22,p.r*.12,-.5,0,7);ctx.fill();ctx.strokeStyle='#d9fffd';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(x,y,p.r+5+Math.sin(t*2+p.phase)*2,Math.PI*1.1,Math.PI*1.8);ctx.stroke();ctx.restore();}
  function drawHazard(h,t){ctx.save();ctx.translate(h.x,h.y);ctx.rotate(t*.22+h.spin);ctx.shadowColor='#133b6b66';ctx.shadowBlur=10;ctx.shadowOffsetY=4;const spikes=11;for(let i=0;i<spikes;i++){ctx.rotate(Math.PI*2/spikes);ctx.beginPath();ctx.moveTo(h.r*.76,-h.r*.22);ctx.lineTo(h.r*1.32,0);ctx.lineTo(h.r*.76,h.r*.22);ctx.closePath();ctx.fillStyle=h.hue?'#f48d95':'#f8ab79';ctx.fill();}ctx.shadowBlur=0;ctx.shadowOffsetY=0;const g=ctx.createRadialGradient(-h.r*.35,-h.r*.4,2,0,0,h.r);g.addColorStop(0,'#ffe9c4');g.addColorStop(.45,h.hue?'#f5a1a1':'#ffc17f');g.addColorStop(1,h.hue?'#d66483':'#df7d62');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,h.r*.76,0,7);ctx.fill();ctx.fillStyle='#684765';ctx.beginPath();ctx.arc(-h.r*.22,-2,2,0,7);ctx.arc(h.r*.2,-2,2,0,7);ctx.fill();ctx.strokeStyle='#8c5668';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(0,h.r*.1,4,0,Math.PI);ctx.stroke();ctx.restore();}
  function drawPlayer(t){const p=player;ctx.save();ctx.translate(p.x,p.y+Math.sin(t*3)*2);if(p.face<0)ctx.scale(-1,1);if(hurtTimer>0&&Math.floor(hurtTimer*12)%2===0)ctx.globalAlpha=.45;ctx.shadowColor='#126b9455';ctx.shadowBlur=17;ctx.shadowOffsetY=8;
    // tail
    const flap=Math.sin(p.tail)*7;ctx.fillStyle='#39b9d0';ctx.beginPath();ctx.moveTo(-p.r*.73,0);ctx.quadraticCurveTo(-p.r*1.3,flap-5,-p.r*1.52,flap-13);ctx.quadraticCurveTo(-p.r*1.48,flap,-p.r*1.52,flap+13);ctx.quadraticCurveTo(-p.r*1.1,flap+5,-p.r*.73,0);ctx.fill();
    const body=ctx.createLinearGradient(-p.r,-p.r,p.r,p.r);body.addColorStop(0,'#c7fff0');body.addColorStop(.35,'#6ce0d4');body.addColorStop(.7,'#35bdd0');body.addColorStop(1,'#2699c7');ctx.fillStyle=body;ctx.beginPath();ctx.ellipse(0,0,p.r*1.18,p.r*.79,-.08,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    ctx.fillStyle='#d9fff0a8';ctx.beginPath();ctx.ellipse(-p.r*.12,p.r*.3,p.r*.68,p.r*.25,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f9ffff';ctx.beginPath();ctx.ellipse(p.r*.57,-p.r*.17,p.r*.14,p.r*.2,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#064a65';ctx.beginPath();ctx.arc(p.r*.62,-p.r*.15,p.r*.075,0,7);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(p.r*.64,-p.r*.21,p.r*.027,p.r*.04,0,0,7);ctx.fill();
    // fin
    ctx.fillStyle='#59d7cb';ctx.beginPath();ctx.moveTo(-p.r*.16,p.r*.55);ctx.quadraticCurveTo(p.r*.15,p.r*1.05,p.r*.52,p.r*.62);ctx.quadraticCurveTo(p.r*.12,p.r*.52,-p.r*.16,p.r*.55);ctx.fill();
    ctx.restore();
    if(state==='playing'){for(let i=0;i<2;i++){const bx=p.x-p.face*p.r*(1.15+i*.55),by=p.y+Math.sin(t*4+i)*4+8;ctx.beginPath();ctx.arc(bx,by,2+i*.9,0,7);ctx.strokeStyle='#e6ffffa9';ctx.lineWidth=1;ctx.stroke();}}
  }
  function drawHearts(){if(state!=='playing'&&state!=='paused')return;ctx.save();ctx.textAlign='right';ctx.font=`900 ${Math.max(14,Math.min(18,W*.018))}px Nunito`;ctx.fillStyle='#fff';ctx.shadowColor='#00556b66';ctx.shadowBlur=5;ctx.fillText('♥ '.repeat(hearts)+'♡ '.repeat(3-hearts),W-30,H-23);ctx.restore();}
  function render(t){ctx.save();if(shake>0)ctx.translate(rand(-shake,shake),rand(-shake,shake));drawBackground(t);drawBubbles(t);fish.forEach(f=>drawFish(f,t));pearls.forEach(p=>{if(!p.got)drawPearl(p,t);});hazards.forEach(h=>drawHazard(h,t));if(player)drawPlayer(t);drawHearts();ctx.restore();}
  function frame(now){const dt=Math.min(.04,(now-last)/1000||0);last=now;if(state==='playing')update(dt);render(now/1000);requestAnimationFrame(frame);}

  startButton.addEventListener('click',()=>{if(state==='paused'){togglePause();return;}instructions.style.display='flex';bestNote.style.display='block';title.innerHTML='Aero <em>Reef</em>';message.innerHTML='Slip into a sunlit blue world.<br>Find the pearls. Follow the bubbles.';begin();});
  pauseButton.addEventListener('click',togglePause);
  soundButton.addEventListener('click',()=>{soundOn=!soundOn;soundButton.innerHTML=`${soundOn?'♫':'♩'} <span>Sound ${soundOn?'on':'off'}</span>`;if(soundOn)sound('start');});
  window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();keys.add(e.key);if(!e.repeat&&(e.key==='Escape'||e.key==='p'||e.key==='P'))togglePause();if(!e.repeat&&e.key==='Enter'&&(state==='intro'||state==='won'||state==='lost'))startButton.click();});
  window.addEventListener('keyup',e=>keys.delete(e.key));
  window.addEventListener('blur',()=>{keys.clear();touch.clear();if(state==='playing')togglePause();});
  document.querySelectorAll('.dpad').forEach(button=>{
    const dir=button.dataset.dir;
    const down=e=>{e.preventDefault();touch.add(dir);button.classList.add('pressed');try{button.setPointerCapture(e.pointerId);}catch(_){}};
    const up=e=>{e.preventDefault();touch.delete(dir);button.classList.remove('pressed');};
    button.addEventListener('pointerdown',down);button.addEventListener('pointerup',up);button.addEventListener('pointercancel',up);button.addEventListener('lostpointercapture',up);
  });
  window.addEventListener('resize',resize);
  resize();requestAnimationFrame(frame);
})();
