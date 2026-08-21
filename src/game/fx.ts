import * as THREE from 'three';

// ============================================================
//  次世代水墨特效引擎
//  - GPU 软粒子系统（辉光/墨云 双通道）
//  - 加色辉光、墨迹残影、全屏闪光、冲击波环
// ============================================================

const MAXP = 1200;
const glyphCache = new Map<string, THREE.CanvasTexture>();
let runeTex: THREE.CanvasTexture | null = null;

function makeTex(kind: 'glow' | 'ink'): THREE.CanvasTexture {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const c = S / 2;
  if (kind === 'glow') {
    const gr = g.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.18)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  } else {
    for (let i = 0; i < 9; i++) {
      const x = c + (Math.random() - 0.5) * S * 0.8;
      const y = c + (Math.random() - 0.5) * S * 0.8;
      const r = S * (0.07 + Math.random() * 0.17);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(28,22,16,0.85)');
      gr.addColorStop(1, 'rgba(28,22,16,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 横向能量纹理：中心白热、两端收束，专供刀光和高速弹道。 */
function makeBeamTex(): THREE.CanvasTexture {
  const W = 256, H = 64;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  const along = g.createLinearGradient(0, 0, W, 0);
  along.addColorStop(0, 'rgba(255,255,255,0)');
  along.addColorStop(0.12, 'rgba(255,255,255,.56)');
  along.addColorStop(0.48, 'rgba(255,255,255,1)');
  along.addColorStop(0.86, 'rgba(255,255,255,.7)');
  along.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = along; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-in';
  const across = g.createLinearGradient(0, 0, 0, H);
  across.addColorStop(0, 'rgba(255,255,255,0)');
  across.addColorStop(0.34, 'rgba(255,255,255,.36)');
  across.addColorStop(0.5, 'rgba(255,255,255,1)');
  across.addColorStop(0.66, 'rgba(255,255,255,.36)');
  across.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = across; g.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 八卦星盘纹理：技能蓄能、锁定与领域效果的共同高级视觉语言。 */
function makeRuneTex(): THREE.CanvasTexture {
  if (runeTex) return runeTex;
  const S = 512;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d')!; const c = S / 2;
  g.translate(c, c); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round';
  for (const [r, w, dash] of [[218, 4, [22, 13]], [178, 2, [6, 14]], [116, 3, [30, 10]], [62, 2, [8, 9]]] as const) {
    g.lineWidth = w; g.setLineDash([...dash]); g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
  }
  g.setLineDash([]);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6; const ca = Math.cos(a), sa = Math.sin(a);
    g.lineWidth = i % 3 === 0 ? 4 : 2;
    g.beginPath(); g.moveTo(ca * 132, sa * 132); g.lineTo(ca * 205, sa * 205); g.stroke();
    const r = i % 2 ? 157 : 190;
    g.save(); g.translate(ca * r, sa * r); g.rotate(a + Math.PI / 2);
    g.strokeRect(-12, -5, 24, 10); g.restore();
  }
  g.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 3;
    const x = Math.cos(a) * 105, y = Math.sin(a) * 105;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath(); g.stroke();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  runeTex = tex;
  return tex;
}

function makeGlyph(text: string, color: string): THREE.CanvasTexture {
  const key = `${text}:${color}`;
  const cached = glyphCache.get(key);
  if (cached) return cached;
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, S, S);
  g.font = `900 184px "STKaiti","KaiTi","Songti SC","SimSun",serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 14;
  g.strokeStyle = 'rgba(24,16,10,0.72)';
  g.strokeText(text, S / 2, S / 2 + 8);
  g.fillStyle = color;
  g.fillText(text, S / 2, S / 2 + 8);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  glyphCache.set(key, tex);
  return tex;
}

export interface EmitOpts {
  x: number; y: number; z?: number;
  vx?: number; vy?: number; vz?: number;
  life?: number; size0?: number; size1?: number;
  a0?: number; a1?: number;
  color?: string; drag?: number; grav?: number;
}

/** GPU 粒子场（固定缓冲池，零 GC 压力） */
class ParticleField {
  points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;
  private uScale: { value: number };
  private px = new Float32Array(MAXP); private py = new Float32Array(MAXP); private pz = new Float32Array(MAXP);
  private vx = new Float32Array(MAXP); private vy = new Float32Array(MAXP); private vz = new Float32Array(MAXP);
  private cr = new Float32Array(MAXP); private cg = new Float32Array(MAXP); private cb = new Float32Array(MAXP);
  private sz0 = new Float32Array(MAXP); private sz1 = new Float32Array(MAXP);
  private al0 = new Float32Array(MAXP); private al1 = new Float32Array(MAXP);
  private life = new Float32Array(MAXP); private max = new Float32Array(MAXP);
  private drag = new Float32Array(MAXP); private grav = new Float32Array(MAXP);
  private alive = new Uint8Array(MAXP);
  private cursor = 0;
  private disposed = false;

  constructor(scene: THREE.Scene, tex: THREE.Texture, additive: boolean) {
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAXP), 1));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(MAXP), 1));
    this.uScale = { value: 60 };
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex }, uScale: this.uScale },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uScale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          gl_PointSize = aSize * uScale;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          if (t.a < 0.01) discard;
          gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  setScale(s: number) { this.uScale.value = s; }

  emit(o: EmitOpts) {
    if (this.disposed) return;
    let slot = -1;
    for (let n = 0; n < MAXP; n++) {
      this.cursor = (this.cursor + 1) % MAXP;
      if (!this.alive[this.cursor]) { slot = this.cursor; break; }
    }
    if (slot < 0) return;
    const col = new THREE.Color(o.color || '#ffffff');
    this.px[slot] = o.x; this.py[slot] = o.y; this.pz[slot] = o.z ?? 0.5;
    this.vx[slot] = o.vx ?? 0; this.vy[slot] = o.vy ?? 0; this.vz[slot] = o.vz ?? 0;
    this.cr[slot] = col.r; this.cg[slot] = col.g; this.cb[slot] = col.b;
    this.sz0[slot] = o.size0 ?? 0.3; this.sz1[slot] = o.size1 ?? 0.1;
    this.al0[slot] = o.a0 ?? 0.8; this.al1[slot] = o.a1 ?? 0;
    this.max[slot] = o.life ?? 0.5; this.life[slot] = this.max[slot];
    this.drag[slot] = o.drag ?? 0.92; this.grav[slot] = o.grav ?? 0;
    this.alive[slot] = 1;
  }

  update(dt: number) {
    if (this.disposed) return;
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const col = this.geo.attributes.aColor as THREE.BufferAttribute;
    const sz = this.geo.attributes.aSize as THREE.BufferAttribute;
    const al = this.geo.attributes.aAlpha as THREE.BufferAttribute;
    for (let i = 0; i < MAXP; i++) {
      if (!this.alive[i]) { al.array[i] = 0; continue; }
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alive[i] = 0; al.array[i] = 0; continue; }
      const d = Math.pow(this.drag[i], dt * 60);
      this.vx[i] *= d; this.vy[i] *= d; this.vz[i] *= d;
      this.vy[i] -= this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      const k = 1 - this.life[i] / this.max[i];
      pos.array[i * 3] = this.px[i];
      pos.array[i * 3 + 1] = this.py[i];
      pos.array[i * 3 + 2] = this.pz[i];
      col.array[i * 3] = this.cr[i];
      col.array[i * 3 + 1] = this.cg[i];
      col.array[i * 3 + 2] = this.cb[i];
      sz.array[i] = this.sz0[i] + (this.sz1[i] - this.sz0[i]) * k;
      al.array[i] = this.al0[i] + (this.al1[i] - this.al0[i]) * k;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    sz.needsUpdate = true;
    al.needsUpdate = true;
  }

  dispose(scene: THREE.Scene) {
    if (this.disposed) return;
    this.disposed = true;
    scene.remove(this.points);
    this.geo.dispose();
    this.mat.dispose();
  }
}

interface FadeMesh {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number; max: number;
  baseA: number; grow: number; spin?: number;
}

interface Mote { x: number; y: number; vy: number; life: number; t: number }

export interface FxHooks {
  punch?: (a: number) => void;
  shake?: (m: number, t: number) => void;
}

export class FxEngine {
  scene: THREE.Scene;
  private glowTex: THREE.Texture;
  private inkTex: THREE.Texture;
  private beamTex: THREE.Texture;
  private glowField: ParticleField;
  private inkField: ParticleField;
  private fades: FadeMesh[] = [];
  private motes: Mote[] = [];
  private respawnT = 0;
  private environment = 0;
  private disposed = false;
  private timers = new Set<number>();
  hooks: FxHooks = {};

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.glowTex = makeTex('glow');
    this.inkTex = makeTex('ink');
    this.beamTex = makeBeamTex();
    this.glowField = new ParticleField(scene, this.glowTex, true);
    this.inkField = new ParticleField(scene, this.inkTex, false);
    for (let i = 0; i < 12; i++) {
      this.motes.push({ x: (Math.random() - 0.5) * 11, y: 5 + Math.random() * 3, vy: -(0.04 + Math.random() * 0.06), life: 6 + Math.random() * 6, t: Math.random() * 0.4 });
    }
  }

  setScale(s: number) { if (!this.disposed) { this.glowField.setScale(s); this.inkField.setScale(s); } }

  setEnvironment(chapter: number) { this.environment = chapter; }

  /** 可回收的分镜调度，技能结束或离开战斗后不会再残留回调。 */
  private later(delay: number, fn: () => void) {
    if (this.disposed) return;
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      if (!this.disposed) fn();
    }, delay);
    this.timers.add(id);
  }

  update(dt: number) {
    if (this.disposed) return;
    this.glowField.update(dt);
    this.inkField.update(dt);
    for (let i = this.fades.length - 1; i >= 0; i--) {
      const f = this.fades[i];
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      f.mat.opacity = f.baseA * k * k;
      if (f.grow > 0) f.mesh.scale.setScalar(1 + (1 - k) * f.grow);
      if (f.spin) f.mesh.rotation.z += f.spin * dt;
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.mat.dispose();
        this.fades.splice(i, 1);
      }
    }
    // 空气中飘浮的墨尘
    this.respawnT -= dt;
    if (this.respawnT <= 0) {
      this.respawnT = 0.8;
      const dead = this.motes.find(m => m.life <= 0);
      if (dead) { dead.x = (Math.random() - 0.5) * 11; dead.y = 6.5; dead.life = 8; dead.t = 0; }
    }
    for (const m of this.motes) {
      if (m.life <= 0) continue;
      m.life -= dt; m.y += m.vy * dt; m.t -= dt;
      if (m.t <= 0) {
        m.t = 0.5;
        const moteColor = this.environment === 1 ? '#55727a'
          : this.environment === 2 ? '#5a3020'
            : this.environment === 3 ? '#486b7b' : '#4a3d2c';
        this.inkField.emit({
          x: m.x + (Math.random() - 0.5) * 0.4, y: m.y, z: 0.1,
          life: 2.2, size0: 0.1, size1: 0.34, a0: 0.07, a1: 0, color: moteColor,
        });
        if (this.environment === 2 && Math.random() < 0.55) {
          this.glowField.emit({
            x: m.x, y: m.y - 0.1, z: 0.25, vy: 0.32 + Math.random() * 0.35,
            life: 0.7 + Math.random() * 0.45, size0: 0.11, size1: 0.02,
            a0: 0.7, a1: 0, color: Math.random() < 0.5 ? '#f97316' : '#facc15', drag: 0.97,
          });
        }
        if (this.environment === 3 && Math.random() < 0.34) {
          this.glowField.emit({
            x: m.x, y: m.y, z: 0.2, vy: -0.12,
            life: 1.2, size0: 0.08, size1: 0.02, a0: 0.35, a1: 0, color: '#b7e3ec', drag: 0.99,
          });
        }
      }
    }
  }

  // ---------- 基础图元 ----------

  /** 加色辉光粒子爆发 */
  burst(x: number, y: number, color: string, count: number, speed: number, size: number, life = 0.5, grav = 0) {
    if (this.disposed) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.35 + Math.random() * 0.9);
      this.glowField.emit({
        x, y, z: 0.4,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: (Math.random() - 0.5) * sp * 0.5,
        life: life * (0.55 + Math.random() * 0.75),
        size0: size * (0.55 + Math.random() * 0.9), size1: size * 0.18,
        a0: 0.95, a1: 0, color, drag: 0.9, grav,
      });
    }
  }

  /** 墨云散逸（正常混合，暗色） */
  cloud(x: number, y: number, color: string, count: number, spread: number, life = 0.9) {
    if (this.disposed) return;
    for (let i = 0; i < count; i++) {
      this.inkField.emit({
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * spread,
        z: 0.3,
        vx: (Math.random() - 0.5) * 1.6, vy: (Math.random() - 0.5) * 1.6,
        life: life * (0.6 + Math.random() * 0.8),
        size0: 0.35 + Math.random() * 0.5, size1: 1.1 + Math.random() * 0.9,
        a0: 0.5, a1: 0, color,
      });
    }
  }

  /** 辉光拖尾/光束 */
  streak(x1: number, y1: number, x2: number, y2: number, color: string, w: number, life = 0.16, baseA = 0.95) {
    if (this.disposed) return;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 0.02) return;
    const mat = new THREE.MeshBasicMaterial({
      map: this.beamTex, color: new THREE.Color(color),
      transparent: true, opacity: baseA,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), mat);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0.9);
    m.rotation.z = Math.atan2(y2 - y1, x2 - x1);
    this.scene.add(m);
    this.fades.push({ mesh: m, mat, life, max: life, baseA, grow: 0.25 });
  }

  /** 速度切线：带粗细分层的白热核心，比单根直线更像真实能量轨迹。 */
  blade(x1: number, y1: number, x2: number, y2: number, color: string, width = 0.16, life = 0.24) {
    this.streak(x1, y1, x2, y2, color, width * 2.5, life * 1.35, 0.28);
    this.streak(x1, y1, x2, y2, color, width, life, 0.96);
    this.streak(x1, y1, x2, y2, '#ffffff', width * 0.28, life * 0.72, 1);
  }

  /** 放射速度线，作为重击时的空间压缩感。 */
  rays(x: number, y: number, color: string, radius: number, count = 12, life = 0.28, phase = 0) {
    for (let i = 0; i < count; i++) {
      const a = phase + i * Math.PI * 2 / count + (Math.random() - 0.5) * 0.08;
      const inner = radius * (0.18 + Math.random() * 0.12);
      const outer = radius * (0.72 + Math.random() * 0.28);
      this.streak(x + Math.cos(a) * inner, y + Math.sin(a) * inner,
        x + Math.cos(a) * outer, y + Math.sin(a) * outer,
        i % 3 === 0 ? '#ffffff' : color, i % 3 === 0 ? 0.055 : 0.025, life * (0.8 + Math.random() * 0.4), 0.85);
    }
  }

  /** 旋转阵盘；使用稀疏线纹，不会盖住棋子和血条。 */
  rune(x: number, y: number, radius: number, color: string, life = 0.65, spin = 1.5, baseA = 0.82) {
    if (this.disposed) return;
    const mat = new THREE.MeshBasicMaterial({ map: makeRuneTex(), color: new THREE.Color(color), transparent: true,
      opacity: baseA, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
    m.position.set(x, y, 1.12); m.rotation.z = Math.random() * Math.PI;
    this.scene.add(m);
    this.fades.push({ mesh: m, mat, life, max: life, baseA, grow: 0.28, spin });
  }

  /** 锥形能量面，用于扇形斩击和冲锋前方的空间撕裂。 */
  cone(x: number, y: number, r: number, facing: number, span: number, color: string, life = 0.32, baseA = 0.35) {
    if (this.disposed) return;
    const geo = new THREE.CircleGeometry(r, 48, facing - span / 2, span);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: baseA,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, 0.96);
    this.scene.add(m); this.fades.push({ mesh: m, mat, life, max: life, baseA, grow: 0.3 });
  }

  /** 地裂纹：从落点向外生长的多段不规则光缝。 */
  cracks(x: number, y: number, color: string, radius: number, count = 9, life = 0.65) {
    for (let i = 0; i < count; i++) {
      const a = i * Math.PI * 2 / count + (Math.random() - 0.5) * 0.32;
      let px = x, py = y;
      const segs = 2 + Math.floor(Math.random() * 3);
      for (let s = 1; s <= segs; s++) {
        const rr = radius * s / segs * (0.72 + Math.random() * 0.28);
        const nx = x + Math.cos(a + (Math.random() - 0.5) * 0.18) * rr;
        const ny = y + Math.sin(a + (Math.random() - 0.5) * 0.18) * rr;
        this.streak(px, py, nx, ny, s === 1 ? '#fff7ed' : color, Math.max(0.025, 0.09 - s * 0.018), life * (1 - s * 0.08), 0.8);
        px = nx; py = ny;
      }
    }
  }

  /** 冲击波环 */
  ring(x: number, y: number, r: number, color: string, life = 0.35, baseA = 0.75, grow = 1.9) {
    if (this.disposed) return;
    const g = new THREE.RingGeometry(r * 0.84, r, 48);
    const mat = new THREE.MeshBasicMaterial({
      map: this.glowTex, color: new THREE.Color(color),
      transparent: true, opacity: baseA,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, 1.0);
    this.scene.add(m);
    this.fades.push({ mesh: m, mat, life, max: life, baseA, grow });
  }

  /** 定点辉光 */
  glow(x: number, y: number, size: number, color: string, life = 0.3, baseA = 0.7) {
    if (this.disposed) return;
    const mat = new THREE.MeshBasicMaterial({
      map: this.glowTex, color: new THREE.Color(color),
      transparent: true, opacity: baseA,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.position.set(x, y, 0.8);
    this.scene.add(m);
    this.fades.push({ mesh: m, mat, life, max: life, baseA, grow: 0.6 });
  }

  /** 书法字印：用于技能和 Boss 演出的识别锚点。 */
  glyph(x: number, y: number, text: string, color: string, size = 1.8, life = 0.75, baseA = 0.9) {
    if (this.disposed) return;
    const mat = new THREE.MeshBasicMaterial({
      map: makeGlyph(text, color), transparent: true, opacity: baseA,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.position.set(x, y, 1.35);
    m.rotation.z = (Math.random() - 0.5) * 0.08;
    this.scene.add(m);
    this.fades.push({ mesh: m, mat, life, max: life, baseA, grow: 0.35 });
  }

  /** 施法者签名：用角色字印、双层运笔环和源点辉光锁定“谁在施法”。 */
  sourceMark(x: number, y: number, color: string, sourceGlyph: string, radius = 1.15) {
    this.arc(x, y, radius, color, -Math.PI * 0.92, Math.PI * 1.44, 0.58, 0.82);
    this.arc(x, y, radius * 0.7, '#fff4d6', 0.22, Math.PI * 1.1, 0.46, 0.62);
    this.glow(x, y, radius * 1.2, color, 0.42, 0.42);
    this.glyph(x, y, sourceGlyph, '#fff0bd', Math.min(2.1, radius * 1.45), 0.72, 0.9);
  }

  /** 武将大招统一起手：暗场压光、双阵盘、角色印与放射光针。 */
  skillPrelude(x: number, y: number, color: string, sourceGlyph: string) {
    this.flash(color, 0.16, 0.22);
    this.rune(x, y, 1.48, color, 0.62, 4.8, 0.94);
    this.rune(x, y, 0.92, '#fff4d6', 0.5, -7.2, 0.78);
    this.rays(x, y, color, 1.75, 16, 0.42);
    this.glyph(x, y, sourceGlyph, '#fff8db', 2.15, 0.7, 0.94);
    this.glow(x, y, 2.2, color, 0.46, 0.58);
  }

  /** 高频普攻的轻量兵种签名：保留施法者辨识度，但不会遮满战场。 */
  sourceStamp(x: number, y: number, color: string, sourceGlyph: string) {
    this.glow(x, y, 0.42, color, 0.16, 0.64);
    this.glyph(x, y, sourceGlyph, color, 0.52, 0.2, 0.8);
  }

  /** 有方向的能量线：主体光束 + 双层箭头，明确从施法者飞向目标。 */
  directional(x1: number, y1: number, x2: number, y2: number, color: string, width = 0.1, life = 0.2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.08) return;
    const ux = dx / len, uy = dy / len;
    const px = -uy, py = ux;
    this.streak(x1, y1, x2, y2, color, width, life, 0.76);
    this.glow(x1, y1, Math.max(0.25, width * 3.5), color, life * 1.25, 0.55);
    this.glow(x2, y2, Math.max(0.42, width * 5), '#fff4d6', life * 1.1, 0.65);
    for (const k of [0.48, 0.76]) {
      const hx = x1 + dx * k, hy = y1 + dy * k;
      const back = Math.min(0.38, len * 0.12);
      this.streak(hx, hy, hx - ux * back + px * back * 0.6, hy - uy * back + py * back * 0.6, color, width * 0.62, life * 0.86, 0.82);
      this.streak(hx, hy, hx - ux * back - px * back * 0.6, hy - uy * back - py * back * 0.6, color, width * 0.62, life * 0.86, 0.82);
    }
  }

  /** 命中反馈：高亮核心、外圈和少量爆裂粒子，强化“打到谁”。 */
  hitSpark(x: number, y: number, color: string, crit = false) {
    this.glow(x, y, crit ? 1.15 : 0.42, crit ? '#fff0ad' : color, crit ? 0.24 : 0.12, crit ? 1 : 0.58);
    if (crit) {
      this.rays(x, y, '#ffd166', 1.35, 10, 0.28);
      this.ring(x, y, 0.72, '#fff1a8', 0.26, 0.92, 2.05);
      this.burst(x, y, '#fff4d6', 13, 4.2, 0.14, 0.32);
      this.hooks.punch?.(0.045);
    } else {
      this.burst(x, y, color, 2, 2.1, 0.075, 0.16);
    }
  }

  /**
   * 七名武将的专属普攻签名。这里不负责伤害，只负责把每位武将的武器、
   * 性格和色彩在 0.2 秒内读出来，彻底摆脱“英雄套兵种模板”的廉价感。
   */
  heroAttack(key: string, x: number, y: number, tx: number, ty: number, color: string) {
    const ang = Math.atan2(ty - y, tx - x);
    const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
    const dist = Math.hypot(tx - x, ty - y);
    if (key === 'zhaoyun') {
      // 银龙枪：瞬身残影 + 螺旋枪尖。
      this.rune(x, y, 0.58, '#60a5fa', 0.3, 5.5, 0.68);
      this.blade(x - dx * 0.28, y - dy * 0.28, tx + dx * 0.55, ty + dy * 0.55, '#38bdf8', 0.105, 0.24);
      for (const off of [-0.18, 0.18]) this.streak(x + px * off, y + py * off, tx + px * off, ty + py * off, '#93c5fd', 0.045, 0.3, 0.72);
      this.arc(tx, ty, 0.56, '#e0f2fe', ang - 1.2, 2.4, 0.22, 0.92, 0, 9);
      this.rays(tx, ty, '#38bdf8', 0.9, 7, 0.22, ang);
    } else if (key === 'guanyu') {
      // 青龙偃月：厚重月牙，不做普通直线弹道。
      this.cone(x, y, Math.min(dist + 0.5, 4.8), ang, 0.52, '#10b981', 0.28, 0.16);
      for (const [r, w, c] of [[0.72, 0.18, '#ecfdf5'], [0.92, 0.12, '#34d399'], [1.1, 0.06, '#047857']] as const)
        this.arc(tx, ty, r, c, ang + 1.85, 2.55, 0.32, 0.9, 0, -4 + w * 10);
      this.blade(x + px * 0.18, y + py * 0.18, tx - px * 0.34, ty - py * 0.34, '#6ee7b7', 0.18, 0.28);
      this.cloud(tx, ty, '#064e3b', 5, 0.4, 0.55);
    } else if (key === 'zhangfei') {
      // 蛇矛：黑紫电裂，命中像钉进地面。
      this.lightning(x, y, tx, ty, '#c084fc', 5, 0.24, 0.075);
      this.blade(x, y, tx, ty, '#e9d5ff', 0.09, 0.18);
      this.cracks(tx, ty, '#7e22ce', 0.82, 6, 0.42);
      this.ring(tx, ty, 0.5, '#a855f7', 0.2, 0.75, 1.75);
    } else if (key === 'liubei') {
      // 双股剑：金蓝双弧交汇。
      this.rune(x, y, 0.5, '#fbbf24', 0.3, -4.2, 0.66);
      this.blade(x + px * 0.18, y + py * 0.18, tx - px * 0.16, ty - py * 0.16, '#fde68a', 0.08, 0.24);
      this.blade(x - px * 0.18, y - py * 0.18, tx + px * 0.16, ty + py * 0.16, '#60a5fa', 0.07, 0.26);
      this.rune(tx, ty, 0.46, '#fff7cc', 0.26, 6, 0.74);
    } else if (key === 'huangzhong') {
      // 烈阳箭：蓄能准星 + 实体箭头，飞行阶段由 heroProjectileTrail 接管。
      this.rune(x, y, 0.62, '#f59e0b', 0.32, 3.8, 0.74);
      this.arc(x, y, 0.45, '#fde68a', ang - 1.25, 2.5, 0.26, 0.92, 0, -5);
      this.rays(x, y, '#f59e0b', 0.92, 8, 0.24, ang);
      this.blade(x, y, x + dx * 0.88, y + dy * 0.88, '#fff7ed', 0.075, 0.16);
    } else if (key === 'machao') {
      // 西凉银骑：三段超高速残像。
      for (const [off, c, w] of [[0, '#fff1f2', 0.12], [0.2, '#fb7185', 0.075], [-0.2, '#c026d3', 0.055]] as const)
        this.blade(x + px * off - dx * 0.5, y + py * off - dy * 0.5, tx + px * off, ty + py * off, c, w, 0.2 + Math.abs(off) * 0.3);
      this.rays(tx, ty, '#f472b6', 1.05, 9, 0.24, ang);
      this.ring(tx, ty, 0.64, '#fb7185', 0.24, 0.86, 2.25);
    } else if (key === 'lubu') {
      // 方天画戟：赤金十字斩与微型地裂。
      this.flash('#7f1d1d', 0.08, 0.12);
      this.blade(x, y, tx, ty, '#fbbf24', 0.18, 0.28);
      this.blade(tx - px * 0.85, ty - py * 0.85, tx + px * 0.85, ty + py * 0.85, '#ef4444', 0.15, 0.3);
      this.cracks(tx, ty, '#b91c1c', 1.05, 7, 0.52);
      this.rays(tx, ty, '#f59e0b', 1.25, 10, 0.3, ang);
      this.hooks.punch?.(0.06);
    } else {
      this.blade(x, y, tx, ty, color, 0.1, 0.22);
    }
  }

  lightning(x1: number, y1: number, x2: number, y2: number, color: string, segments = 6, life = 0.24, width = 0.06) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len;
    let ox = x1, oy = y1;
    for (let i = 1; i <= segments; i++) {
      const k = i / segments; const j = i === segments ? 0 : (Math.random() - 0.5) * Math.min(0.7, len * 0.18);
      const nx = x1 + dx * k + px * j, ny = y1 + dy * k + py * j;
      this.streak(ox, oy, nx, ny, i % 2 ? '#ffffff' : color, width * (i % 2 ? 0.55 : 1), life, 0.95);
      ox = nx; oy = ny;
    }
  }

  heroProjectileTrail(key: string, x: number, y: number, color: string, dx: number, dy: number) {
    if (key === 'huangzhong') {
      this.glowField.emit({ x, y, z: 0.85, life: 0.22, size0: 0.3, size1: 0.025, a0: 1, a1: 0, color: '#fef3c7' });
      this.streak(x - dx * 0.62, y - dy * 0.62, x + dx * 0.16, y + dy * 0.16, '#f59e0b', 0.08, 0.1, 0.9);
      this.streak(x - dx * 0.38, y - dy * 0.38, x + dx * 0.08, y + dy * 0.08, '#ffffff', 0.025, 0.08, 1);
    } else if (key === 'liubei') {
      const px = -dy, py = dx;
      this.glowField.emit({ x, y, z: 0.8, life: 0.24, size0: 0.22, size1: 0.02, a0: 0.95, a1: 0, color: '#fde68a' });
      this.streak(x - dx * 0.42 + px * 0.08, y - dy * 0.42 + py * 0.08, x, y, '#fbbf24', 0.045, 0.1, 0.9);
      this.streak(x - dx * 0.36 - px * 0.08, y - dy * 0.36 - py * 0.08, x, y, '#60a5fa', 0.04, 0.11, 0.82);
    } else {
      this.gongTrail(x, y, color, dx, dy);
    }
  }

  heroProjectileImpact(key: string, x: number, y: number, color: string) {
    if (key === 'huangzhong') {
      this.rune(x, y, 0.72, '#f59e0b', 0.34, -7, 0.86);
      this.rays(x, y, '#fbbf24', 1.3, 12, 0.3);
      this.ring(x, y, 0.82, '#fde68a', 0.3, 0.9, 2.35);
      this.burst(x, y, '#fff7ed', 10, 4.8, 0.13, 0.32);
      this.hooks.punch?.(0.04);
    } else if (key === 'liubei') {
      this.rune(x, y, 0.55, '#fbbf24', 0.3, 8, 0.82);
      this.arc(x, y, 0.62, '#60a5fa', -0.8, 2.4, 0.3, 0.86, 0, -6);
      this.arc(x, y, 0.48, '#fde68a', 2.1, 2.4, 0.28, 0.9, 0, 6);
      this.rays(x, y, '#fff7cc', 0.9, 8, 0.25);
    } else this.gongImpact(x, y, color);
  }

  /** 不完整的墨环：比完整圆环更接近书法运笔。 */
  arc(x: number, y: number, r: number, color: string, start = -0.8, span = 1.7, life = 0.4, baseA = 0.75, rotation?: number, spin = 0) {
    if (this.disposed) return;
    const g = new THREE.RingGeometry(r * 0.82, r, 40, 1, start, span);
    const mat = new THREE.MeshBasicMaterial({
      map: this.glowTex, color: new THREE.Color(color), transparent: true, opacity: baseA,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, 1.05);
    m.rotation.z = rotation ?? (Math.random() - 0.5) * 0.08;
    this.scene.add(m);
    this.fades.push({ mesh: m, mat, life, max: life, baseA, grow: 1.2, spin });
  }

  /** 墨迹残留（地面印记） */
  blot(x: number, y: number, size: number, color = '#2b2219', life = 0.8, baseA = 0.45) {
    if (this.disposed) return;
    const mat = new THREE.MeshBasicMaterial({
      map: this.inkTex, color: new THREE.Color(color),
      transparent: true, opacity: baseA, depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.position.set(x, y, -2.4);
    this.scene.add(m);
    this.fades.push({ mesh: m, mat, life, max: life, baseA, grow: 1.0 });
  }

  /** 全屏闪光 */
  flash(color: string, strength = 0.4, life = 0.2) {
    if (this.disposed) return;
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true, opacity: strength,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(42, 42), mat);
    m.position.z = 6;
    m.renderOrder = 999;
    this.scene.add(m);
    this.fades.push({ mesh: m, mat, life, max: life, baseA: strength, grow: 0 });
  }

  // ---------- 兵种攻击特效 ----------

  /** 刀兵普攻：次世代「裂空斩」——蓄能、三重刀轨、十字切面与核心爆裂。 */
  daoAttack(x: number, y: number, tx: number, ty: number, color: string) {
    const ang = Math.atan2(ty - y, tx - x);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const px = -dy, py = dx;
    const edge = '#22d3ee';
    const core = '#ecfeff';
    const accent = '#2563eb';

    this.sourceStamp(x, y, edge, '刀');
    this.rune(x, y, 0.42, edge, 0.2, 6.5, 0.58);
    this.glow(x, y, 0.68, '#67e8f9', 0.18, 0.68);
    this.arc(x, y, 0.46, edge, -0.95, 1.9, 0.24, 0.78, ang, 4.5);
    this.burst(x, y, core, 5, 2.5, 0.08, 0.18);

    // 主刀轨 + 两条偏移残影，视觉上像把空气切开而不是一根普通光线。
    this.directional(x, y, tx, ty, accent, 0.025, 0.16);
    for (const [off, col, width, life] of [[0, core, 0.22, 0.22], [0.25, edge, 0.105, 0.28], [-0.25, '#3b82f6', 0.09, 0.32]] as const) {
      const sx = x + px * off - dx * 0.24;
      const sy = y + py * off - dy * 0.24;
      const ex = tx + px * off + dx * 0.16;
      const ey = ty + py * off + dy * 0.16;
      this.streak(sx, sy, ex, ey, col, width, life, col === core ? 1 : 0.78);
    }
    for (const k of [0.24, 0.48, 0.72]) {
      this.glow(x + (tx - x) * k, y + (ty - y) * k, 0.14 + k * 0.08, edge, 0.16, 0.7);
    }

    // 命中瞬间：双层切面 + 白热核心 + 逆向碎片。
    const slash = ang + Math.PI * 0.72;
    const slash2 = ang - Math.PI * 0.72;
    this.streak(tx - Math.cos(slash) * 0.94, ty - Math.sin(slash) * 0.94, tx + Math.cos(slash) * 0.94, ty + Math.sin(slash) * 0.94, core, 0.17, 0.2, 0.98);
    this.streak(tx - Math.cos(slash2) * 0.66, ty - Math.sin(slash2) * 0.66, tx + Math.cos(slash2) * 0.66, ty + Math.sin(slash2) * 0.66, edge, 0.09, 0.24, 0.9);
    this.arc(tx, ty, 0.7, edge, ang - 1.32, 1.92, 0.3, 0.9, 0, -5);
    this.rays(tx, ty, edge, 0.96, 7, 0.22, ang);
    this.ring(tx, ty, 0.52, accent, 0.24, 0.8, 2.4);
    this.glow(tx, ty, 1.0, core, 0.2, 0.9);
    this.burst(tx, ty, edge, 15, 4.4, 0.12, 0.34);
    this.burst(tx, ty, core, 6, 2.8, 0.09, 0.22);
    this.inkField.emit({ x: tx, y: ty, z: 0.3, vx: -px * 1.4, vy: -py * 1.4, life: 0.62, size0: 0.22, size1: 0.62, a0: 0.48, a1: 0, color: color || '#172b35' });
    this.hooks.punch?.(0.028);
  }

  /** 枪兵普攻：电磁枪阵——五重平行枪芒、轨道脉冲、贯穿式命中环。 */
  qiangAttack(x: number, y: number, tx: number, ty: number, color: string) {
    const dx0 = tx - x, dy0 = ty - y;
    const len = Math.hypot(dx0, dy0) || 1;
    const dx = dx0 / len, dy = dy0 / len;
    const px = -dy, py = dx;
    const edge = '#2dd4bf';
    const core = '#ecfffb';
    const deep = '#0f766e';

    this.sourceStamp(x, y, edge, '枪');
    this.rune(x, y, 0.44, edge, 0.22, -7, 0.6);
    this.glow(x, y, 0.72, '#5eead4', 0.2, 0.7);
    this.arc(x, y, 0.48, edge, -0.8, 1.6, 0.22, 0.82, Math.atan2(dy, dx), -4);
    this.directional(x, y, tx, ty, deep, 0.035, 0.22);

    for (const off of [-0.22, -0.11, 0, 0.11, 0.22]) {
      const sx = x + px * off;
      const sy = y + py * off;
      const ex = tx + px * off;
      const ey = ty + py * off;
      const isCore = off === 0;
      this.streak(sx, sy, ex, ey, isCore ? core : edge, isCore ? 0.16 : 0.065, 0.24 + Math.abs(off) * 0.18, isCore ? 1 : 0.74);
    }
    // 沿枪线高速跳动的能量节点，给“贯穿”一个清晰的速度感。
    for (let i = 1; i <= 4; i++) {
      const k = i / 5;
      const pulse = 0.13 + i * 0.025;
      this.glow(x + dx0 * k, y + dy0 * k, pulse, i % 2 ? edge : core, 0.2, 0.82);
    }
    this.streak(x - px * 0.42, y - py * 0.42, x + dx * 1.12 - px * 0.42, y + dy * 1.12 - py * 0.42, core, 0.23, 0.15, 0.96);

    this.ring(tx, ty, 0.72, edge, 0.28, 0.82, 2.25);
    this.rays(tx, ty, edge, 0.94, 8, 0.24, Math.atan2(dy, dx));
    this.arc(tx, ty, 0.48, core, -0.55, Math.PI * 1.5, 0.22, 0.9, Math.atan2(dy, dx), 6);
    this.glow(tx, ty, 0.94, core, 0.2, 0.9);
    this.burst(tx, ty, edge, 18, 4.1, 0.11, 0.34);
    this.burst(tx, ty, core, 5, 2.5, 0.08, 0.22);
    this.burst(tx, ty, color, 3, 2.1, 0.06, 0.18);
    this.hooks.punch?.(0.036);
  }

  /** 骑兵普攻：超音速冲阵——五重低空尾焰、路径脉冲与重型震爆。 */
  cavalryCharge(x: number, y: number, tx: number, ty: number, color: string) {
    const dx0 = tx - x, dy0 = ty - y;
    const len = Math.hypot(dx0, dy0) || 1;
    const dx = dx0 / len, dy = dy0 / len;
    const px = -dy, py = dx;
    const edge = '#fb923c';
    const hot = '#facc15';
    const core = '#fff7ed';

    this.sourceStamp(x, y, edge, '骑');
    this.rune(x, y, 0.54, hot, 0.24, 5.5, 0.62);
    this.flash('#7c2d12', 0.1, 0.12);
    this.glow(x, y, 0.9, hot, 0.22, 0.72);
    this.arc(x, y, 0.62, edge, -1.1, 2.0, 0.26, 0.86, Math.atan2(dy, dx), -3.5);
    this.directional(x, y, tx, ty, edge, 0.12, 0.28);
    this.cone(x, y, len + 0.45, Math.atan2(dy, dx), 0.42, '#f97316', 0.32, 0.14);
    for (const off of [-0.42, -0.2, 0, 0.2, 0.42]) {
      const back = 0.72 + Math.abs(off) * 0.3;
      this.streak(x + px * off - dx * back, y + py * off - dy * back, tx + px * off, ty + py * off, off === 0 ? core : edge, off === 0 ? 0.2 : 0.07, 0.28, off === 0 ? 1 : 0.68);
    }
    for (const k of [0.2, 0.4, 0.6, 0.8]) {
      const mx = x + dx0 * k, my = y + dy0 * k;
      this.ring(mx, my, 0.2 + k * 0.14, hot, 0.18, 0.58, 1.8);
      this.burst(mx, my, hot, 3, 2.8, 0.08, 0.2, 0.6);
    }

    this.ring(tx, ty, 2.05, edge, 0.38, 0.82, 2.45);
    this.rays(tx, ty, hot, 2.25, 16, 0.34, Math.atan2(dy, dx));
    this.cracks(tx, ty, '#c2410c', 1.5, 8, 0.6);
    this.ring(tx, ty, 1.18, hot, 0.3, 0.86, 2.1);
    this.arc(tx, ty, 0.8, core, -0.8, Math.PI * 1.45, 0.24, 0.95, Math.atan2(dy, dx), 5);
    this.glow(tx, ty, 1.35, core, 0.22, 0.94);
    this.burst(tx, ty, edge, 32, 6.5, 0.2, 0.52, 0.8);
    this.burst(tx, ty, core, 10, 3.8, 0.13, 0.32);
    this.cloud(tx, ty, color, 4, 0.52, 0.48);
    this.cloud(tx, ty, '#3c2b1d', 11, 0.82, 0.86);
    this.blot(tx, ty, 1.7, '#241a10', 0.95, 0.46);
    this.hooks.punch?.(0.1);
    this.hooks.shake?.(0.18, 0.14);
  }

  /** 刀兵旧接口保留给英雄/兼容调用。 */
  daoSlash(x: number, y: number, tx: number, ty: number, color: string) {
    const ang = Math.atan2(ty - y, tx - x);
    const r = Math.hypot(tx - x, ty - y);
    const px = -Math.sin(ang), py = Math.cos(ang);
    this.directional(x, y, tx, ty, color, 0.07, 0.16);
    // 双重刀光（主体 + 拖尾）
    this.streak(x, y, x + px * 0.25 + Math.cos(ang) * r * 0.92, y + py * 0.25 + Math.sin(ang) * r * 0.92, '#f5f0e6', 0.34, 0.14);
    this.streak(x, y, x + Math.cos(ang) * r * 0.8, y + Math.sin(ang) * r * 0.8, color, 0.18, 0.2, 0.7);
    this.burst((x + tx) / 2, (y + ty) / 2, color, 6, 3.2, 0.16, 0.35);
    this.inkField.emit({ x: tx, y: ty, z: 0.3, vx: -px * 1.2, vy: -py * 1.2, life: 0.6, size0: 0.3, size1: 0.55, a0: 0.4, a1: 0, color: '#2b2219' });
  }

  /** 枪将/赵云技能：直线穿阵笔锋 */
  qiangPierce(x: number, y: number, dx: number, dy: number, range: number, color: string) {
    const ex = x + dx * range, ey = y + dy * range;
    this.streak(x, y, ex, ey, '#eef4f2', 0.3, 0.2);
    this.streak(x, y, ex, ey, color, 0.12, 0.24, 0.8);
    for (let i = 1; i <= 3; i++) {
      const k = i / 4;
      const bx = x + dx * range * k, by = y + dy * range * k;
      setTimeout(() => this.burst(bx, by, color, 5, 2.6, 0.14, 0.3), i * 55);
    }
    this.blot(ex, ey, 0.9, '#1f2e2a', 0.7, 0.35);
  }

  /** 骑兵：重击爆发（镜头冲击） */
  qiImpact(x: number, y: number, color: string, sourceX?: number, sourceY?: number) {
    if (sourceX !== undefined && sourceY !== undefined) this.directional(sourceX, sourceY, x, y, color, 0.1, 0.24);
    this.flash(color, 0.3, 0.18);
    this.ring(x, y, 2.2, color, 0.4, 0.8, 2.2);
    this.burst(x, y, color, 22, 5.5, 0.24, 0.55);
    this.burst(x, y, '#fff3dd', 8, 3.2, 0.2, 0.4);
    this.cloud(x, y, '#3c2b1d', 8, 0.6, 0.9);
    this.blot(x, y, 1.5, '#241a10', 0.9, 0.5);
    this.hooks.punch?.(0.14);
    this.hooks.shake?.(0.28, 0.18);
  }

  /** 弓兵：量子箭矢出膛——蓄力弧、追踪准星与白热箭芯。 */
  gongShot(x: number, y: number, tx: number, ty: number, color: string, sourceGlyph = '弓') {
    const ang = Math.atan2(ty - y, tx - x);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const edge = '#a78bfa';
    const core = '#fffbea';
    this.sourceStamp(x, y, edge, sourceGlyph);
    this.rune(x, y, 0.46, edge, 0.24, -6, 0.58);
    this.glow(x, y, 0.7, '#c4b5fd', 0.18, 0.72);
    this.arc(x, y, 0.5, edge, ang - 1.25, 2.5, 0.24, 0.82, 0, -4.5);
    this.arc(x, y, 0.34, core, ang - 1.05, 0.72, 0.18, 0.9, 0, 5);
    this.directional(x, y, tx, ty, edge, 0.026, 0.12);
    this.streak(x, y, x + dx * 0.92, y + dy * 0.92, core, 0.16, 0.15, 0.98);
    this.streak(x + dx * 0.12, y + dy * 0.12, x + dx * 0.82, y + dy * 0.82, edge, 0.08, 0.2, 0.86);
    this.streak(x - dy * 0.13, y + dx * 0.13, x + dx * 0.4 - dy * 0.13, y + dy * 0.4 + dx * 0.13, '#fef3c7', 0.045, 0.18, 0.8);
    this.burst(x, y, edge, 8, 2.2, 0.09, 0.24);
    this.burst(x, y, color, 4, 1.6, 0.055, 0.18);
    this.glow(x + dx * 0.54, y + dy * 0.54, 0.46, core, 0.16, 0.82);
  }

  /** 弓兵：箭矢飞行拖尾；保留真正的飞行弹体，不再是一条瞬移光线。 */
  gongTrail(x: number, y: number, color: string, dx = 0, dy = 0) {
    if (this.disposed) return;
    this.glowField.emit({ x, y, z: 0.7, life: 0.2, size0: 0.18, size1: 0.025, a0: 1, a1: 0, color: '#c4b5fd' });
    this.glowField.emit({ x: x - dx * 0.18, y: y - dy * 0.18, z: 0.68, life: 0.26, size0: 0.09, size1: 0.015, a0: 0.72, a1: 0, color });
    this.inkField.emit({ x: x - dx * 0.3, y: y - dy * 0.3, z: 0.64, vx: -dx * 0.12, vy: -dy * 0.12, life: 0.26, size0: 0.1, size1: 0.02, a0: 0.48, a1: 0, color: '#fff2cf' });
    if (Math.abs(dx) + Math.abs(dy) > 0.1) {
      const px = -dy, py = dx;
      this.streak(x - dx * 0.3 + px * 0.13, y - dy * 0.3 + py * 0.13, x, y, '#fffbea', 0.045, 0.075, 0.9);
      this.streak(x - dx * 0.3 - px * 0.13, y - dy * 0.3 - py * 0.13, x, y, color, 0.035, 0.09, 0.68);
    }
  }

  /** 弓兵：命中爆点——箭矢穿透后的十字星爆与紫金冲击环。 */
  gongImpact(x: number, y: number, color: string) {
    this.ring(x, y, 0.82, '#a78bfa', 0.28, 0.84, 2.1);
    this.ring(x, y, 0.44, color, 0.2, 0.58, 1.8);
    this.arc(x, y, 0.56, '#f5f3ff', -0.9, 1.7, 0.22, 0.95, 0, -6);
    this.streak(x - 0.66, y, x + 0.66, y, '#fffbea', 0.085, 0.2, 0.96);
    this.streak(x, y - 0.66, x, y + 0.66, '#c4b5fd', 0.065, 0.22, 0.82);
    this.streak(x - 0.38, y - 0.38, x + 0.38, y + 0.38, '#ddd6fe', 0.045, 0.2, 0.78);
    this.burst(x, y, '#a78bfa', 18, 4.1, 0.13, 0.36);
    this.burst(x, y, '#fffbea', 5, 2.3, 0.08, 0.22);
    this.glow(x, y, 1.0, '#fff7e6', 0.22, 0.94);
    this.hooks.punch?.(0.022);
  }

  // ---------- 武将技能 ----------

  /** 赵云 · 七进七出：银龙贯日，枪芒有龙脊、侧翼电弧与终点破空阵。 */
  zhaoyunBeam(x1: number, y1: number, x2: number, y2: number) {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const px = -Math.sin(ang), py = Math.cos(ang);
    this.rune(x1, y1, 1.05, '#38bdf8', 0.48, 7.5, 0.88);
    this.cone(x1, y1, Math.min(18, Math.hypot(x2 - x1, y2 - y1)), ang, 0.18, '#2563eb', 0.34, 0.2);
    this.blade(x1 - Math.cos(ang) * 0.5, y1 - Math.sin(ang) * 0.5, x2, y2, '#38bdf8', 0.28, 0.32);
    for (const off of [-0.34, -0.17, 0.17, 0.34]) {
      this.streak(x1 + px * off, y1 + py * off, x2 + px * off, y2 + py * off,
        Math.abs(off) > 0.2 ? '#1d4ed8' : '#bae6fd', Math.abs(off) > 0.2 ? 0.055 : 0.08, 0.38, 0.76);
    }
    for (let i = 1; i <= 6; i++) {
      const k = i / 7, bx = x1 + (x2 - x1) * k, by = y1 + (y2 - y1) * k;
      this.arc(bx, by, 0.34 + (i % 2) * 0.12, i % 2 ? '#7dd3fc' : '#ffffff', ang - 0.8, 1.6, 0.28, 0.8, 0, i % 2 ? 10 : -10);
    }
    this.rune(x2, y2, 1.25, '#60a5fa', 0.44, -8, 0.9);
    this.rays(x2, y2, '#93c5fd', 1.7, 16, 0.34, ang);
    this.glow(x2, y2, 1.8, '#e0f2fe', 0.3, 1);
    this.burst(x2, y2, '#93c5fd', 20, 5.6, 0.17, 0.46);
    this.hooks.punch?.(0.075);
  }

  /** 关羽 · 青龙偃月：三层青龙月刃横扫，扇面由内而外爆开。 */
  guanyuFan(x: number, y: number, r: number, color: string, facing = -Math.PI * 0.1) {
    this.flash('#022c22', 0.24, 0.28);
    this.rune(x, y, 1.3, '#34d399', 0.55, -4.5, 0.9);
    this.cone(x, y, r, facing, 2.0, '#059669', 0.5, 0.2);
    this.glyph(x, y, '龍', '#d1fae5', Math.min(2.8, r * 0.65), 0.72, 0.82);
    for (let wave = 0; wave < 3; wave++) {
      this.later(wave * 65, () => {
        const rr = r * (0.68 + wave * 0.15);
        this.arc(x, y, rr, wave === 1 ? '#ecfdf5' : wave === 0 ? '#34d399' : '#047857',
          facing - 1.02, 2.04, 0.46, 0.94 - wave * 0.12, 0, wave % 2 ? 2.2 : -2.2);
        for (let i = 0; i < 7; i++) {
          const a = facing - 0.9 + i * 0.3;
          this.blade(x + Math.cos(a) * rr * 0.32, y + Math.sin(a) * rr * 0.32,
            x + Math.cos(a) * rr, y + Math.sin(a) * rr, i % 2 ? '#a7f3d0' : color, 0.09, 0.28);
        }
      });
    }
    this.rays(x + Math.cos(facing) * r * 0.58, y + Math.sin(facing) * r * 0.58, '#6ee7b7', r * 0.58, 17, 0.42, facing);
    this.cloud(x + Math.cos(facing) * r * 0.58, y + Math.sin(facing) * r * 0.58, '#064e3b', 15, r * 0.65, 0.9);
    this.hooks.punch?.(0.12);
  }

  /** 张飞 · 当阳断喝：声压塌缩、紫电地裂、三重震波。 */
  zhangfeiShock(x: number, y: number, r: number) {
    this.flash('#160b2c', 0.34, 0.32);
    this.rune(x, y, 1.2, '#c084fc', 0.55, 6.5, 0.9);
    this.glyph(x, y, '喝', '#faf5ff', Math.min(3.1, r * 0.78), 0.82, 0.9);
    this.cracks(x, y, '#7e22ce', r * 0.92, 14, 0.9);
    this.rays(x, y, '#d8b4fe', r * 0.9, 22, 0.5);
    for (let i = 0; i < 4; i++) this.later(i * 82, () => {
      this.ring(x, y, r * (0.28 + i * 0.22), i % 2 ? '#c084fc' : '#f3e8ff', 0.5, 0.92 - i * 0.1, 1.75);
      this.arc(x, y, r * (0.34 + i * 0.2), '#6b21a8', i * 0.7, 4.5, 0.55, 0.72, 0, i % 2 ? 4 : -4);
    });
    this.cloud(x, y, '#1f172a', 24, r * 0.92, 1.25);
    this.burst(x, y, '#e9d5ff', 30, 6.2, 0.21, 0.55);
    this.hooks.punch?.(0.17);
    this.hooks.shake?.(0.46, 0.36);
  }

  /** 刘备 · 仁德：金色生命树阵由施法者沿丝带流向阿斗。 */
  liubeiHeal(x: number, y: number, targetX = x, targetY = y) {
    const dist = Math.hypot(targetX - x, targetY - y);
    this.rune(x, y, 1.15, '#fbbf24', 0.7, 3.8, 0.92);
    this.glyph(x, y, '仁', '#fff7cc', 2.2, 0.72, 0.88);
    if (dist > 0.1) {
      this.lightning(x, y, targetX, targetY, '#fde68a', 9, 0.55, 0.075);
      this.blade(x, y, targetX, targetY, '#fbbf24', 0.08, 0.48);
    }
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      this.glowField.emit({
        x, y, z: 0.5,
        vx: Math.cos(a) * (0.4 + Math.random() * 1.2),
        vy: 1.4 + Math.random() * 1.8,
        vz: (Math.random() - 0.5) * 0.5,
        life: 1.1 + Math.random() * 0.5,
        size0: 0.22, size1: 0.05,
        a0: 0.9, a1: 0, color: i % 3 ? '#fbbf24' : '#ecfdf5', drag: 0.97, grav: -0.4,
      });
    }
    this.rune(targetX, targetY, 1.35, '#fcd34d', 0.85, -3.6, 0.9);
    this.rays(targetX, targetY, '#fde68a', 1.7, 18, 0.52);
    this.ring(targetX, targetY, 1.45, '#fff7cc', 0.62, 0.86, 1.8);
    this.glow(targetX, targetY, 2.7, '#fcd34d', 0.62, 0.65);
  }

  /** 刘备满血时的全军号令：每个阵位展开小型金青护阵。 */
  armyBless(points: { x: number; y: number }[]) {
    this.flash('#f59e0b', 0.18, 0.28);
    points.forEach((p, i) => this.later(i * 24, () => {
      this.rune(p.x, p.y, 0.62, i % 2 ? '#fbbf24' : '#34d399', 0.58, i % 2 ? 5 : -5, 0.76);
      this.ring(p.x, p.y, 0.55, '#fff7cc', 0.42, 0.82, 1.85);
      for (let j = 0; j < 4; j++) this.glowField.emit({
        x: p.x + (Math.random() - 0.5) * 0.4, y: p.y, z: 0.75,
        vx: (Math.random() - 0.5) * 0.35, vy: 0.8 + Math.random() * 0.8,
        life: 0.65 + Math.random() * 0.4, size0: 0.14, size1: 0.03, a0: 0.9, a1: 0,
        color: j % 2 ? '#fde68a' : '#a7f3d0', drag: 0.98,
      });
    }));
  }

  /** 黄忠 · 百步穿杨：先锁定全图，再由高空金色箭雨分批砸落。 */
  arrowStorm(x: number, y: number, points: { x: number; y: number }[]) {
    this.flash('#78350f', 0.38, 0.34);
    this.rune(x, y, 1.55, '#f59e0b', 0.72, -5.2, 0.94);
    this.glyph(x, y, '弓', '#fff7cc', 2.35, 0.76, 0.9);
    this.rays(x, y, '#fbbf24', 2.1, 20, 0.48);
    points.forEach((p, i) => {
      this.later(i * 42, () => {
        // 高空斜落箭：三层箭芯 + 落点瞄准阵。
        const sx = p.x - 1.2, sy = p.y + 3.2;
        this.rune(p.x, p.y, 0.54, '#f59e0b', 0.34, i % 2 ? 8 : -8, 0.76);
        this.blade(sx, sy, p.x, p.y, '#f59e0b', 0.13, 0.28);
        this.streak(sx - 0.18, sy + 0.12, p.x - 0.05, p.y + 0.08, '#fff7ed', 0.035, 0.24, 1);
        this.rays(p.x, p.y, '#fbbf24', 0.9, 9, 0.26, -1.15);
        this.ring(p.x, p.y, 0.56, '#fde68a', 0.28, 0.86, 2.1);
        this.burst(p.x, p.y, '#f59e0b', 8, 4.2, 0.12, 0.34);
        this.blot(p.x, p.y, 0.72, '#2b2219', 0.9, 0.42);
      });
    });
  }

  /** 马超 · 西凉突阵：粉金幻影沿折线切入，落点留下风眼。 */
  machaoDash(x1: number, y1: number, x2: number, y2: number, color: string) {
    const a = Math.atan2(y2 - y1, x2 - x1), px = -Math.sin(a), py = Math.cos(a);
    this.cone(x1, y1, Math.hypot(x2 - x1, y2 - y1), a, 0.28, '#db2777', 0.32, 0.16);
    for (const [off, c, w] of [[0, '#fff1f2', 0.18], [0.3, '#f472b6', 0.12], [-0.3, '#a855f7', 0.09]] as const)
      this.blade(x1 + px * off, y1 + py * off, x2 + px * off, y2 + py * off, c, w, 0.28 + Math.abs(off) * 0.12);
    this.rune(x2, y2, 0.84, color, 0.34, 10, 0.88);
    this.rays(x2, y2, '#f9a8d4', 1.35, 14, 0.3, a);
    this.burst(x2, y2, color, 17, 5.2, 0.16, 0.44);
    this.glow(x2, y2, 1.25, '#fff1f2', 0.28, 0.92);
  }

  /** 吕布 · 无双：赤金彗星坠落，先塌缩再爆出地裂与方天十字。 */
  lubuLeap(x1: number, y1: number, x2: number, y2: number, r: number) {
    const a = Math.atan2(y2 - y1, x2 - x1), px = -Math.sin(a), py = Math.cos(a);
    this.flash('#7f1d1d', 0.48, 0.36);
    this.rune(x1, y1, 1.35, '#f59e0b', 0.52, 7, 0.92);
    this.cone(x1, y1, Math.hypot(x2 - x1, y2 - y1), a, 0.38, '#dc2626', 0.38, 0.22);
    this.blade(x1, y1, x2, y2, '#f59e0b', 0.38, 0.38);
    this.blade(x1 + px * 0.34, y1 + py * 0.34, x2 + px * 0.34, y2 + py * 0.34, '#ef4444', 0.11, 0.44);
    this.blade(x1 - px * 0.34, y1 - py * 0.34, x2 - px * 0.34, y2 - py * 0.34, '#7f1d1d', 0.09, 0.48);
    this.rune(x2, y2, r * 0.82, '#ef4444', 0.72, -8, 0.95);
    this.cracks(x2, y2, '#b91c1c', r * 1.22, 16, 1.1);
    this.rays(x2, y2, '#fbbf24', r * 1.36, 26, 0.58, a);
    this.blade(x2 - px * r, y2 - py * r, x2 + px * r, y2 + py * r, '#fff7d6', 0.22, 0.42);
    this.blade(x2 - Math.cos(a) * r, y2 - Math.sin(a) * r, x2 + Math.cos(a) * r, y2 + Math.sin(a) * r, '#ef4444', 0.18, 0.46);
    this.ring(x2, y2, r, '#ef4444', 0.6, 0.96, 2.2);
    this.ring(x2, y2, r * 0.58, '#fbbf24', 0.45, 0.9, 2.5);
    this.burst(x2, y2, '#ef4444', 46, 7.8, 0.28, 0.75);
    this.burst(x2, y2, '#fef3c7', 18, 4.2, 0.18, 0.5);
    this.cloud(x2, y2, '#321711', 22, r, 1.3);
    this.blot(x2, y2, r * 1.4, '#2a1510', 1.35, 0.58);
    this.hooks.punch?.(0.25);
    this.hooks.shake?.(0.62, 0.48);
  }

  // ---------- 事件特效 ----------

  /** 合成爆发 */
  mergeBurst(x: number, y: number, big: boolean) {
    const color = big ? '#fbbf24' : '#e8e0cc';
    this.flash(color, big ? 0.4 : 0.18, big ? 0.3 : 0.18);
    this.ring(x, y, big ? 3.4 : 1.6, color, 0.5, 0.8, 2.4);
    this.burst(x, y, color, big ? 40 : 14, big ? 6.5 : 3.6, big ? 0.28 : 0.16, 0.6);
    this.burst(x, y, '#ffffff', big ? 14 : 5, big ? 3.6 : 2, 0.18, 0.45);
    this.cloud(x, y, '#3a2f22', big ? 16 : 6, big ? 1.2 : 0.5, 1.0);
    this.blot(x, y, big ? 2.4 : 1.0, '#241a10', big ? 1.2 : 0.7, 0.5);
    if (big) {
      this.hooks.punch?.(0.2);
      this.hooks.shake?.(0.35, 0.3);
    }
  }

  /** 征兵落地 */
  spawnPop(x: number, y: number, color: string) {
    this.burst(x, y, color, 6, 2.2, 0.12, 0.3);
    this.glow(x, y, 0.6, '#fff8e8', 0.2, 0.6);
  }

  /** 武将诞生（局内高潮） */
  heroBorn(x: number, y: number, glyph = '将') {
    this.flash('#fef3c7', 0.55, 0.4);
    this.ring(x, y, 4.2, '#f59e0b', 0.7, 0.9, 2.6);
    this.ring(x, y, 2.4, '#fde68a', 0.5, 0.8, 2.0);
    this.burst(x, y, '#fbbf24', 44, 7.5, 0.3, 0.75);
    this.burst(x, y, '#ffffff', 16, 4.5, 0.2, 0.5);
    this.burst(x, y, '#92400e', 10, 2.6, 0.24, 0.9, 2.5);
    this.cloud(x, y, '#33291c', 18, 1.4, 1.2);
    this.blot(x, y, 3.2, '#1f170e', 1.4, 0.6);
    this.glyph(x, y, glyph, '#ffe7a8', 2.6, 0.9, 0.8);
    this.hooks.punch?.(0.28);
    this.hooks.shake?.(0.5, 0.45);
  }

  /** 敌兵死亡 */
  enemyDie(x: number, y: number, boss: boolean) {
    if (boss) {
      this.flash('#7f1d1d', 0.72, 0.58);
      this.rune(x, y, 3.3, '#ef4444', 1.05, -5, 0.94);
      this.cracks(x, y, '#991b1b', 4.8, 22, 1.4);
      this.rays(x, y, '#fca5a5', 5.4, 34, 0.82);
      for (let i = 0; i < 4; i++) this.later(i * 75, () =>
        this.ring(x, y, 1.5 + i * 0.9, i % 2 ? '#fecaca' : '#dc2626', 0.85, 0.94 - i * 0.12, 2.1));
      this.glyph(x, y, '灭', '#ffe4e6', 3.1, 1.1, 0.9);
      this.burst(x, y, '#ef4444', 72, 9.5, 0.36, 1.05);
      this.burst(x, y, '#fff1f2', 24, 5.2, 0.22, 0.72);
      this.cloud(x, y, '#2a1a14', 34, 2.4, 1.7);
      this.blot(x, y, 4.8, '#1a0f0a', 2.0, 0.76);
      this.hooks.punch?.(0.3);
      this.hooks.shake?.(0.7, 0.8);
    } else {
      this.rays(x, y, '#a8a29e', 0.82, 7, 0.25);
      this.arc(x, y, 0.48, '#d6d3d1', -0.8, 4.5, 0.3, 0.65, 0, 5);
      this.burst(x, y, '#78716c', 11, 3.6, 0.16, 0.46);
      this.cloud(x, y, '#33291c', 6, 0.5, 0.78);
      this.blot(x, y, 0.9, '#241a10', 0.68, 0.34);
    }
  }

  /** Boss 登场 */
  bossSpawn(x: number, y: number, glyph = '敌') {
    this.flash('#450a0a', 0.72, 0.62);
    this.rune(x, y, 3.6, '#dc2626', 1.15, -3.8, 0.96);
    this.rune(x, y, 2.35, '#f59e0b', 0.9, 6, 0.8);
    this.cracks(x, y, '#7f1d1d', 4.5, 20, 1.25);
    this.rays(x, y, '#fda4af', 5.6, 32, 0.78);
    this.ring(x, y, 5.5, '#dc2626', 1.0, 0.98, 2.8);
    this.burst(x, y, '#b91c1c', 70, 9.2, 0.38, 1.15);
    this.burst(x, y, '#fda4af', 24, 5.2, 0.22, 0.78);
    this.cloud(x, y, '#200f0a', 34, 2.7, 1.8);
    this.blot(x, y, 5.2, '#120806', 2.2, 0.8);
    this.glyph(x, y, glyph, '#ffb4a2', 3.4, 1.15, 0.92);
    this.hooks.punch?.(0.34);
    this.hooks.shake?.(0.65, 0.8);
  }

  /** Boss 技能的视觉锚点：每个机制都有独立颜色、书法字和运动方向。 */
  bossSkill(x: number, y: number, key: string, targetX = x, targetY = y) {
    const bossGlyph = key === 'xiahoudun' ? '夏' : key === 'caoren' ? '曹' : key === 'zhangliao' ? '张' : '许';
    const bossColor = key === 'caoren' ? '#34d399' : key === 'zhangliao' ? '#60a5fa' : key === 'xiahoudun' ? '#ef4444' : '#f59e0b';
    this.sourceMark(x, y, bossColor, bossGlyph, 1.3);
    if (key === 'xiahoudun') {
      this.flash('#7f1d1d', 0.42, 0.34);
      this.rune(x, y, 2.35, '#ef4444', 0.72, 7, 0.94);
      this.cracks(x, y, '#991b1b', 3.3, 16, 0.95);
      this.rays(x, y, '#fca5a5', 3.5, 24, 0.58);
      for (let i = 0; i < 3; i++) this.later(i * 65, () =>
        this.arc(x, y, 2.4 + i * 0.38, i === 1 ? '#fff1f2' : '#ef4444', -0.95, 1.9, 0.62, 0.94 - i * 0.12, 0, i % 2 ? 5 : -5));
      this.glyph(x, y, '狂', '#fecaca', 2.8, 0.9, 0.88);
      this.burst(x, y, '#ef4444', 36, 6.4, 0.22, 0.68);
    } else if (key === 'zhangliao') {
      const a = Math.atan2(targetY - y, targetX - x), px = -Math.sin(a), py = Math.cos(a);
      this.rune(x, y, 1.9, '#60a5fa', 0.58, -8, 0.9);
      this.cone(x, y, Math.max(5, Math.hypot(targetX - x, targetY - y)), a, 0.42, '#1d4ed8', 0.48, 0.22);
      this.blade(x, y, targetX, targetY, '#bfdbfe', 0.34, 0.42);
      this.blade(x + px * 0.35, y + py * 0.35, targetX + px * 0.35, targetY + py * 0.35, '#2563eb', 0.12, 0.5);
      this.blade(x - px * 0.35, y - py * 0.35, targetX - px * 0.35, targetY - py * 0.35, '#38bdf8', 0.09, 0.54);
      this.rays(x, y, '#93c5fd', 2.7, 20, 0.48, a);
      this.glyph(x, y, '突', '#dbeafe', 2.5, 0.82, 0.86);
      this.burst(x, y, '#60a5fa', 28, 6.2, 0.2, 0.62);
    } else if (key === 'caoren') {
      this.flash('#022c22', 0.3, 0.34);
      this.rune(x, y, 3.25, '#34d399', 0.92, 3.5, 0.96);
      this.rune(x, y, 2.1, '#a7f3d0', 0.75, -5, 0.8);
      for (let i = 0; i < 4; i++) this.later(i * 62, () => {
        this.ring(x, y, 2.1 + i * 0.52, i % 2 ? '#a7f3d0' : '#059669', 0.72, 0.94 - i * 0.1, 1.62);
        this.arc(x, y, 2.35 + i * 0.46, '#34d399', i * 0.8, Math.PI * 1.2, 0.78, 0.78, 0, i % 2 ? 3 : -3);
      });
      this.glyph(x, y, '壁', '#d1fae5', 2.8, 0.95, 0.9);
      this.burst(x, y, '#10b981', 32, 4.8, 0.22, 0.72);
    } else if (key === 'xuchu') {
      this.flash('#78350f', 0.42, 0.38);
      this.rune(x, y, 2.4, '#f59e0b', 0.75, 6, 0.9);
      this.cracks(x, y, '#92400e', 4.2, 18, 1.05);
      this.rays(x, y, '#fde68a', 4.8, 28, 0.68);
      for (let i = 0; i < 4; i++) this.later(i * 78, () =>
        this.ring(x, y, 1.8 + i * 0.85, i % 2 ? '#fde68a' : '#f59e0b', 0.78, 0.92 - i * 0.12, 1.85));
      this.glyph(x, y, '吼', '#fff7cc', 3.05, 1.0, 0.92);
      this.cloud(x, y, '#3b2014', 28, 2.1, 1.28);
      this.burst(x, y, '#fbbf24', 34, 6.4, 0.24, 0.72);
    }
  }

  /** 赤壁火势 */
  fire(x: number, y: number) {
    this.glow(x, y, 4.2, '#f97316', 1.0, 0.48);
    this.rune(x, y, 1.65, '#f97316', 0.72, 4, 0.56);
    this.ring(x, y, 2.35, '#fb923c', 0.8, 0.56, 1.55);
    this.rays(x, y, '#fde047', 2.45, 14, 0.55);
    for (let i = 0; i < 18; i++) {
      this.glowField.emit({
        x: x + (Math.random() - 0.5) * 2.6, y: y + (Math.random() - 0.5) * 0.4, z: 0.4,
        vx: (Math.random() - 0.5) * 0.8, vy: 0.8 + Math.random() * 1.4,
        life: 0.8 + Math.random() * 0.8,
        size0: 0.26, size1: 0.04, a0: 0.9, a1: 0, color: Math.random() < 0.55 ? '#f97316' : '#fde047',
      });
    }
    this.cloud(x, y + 0.7, '#431407', 8, 1.5, 1.1);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.clear();
    this.glowField.dispose(this.scene);
    this.inkField.dispose(this.scene);
    for (const f of this.fades) {
      this.scene.remove(f.mesh);
      f.mesh.geometry.dispose();
      f.mat.dispose();
    }
    this.fades = [];
    this.glowTex.dispose();
    this.inkTex.dispose();
    this.beamTex.dispose();
    runeTex?.dispose();
    runeTex = null;
    for (const tex of glyphCache.values()) tex.dispose();
    glyphCache.clear();
  }
}
