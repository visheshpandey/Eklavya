// The microphone as a smooth, glossy sphere. A clear-coated physical material on a finely subdivided icosphere; the surface breathes with a very low, very
// slow simplex noise (never more than 0.08 of the radius) whose strength follows the live voice level, smoothed so it can never spike. The normals are
// recomputed after the displacement so the highlights stay clean. Terracotta while the student talks, deep green while Eklavya speaks, a calm breathing
// scale when it is quiet, and a soft glow ring behind it.
import { PALETTE } from './env.js';
import { THREE, createStage } from './scene-kit.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const MAX_DISPLACEMENT = 0.08;

const NOISE = /* glsl */ `
  vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;} vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
  vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);} vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
    vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
    float n_=.142857142857; vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
    vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3))); p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
    return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
  uniform float uTime; uniform float uAmp;
  vec3 displace(vec3 p){ vec3 n = normalize(p); float d = snoise(n * 0.95 + vec3(0., uTime * 0.18, uTime * 0.1)) * uAmp; return n * (1.0 + d); }
`;

const LOOKS = {   // [body, glow]
  quiet: [new THREE.Color('#1f3a31'), new THREE.Color(PALETTE.greenSoft)],
  student: [new THREE.Color(PALETTE.terracotta), new THREE.Color('#e0a07f')],
  speaking: [new THREE.Color('#2f6b4a'), new THREE.Color('#8fc9a3')],
  connecting: [new THREE.Color('#7a5c2a'), new THREE.Color(PALETTE.gold)],
};

export function createOrb(host) {
  const stage = createStage(host, { fov: 30, position: [0, 0, 5.8], target: [0, 0, 0], shadows: false, floor: false });
  const pmrem = new THREE.PMREMGenerator(stage.renderer);
  stage.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  stage.scene.environmentIntensity = 0.7;

  const uniforms = { uTime: { value: 0 }, uAmp: { value: 0.02 } };
  const material = new THREE.MeshPhysicalMaterial({ color: LOOKS.quiet[0].clone(), roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, sheen: 0.3, sheenColor: new THREE.Color('#ffffff') });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${NOISE}`)
      .replace('#include <beginnormal_vertex>', `
        vec3 pn = normalize(position);
        vec3 tA = normalize(cross(pn, abs(pn.y) > 0.9 ? vec3(1., 0., 0.) : vec3(0., 1., 0.)));
        vec3 tB = cross(pn, tA);
        float e = 0.02;
        vec3 p0 = displace(pn), p1 = displace(normalize(pn + tA * e)), p2 = displace(normalize(pn + tB * e));
        vec3 objectNormal = normalize(cross(p1 - p0, p2 - p0));
        if (dot(objectNormal, pn) < 0.) objectNormal = -objectNormal;
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`)
      .replace('#include <begin_vertex>', 'vec3 transformed = displace(position);');
  };
  const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 32), material);   // detail 32: smooth enough that no facets show
  stage.scene.add(sphere);

  // the glow ring behind it: a soft radial sprite
  const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 128;
  const g = glowCanvas.getContext('2d'), gradient = g.createRadialGradient(64, 64, 18, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,0.0)'); gradient.addColorStop(0.55, 'rgba(255,255,255,0.55)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient; g.fillRect(0, 0, 128, 128);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: LOOKS.quiet[1].clone(), transparent: true, opacity: 0.35, depthWrite: false }));
  glow.scale.set(3.1, 3.1, 1); glow.position.z = -0.8;
  stage.scene.add(glow);

  let state = 'idle', level = 0, shown = 0;
  stage.add({ run(delta, time) {
    shown += (level - shown) * Math.min(1, delta * 6);   // slow and smooth: a loud syllable never snaps the surface
    uniforms.uTime.value = time;
    uniforms.uAmp.value = Math.min(MAX_DISPLACEMENT, 0.018 + shown * 0.06);
    const look = state === 'connecting' ? LOOKS.connecting : state === 'speaking' ? LOOKS.speaking : state === 'listening' && shown > 0.05 ? LOOKS.student : LOOKS.quiet;
    material.color.lerp(look[0], Math.min(1, delta * 4)); glow.material.color.lerp(look[1], Math.min(1, delta * 4));
    glow.material.opacity += ((state === 'idle' ? 0.22 : 0.32 + shown * 0.4) - glow.material.opacity) * Math.min(1, delta * 4);
    const breathe = 1 + Math.sin(time * 1.4) * (state === 'idle' ? 0.03 : 0.015) + shown * 0.05;
    sphere.scale.setScalar(breathe); glow.scale.setScalar(3.1 * (1 + shown * 0.18));
    sphere.rotation.y = time * 0.12;
  } });
  return {
    setLevel(next) { level = Math.max(0, Math.min(1, next)); },
    setState(next) { state = next; },
    dispose() { pmrem.dispose(); glowTexture.dispose(); stage.dispose(); },
  };
}
