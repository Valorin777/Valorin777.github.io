import{g as w,l as _,am as T,an as at}from"./index-BueiHBBC.js";const st={1:{cap:12,fps:30,fx:4,low:!0},2:{cap:24,fps:60,fx:10,low:!1},3:{cap:72,fps:60,fx:18,low:!1}};function ht(){try{return typeof matchMedia=="function"&&matchMedia("(hover: hover) and (pointer: fine)").matches}catch{return!1}}function lt(c,t){return c==="tv"||t?"hi":"phone"}function ct(c,t,s){const e=Number.isFinite(s)&&s>0?s:1;return c==="hi"||t>=2?{base:Math.min(e,2),floor:Math.min(e,1)}:{base:Math.min(e,.6),floor:Math.min(e,.45)}}const $={dprK:1,low:!1,capK:1,fxK:1,fps:60},F={...$,low:!0},y={...F,capK:.75,fxK:.5},ft=[$,F,y,{...y,dprK:.85},{...y,dprK:.72},{...y,dprK:.6},{...y,dprK:0},{...y,dprK:0,fps:30}],ut=[$,F,y,{...y,dprK:.8},{...y,dprK:.65},{...y,dprK:0}],pt=[F,{...F,dprK:.87},{...F,dprK:0}];function Q(c,t){return c==="hi"?ft:t===1?pt:ut}function P(c,t,s,e){const i=Q(c,t),n=i[Math.max(0,Math.min(i.length-1,s))],o=st[t],{base:r,floor:h}=ct(c,t,e),a=Math.max(h,Math.min(r,r*n.dprK));return{dpr:Math.round(a*1e3)/1e3,low:o.low||n.low,cap:Math.max(Math.min(o.cap,12),Math.round(o.cap*n.capK)),fx:Math.max(2,Math.round(o.fx*n.fxK)),fps:Math.min(o.fps,n.fps)}}function dt(c,t){return Math.abs(c.dpr-t.dpr)<.001&&c.low===t.low&&c.cap===t.cap&&c.fx===t.fx&&c.fps===t.fps}function B(c,t,s,e,i){const n=Q(c,t),o=P(c,t,s,i);for(let r=s+e;r>=0&&r<n.length;r+=e)if(!dt(P(c,t,r,i),o))return r;return null}const mt=24,X=18.5,xt=20,G=12,vt=8;class gt{members=new Set;now;hist=[];lastFrame=-1;lastT=0;drewNow=!1;n=0;sum=0;fast=0;lastDrop=-1/0;lastRecover=-1/0;backoff=8e3;probe=null;futile=0;holdUntil=-1/0;holdAvg=0;holdMs=3e4;hopeless=0;last="";constructor(t={}){this.now=t.now??(()=>performance.now())}add(t){return this.members.add(t),()=>{this.members.delete(t),this.hist=this.hist.filter(s=>s!==t)}}frame(t,s){if(t===this.lastFrame)return;this.lastFrame=t;const e=s-this.lastT;this.lastT=s;const i=this.drewNow;this.drewNow=!1,i&&e>0&&e<250&&this.sample(e)}drew(){this.drewNow=!0}reset(){this.n=this.sum=0,this.drewNow=!1}sample(t){if(this.sum+=t,++this.n<90&&(this.sum<1500||this.n<16))return;const s=this.sum/this.n;this.n=this.sum=0,this.window(s)}window(t){const s=this.now(),e=[...this.members].filter(f=>f.active());let i=e.length?0:null;for(const f of this.members){const l=f.takeGpu();e.includes(f)&&(l===null||i===null?i=null:i+=l)}for(const f of e)f.report(t,i);if(!e.length)return;const n=i!==null,o=i??0,r=n?t>xt&&o>Math.min(G,t*.4):t>mt,h=n?r&&o>22:t>40,a=n?o<vt||t<X&&o<G*.75:t<X;if(!n&&this.probe&&(t<this.probe.before*.92?(this.probe=null,this.futile=0):r&&this.futile++),r){if(this.fast=0,!n&&this.probe&&this.futile>=4){for(let l=this.probe.steps;l>0;l--)this.recoverLast();this.probe=null,this.futile=0,this.holdUntil=s+this.holdMs,this.holdAvg=t,this.holdMs=Math.min(this.holdMs*2,3e5),this.last="hold";return}if(!n&&s<this.holdUntil&&t<this.holdAvg*1.25){this.last="held";return}s-this.lastRecover<1e4&&(this.backoff=Math.min(this.backoff*2,12e4));let f=0;for(let l=h?2:1;l>0;l--)this.degradeOne(e)&&f++;if(f){this.lastDrop=s,this.hopeless=0,n||(this.probe??={before:t,steps:0},this.probe.steps+=f),this.last=`degrade ${f}`;return}if(t>45&&(n?o>G:s>=this.holdUntil)&&++this.hopeless>=2){this.hopeless=0;const l=e.reduce((u,x)=>x.importance<u.importance?x:u);l.drop(),this.members.delete(l),this.hist=this.hist.filter(u=>u!==l),this.last="drop";return}this.last="floor";return}if(this.hopeless=0,a){if(!n&&t<X&&(this.holdUntil=-1/0),++this.fast>=3&&s-this.lastDrop>this.backoff&&s-this.lastRecover>3e3&&(this.fast=0,this.recoverLast())){this.lastRecover=s,this.probe=null,this.futile=0,this.last="recover";return}this.last="fast";return}this.fast=0,this.last="ok"}degradeOne(t){const s=t.filter(o=>o.canDegrade());if(!s.length)return!1;const e=s.filter(o=>!o.nextIsResolution()),n=(e.length?e:s).reduce((o,r)=>r.pixels()/r.importance>o.pixels()/o.importance?r:o);return n.degrade()?(this.hist.push(n),!0):!1}recoverLast(){for(;this.hist.length;){const t=this.hist.pop();if(this.members.has(t)&&t.recover())return!0}return!1}}const z=new gt,V=160,it=6,bt="attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}",wt=`#version 300 es
in vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`,Z=`
uniform vec4 uFrame;uniform vec2 uDesign;uniform float uCorner,uTime,uPx,uK,uBevel,uHeat,uAgit,uFlash,uCalm,uMode;uniform int uN;
uniform vec4 uA[NB];uniform vec4 uP[NB];uniform vec4 uR[4];
#ifdef TILES
uniform highp usampler2D uTiles;uniform vec3 uTile;uniform int uSlots;
#endif
float h21(vec2 p){p=fract(p*vec2(233.34,851.73));p+=dot(p,p+23.45);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
vec3 film(float x){return .55+.45*cos(6.2832*(x+vec3(0.,.33,.67)));}
/** film() averaged over a footprint w (the bands fade to their mean instead of aliasing) */
vec3 filmw(float x,float w){return .55+.45*cos(6.2832*(x+vec3(0.,.33,.67)))*exp(-1.8*w*w);}
// Specular anti-aliasing: the reflection turns fast near the rim (up to a fraction of a radian per
// device pixel), where the studio's thin highlights and horizon line would be sampled into dashes
// and sparkles. Both are widened to the pixel footprint w (energy kept): pow(cos x, n) is a lobe
// of variance 1/n, an exp(-|y|/s) band has width s.
float lobe(float x,float n,float w){float q=1./(1.+n*w*w*.25);return pow(max(0.,cos(x)),n*q)*sqrt(q);}
float band(float y,float s,float w){float s2=sqrt(s*s+w*w*.25);return exp(-abs(y)/s2)*(s/s2);}
vec3 envD(vec3 R,float t,float fw){
  float up=-R.y;
  vec3 c=mix(vec3(.045,.05,.062),vec3(.40,.43,.49),smoothstep(-.05,.9,up));
  c=mix(c,vec3(.022,.021,.024),smoothstep(-.03,-.55,up));
  float fb=smoothstep(.35,.93,R.z);
  c=mix(c,vec3(.69,.72,.78)+vec3(.13)*clamp(up+.35,0.,1.),fb);
  float az=atan(R.x,R.z);float da=fw/max(length(R.xz),.05);
  float s1=lobe(az*3.-t*.33,42.,3.*da);
  float s2=lobe(az*5.+t*.21+1.7,90.,5.*da);
  c+=vec3(1.02,1.05,1.1)*(s1*.85+s2*.45)*smoothstep(-.55,.2,up);
  float hz=smoothstep(.22,0.,abs(up+.02))*(1.-fb);
  c=mix(c,vec3(.015,.017,.022),.55*hz);
  c+=vec3(.75,.83,.96)*band(up+.05,1./26.,fw)*(1.-fb)*.6;
  return c;
}
vec3 envL(vec3 R,float t,float fw){
  float up=-R.y;
  vec3 c=mix(vec3(.60,.635,.69),vec3(.975,.982,.995),smoothstep(-.08,.75,up));
  c=mix(c,vec3(.26,.285,.33),smoothstep(-.02,-.5,up));
  float fb=smoothstep(.42,.95,R.z);
  c=mix(c,vec3(.90,.915,.945)+vec3(.07)*clamp(up+.3,0.,1.),fb);
  float az=atan(R.x,R.z);float da=fw/max(length(R.xz),.05);
  float s1=lobe(az*3.-t*.33,34.,3.*da);
  float s2=lobe(az*5.+t*.21+1.7,80.,5.*da);
  c+=vec3(1.)*(s1*.75+s2*.4)*smoothstep(-.4,.3,up);
  float hz=smoothstep(.27,0.,abs(up+.02))*(1.-fb);
  c=mix(c,vec3(.085,.095,.12),.78*hz);
  c+=vec3(.55,.64,.8)*band(up+.07,1./30.,fw)*(1.-fb)*.28;
  return c;
}
vec3 env(vec3 R,float t,float fw){
  if(uMode<.002)return envD(R,t,fw);
  if(uMode>.998)return envL(R,t,fw);
  return mix(envD(R,t,fw),envL(R,t,fw),uMode);
}
float m,s;vec2 g;vec4 at;
void blob(vec2 p,vec4 A,vec4 P){
  float d,rad;vec2 gn;
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
  // weight < e^-6 against the nearest surface so far: nothing visible, skip the exp
  if(d-m>${it.toFixed(1)}*uK)return;
  vec4 v=vec4(rad,P.yzw);
  if(d<m){float sc=exp((d-m)/uK);s=s*sc+1.;g=g*sc+gn;at=at*sc+v;m=d;}
  else{float w=exp((m-d)/uK);s+=w;g+=gn*w;at+=v*w;}
}
void main(){
  vec2 fc=gl_FragCoord.xy-uFrame.xy;
  vec2 p=vec2(fc.x,uFrame.w-fc.y)*uPx;
  vec2 hd=uDesign*.5;
  vec2 q0=abs(p-hd)-hd+uCorner;
  float fr=length(max(q0,0.))+min(max(q0.x,q0.y),0.)-uCorner;
  float mask=clamp(.5-fr/uPx,0.,1.);
  if(mask<=0.){FRAG_OUT=vec4(0.);return;}
  float t=uTime;
  vec2 rp=vec2(0.);float ring=0.;
  for(int i=0;i<4;i++){
    vec4 r=uR[i];if(r.w<=0.)continue;
    vec2 dv=p-r.xy;float L=length(dv);float x=L-r.z*430.;
    float w=sin(x*.075)*exp(-x*x/3200.)*r.w*exp(-r.z*1.3);
    rp+=dv/max(L,1.)*w;ring+=w;
  }
  m=1e5;s=0.;g=vec2(0.);at=vec4(0.);
#ifdef TILES
  ivec2 tc=clamp(ivec2(p/uTile.x),ivec2(0),ivec2(uTile.yz)-1);
  int tb=tc.x*uSlots;
  int cnt=int(texelFetch(uTiles,ivec2(tb,tc.y),0).r);
  if(cnt==255){
    for(int i=0;i<NB;i++){if(i>=uN)break;blob(p,uA[i],uP[i]);}
  }else{
    for(int k=0;k<NB;k++){
      if(k>=cnt)break;
      int i=int(texelFetch(uTiles,ivec2(tb+1+k,tc.y),0).r);
      blob(p,uA[i],uP[i]);
    }
  }
#else
  for(int i=0;i<NB;i++){if(i>=uN)break;blob(p,uA[i],uP[i]);}
#endif
  float D=m-uK*log(max(s,1.));
  at/=max(s,1e-4);
  vec2 od=g/max(length(g),1e-4);
  // the surface breathes; at rest the silhouette stays put (sub-pixel), agitation makes it boil.
  // Only near a surface (fades out by 40 units, where nothing reads D that finely)
  float bw=1.-smoothstep(28.,40.,D);
  if(bw>0.)D+=(vn(p*.02+vec2(t*(.4+uAgit*2.),-t*.27))-.5)*(.5+uAgit*3.5)*uCalm*bw;
  D+=ring*2.4;
  float e=-D;
  // ~1 device pixel of anti-aliasing at the actual render scale
  float cov=smoothstep(-.75*uPx,.75*uPx,e);
  vec2 uv=p/uDesign;
  float vig=smoothstep(1.1,.05,length((uv-vec2(.5,.36))*vec2(1.,1.25)));
  float sh=vn(p*.0045+vec2(t*.025,-t*.018));
  vec3 fs=film(sh*1.3+t*.015);
  float oD=max(D,0.);
  float near=1.-smoothstep(${(V*.6).toFixed(1)},${V.toFixed(1)},oD);
  vec3 gD=mix(vec3(.056,.062,.078),vec3(.1,.108,.132),vig);
  gD+=fs*.024*smoothstep(.35,.9,sh);
  vec3 gL=mix(vec3(.85,.868,.9),vec3(.972,.978,.988),vig);
  gL+=(fs-.55)*.055*smoothstep(.3,.9,sh);
  if(uHeat>0.){
    float pulse=.05+.035*sin(t*6.2832);
    gD+=vec3(.55,.13,.22)*uHeat*pulse*smoothstep(.2,1.,uv.y);
    gL-=vec3(0.,.05,.07)*uHeat*(.6+.4*sin(t*6.2832))*smoothstep(.2,1.,uv.y);
  }
  gD+=vec3(.6,.7,.82)*ring*.06;
  gL+=vec3(.28,.32,.42)*ring*.05;
  if(near>0.){
    vec3 halo=film(t*.04+uv.x*.6+.2);
    gD*=1.-.5*exp(-oD/16.)*near;
    gD+=halo*.06*exp(-oD/5.);
    gD+=vec3(1.,.98,.95)*at.z*.3*exp(-oD/36.)*near;
    gL*=1.-(.22*exp(-oD/12.)+.07*exp(-oD/48.))*near;
    gL+=(halo-.5)*.13*exp(-oD/6.);
    gL+=(film(t*.3+oD*.03)-.3)*at.z*.3*exp(-oD/30.)*near;
  }
  vec3 gc=mix(gD,gL,uMode);
  vec3 col=gc;
  if(cov>0.){
    // shade edge pixels half a pixel inside the rim: the grazing normal right at the
    // silhouette flickers between env bands from one pixel to the next (jaggy, noisy rim)
    float es=max(e,.5*uPx);
    float bev=max(min(at.x*.78,uBevel),1.);
    float u=1.-clamp(es/bev,0.,1.);
    float nz0=sqrt(max(1.-u*u,0.));
    vec3 n=vec3(od*u,nz0);
    // how far the normal tilts per device pixel: across the bevel (steepest at the rim) and
    // around the outline (its curvature); the reflection turns twice as far
    float dt=uPx*u*(1./(bev*max(nz0,.12))+1./max(at.x,4.));
    float fl=1.-u;
    n.xy+=rp*.3+(vec2(vn(p*.006+t*.08),vn(p*.006-t*.07+9.))-.5)*.34*fl*uCalm;
#ifndef LOW
    if(uAgit>.001)n.xy+=(vec2(vn(p*.017+t*2.3),vn(p*.017-t*2.1+3.))-.5)*uAgit*.3;
#endif
    n=normalize(n);
    vec3 I=normalize(vec3((p-hd)/uDesign.y*.55,-1.));
    vec3 R=reflect(I,n);
    vec3 c=env(R,t,2.*dt);
    float fth=vn(p*.009+vec2(t*.05,t*.03))*.9+(1.-n.z)*1.3+t*.02+uHeat*.35;
    vec3 fcol=filmw(fth,1.3*dt);
    float fa=clamp(at.w*(1.+.4*uMode)*(.1+1.25*pow(1.-n.z,1.6)),0.,1.);
    c=mix(c,c*fcol*1.8+fcol*.05,fa);
    float ty=clamp(at.y,0.,1.);
    if(ty>0.){
      float lum=dot(c,vec3(.3,.5,.2));
      vec3 ox=mix(vec3(.74,.53,.27),vec3(.38,.25,.56),smoothstep(.25,.7,ty+fth*.12));
      ox=mix(ox,vec3(.2,.22,.4),smoothstep(.55,.95,ty));
      c=mix(c,ox*(.16+lum*.95),smoothstep(0.,.6,ty)*.86);
      c=mix(c,c*.45,smoothstep(.7,1.,ty));
    }
    c*=1.-uMode*.32*pow(u,7.);
    if(at.z>0.){
      float sw=pow(max(0.,sin((p.x*.7+p.y)*.01-t*4.)),12.);
      c+=at.z*(.2+.85*sw)*vec3(1.,1.,1.03);
    }
    col=mix(gc,c,cov);
  }
  col+=uFlash*mix(vec3(.55,.57,.6),vec3(.3,.31,.34),uMode);
#ifndef LOW
  col+=(h21(gl_FragCoord.xy+fract(t*7.)*91.)-.5)*.01;
#endif
  FRAG_OUT=vec4(col*mask,mask);
}`;function yt(c){const t=`#define NB ${c.nb}
${c.low?`#define LOW
`:""}`;return c.tiles?`#version 300 es
precision highp float;
precision highp int;
${t}#define TILES
out vec4 fragOut;
#define FRAG_OUT fragOut
${Z}`:`#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
${t}#define FRAG_OUT gl_FragColor
${Z}`}const Mt=32,W=255,Tt=4;function Et(c,t){return Math.max(24,Math.ceil(Math.sqrt(Math.max(1,c)*Math.max(1,t)/1e3)))}function Rt(c,t,s,e=Mt){const i=Et(c,t),n=Math.max(1,Math.ceil(c/i)),o=Math.max(1,Math.ceil(t/i));return s&&s.ts===i&&s.tx===n&&s.ty===o&&s.slots===e?s:{ts:i,tx:n,ty:o,slots:e,data:new Uint8Array(n*e*o),near:new Float32Array(n*o),overflow:0,max:0,refs:0}}function tt(c,t,s,e,i){const n=s*4,o=t[n],r=c[n],h=c[n+1],a=c[n+2],f=c[n+3];if(o>=0){const d=e-r,g=i-h,m=a-r,b=f-h,p=Math.max(m*m+b*b,.001),v=Math.min(1,Math.max(0,(d*m+g*b)/p));return Math.hypot(d-m*v,g-b*v)-o}const l=-o,u=Math.abs(e-r)-a+l,x=Math.abs(i-h)-f+l;return Math.hypot(Math.max(u,0),Math.max(x,0))+Math.min(Math.max(u,x),0)-l}const E=new Float32Array(4);function et(c,t,s){const e=s*4,i=t[e],n=c[e],o=c[e+1],r=c[e+2],h=c[e+3];return i>=0?(E[0]=Math.min(n,r)-i,E[1]=Math.min(o,h)-i,E[2]=Math.max(n,r)+i,E[3]=Math.max(o,h)+i):(E[0]=n-r,E[1]=o-h,E[2]=n+r,E[3]=o+h),E}function _t(c,t,s,e,i){const{ts:n,tx:o,ty:r,slots:h,data:a,near:f}=c,l=V,u=n*Math.SQRT1_2;f.fill(1/0);for(let p=0;p<e;p++){const v=et(t,s,p),L=Math.max(0,Math.floor((v[0]-l)/n)),A=Math.min(o-1,Math.floor((v[2]+l)/n)),q=Math.max(0,Math.floor((v[1]-l)/n)),I=Math.min(r-1,Math.floor((v[3]+l)/n));for(let k=q;k<=I;k++){const K=(k+.5)*n;for(let D=L;D<=A;D++){const U=tt(t,s,p,(D+.5)*n,K)+u,M=k*o+D;U<f[M]&&(f[M]=U)}}}const x=o*h;for(let p=0;p<r;p++)for(let v=0;v<o;v++)a[p*x+v*h]=0;let d=0,g=0;const m=it*i+Tt;for(let p=0;p<e;p++){const v=et(t,s,p),L=v[0],A=v[1],q=v[2],I=v[3],k=Math.max(0,Math.floor((L-l)/n)),K=Math.min(o-1,Math.floor((q+l)/n)),D=Math.max(0,Math.floor((A-l)/n)),U=Math.min(r-1,Math.floor((I+l)/n));for(let M=D;M<=U;M++){const Y=M*n,nt=Math.max(0,A-(Y+n),Y-I);for(let S=k;S<=K;S++){const j=S*n,rt=Math.max(0,L-(j+n),j-q),ot=M*o+S,J=Math.min(l,f[ot]+m),N=Math.hypot(rt,nt);if(N>0&&N>J||Math.max(N>0?N:-1/0,tt(t,s,p,(S+.5)*n,(M+.5)*n)-u)>J)continue;const O=M*x+S*h,C=a[O];if(C!==W){if(C>=h-1){a[O]=W,d++;continue}a[O+1+C]=p,a[O]=C+1,g++}}}}let b=0;for(let p=0;p<r;p++)for(let v=0;v<o;v++){const L=a[p*x+v*h],A=L===W?e:L;A>b&&(b=A)}c.overflow=d,c.max=b,c.refs=g}const Lt=["uFrame","uDesign","uCorner","uTime","uPx","uK","uBevel","uHeat","uAgit","uFlash","uCalm","uMode","uN","uA","uP","uR","uTiles","uTile","uSlots"],At={x:0,y:0,r:0,ax:0,ay:0,bx:0,by:0,box:0,hw:0,hh:0,cr:20,tar:0,glow:0,film:.34,sc:1,dx:0,dy:0,on:1,prio:1};function Pt(c={}){return{...At,...c}}function kt(c){const t=c.checkVisibility;return typeof t=="function"?!t.call(c,{opacityProperty:!0,visibilityProperty:!0}):!1}const R=()=>typeof devicePixelRatio=="number"&&devicePixelRatio>0?devicePixelRatio:1;class H{constructor(t,s,e){this.gl=t,this.gl2=s,this.ext=e}gl;gl2;ext;free=[];pending=[];sum=0;cnt=0;open=!1;static make(t,s){try{const e=t.getExtension(s?"EXT_disjoint_timer_query_webgl2":"EXT_disjoint_timer_query");return e?new H(t,s,e):null}catch{return null}}get fns(){return this.ext}begin(){if(this.open||this.pending.length>=4)return;const t=this.free.pop()??(this.gl2?this.gl.createQuery():this.fns.createQueryEXT?.call(this.ext));t&&(this.gl2?this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT,t):this.fns.beginQueryEXT?.call(this.ext,this.ext.TIME_ELAPSED_EXT,t),this.pending.push(t),this.open=!0)}end(){this.open&&(this.open=!1,this.gl2?this.gl.endQuery(this.ext.TIME_ELAPSED_EXT):this.fns.endQueryEXT?.call(this.ext,this.ext.TIME_ELAPSED_EXT))}poll(){const t=this.gl;for(;this.pending.length;){const s=this.pending[0];if(!(this.gl2?t.getQueryParameter(s,t.QUERY_RESULT_AVAILABLE):this.fns.getQueryObjectEXT?.call(this.ext,s,this.ext.QUERY_RESULT_AVAILABLE_EXT)))break;this.pending.shift();const i=t.getParameter(this.ext.GPU_DISJOINT_EXT),n=this.gl2?t.getQueryParameter(s,t.QUERY_RESULT):this.fns.getQueryObjectEXT?.call(this.ext,s,this.ext.QUERY_RESULT_EXT);!i&&typeof n=="number"&&n>0&&(this.sum+=n/1e6,this.cnt++),this.free.push(s)}}take(){const t=this.cnt?this.sum/this.cnt:null;return this.sum=this.cnt=0,t}destroy(){for(const t of[...this.free,...this.pending])this.gl2?this.gl.deleteQuery(t):this.fns.deleteQueryEXT?.call(this.ext,t);this.free=[],this.pending=[]}}function Dt(c){const t=c.trim();if(!t||t==="transparent")return 0;const s=/\/\s*([\d.]+)(%?)\s*\)$/.exec(t);if(s)return parseFloat(s[1])/(s[2]?100:1);const e=/^rgba\(([^)]*)\)$/.exec(t);if(e){const i=e[1].split(",");if(i.length===4)return parseFloat(i[3])}return 1}function St(c,t){if(typeof document.elementFromPoint!="function")return!1;const s=Math.max(t.left,0),e=Math.max(t.top,0),i=Math.min(t.right,innerWidth),n=Math.min(t.bottom,innerHeight);if(i-s<8||n-e<8)return!1;let o=null;for(let r=document.elementFromPoint((s+i)/2,(e+n)/2);r&&!r.contains(c);r=r.parentElement){const h=r.getBoundingClientRect();if(h.left>s+.5||h.top>e+.5||h.right<i-.5||h.bottom<n-.5)continue;const a=getComputedStyle(r);if(!(a.visibility!=="visible"||a.opacity!=="1"||Dt(a.backgroundColor)<.999)&&!(parseFloat(a.borderTopLeftRadius)||parseFloat(a.borderTopRightRadius)||parseFloat(a.borderBottomLeftRadius)||parseFloat(a.borderBottomRightRadius))){o=r;break}}if(!o)return!1;for(let r=o.parentElement;r&&!r.contains(c);r=r.parentElement)if(getComputedStyle(r).opacity!=="1")return!1;for(const[r,h]of[[s+2,e+2],[i-2,e+2],[s+2,n-2],[i-2,n-2]]){const a=document.elementFromPoint(r,h);if(!a||!o.contains(a))return!1}return!0}class It{canvas;opts;scene;time=0;modeV=0;gl=null;gl2=!1;progs=new Map;warming=new Map;warmAt=0;nbMax=0;buf=null;tileTex=null;grid=null;gridTex="";tilesK=-1;tilesDirty=!0;timer=null;blobs=[];anchors=new Map;particles=[];follows=[];ripples=[];Rb=new Float32Array(16);prevA=new Float32Array(0);prevP=new Float32Array(0);prevN=-1;_tier;manual=!1;cls;lv=0;q;dpr;lost=!1;dead=!1;paused=!1;onScreen=!0;occluded=!1;nextProbe=0;drewInWindow=!1;leave=null;startedAt=performance.now();last=performance.now();lastRender=0;fpsCount=0;fpsT0=performance.now();statsListeners=new Set;_stats;rect=null;layoutW=0;unit=1;dw=1;dh=1;mode="dark";modeObs=null;io=null;lastPackN=0;presented=!1;constructor(t,s){if(this.canvas=t,this.opts=s,this._tier=s.tier,this.cls=lt(s.profile,ht()),this.q=P(this.cls,s.tier,0,R()),this.dpr=this.q.dpr,this.scene=s.profile==="tv"?{heat:0,agit:0,flash:0,k:10,bevel:32}:{heat:0,agit:0,flash:0,k:8,bevel:22},!this.initGL()||!this.program(s.tier))throw this.gl=null,new Error("liquid: WebGL unavailable");t.addEventListener("webglcontextlost",this.onLost),t.addEventListener("webglcontextrestored",this.onRestored);const e=s.modeSource??document.documentElement,i=()=>e.getAttribute("data-mode")==="light"?"light":"dark";this.mode=i(),this.modeV=this.mode==="light"?1:0,this.modeObs=new MutationObserver(()=>{const n=document.documentElement.classList.contains("vx-vt");this.setMode(i(),!n)}),this.modeObs.observe(e,{attributes:!0,attributeFilter:["data-mode"]}),typeof IntersectionObserver=="function"&&(this.io=new IntersectionObserver(n=>{const o=n[n.length-1];o&&(this.onScreen=o.isIntersecting)}),this.io.observe(t)),this._stats={tier:this._tier,fps:0,frameMs:0,gpuMs:null,blobs:0,dpr:this.dpr,level:0,gl:this.gl2?2:1,mode:this.mode,lost:!1},this.member=this.makeMember(),this.leave=z.add(this.member),document.addEventListener("visibilitychange",this.onVisibility),w.ticker.add(this.tick)}initGL(){const t=this.opts.profile==="phone",s={alpha:!0,premultipliedAlpha:!0,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1,powerPreference:t?"low-power":"high-performance",failIfMajorPerformanceCaveat:t};let e=null,i=!1;try{e=this.canvas.getContext("webgl2",s),i=!!e,e||(e=this.canvas.getContext("webgl",s))}catch{e=null}if(!e)return!1;const n=Number(e.getParameter(e.MAX_FRAGMENT_UNIFORM_VECTORS))||0;if(this.nbMax=Math.min(72,Math.floor((n-24)/2)),this.nbMax<12)return!1;this.gl=e,this.gl2=i,this.progs.clear(),this.warming.clear(),this.warmAt=performance.now()+2500;const o=e.createBuffer();if(e.bindBuffer(e.ARRAY_BUFFER,o),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),this.buf=o,this.tileTex=null,this.gridTex="",this.tilesDirty=!0,i){const r=e;r.pixelStorei(r.UNPACK_ALIGNMENT,1);const h=r.createTexture();r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,h),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),this.tileTex=h}return this.timer?.destroy(),this.timer=H.make(e,i),!0}progKey(t,s){const e=Math.min(st[t].cap,this.nbMax);return{key:`${e}|${s?1:0}|${this.gl2?1:0}`,nb:e}}link(t,s){const e=this.gl;if(!e)return null;const i=this.gl2,n=e.createShader(e.VERTEX_SHADER),o=e.createShader(e.FRAGMENT_SHADER),r=e.createProgram();return!n||!o||!r?null:(e.shaderSource(n,i?wt:bt),e.shaderSource(o,yt({nb:t,low:s,tiles:i})),e.compileShader(n),e.compileShader(o),e.attachShader(r,n),e.attachShader(r,o),e.bindAttribLocation(r,0,"a"),e.linkProgram(r),{p:r,v:n,f:o,nb:t,tiles:i})}warm(){if(!this.gl||this._tier===0)return;const t=this._tier,s=[[t,!0]];this.cls==="phone"&&t>1&&!this.manual&&s.push([t-1,!0]);for(const[e,i]of s){const{key:n,nb:o}=this.progKey(e,i);if(this.progs.has(n)||this.warming.has(n))continue;const r=this.link(o,i);r&&this.warming.set(n,r)}}program(t,s=this.q.low){const e=this.gl;if(!e)return null;const{key:i,nb:n}=this.progKey(t,s),o=this.progs.get(i);if(o)return o;const r=this.warming.get(i)??this.link(n,s);if(this.warming.delete(i),!r)return null;const{p:h,tiles:a}=r;if(!e.getProgramParameter(h,e.LINK_STATUS)){for(const u of[r.v,r.f])e.getShaderParameter(u,e.COMPILE_STATUS)||console.warn("liquid shader:",e.getShaderInfoLog(u));return console.warn("liquid link:",e.getProgramInfoLog(h)),e.deleteProgram(h),null}const f={};for(const u of Lt)f[u]=e.getUniformLocation(h,u);a&&(e.useProgram(h),e.uniform1i(f.uTiles,0));const l={p:h,nb:n,tiles:a,u:f,A:new Float32Array(n*4),P:new Float32Array(n*4)};return this.progs.set(i,l),l}onLost=t=>{t.preventDefault(),this.lost=!0,this.progs.clear(),this.warming.clear(),this.timer=null,this.gl=null,this.refreshLive(),this.opts.onTier?.(0),this.emitStats()};onRestored=()=>{this.initGL()&&this._tier>0&&this.program(this._tier)&&(this.lost=!1,this.refreshLive(),this.opts.onTier?.(this._tier),this.emitStats())};onVisibility=()=>{this.last=performance.now(),z.reset(),document.hidden&&this.unpresent()};get tier(){return this.lost?0:this._tier}get live(){return!this.lost&&!this.dead&&this._tier>0}get stats(){return this._stats}get scale(){return this.unit}get size(){return{w:this.dw,h:this.dh}}onStats(t){return this.statsListeners.add(t),()=>this.statsListeners.delete(t)}setTier(t){if(t==="auto"){this.manual=!1;return}this.manual=!0,this.applyTier(t)}applyTier(t,s=0){t!==0&&!this.program(t,P(this.cls,t,s,R()).low)&&(t=0);const e=this._tier;this._tier=t,this.setLevel(s),this.refreshLive(),e!==t&&this.opts.onTier?.(t),this.emitStats()}setLevel(t){if(this.lv=t,this._tier!==0){for(this.q=P(this.cls,this._tier,t,R()),this.dpr=this.q.dpr;this.particles.length>this.q.fx;)this.killParticle(0);this.emitStats()}}pause(){this.paused=!0}resume(){this.paused=!1,this.last=performance.now()}setMode(t,s=!0){if(t===this.mode)return;this.mode=t;const e=t==="light"?1:0;w.killTweensOf(this,"modeV"),!s||_()?this.modeV=e:(w.to(this,{modeV:e,duration:.9,ease:"power2.inOut"}),this.ripple(this.dw/2,this.dh*.4,1.1)),this.emitStats()}add(t={}){const s=Pt(t);return this.blobs.push(s),s}circle(t,s,e,i={}){return this.add({...i,x:t,y:s,r:e})}pill(t,s,e,i,n={}){return this.add({...n,x:t,y:s,r:i,ax:-e,bx:e})}rbox(t,s,e,i,n,o={}){return this.add({...o,x:t,y:s,hw:e,hh:i,cr:n,box:1})}remove(t){w.killTweensOf(t);const s=this.blobs.indexOf(t);s>=0&&this.blobs.splice(s,1),this.anchors.delete(t),this.follows=this.follows.filter(e=>e.b!==t)}clearScene(){for(const t of this.blobs.slice())this.anchors.has(t)||this.remove(t);this.particles.length=0,this.follows.length=0,this.ripples.length=0,this.scene.heat=this.scene.agit=this.scene.flash=0}anchor(t,s={}){const e=performance.now()-this.startedAt,i=s.appear==="auto"||s.appear===void 0?e>400?"pour":"instant":s.appear,n=this.add({film:s.film??.34,tar:s.tar??0,glow:s.glow??0,prio:s.prio??0,box:s.shape==="box"?1:0,sc:i==="pour"?0:1}),o={b:n,el:t,shape:s.shape??"pill",pad:s.pad??0,cr:s.cr??null,state:"",want:""};if(o.shape==="box"&&o.cr===null){const r=parseFloat(getComputedStyle(t).borderTopLeftRadius);o.cr=Number.isFinite(r)?r:20}return this.anchors.set(n,o),this.measureAnchor(o),i==="pour"&&w.to(n,{sc:1,duration:_()?.3:.75,ease:_()?"power2.out":"back.out(1.7)",delay:.04}),this.setLq(o,"off"),n}release(t,s=!0){const e=this.anchors.get(t);if(e&&(this.setLq(e,""),this.anchors.delete(t)),!s||!this.live){this.remove(t);return}w.killTweensOf(t,"sc"),w.to(t,{sc:0,duration:.28,ease:"power2.in",onComplete:()=>this.remove(t)})}follow(t,s,e=0,i=0){const n={el:t,b:s,ox:e,oy:i,last:""};return this.follows.push(n),()=>{this.follows=this.follows.filter(o=>o!==n)}}ripple(t,s,e=1){_()&&(e*=.4),this.ripples.push({x:t,y:s,t:0,s:e}),this.ripples.length>4&&this.ripples.shift()}flash(t){this.scene.flash=Math.max(this.scene.flash,_()?t*.3:t)}droplet(t){if(!this.live||this.particles.length>=this.q.fx)return null;const s=this.add({x:t.x,y:t.y,r:t.r,tar:t.tar??0,glow:t.glow??0,film:t.film??.5,prio:2});return this.particles.push({b:s,vx:t.vx??0,vy:t.vy??0,g:t.g??1400,k:t.k??0,px:t.px??0,py:t.py??0,damp:t.damp??0,life:t.life??1,t:0,r0:t.r}),s}splash(t,s,e,i,n=!1){_()&&(i=Math.min(i,2));for(let o=0;o<i;o++){const r=T()*at,h=(n?1050:720)*(.6+T()*.6);this.droplet({x:t+Math.cos(r)*e*.85,y:s+Math.sin(r)*e*.85,vx:Math.cos(r)*h,vy:Math.sin(r)*h,r:(n?11:7)*(.7+T()*.6),g:0,k:24,px:t,py:s,damp:1.6,life:1.05+T()*.35,film:.6})}}fountain(t,s,e,i,n={}){_()&&(i=Math.min(i,3));for(let o=0;o<i;o++){const r=-Math.PI/2+(T()-.5)*(n.spread??2.2),h=(n.sp??620)*(.65+T()*.6);this.droplet({x:t+(T()-.5)*e,y:s,vx:Math.cos(r)*h,vy:Math.sin(r)*h,r:(n.r??8)*(.7+T()*.6),g:n.g??1500,life:(n.life??1.2)+T()*.4,film:n.film??.8,glow:n.glow??0,tar:n.tar??0})}}measure(t){const s=this.rect??this.canvas.getBoundingClientRect(),e=this.unitFor(s),i=t.getBoundingClientRect();return{x:(i.left-s.left+i.width/2)/e,y:(i.top-s.top+i.height/2)/e,w:i.width/e,h:i.height/e}}toLocal(t,s){const e=this.rect??this.canvas.getBoundingClientRect(),i=this.unitFor(e);return{x:(t-e.left)/i,y:(s-e.top)/i}}destroy(){if(this.dead)return;this.dead=!0,w.ticker.remove(this.tick),this.leave?.(),this.leave=null,w.killTweensOf(this.blobs),w.killTweensOf(this),w.killTweensOf(this.scene);for(const s of this.anchors.values())this.setLq(s,"");this.anchors.clear(),this.modeObs?.disconnect(),this.io?.disconnect(),document.removeEventListener("visibilitychange",this.onVisibility),this.canvas.removeEventListener("webglcontextlost",this.onLost),this.canvas.removeEventListener("webglcontextrestored",this.onRestored);const t=this.gl;if(t){this.timer?.destroy();for(const s of this.progs.values())t.deleteProgram(s.p);for(const s of this.warming.values())t.deleteProgram(s.p);this.buf&&t.deleteBuffer(this.buf),this.tileTex&&t.deleteTexture(this.tileTex),t.getExtension("WEBGL_lose_context")?.loseContext()}this.timer=null,this.gl=null,this.statsListeners.clear()}unitFor(t){const s=this.opts.designWidth;if(s&&t.width>0)return t.width/s;const e=this.layoutW||this.canvas.offsetWidth;return e>0&&t.width>0?t.width/e:1}setLq(t,s){t.state!==s&&(t.state=s,s===""?t.el.removeAttribute("data-lq"):t.el.setAttribute("data-lq",s))}unpresent(){this.presented=!1,this.canvas.style.visibility="hidden";for(const t of this.anchors.values())t.want="",this.setLq(t,"off")}present(){this.presented||(this.presented=!0,this.canvas.style.visibility="");for(const t of this.anchors.values())t.want&&this.setLq(t,t.want)}refreshLive(){this.live||this.unpresent()}measureAnchor(t){const s=this.rect??this.canvas.getBoundingClientRect(),e=this.unitFor(s),i=t.b;if(!t.el.isConnected)return!1;const n=t.el.getBoundingClientRect();if(n.width<.5||n.height<.5||kt(t.el)||n.right<s.left-40||n.left>s.right+40||n.bottom<s.top-40||n.top>s.bottom+40)return!1;const o=n.width/e+t.pad*2,r=n.height/e+t.pad*2;if(i.x=(n.left-s.left)/e+n.width/e/2,i.y=(n.top-s.top)/e+n.height/e/2,t.shape==="circle")i.r=Math.min(o,r)/2,i.ax=i.bx=i.ay=i.by=0;else if(t.shape==="pill")if(o>=r){const h=r/2;i.r=h,i.ax=-(o/2-h),i.bx=o/2-h,i.ay=i.by=0}else{const h=o/2;i.r=h,i.ay=-(r/2-h),i.by=r/2-h,i.ax=i.bx=0}else i.hw=o/2,i.hh=r/2,i.cr=Math.min(t.cr??20,i.hw,i.hh);return!0}killParticle(t){const s=this.particles[t];if(!s)return;this.particles.splice(t,1);const e=this.blobs.indexOf(s.b);e>=0&&this.blobs.splice(e,1)}simulate(t){for(let e=this.particles.length-1;e>=0;e--){const i=this.particles[e],n=i.b;if(i.t+=t,i.k&&(i.vx+=(i.px-n.x)*i.k*t,i.vy+=(i.py-n.y)*i.k*t),i.damp){const a=Math.exp(-i.damp*t);i.vx*=a,i.vy*=a}i.vy+=i.g*t,n.x+=i.vx*t,n.y+=i.vy*t;const o=Math.hypot(i.vx,i.vy),r=o>1?Math.min(o*.022,n.r*2.2):0;n.ax=o>1?-i.vx/o*r:0,n.ay=o>1?-i.vy/o*r:0;const h=i.t/i.life;n.r=i.r0*(h<.65?1:Math.max(0,1-(h-.65)/.35)),(h>=1||n.y>this.dh+140)&&this.killParticle(e)}for(const e of this.ripples)e.t+=t;this.ripples=this.ripples.filter(e=>e.t<2.6);const s=this.scene;s.flash*=Math.exp(-t*3.2),s.flash<.002&&(s.flash=0)}pack(t,s){const e=t.A,i=t.P,n=Math.min(t.nb,s),o=this.scene.k*3+40;let r=0;for(let h=0;h<=2;h++)for(const a of this.blobs){if((a.prio<=0?0:a.prio>=2?2:Math.round(a.prio))!==h||!a.on||a.sc<=.002)continue;const l=this.anchors.get(a),u=a.x+a.dx,x=a.y+a.dy;let d=!0,g=0;if(a.box){const b=a.hw*a.sc,p=a.hh*a.sc;(b<.5||p<.5)&&(d=!1),g=Math.max(b,p)}else{const b=a.r*a.sc;b<.4&&(d=!1),g=b+Math.max(Math.abs(a.ax),Math.abs(a.bx),Math.abs(a.ay),Math.abs(a.by))*a.sc}if(d&&(u+g<-o||u-g>this.dw+o||x+g<-o||x-g>this.dh+o)&&(d=!1),!d)continue;if(r>=n){l&&(l.want="off");continue}l&&(l.want="live");const m=r*4;if(a.box){const b=a.hw*a.sc,p=a.hh*a.sc;e[m]=u,e[m+1]=x,e[m+2]=b,e[m+3]=p,i[m]=-Math.max(.5,Math.min(a.cr*a.sc,b,p))}else e[m]=u+a.ax*a.sc,e[m+1]=x+a.ay*a.sc,e[m+2]=u+a.bx*a.sc,e[m+3]=x+a.by*a.sc,i[m]=a.r*a.sc;i[m+1]=a.tar,i[m+2]=a.glow,i[m+3]=a.film,r++}return r}changed(t,s){const e=s*4;let i=s!==this.prevN;if(this.prevA.length<t.A.length&&(this.prevA=new Float32Array(t.A.length),this.prevP=new Float32Array(t.P.length),i=!0),!i){for(let n=0;n<e;n++)if(Math.abs(t.A[n]-this.prevA[n])>.05||Math.abs(t.P[n]-this.prevP[n])>.002){i=!0;break}}return i&&(this.prevA.set(t.A.subarray(0,e)),this.prevP.set(t.P.subarray(0,e)),this.prevN=s),i}tick=()=>{const t=performance.now(),s=t-this.last;if(this.last=t,this.dead||(z.frame(w.ticker.frame,t),this.paused||document.hidden||!this.onScreen||!this.live||!this.gl))return;this.timer?.poll();const e=Math.min(s/1e3,.05),i=this.canvas.getBoundingClientRect();if(this.rect=i,this.layoutW=this.canvas.offsetWidth,t>=this.nextProbe){const d=this.occluded;this.occluded=St(this.canvas,i),this.nextProbe=t+(this.occluded?250:500),this.occluded&&!d&&this.unpresent()}if(this.occluded)return;this.time+=e,this.unit=this.unitFor(i),this.dw=Math.max(1,i.width/this.unit),this.dh=Math.max(1,i.height/this.unit);for(const d of this.anchors.values())this.measureAnchor(d)?d.b.on=1:d.b.on=0;this.simulate(e);for(const d of this.follows){const g=d.b,m=`translate3d(${(g.x+g.dx+d.ox).toFixed(1)}px,${(g.y+g.dy+d.oy).toFixed(1)}px,0)`;m!==d.last&&(d.el.style.transform=m,d.last=m)}const n=this._tier;this.q=P(this.cls,n,this.lv,R()),this.dpr=this.q.dpr;const o=this.program(n);if(!o){this.applyTier(0);return}const r=this.pack(o,this.q.cap);this.lastPackN=r;const h=this.scene,a=this.changed(o,r);a&&(this.tilesDirty=!0);const f=a||this.ripples.length>0||this.particles.length>0||h.flash>0||h.agit>.001||h.heat>.001||this.modeV>.001&&this.modeV<.999,l=this.q.fps<60?1e3/this.q.fps-4:0,u=this.opts.profile==="phone"||n===1?1e3/30-4:0,x=Math.max(l,f?0:u);t-this.lastRender<x||(this.lastRender=t,this.draw(o,r),this.present(),z.drew(),this.warmAt&&t>=this.warmAt&&(this.warmAt=0,this.warm()),this.drewInWindow=!0,this.fpsCount++,t-this.fpsT0>=1e3&&(this._stats={...this._stats,fps:Math.round(this.fpsCount*1e3/(t-this.fpsT0)),blobs:r},this.fpsCount=0,this.fpsT0=t,this.emitStats()))};tiles(t,s,e){const i=Rt(this.dw,this.dh,this.grid),n=`${i.tx*i.slots}x${i.ty}`;return(i!==this.grid||this.tilesDirty||this.tilesK!==this.scene.k||n!==this.gridTex)&&(this.grid=i,_t(i,s.A,s.P,e,this.scene.k),this.tilesK=this.scene.k,this.tilesDirty=!1,t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,this.tileTex),n!==this.gridTex?(t.texImage2D(t.TEXTURE_2D,0,t.R8UI,i.tx*i.slots,i.ty,0,t.RED_INTEGER,t.UNSIGNED_BYTE,i.data),this.gridTex=n):t.texSubImage2D(t.TEXTURE_2D,0,0,0,i.tx*i.slots,i.ty,t.RED_INTEGER,t.UNSIGNED_BYTE,i.data)),i}draw(t,s){const e=this.gl,i=this.rect;if(!e||!i)return;const n=Math.max(1,Math.round(i.width*this.dpr)),o=Math.max(1,Math.round(i.height*this.dpr));(this.canvas.width!==n||this.canvas.height!==o)&&(this.canvas.width=n,this.canvas.height=o);const r=_(),h=this.scene,a=this.Rb;a.fill(0),this.ripples.forEach((u,x)=>{a[x*4]=u.x,a[x*4+1]=u.y,a[x*4+2]=u.t,a[x*4+3]=u.s});const f=t.tiles?this.tiles(e,t,s):null;this.timer?.begin(),e.viewport(0,0,n,o),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),e.useProgram(t.p);const l=t.u;e.uniform4f(l.uFrame,0,0,n,o),e.uniform2f(l.uDesign,this.dw,this.dh),e.uniform1f(l.uCorner,this.opts.corner??0),e.uniform1f(l.uTime,this.time*(r?.4:1)),e.uniform1f(l.uPx,this.dw/n),e.uniform1f(l.uK,h.k),e.uniform1f(l.uBevel,h.bevel),e.uniform1f(l.uHeat,h.heat),e.uniform1f(l.uAgit,r?h.agit*.3:h.agit),e.uniform1f(l.uFlash,r?h.flash*.3:h.flash),e.uniform1f(l.uCalm,r?.35:1),e.uniform1f(l.uMode,this.modeV),e.uniform1i(l.uN,s),e.uniform4fv(l.uA,t.A),e.uniform4fv(l.uP,t.P),e.uniform4fv(l.uR,a),f&&(e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.tileTex),e.uniform3f(l.uTile,f.ts,f.tx,f.ty),e.uniform1i(l.uSlots,f.slots)),e.drawArrays(e.TRIANGLES,0,3),this.timer?.end()}member;makeMember(){return{importance:this.opts.profile==="tv"?3:this.canvas.parentElement?.classList.contains("lq-contained")?2:1,pixels:()=>this.canvas.width*this.canvas.height,active:()=>this.drewInWindow&&this.live,nextIsResolution:()=>{if(this._tier===0)return!1;const t=this._tier,s=B(this.cls,t,this.lv,1,R());return s===null||P(this.cls,t,s,R()).dpr<this.q.dpr-.001},canDegrade:()=>{if(this._tier===0)return!1;const t=this._tier;return B(this.cls,t,this.lv,1,R())!==null||!this.manual&&this.cls==="phone"&&t>1},degrade:()=>this.stepDown(),recover:()=>this.stepUp(),takeGpu:()=>this.timer?this.timer.take():null,drop:()=>this.applyTier(0),report:(t,s)=>{this.drewInWindow=!1,this._stats={...this._stats,frameMs:Math.round(t*10)/10,gpuMs:s===null?null:Math.round(s*10)/10},this.emitStats()}}}stepDown(){if(this._tier===0)return!1;const t=this._tier,s=B(this.cls,t,this.lv,1,R());return s!==null?(this.setLevel(s),!0):!this.manual&&this.cls==="phone"&&t>1?(this.applyTier(t-1,0),!0):!1}stepUp(){if(this._tier===0)return!1;const t=this._tier,s=B(this.cls,t,this.lv,-1,R());if(s!==null)return this.setLevel(s),!0;if(!this.manual&&this.cls==="phone"&&t<this.opts.maxTier){const e=t+1;return this.applyTier(e,Q(this.cls,e).length-1),!0}return!1}emitStats(){this._stats={...this._stats,tier:this.tier,dpr:Math.round(this.dpr*100)/100,level:this.lv,gl:this.gl2?2:1,mode:this.mode,lost:this.lost,blobs:this.lastPackN};for(const t of this.statsListeners)t(this._stats)}}export{It as LiquidEngine,st as TIERS,Dt as cssAlpha,Pt as makeBlob};
