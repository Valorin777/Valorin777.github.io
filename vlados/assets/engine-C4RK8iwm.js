import{g as v,I as b,ae as g,ai as A}from"./index-GK-U60x-.js";const L="attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}",R=`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec4 uFrame;uniform vec2 uDesign;uniform float uCorner,uTime,uPx,uK,uBevel,uHeat,uAgit,uFlash,uCalm,uMode;uniform int uN;
uniform vec4 uA[NB];uniform vec4 uP[NB];uniform vec4 uR[4];
float h21(vec2 p){p=fract(p*vec2(233.34,851.73));p+=dot(p,p+23.45);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
vec3 film(float x){return .55+.45*cos(6.2832*(x+vec3(0.,.33,.67)));}
vec3 envD(vec3 R,float t){
  float up=-R.y;
  vec3 c=mix(vec3(.045,.05,.062),vec3(.40,.43,.49),smoothstep(-.05,.9,up));
  c=mix(c,vec3(.022,.021,.024),smoothstep(-.03,-.55,up));
  float fb=smoothstep(.35,.93,R.z);
  c=mix(c,vec3(.69,.72,.78)+vec3(.13)*clamp(up+.35,0.,1.),fb);
  float az=atan(R.x,R.z);
  float s1=pow(max(0.,cos(az*3.-t*.33)),42.);
  float s2=pow(max(0.,cos(az*5.+t*.21+1.7)),90.);
  c+=vec3(1.02,1.05,1.1)*(s1*.85+s2*.45)*smoothstep(-.55,.2,up);
  float hz=smoothstep(.22,0.,abs(up+.02))*(1.-fb);
  c=mix(c,vec3(.015,.017,.022),.55*hz);
  c+=vec3(.75,.83,.96)*exp(-abs(up+.05)*26.)*(1.-fb)*.6;
  return c;
}
vec3 envL(vec3 R,float t){
  float up=-R.y;
  vec3 c=mix(vec3(.60,.635,.69),vec3(.975,.982,.995),smoothstep(-.08,.75,up));
  c=mix(c,vec3(.26,.285,.33),smoothstep(-.02,-.5,up));
  float fb=smoothstep(.42,.95,R.z);
  c=mix(c,vec3(.90,.915,.945)+vec3(.07)*clamp(up+.3,0.,1.),fb);
  float az=atan(R.x,R.z);
  float s1=pow(max(0.,cos(az*3.-t*.33)),34.);
  float s2=pow(max(0.,cos(az*5.+t*.21+1.7)),80.);
  c+=vec3(1.)*(s1*.75+s2*.4)*smoothstep(-.4,.3,up);
  float hz=smoothstep(.27,0.,abs(up+.02))*(1.-fb);
  c=mix(c,vec3(.085,.095,.12),.78*hz);
  c+=vec3(.55,.64,.8)*exp(-abs(up+.07)*30.)*(1.-fb)*.28;
  return c;
}
vec3 env(vec3 R,float t){
  if(uMode<.002)return envD(R,t);
  if(uMode>.998)return envL(R,t);
  return mix(envD(R,t),envL(R,t),uMode);
}
void main(){
  vec2 fc=gl_FragCoord.xy-uFrame.xy;
  vec2 p=vec2(fc.x,uFrame.w-fc.y)*uPx;
  vec2 hd=uDesign*.5;
  vec2 q0=abs(p-hd)-hd+uCorner;
  float fr=length(max(q0,0.))+min(max(q0.x,q0.y),0.)-uCorner;
  float mask=clamp(.5-fr/uPx,0.,1.);
  if(mask<=0.){gl_FragColor=vec4(0.);return;}
  float t=uTime;
  vec2 rp=vec2(0.);float ring=0.;
  for(int i=0;i<4;i++){
    vec4 r=uR[i];if(r.w<=0.)continue;
    vec2 dv=p-r.xy;float L=length(dv);float x=L-r.z*430.;
    float w=sin(x*.075)*exp(-x*x/3200.)*r.w*exp(-r.z*1.3);
    rp+=dv/max(L,1.)*w;ring+=w;
  }
  float m=1e5,s=0.;vec2 g=vec2(0.);vec4 at=vec4(0.);
  for(int i=0;i<NB;i++){
    if(i>=uN)break;
    vec4 A=uA[i],P=uP[i];float d,rad;vec2 gn;
    if(P.x>=0.){
      vec2 pa=p-A.xy,ba=A.zw-A.xy;
      float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-3),0.,1.);
      vec2 q=pa-ba*h;float L=length(q);
      d=L-P.x;gn=q/max(L,1e-3);rad=P.x;
    }else{
      rad=-P.x;vec2 dp=p-A.xy;vec2 q=abs(dp)-A.zw+rad;vec2 qm=max(q,0.);float L=length(qm);
      d=L+min(max(q.x,q.y),0.)-rad;vec2 sg=sign(dp);
      gn=L>1e-3?sg*qm/L:(q.x>q.y?vec2(sg.x,0.):vec2(0.,sg.y));
    }
    vec4 v=vec4(rad,P.yzw);
    if(d<m){float sc=exp((d-m)/uK);s=s*sc+1.;g=g*sc+gn;at=at*sc+v;m=d;}
    else{float w=exp((m-d)/uK);s+=w;g+=gn*w;at+=v*w;}
  }
  float D=m-uK*log(max(s,1.));
  at/=max(s,1e-4);
  vec2 od=g/max(length(g),1e-4);
  D+=(vn(p*.02+vec2(t*(.4+uAgit*2.),-t*.27))-.5)*(1.4+uAgit*3.5)*uCalm+ring*2.4;
  float e=-D;
  float cov=smoothstep(-uPx,uPx,e);
  vec2 uv=p/uDesign;
  float vig=smoothstep(1.1,.05,length((uv-vec2(.5,.36))*vec2(1.,1.25)));
  float sh=vn(p*.0045+vec2(t*.025,-t*.018));
  vec3 fs=film(sh*1.3+t*.015);
  float oD=max(D,0.);
  vec3 halo=film(t*.04+uv.x*.6+.2);
  float pulse=.05+.035*sin(t*6.2832);
  vec3 gD=mix(vec3(.056,.062,.078),vec3(.1,.108,.132),vig);
  gD+=fs*.024*smoothstep(.35,.9,sh);
  gD+=vec3(.55,.13,.22)*uHeat*pulse*smoothstep(.2,1.,uv.y);
  gD+=vec3(.6,.7,.82)*ring*.06;
  gD*=1.-.5*exp(-oD/16.);
  gD+=halo*.06*exp(-oD/5.);
  gD+=vec3(1.,.98,.95)*at.z*.3*exp(-oD/36.);
  vec3 gL=mix(vec3(.85,.868,.9),vec3(.972,.978,.988),vig);
  gL+=(fs-.55)*.055*smoothstep(.3,.9,sh);
  gL-=vec3(0.,.05,.07)*uHeat*(.6+.4*sin(t*6.2832))*smoothstep(.2,1.,uv.y);
  gL+=vec3(.28,.32,.42)*ring*.05;
  gL*=1.-.22*exp(-oD/12.)-.07*exp(-oD/48.);
  gL+=(halo-.5)*.13*exp(-oD/6.);
  gL+=(film(t*.3+oD*.03)-.3)*at.z*.3*exp(-oD/30.);
  vec3 gc=mix(gD,gL,uMode);
  vec3 col=gc;
  if(cov>0.){
    float bev=max(min(at.x*.78,uBevel),1.);
    float u=1.-clamp(e/bev,0.,1.);
    vec3 n=vec3(od*u,sqrt(max(1.-u*u,0.)));
    float fl=1.-u;
    n.xy+=rp*.3+(vec2(vn(p*.006+t*.08),vn(p*.006-t*.07+9.))-.5)*.34*fl*uCalm;
#ifndef LOW
    n.xy+=(vec2(vn(p*.017+t*2.3),vn(p*.017-t*2.1+3.))-.5)*uAgit*.3;
#endif
    n=normalize(n);
    vec3 I=normalize(vec3((p-hd)/uDesign.y*.55,-1.));
    vec3 R=reflect(I,n);
    vec3 c=env(R,t);
    float fth=vn(p*.009+vec2(t*.05,t*.03))*.9+(1.-n.z)*1.3+t*.02+uHeat*.35;
    vec3 fcol=film(fth);
    float fa=clamp(at.w*(1.+.4*uMode)*(.1+1.25*pow(1.-n.z,1.6)),0.,1.);
    c=mix(c,c*fcol*1.8+fcol*.05,fa);
    float ty=clamp(at.y,0.,1.);
    float lum=dot(c,vec3(.3,.5,.2));
    vec3 ox=mix(vec3(.74,.53,.27),vec3(.38,.25,.56),smoothstep(.25,.7,ty+fth*.12));
    ox=mix(ox,vec3(.2,.22,.4),smoothstep(.55,.95,ty));
    c=mix(c,ox*(.16+lum*.95),smoothstep(0.,.6,ty)*.86);
    c=mix(c,c*.45,smoothstep(.7,1.,ty));
    c*=1.-uMode*.32*pow(u,7.);
    float sw=pow(max(0.,sin((p.x*.7+p.y)*.01-t*4.)),12.);
    c+=at.z*(.2+.85*sw)*vec3(1.,1.,1.03);
    col=mix(gc,c,cov);
  }
  col+=uFlash*mix(vec3(.55,.57,.6),vec3(.3,.31,.34),uMode);
#ifndef LOW
  col+=(h21(gl_FragCoord.xy+fract(t*7.)*91.)-.5)*.012;
#endif
  gl_FragColor=vec4(col*mask,mask);
}`,w={1:{cap:12,dprMax:.6,dprMin:.45,fps:30,fx:4,low:!0},2:{cap:24,dprMax:1,dprMin:.7,fps:60,fx:10,low:!1},3:{cap:72,dprMax:1.5,dprMin:1,fps:60,fx:18,low:!1}},P=["uFrame","uDesign","uCorner","uTime","uPx","uK","uBevel","uHeat","uAgit","uFlash","uCalm","uMode","uN","uA","uP","uR"],F={x:0,y:0,r:0,ax:0,ay:0,bx:0,by:0,box:0,hw:0,hh:0,cr:20,tar:0,glow:0,film:.34,sc:1,dx:0,dy:0,on:1,prio:1};function _(y={}){return{...F,...y}}function k(y){const t=y.checkVisibility;return typeof t=="function"?!t.call(y,{opacityProperty:!0,visibilityProperty:!0}):!1}class S{canvas;opts;scene;time=0;modeV=0;gl=null;progs=new Map;nbMax=0;buf=null;blobs=[];anchors=new Map;particles=[];follows=[];ripples=[];Rb=new Float32Array(16);prevA=new Float32Array(0);prevP=new Float32Array(0);prevN=-1;_tier;manual=!1;dpr;lost=!1;dead=!1;paused=!1;onScreen=!0;startedAt=performance.now();last=performance.now();lastRender=0;prevRendered=!1;samples=0;sampleSum=0;fastWindows=0;lastDrop=0;ceilingUntil=0;fpsCount=0;fpsT0=performance.now();statsListeners=new Set;_stats;rect=null;unit=1;dw=1;dh=1;mode="dark";modeObs=null;io=null;lastPackN=0;presented=!1;constructor(t,s){if(this.canvas=t,this.opts=s,this._tier=s.tier,this.dpr=this.dprFor(s.tier),this.scene=s.profile==="tv"?{heat:0,agit:0,flash:0,k:10,bevel:32}:{heat:0,agit:0,flash:0,k:8,bevel:22},!this.initGL()||!this.program(s.tier))throw this.gl=null,new Error("liquid: WebGL unavailable");t.addEventListener("webglcontextlost",this.onLost),t.addEventListener("webglcontextrestored",this.onRestored);const e=s.modeSource??document.documentElement,i=()=>e.getAttribute("data-mode")==="light"?"light":"dark";this.mode=i(),this.modeV=this.mode==="light"?1:0,this.modeObs=new MutationObserver(()=>{const r=document.documentElement.classList.contains("vx-vt");this.setMode(i(),!r)}),this.modeObs.observe(e,{attributes:!0,attributeFilter:["data-mode"]}),typeof IntersectionObserver=="function"&&(this.io=new IntersectionObserver(r=>{const a=r[r.length-1];a&&(this.onScreen=a.isIntersecting)}),this.io.observe(t)),this._stats={tier:this._tier,fps:0,frameMs:0,blobs:0,dpr:this.dpr,mode:this.mode,lost:!1},document.addEventListener("visibilitychange",this.onVisibility),v.ticker.add(this.tick)}initGL(){const t=this.opts.profile==="phone",s={alpha:!0,premultipliedAlpha:!0,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1,powerPreference:t?"low-power":"high-performance",failIfMajorPerformanceCaveat:t};let e=null;try{e=this.canvas.getContext("webgl",s)}catch{e=null}if(!e)return!1;const i=Number(e.getParameter(e.MAX_FRAGMENT_UNIFORM_VECTORS))||0;if(this.nbMax=Math.min(72,Math.floor((i-24)/2)),this.nbMax<12)return!1;this.gl=e,this.progs.clear();const r=e.createBuffer();return e.bindBuffer(e.ARRAY_BUFFER,r),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),this.buf=r,!0}program(t){const s=this.gl;if(!s)return null;const e=w[t],i=Math.min(e.cap,this.nbMax),r=i*2+(e.low?1:0),a=this.progs.get(r);if(a)return a;const n=(d,x)=>{const c=s.createShader(d);return c?(s.shaderSource(c,x),s.compileShader(c),s.getShaderParameter(c,s.COMPILE_STATUS)?c:(console.warn("liquid shader:",s.getShaderInfoLog(c)),null)):null},h=n(s.VERTEX_SHADER,L),o=n(s.FRAGMENT_SHADER,`#define NB ${i}
${e.low?`#define LOW
`:""}${R}`);if(!h||!o)return null;const l=s.createProgram();if(!l)return null;if(s.attachShader(l,h),s.attachShader(l,o),s.bindAttribLocation(l,0,"a"),s.linkProgram(l),!s.getProgramParameter(l,s.LINK_STATUS))return console.warn("liquid link:",s.getProgramInfoLog(l)),null;const u={};for(const d of P)u[d]=s.getUniformLocation(l,d);const p={p:l,nb:i,u,A:new Float32Array(i*4),P:new Float32Array(i*4)};return this.progs.set(r,p),p}onLost=t=>{t.preventDefault(),this.lost=!0,this.progs.clear(),this.gl=null,this.refreshLive(),this.opts.onTier?.(0),this.emitStats()};onRestored=()=>{this.initGL()&&this._tier>0&&this.program(this._tier)&&(this.lost=!1,this.refreshLive(),this.opts.onTier?.(this._tier),this.emitStats())};onVisibility=()=>{this.last=performance.now(),this.prevRendered=!1,document.hidden&&this.unpresent()};get tier(){return this.lost?0:this._tier}get live(){return!this.lost&&!this.dead&&this._tier>0}get stats(){return this._stats}get scale(){return this.unit}get size(){return{w:this.dw,h:this.dh}}onStats(t){return this.statsListeners.add(t),()=>this.statsListeners.delete(t)}setTier(t){if(t==="auto"){this.manual=!1;return}this.manual=!0,this.applyTier(t)}dprFor(t){if(t===0)return 1;const s=typeof devicePixelRatio=="number"?devicePixelRatio:1;return Math.min(w[t].dprMax,s)}applyTier(t){t!==0&&!this.program(t)&&(t=0);const s=this._tier;if(this._tier=t,this.dpr=this.dprFor(t),this.samples=this.sampleSum=this.fastWindows=0,t!==0){const e=w[t].fx;for(;this.particles.length>e;)this.killParticle(0)}this.refreshLive(),s!==t&&this.opts.onTier?.(t),this.emitStats()}pause(){this.paused=!0}resume(){this.paused=!1,this.last=performance.now()}setMode(t,s=!0){if(t===this.mode)return;this.mode=t;const e=t==="light"?1:0;v.killTweensOf(this,"modeV"),!s||b()?this.modeV=e:(v.to(this,{modeV:e,duration:.9,ease:"power2.inOut"}),this.ripple(this.dw/2,this.dh*.4,1.1)),this.emitStats()}add(t={}){const s=_(t);return this.blobs.push(s),s}circle(t,s,e,i={}){return this.add({...i,x:t,y:s,r:e})}pill(t,s,e,i,r={}){return this.add({...r,x:t,y:s,r:i,ax:-e,bx:e})}rbox(t,s,e,i,r,a={}){return this.add({...a,x:t,y:s,hw:e,hh:i,cr:r,box:1})}remove(t){v.killTweensOf(t);const s=this.blobs.indexOf(t);s>=0&&this.blobs.splice(s,1),this.anchors.delete(t),this.follows=this.follows.filter(e=>e.b!==t)}clearScene(){for(const t of this.blobs.slice())this.anchors.has(t)||this.remove(t);this.particles.length=0,this.follows.length=0,this.ripples.length=0,this.scene.heat=this.scene.agit=this.scene.flash=0}anchor(t,s={}){const e=performance.now()-this.startedAt,i=s.appear==="auto"||s.appear===void 0?e>400?"pour":"instant":s.appear,r=this.add({film:s.film??.34,tar:s.tar??0,glow:s.glow??0,prio:s.prio??0,box:s.shape==="box"?1:0,sc:i==="pour"?0:1}),a={b:r,el:t,shape:s.shape??"pill",pad:s.pad??0,cr:s.cr??null,state:"",want:""};if(a.shape==="box"&&a.cr===null){const n=parseFloat(getComputedStyle(t).borderTopLeftRadius);a.cr=Number.isFinite(n)?n:20}return this.anchors.set(r,a),this.measureAnchor(a),i==="pour"&&v.to(r,{sc:1,duration:b()?.3:.75,ease:b()?"power2.out":"back.out(1.7)",delay:.04}),this.setLq(a,"off"),r}release(t,s=!0){const e=this.anchors.get(t);if(e&&(this.setLq(e,""),this.anchors.delete(t)),!s||!this.live){this.remove(t);return}v.killTweensOf(t,"sc"),v.to(t,{sc:0,duration:.28,ease:"power2.in",onComplete:()=>this.remove(t)})}follow(t,s,e=0,i=0){const r={el:t,b:s,ox:e,oy:i,last:""};return this.follows.push(r),()=>{this.follows=this.follows.filter(a=>a!==r)}}ripple(t,s,e=1){b()&&(e*=.4),this.ripples.push({x:t,y:s,t:0,s:e}),this.ripples.length>4&&this.ripples.shift()}flash(t){this.scene.flash=Math.max(this.scene.flash,b()?t*.3:t)}droplet(t){if(!this.live)return null;const s=w[this._tier].fx;if(this.particles.length>=s)return null;const e=this.add({x:t.x,y:t.y,r:t.r,tar:t.tar??0,glow:t.glow??0,film:t.film??.5,prio:2});return this.particles.push({b:e,vx:t.vx??0,vy:t.vy??0,g:t.g??1400,k:t.k??0,px:t.px??0,py:t.py??0,damp:t.damp??0,life:t.life??1,t:0,r0:t.r}),e}splash(t,s,e,i,r=!1){b()&&(i=Math.min(i,2));for(let a=0;a<i;a++){const n=g()*A,h=(r?1050:720)*(.6+g()*.6);this.droplet({x:t+Math.cos(n)*e*.85,y:s+Math.sin(n)*e*.85,vx:Math.cos(n)*h,vy:Math.sin(n)*h,r:(r?11:7)*(.7+g()*.6),g:0,k:24,px:t,py:s,damp:1.6,life:1.05+g()*.35,film:.6})}}fountain(t,s,e,i,r={}){b()&&(i=Math.min(i,3));for(let a=0;a<i;a++){const n=-Math.PI/2+(g()-.5)*(r.spread??2.2),h=(r.sp??620)*(.65+g()*.6);this.droplet({x:t+(g()-.5)*e,y:s,vx:Math.cos(n)*h,vy:Math.sin(n)*h,r:(r.r??8)*(.7+g()*.6),g:r.g??1500,life:(r.life??1.2)+g()*.4,film:r.film??.8,glow:r.glow??0,tar:r.tar??0})}}measure(t){const s=this.rect??this.canvas.getBoundingClientRect(),e=this.unitFor(s),i=t.getBoundingClientRect();return{x:(i.left-s.left+i.width/2)/e,y:(i.top-s.top+i.height/2)/e,w:i.width/e,h:i.height/e}}toLocal(t,s){const e=this.rect??this.canvas.getBoundingClientRect(),i=this.unitFor(e);return{x:(t-e.left)/i,y:(s-e.top)/i}}destroy(){if(this.dead)return;this.dead=!0,v.ticker.remove(this.tick),v.killTweensOf(this.blobs),v.killTweensOf(this),v.killTweensOf(this.scene);for(const s of this.anchors.values())this.setLq(s,"");this.anchors.clear(),this.modeObs?.disconnect(),this.io?.disconnect(),document.removeEventListener("visibilitychange",this.onVisibility),this.canvas.removeEventListener("webglcontextlost",this.onLost),this.canvas.removeEventListener("webglcontextrestored",this.onRestored);const t=this.gl;if(t){for(const s of this.progs.values())t.deleteProgram(s.p);this.buf&&t.deleteBuffer(this.buf),t.getExtension("WEBGL_lose_context")?.loseContext()}this.gl=null,this.statsListeners.clear()}unitFor(t){const s=this.opts.designWidth;return s&&t.width>0?t.width/s:1}setLq(t,s){t.state!==s&&(t.state=s,s===""?t.el.removeAttribute("data-lq"):t.el.setAttribute("data-lq",s))}unpresent(){this.presented=!1,this.canvas.style.visibility="hidden";for(const t of this.anchors.values())t.want="",this.setLq(t,"off")}present(){this.presented||(this.presented=!0,this.canvas.style.visibility="");for(const t of this.anchors.values())t.want&&this.setLq(t,t.want)}refreshLive(){this.live||this.unpresent()}measureAnchor(t){const s=this.rect??this.canvas.getBoundingClientRect(),e=this.unitFor(s),i=t.b;if(!t.el.isConnected)return!1;const r=t.el.getBoundingClientRect();if(r.width<.5||r.height<.5||k(t.el)||r.right<s.left-40||r.left>s.right+40||r.bottom<s.top-40||r.top>s.bottom+40)return!1;const a=r.width/e+t.pad*2,n=r.height/e+t.pad*2;if(i.x=(r.left-s.left)/e+r.width/e/2,i.y=(r.top-s.top)/e+r.height/e/2,t.shape==="circle")i.r=Math.min(a,n)/2,i.ax=i.bx=i.ay=i.by=0;else if(t.shape==="pill")if(a>=n){const h=n/2;i.r=h,i.ax=-(a/2-h),i.bx=a/2-h,i.ay=i.by=0}else{const h=a/2;i.r=h,i.ay=-(n/2-h),i.by=n/2-h,i.ax=i.bx=0}else i.hw=a/2,i.hh=n/2,i.cr=Math.min(t.cr??20,i.hw,i.hh);return!0}killParticle(t){const s=this.particles[t];if(!s)return;this.particles.splice(t,1);const e=this.blobs.indexOf(s.b);e>=0&&this.blobs.splice(e,1)}simulate(t){for(let e=this.particles.length-1;e>=0;e--){const i=this.particles[e],r=i.b;if(i.t+=t,i.k&&(i.vx+=(i.px-r.x)*i.k*t,i.vy+=(i.py-r.y)*i.k*t),i.damp){const o=Math.exp(-i.damp*t);i.vx*=o,i.vy*=o}i.vy+=i.g*t,r.x+=i.vx*t,r.y+=i.vy*t;const a=Math.hypot(i.vx,i.vy),n=a>1?Math.min(a*.022,r.r*2.2):0;r.ax=a>1?-i.vx/a*n:0,r.ay=a>1?-i.vy/a*n:0;const h=i.t/i.life;r.r=i.r0*(h<.65?1:Math.max(0,1-(h-.65)/.35)),(h>=1||r.y>this.dh+140)&&this.killParticle(e)}for(const e of this.ripples)e.t+=t;this.ripples=this.ripples.filter(e=>e.t<2.6);const s=this.scene;s.flash*=Math.exp(-t*3.2),s.flash<.002&&(s.flash=0)}pack(t,s){const e=t.A,i=t.P,r=Math.min(t.nb,s),a=this.scene.k*3+40;let n=0;for(let h=0;h<=2;h++)for(const o of this.blobs){if((o.prio<=0?0:o.prio>=2?2:Math.round(o.prio))!==h||!o.on||o.sc<=.002)continue;const u=this.anchors.get(o),p=o.x+o.dx,d=o.y+o.dy;let x=!0,c=0;if(o.box){const m=o.hw*o.sc,M=o.hh*o.sc;(m<.5||M<.5)&&(x=!1),c=Math.max(m,M)}else{const m=o.r*o.sc;m<.4&&(x=!1),c=m+Math.max(Math.abs(o.ax),Math.abs(o.bx),Math.abs(o.ay),Math.abs(o.by))*o.sc}if(x&&(p+c<-a||p-c>this.dw+a||d+c<-a||d-c>this.dh+a)&&(x=!1),!x)continue;if(n>=r){u&&(u.want="off");continue}u&&(u.want="live");const f=n*4;if(o.box){const m=o.hw*o.sc,M=o.hh*o.sc;e[f]=p,e[f+1]=d,e[f+2]=m,e[f+3]=M,i[f]=-Math.max(.5,Math.min(o.cr*o.sc,m,M))}else e[f]=p+o.ax*o.sc,e[f+1]=d+o.ay*o.sc,e[f+2]=p+o.bx*o.sc,e[f+3]=d+o.by*o.sc,i[f]=o.r*o.sc;i[f+1]=o.tar,i[f+2]=o.glow,i[f+3]=o.film,n++}return n}changed(t,s){const e=s*4;let i=s!==this.prevN;if(this.prevA.length<t.A.length&&(this.prevA=new Float32Array(t.A.length),this.prevP=new Float32Array(t.P.length),i=!0),!i){for(let r=0;r<e;r++)if(Math.abs(t.A[r]-this.prevA[r])>.05||Math.abs(t.P[r]-this.prevP[r])>.002){i=!0;break}}return i&&(this.prevA.set(t.A.subarray(0,e)),this.prevP.set(t.P.subarray(0,e)),this.prevN=s),i}tick=()=>{const t=performance.now(),s=t-this.last;if(this.last=t,this.dead)return;const e=this.prevRendered;if(this.prevRendered=!1,this.paused||document.hidden||!this.onScreen||!this.live||!this.gl)return;e&&s<250&&this.sample(s);const i=Math.min(s/1e3,.05);this.time+=i;const r=this.canvas.getBoundingClientRect();this.rect=r,this.unit=this.unitFor(r),this.dw=Math.max(1,r.width/this.unit),this.dh=Math.max(1,r.height/this.unit);for(const c of this.anchors.values())this.measureAnchor(c)?c.b.on=1:c.b.on=0;this.simulate(i);for(const c of this.follows){const f=c.b,m=`translate3d(${(f.x+f.dx+c.ox).toFixed(1)}px,${(f.y+f.dy+c.oy).toFixed(1)}px,0)`;m!==c.last&&(c.el.style.transform=m,c.last=m)}const a=this._tier,n=w[a],h=this.program(a);if(!h){this.applyTier(0);return}const o=this.pack(h,n.cap);this.lastPackN=o;const l=this.scene,u=this.changed(h,o)||this.ripples.length>0||this.particles.length>0||l.flash>0||l.agit>.001||l.heat>.001||this.modeV>.001&&this.modeV<.999,p=n.fps<60?1e3/n.fps-4:0,d=this.opts.profile==="phone"||a===1?1e3/30-4:0,x=Math.max(p,u?0:d);t-this.lastRender<x||(this.lastRender=t,this.draw(h,o),this.present(),this.prevRendered=!0,this.fpsCount++,t-this.fpsT0>=1e3&&(this._stats={...this._stats,fps:Math.round(this.fpsCount*1e3/(t-this.fpsT0)),blobs:o},this.fpsCount=0,this.fpsT0=t,this.emitStats()))};draw(t,s){const e=this.gl,i=this.rect;if(!e||!i)return;const r=Math.max(1,Math.round(i.width*this.dpr)),a=Math.max(1,Math.round(i.height*this.dpr));(this.canvas.width!==r||this.canvas.height!==a)&&(this.canvas.width=r,this.canvas.height=a);const n=b(),h=this.scene,o=this.Rb;o.fill(0),this.ripples.forEach((u,p)=>{o[p*4]=u.x,o[p*4+1]=u.y,o[p*4+2]=u.t,o[p*4+3]=u.s}),e.viewport(0,0,r,a),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),e.useProgram(t.p);const l=t.u;e.uniform4f(l.uFrame,0,0,r,a),e.uniform2f(l.uDesign,this.dw,this.dh),e.uniform1f(l.uCorner,this.opts.corner??0),e.uniform1f(l.uTime,this.time*(n?.4:1)),e.uniform1f(l.uPx,this.dw/r),e.uniform1f(l.uK,h.k),e.uniform1f(l.uBevel,h.bevel),e.uniform1f(l.uHeat,h.heat),e.uniform1f(l.uAgit,n?h.agit*.3:h.agit),e.uniform1f(l.uFlash,n?h.flash*.3:h.flash),e.uniform1f(l.uCalm,n?.35:1),e.uniform1f(l.uMode,this.modeV),e.uniform1i(l.uN,s),e.uniform4fv(l.uA,t.A),e.uniform4fv(l.uP,t.P),e.uniform4fv(l.uR,o),e.drawArrays(e.TRIANGLES,0,3)}sample(t){if(this.sampleSum+=t,++this.samples<90&&(this.sampleSum<1500||this.samples<16))return;const s=this.sampleSum/this.samples;this.samples=0,this.sampleSum=0,this.govern(s)}govern(t){const s=performance.now(),e=this._tier;if(e===0)return;const i=w[e];if(this._stats={...this._stats,frameMs:Math.round(t*10)/10},t>24){this.fastWindows=0;const r=t>40;if(this.dpr>i.dprMin+.001)this.dpr=Math.max(i.dprMin,this.dpr*(r?.7:.8));else if(!this.manual){if(e>1){this.lastDrop=s,this.ceilingUntil=s+6e4,this.applyTier(e-1);return}if(t>45){this.applyTier(0);return}}}else if(t<18.5){if(this.fastWindows++,this.fastWindows>=3&&s-this.lastDrop>8e3){this.fastWindows=0;const r=this.dprFor(e);this.dpr<r-.001?this.dpr=Math.min(r,this.dpr*1.12):!this.manual&&e<this.opts.maxTier&&s>this.ceilingUntil&&(this.applyTier(e+1),this.dpr=w[e+1].dprMin)}}else this.fastWindows=0;this._stats={...this._stats,dpr:Math.round(this.dpr*100)/100},this.emitStats()}emitStats(){this._stats={...this._stats,tier:this.tier,dpr:Math.round(this.dpr*100)/100,mode:this.mode,lost:this.lost,blobs:this.lastPackN};for(const t of this.statsListeners)t(this._stats)}}export{S as LiquidEngine,w as TIERS,_ as makeBlob};
