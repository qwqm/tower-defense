import * as THREE from 'three';

// ============================================================
//  次世代水墨特效引擎
//  - GPU 软粒子系统（辉光/墨云 双通道）
//  - 加色辉光、墨迹残影、全屏闪光、冲击波环
// ============================================================

const MAXP = 1200;
const glyphCache = new Map<string, THREE.CanvasTexture>();

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
    scene.remove(this.points);
    this.geo.dispose();
    this.mat.dispose();
  }
}

interface FadeMesh {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number; max: number;
  baseA: number; grow: number;
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
  private glowField: ParticleField;
  private inkField: ParticleField;
  private fades: FadeMesh[] = [];
  private motes: Mote[] = [];
  private respawnT = 0;
  private environment = 0;
  hooks: FxHooks = {};

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.glowTex = makeTex('glow');
    this.inkTex = makeTex('ink');
    this.glowField = new ParticleField(scene, this.glowTex, true);
    this.inkField = new ParticleField(scene, this.inkTex, false);
    for (let i = 0; i < 12; i++) {
      this.motes.push({ x: (Math.random() - 0.5) * 11, y: 5 + Math.random() * 3, vy: -(0.04 + Math.random() * 0.06), life: 6 + Math.random() * 6, t: Math.random() * 0.4 });
    }
  }

  setScale(s: number) { this.glowField.setScale(s); this.inkField.setScale(s); }

  setEnvironment(chapter: number) { this.environment = chapter; }

  update(dt: number) {
    this.glowField.update(dt);
    this.inkField.update(dt);
    for (let i = this.fades.length - 1; i >= 0; i--) {
      const f = this.fades[i];
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      f.mat.opacity = f.baseA * k * k;
      if (f.grow > 0) f.mesh.scale.setScalar(1 + (1 - k) * f.grow);
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
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 0.02) return;
    const mat = new THREE.MeshBasicMaterial({
      map: this.glowTex, color: new THREE.Color(color),
      transparent: true, opacity: baseA,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), mat);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0.9);
    m.rotation.z = Math.atan2(y2 - y1, x2 - x1);
    this.scene.add(m);
    this.fades.push({ mesh: m, mat, life, max: life, baseA, grow: 0.25 });
  }

  /** 冲击波环 */
  ring(x: number, y: number, r: number, color: string, life = 0.35, baseA = 0.75, grow = 1.9) {
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
    this.glow(x, y, crit ? 0.95 : 0.52, crit ? '#fff0ad' : color, crit ? 0.22 : 0.14, crit ? 0.95 : 0.72);
    this.ring(x, y, crit ? 0.62 : 0.34, color, crit ? 0.24 : 0.16, crit ? 0.86 : 0.62, crit ? 1.8 : 1.4);
    this.burst(x, y, crit ? '#fff4d6' : color, crit ? 8 : 3, crit ? 3.6 : 2.2, crit ? 0.13 : 0.08, crit ? 0.3 : 0.2);
  }

  /** 不完整的墨环：比完整圆环更接近书法运笔。 */
  arc(x: number, y: number, r: number, color: string, start = -0.8, span = 1.7, life = 0.4, baseA = 0.75) {
    const g = new THREE.RingGeometry(r * 0.82, r, 40, 1, start, span);
    const mat = new THREE.MeshBasicMaterial({
      map: this.glowTex, color: new THREE.Color(color), transparent: true, opacity: baseA,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, 1.05);
    this.scene.add(m);
    this.fades.push({ mesh: m, mat, life, max: life, baseA, grow: 1.2 });
  }

  /** 墨迹残留（地面印记） */
  blot(x: number, y: number, size: number, color = '#2b2219', life = 0.8, baseA = 0.45) {
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

  /** 刀兵普攻：双层弧刃、交叉闪锋、命中墨爆。 */
  daoAttack(x: number, y: number, tx: number, ty: number, color: string) {
    const ang = Math.atan2(ty - y, tx - x);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const px = -dy, py = dx;
    const len = Math.hypot(tx - x, ty - y);
    this.sourceStamp(x, y, color, '刀');
    this.directional(x, y, tx, ty, color, 0.045, 0.13);
    this.streak(x + px * 0.34 - dx * 0.18, y + py * 0.34 - dy * 0.18, tx + px * 0.62, ty + py * 0.62, '#fff8e7', 0.18, 0.18, 0.94);
    this.streak(x - px * 0.22, y - py * 0.22, x + dx * Math.min(1.4, len * 0.45) - px * 0.72, y + dy * Math.min(1.4, len * 0.45) - py * 0.72, color, 0.11, 0.24, 0.86);
    this.streak(tx - px * 0.7 - dx * 0.2, ty - py * 0.7 - dy * 0.2, tx + px * 0.7, ty + py * 0.7, '#fef3c7', 0.1, 0.22, 0.9);
    this.arc(tx, ty, 0.54, color, ang - 1.25, 1.72, 0.22, 0.82);
    this.glow(tx, ty, 0.72, '#fff4d6', 0.18, 0.9);
    this.burst(tx, ty, color, 8, 3.8, 0.11, 0.28);
    this.inkField.emit({ x: tx, y: ty, z: 0.3, vx: -px * 1.2, vy: -py * 1.2, life: 0.58, size0: 0.24, size1: 0.52, a0: 0.46, a1: 0, color: '#2b2219' });
  }

  /** 枪兵普攻：三道并列枪芒，中央枪尖带贯穿箭头。 */
  qiangAttack(x: number, y: number, tx: number, ty: number, color: string) {
    const dx0 = tx - x, dy0 = ty - y;
    const len = Math.hypot(dx0, dy0) || 1;
    const dx = dx0 / len, dy = dy0 / len;
    const px = -dy, py = dx;
    this.sourceStamp(x, y, color, '枪');
    this.directional(x, y, tx, ty, color, 0.06, 0.18);
    for (const off of [-0.16, 0, 0.16]) {
      const sx = x + px * off, sy = y + py * off;
      const ex = tx + px * off, ey = ty + py * off;
      this.streak(sx, sy, ex, ey, off === 0 ? '#eefcf8' : color, off === 0 ? 0.13 : 0.075, 0.2, off === 0 ? 0.95 : 0.72);
    }
    this.streak(x - px * 0.3, y - py * 0.3, x + dx * 0.9 - px * 0.3, y + dy * 0.9 - py * 0.3, '#d9fff3', 0.2, 0.14, 0.92);
    this.ring(tx, ty, 0.52, color, 0.2, 0.72, 1.5);
    this.glow(tx, ty, 0.76, '#eafff6', 0.18, 0.88);
    this.burst(tx, ty, color, 10, 3.5, 0.1, 0.3);
    for (let i = 1; i < 4; i++) {
      const k = i / 4;
      this.glow(x + dx0 * k, y + dy0 * k, 0.18, color, 0.14 + i * 0.02, 0.62);
    }
  }

  /** 骑兵普攻：低空冲锋拖尾 + 蹄火 + 定向重击波。 */
  cavalryCharge(x: number, y: number, tx: number, ty: number, color: string) {
    const dx0 = tx - x, dy0 = ty - y;
    const len = Math.hypot(dx0, dy0) || 1;
    const dx = dx0 / len, dy = dy0 / len;
    const px = -dy, py = dx;
    this.sourceStamp(x, y, color, '骑');
    this.directional(x, y, tx, ty, color, 0.11, 0.24);
    for (const off of [-0.3, 0, 0.3]) {
      this.streak(x + px * off - dx * 0.7, y + py * off - dy * 0.7, tx + px * off, ty + py * off, off === 0 ? '#fff2d0' : color, off === 0 ? 0.17 : 0.08, 0.26, off === 0 ? 0.96 : 0.62);
    }
    this.burst(x + dx * len * 0.42, y + dy * len * 0.42, '#fbbf24', 8, 2.8, 0.1, 0.28, 0.4);
    this.ring(tx, ty, 1.7, color, 0.32, 0.74, 2.1);
    this.ring(tx, ty, 0.72, '#fff2cf', 0.22, 0.8, 1.8);
    this.burst(tx, ty, color, 20, 5.8, 0.18, 0.45, 0.7);
    this.cloud(tx, ty, '#3c2b1d', 7, 0.65, 0.78);
    this.hooks.punch?.(0.08);
    this.hooks.shake?.(0.16, 0.12);
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

  /** 弓兵：箭矢出膛 */
  gongShot(x: number, y: number, tx: number, ty: number, color: string, sourceGlyph = '弓') {
    const ang = Math.atan2(ty - y, tx - x);
    this.sourceStamp(x, y, color, sourceGlyph);
    this.directional(x, y, tx, ty, color, 0.055, 0.2);
    this.streak(x, y, tx, ty, '#fff8e8', 0.045, 0.2, 0.88);
    this.streak(x + Math.cos(ang) * 0.12, y + Math.sin(ang) * 0.12, x + Math.cos(ang) * 0.8, y + Math.sin(ang) * 0.8, color, 0.13, 0.14, 0.78);
    this.glow(x + Math.cos(ang) * 0.4, y + Math.sin(ang) * 0.4, 0.5, color, 0.16, 0.8);
    this.arc(x, y, 0.34, '#fff0bd', ang - 1.2, 0.8, 0.18, 0.72);
    this.burst(x, y, color, 5, 1.7, 0.1, 0.25);
  }

  /** 弓兵：箭矢飞行拖尾 */
  gongTrail(x: number, y: number, color: string) {
    this.glowField.emit({ x, y, z: 0.7, life: 0.18, size0: 0.14, size1: 0.02, a0: 0.9, a1: 0, color });
    this.inkField.emit({ x, y, z: 0.64, life: 0.2, size0: 0.08, size1: 0.02, a0: 0.48, a1: 0, color: '#fff2cf' });
  }

  /** 弓兵：命中爆点 */
  gongImpact(x: number, y: number, color: string) {
    this.ring(x, y, 0.52, color, 0.24, 0.74, 1.5);
    this.streak(x - 0.48, y, x + 0.48, y, '#fff7e6', 0.07, 0.18, 0.86);
    this.streak(x, y - 0.48, x, y + 0.48, color, 0.06, 0.18, 0.72);
    this.burst(x, y, color, 10, 2.8, 0.13, 0.3);
    this.glow(x, y, 0.72, '#fff7e6', 0.2, 0.88);
  }

  // ---------- 武将技能 ----------

  /** 赵云：贯穿光束 */
  zhaoyunBeam(x1: number, y1: number, x2: number, y2: number) {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    this.directional(x1, y1, x2, y2, '#93c5fd', 0.065, 0.24);
    for (let i = -1; i <= 1; i++) {
      const off = i * 0.12;
      this.streak(x1 - Math.sin(ang) * off, y1 + Math.cos(ang) * off, x2 - Math.sin(ang) * off, y2 + Math.cos(ang) * off, i === 0 ? '#dbeafe' : '#3b82f6', i === 0 ? 0.2 : 0.1, 0.26, i === 0 ? 1 : 0.7);
    }
    this.glow(x2, y2, 1.4, '#60a5fa', 0.3, 0.9);
    this.burst(x2, y2, '#93c5fd', 8, 3.6, 0.16, 0.4);
    this.arc(x2, y2, 0.85, '#bfdbfe', ang - 0.9, 1.8, 0.32, 0.7);
  }

  /** 关羽：扇形青龙斩 */
  guanyuFan(x: number, y: number, r: number, color: string, facing = -Math.PI * 0.1) {
    const n = 9;
    const base = facing;
    for (let i = 0; i < n; i++) {
      const a = base - 0.9 + (i / (n - 1)) * 1.8;
      setTimeout(() => {
        this.streak(x, y, x + Math.cos(a) * r, y + Math.sin(a) * r, i % 2 ? '#059669' : '#a7f3d0', 0.24, 0.26, 0.9);
      }, i * 28);
    }
    this.ring(x, y, r * 0.8, color, 0.45, 0.7, 1.6);
    this.arc(x, y, r * 0.92, '#6ee7b7', -1.02, 2.04, 0.48, 0.82);
    this.glyph(x, y, '青', '#a7f3d0', Math.min(2.4, r * 0.62), 0.62, 0.68);
    this.flash('#052e16', 0.22, 0.25);
    this.glow(x, y, r * 0.7, '#10b981', 0.35, 0.5);
  }

  /** 张飞：环形震慑 */
  zhangfeiShock(x: number, y: number, r: number) {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this.ring(x, y, r * (0.45 + i * 0.28), '#9ca3af', 0.4, 0.8, 2.0);
        this.burst(x, y, '#e5e7eb', 6, 2.2, 0.12, 0.3);
      }, i * 70);
    }
    this.cloud(x, y, '#2f2a24', 14, r * 0.9, 1.1);
    this.glyph(x, y, '喝', '#f3f4f6', Math.min(2.3, r * 0.7), 0.7, 0.74);
    this.flash('#111827', 0.2, 0.2);
    this.hooks.punch?.(0.1);
    this.hooks.shake?.(0.3, 0.22);
  }

  /** 刘备：仁德金光 */
  liubeiHeal(x: number, y: number, targetX = x, targetY = y) {
    if (Math.hypot(targetX - x, targetY - y) > 0.1) this.directional(x, y, targetX, targetY, '#fbbf24', 0.08, 0.42);
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      this.glowField.emit({
        x, y, z: 0.5,
        vx: Math.cos(a) * (0.4 + Math.random() * 0.8),
        vy: 1.6 + Math.random() * 1.4,
        vz: (Math.random() - 0.5) * 0.5,
        life: 1.1 + Math.random() * 0.5,
        size0: 0.22, size1: 0.05,
        a0: 0.85, a1: 0, color: '#fbbf24', drag: 0.97, grav: -0.4,
      });
    }
    this.ring(x, y, 2.0, '#fbbf24', 0.5, 0.7, 1.8);
    this.glow(x, y, 2.2, '#fcd34d', 0.5, 0.55);
  }

  /** 马超：冲刺流光 */
  machaoDash(x1: number, y1: number, x2: number, y2: number, color: string) {
    this.directional(x1, y1, x2, y2, color, 0.075, 0.22);
    this.streak(x1, y1, x2, y2, color, 0.2, 0.2, 0.95);
    this.burst(x2, y2, color, 7, 3.4, 0.14, 0.35);
    this.glow(x2, y2, 0.8, '#fbcfe8', 0.22, 0.8);
  }

  /** 吕布：锁定后从阵位跃击至目标 */
  lubuLeap(x1: number, y1: number, x2: number, y2: number, r: number) {
    this.directional(x1, y1, x2, y2, '#f59e0b', 0.12, 0.3);
    this.streak(x1, y1, x2, y2, '#f59e0b', 0.32, 0.24, 0.95);
    this.streak(x1, y1, x2, y2, '#fff7d6', 0.11, 0.3, 1);
    this.ring(x2, y2, r, '#ef4444', 0.48, 0.9, 1.8);
    this.ring(x2, y2, r * 0.58, '#fbbf24', 0.36, 0.8, 2.2);
    this.burst(x2, y2, '#ef4444', 22, 5.4, 0.22, 0.58);
    this.burst(x2, y2, '#fef3c7', 10, 3.2, 0.14, 0.4);
    this.cloud(x2, y2, '#321711', 12, r * 0.9, 1.05);
    this.blot(x2, y2, r * 1.2, '#2a1510', 1.1, 0.48);
    this.hooks.punch?.(0.16);
    this.hooks.shake?.(0.42, 0.35);
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
      this.flash('#7f1d1d', 0.6, 0.5);
      this.ring(x, y, 5, '#dc2626', 0.8, 0.9, 2.4);
      this.burst(x, y, '#ef4444', 50, 8, 0.32, 0.9);
      this.burst(x, y, '#fecaca', 16, 4, 0.2, 0.6);
      this.cloud(x, y, '#2a1a14', 24, 2, 1.5);
      this.blot(x, y, 4, '#1a0f0a', 1.8, 0.7);
      this.hooks.punch?.(0.3);
      this.hooks.shake?.(0.7, 0.8);
    } else {
      this.burst(x, y, '#78716c', 8, 3, 0.15, 0.4);
      this.cloud(x, y, '#33291c', 4, 0.4, 0.7);
      this.blot(x, y, 0.8, '#241a10', 0.6, 0.3);
    }
  }

  /** Boss 登场 */
  bossSpawn(x: number, y: number, glyph = '敌') {
    this.flash('#450a0a', 0.6, 0.5);
    this.ring(x, y, 5.5, '#dc2626', 0.9, 0.95, 2.8);
    this.burst(x, y, '#b91c1c', 55, 8.5, 0.34, 1.0);
    this.burst(x, y, '#fda4af', 18, 4.5, 0.2, 0.7);
    this.cloud(x, y, '#200f0a', 26, 2.4, 1.6);
    this.blot(x, y, 4.6, '#120806', 2.0, 0.75);
    this.glyph(x, y, glyph, '#ff8d70', 3.0, 1.05, 0.84);
    this.hooks.punch?.(0.34);
    this.hooks.shake?.(0.65, 0.8);
  }

  /** Boss 技能的视觉锚点：每个机制都有独立颜色、书法字和运动方向。 */
  bossSkill(x: number, y: number, key: string, targetX = x, targetY = y) {
    const bossGlyph = key === 'xiahoudun' ? '夏' : key === 'caoren' ? '曹' : key === 'zhangliao' ? '张' : '许';
    const bossColor = key === 'caoren' ? '#34d399' : key === 'zhangliao' ? '#60a5fa' : key === 'xiahoudun' ? '#ef4444' : '#f59e0b';
    this.sourceMark(x, y, bossColor, bossGlyph, 1.3);
    if (key === 'xiahoudun') {
      this.flash('#7f1d1d', 0.24, 0.26);
      this.arc(x, y, 2.9, '#f87171', -0.95, 1.9, 0.55, 0.82);
      this.glyph(x, y, '狂', '#fecaca', 2.4, 0.8, 0.72);
      this.burst(x, y, '#ef4444', 18, 4.4, 0.16, 0.52);
    } else if (key === 'zhangliao') {
      this.directional(x, y, targetX, targetY, '#60a5fa', 0.14, 0.34);
      this.streak(x - 2.8, y, x + 3.6, y, '#93c5fd', 0.2, 0.34, 0.8);
      this.streak(x - 2.8, y + 0.22, x + 3.6, y + 0.22, '#2563eb', 0.1, 0.4, 0.7);
      this.glyph(x, y, '突', '#bfdbfe', 2.1, 0.72, 0.7);
      this.burst(x, y, '#60a5fa', 14, 4.2, 0.14, 0.48);
    } else if (key === 'caoren') {
      this.ring(x, y, 3.1, '#34d399', 0.62, 0.82, 1.8);
      this.arc(x, y, 3.35, '#a7f3d0', 0.1, Math.PI * 1.35, 0.7, 0.82);
      this.glyph(x, y, '壁', '#a7f3d0', 2.35, 0.82, 0.72);
      this.burst(x, y, '#10b981', 18, 3.4, 0.16, 0.56);
    } else if (key === 'xuchu') {
      this.flash('#78350f', 0.24, 0.28);
      this.ring(x, y, 2.7, '#f59e0b', 0.55, 0.85, 2.1);
      this.ring(x, y, 4.5, '#fbbf24', 0.75, 0.48, 1.65);
      this.glyph(x, y, '吼', '#fde68a', 2.65, 0.9, 0.76);
      this.cloud(x, y, '#3b2014', 16, 1.5, 1.0);
    }
  }

  /** 赤壁火势 */
  fire(x: number, y: number) {
    this.glow(x, y, 3.4, '#f97316', 0.9, 0.4);
    this.ring(x, y, 2.1, '#fb923c', 0.72, 0.45, 1.45);
    for (let i = 0; i < 8; i++) {
      this.glowField.emit({
        x: x + (Math.random() - 0.5) * 2.6, y: y + (Math.random() - 0.5) * 0.4, z: 0.4,
        vx: (Math.random() - 0.5) * 0.8, vy: 0.8 + Math.random() * 1.4,
        life: 0.7 + Math.random() * 0.6,
        size0: 0.22, size1: 0.05, a0: 0.8, a1: 0, color: Math.random() < 0.5 ? '#f97316' : '#fde047',
      });
    }
  }

  dispose() {
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
    for (const tex of glyphCache.values()) tex.dispose();
    glyphCache.clear();
  }
}
