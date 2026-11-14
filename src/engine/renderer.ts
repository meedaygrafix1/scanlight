import type { Params } from '../state/types';
import { VERT, EFFECT_FRAG, BRIGHT_FRAG, BLUR_FRAG, COMPOSITE_FRAG } from './shaders';
import { hexToRgb } from './color';

type Uniforms = Record<string, WebGLUniformLocation | null>;
interface Program { prog: WebGLProgram; u: Uniforms }
interface Target { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number }

const EFFECT_INDEX = { led: 0, halftone: 1, bayer: 2, diffusion: 3, ascii: 4, crt: 5 } as const;
const SHAPE_INDEX = { circle: 0, square: 1, diamond: 2 } as const;
const ANIM_INDEX = { none: 0, flicker: 1, scan: 2, pulse: 3, wave: 4, rain: 5, glitch: 6 } as const;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private effect!: Program;
  private bright!: Program;
  private blur!: Program;
  private composite!: Program;
  private srcTex!: WebGLTexture;
  private glyphTex!: WebGLTexture;
  private dataTex!: WebGLTexture;
  private lost = false;
  /** Called after the GPU context was lost and rebuilt; textures must be re-uploaded. */
  onRestore: (() => void) | null = null;
  private targets: Record<string, Target> = {};
  private srcW = 1;
  private srcH = 1;
  private glyphCount = 1;
  readonly maxSize: number;

  constructor(canvas: HTMLCanvasElement, opts: { preserve?: boolean } = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: !!opts.preserve,
    });
    if (!gl) throw new Error('WebGL2 is not supported in this browser.');
    this.gl = gl;
    this.maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 8192);

    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => {
      this.targets = {};
      this.init();
      this.lost = false;
      this.onRestore?.();
    });
    this.init();
  }

  private init() {
    const gl = this.gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    this.effect = this.program(EFFECT_FRAG);
    this.bright = this.program(BRIGHT_FRAG);
    this.blur = this.program(BLUR_FRAG);
    this.composite = this.program(COMPOSITE_FRAG);

    this.srcTex = this.texture(gl.LINEAR_MIPMAP_LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this.glyphTex = this.texture(gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this.dataTex = this.texture(gl.NEAREST);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
  }

  private program(frag: string): Program {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader error');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link error');
    const u: Uniforms = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i)!;
      const name = info.name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(prog, name);
    }
    return { prog, u };
  }

  private texture(filter: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.LINEAR_MIPMAP_LINEAR ? gl.LINEAR : filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private target(name: string, w: number, h: number): Target {
    const gl = this.gl;
    let t = this.targets[name];
    if (t && t.w === w && t.h === h) return t;
    if (t) { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); }
    const tex = this.texture(gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    t = { fb, tex, w, h };
    this.targets[name] = t;
    return t;
  }

  setSource(src: TexImageSource, w: number, h: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.srcW = w;
    this.srcH = h;
  }

  setGlyphs(atlas: TexImageSource, count: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.glyphTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.glyphCount = count;
  }

  /** Error-diffusion result, one byte per cell, row 0 = bottom. */
  setData(data: Uint8Array, cols: number, rows: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.dataTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, cols, rows, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  }

  private draw(p: Program, target: Target | null, w: number, h: number) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(p.prog);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private bindTex(unit: number, tex: WebGLTexture, loc: WebGLUniformLocation | null) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }

  render(p: Params, phase: number, width: number, height: number) {
    const gl = this.gl;
    if (this.lost) return;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;

    const bg = hexToRgb(p.bg);
    const A = ANIM_INDEX[p.anim];

    // 1. Effect pass
    const main = this.target('main', w, h);
    const e = this.effect;
    gl.useProgram(e.prog);
    this.bindTex(0, this.srcTex, e.u.uSrc);
    this.bindTex(1, this.glyphTex, e.u.uGlyphs);
    this.bindTex(2, this.dataTex, e.u.uData);
    gl.uniform2f(e.u.uRes, w, h);
    gl.uniform2f(e.u.uSrcRes, this.srcW, this.srcH);
    gl.uniform1i(e.u.uEffect, EFFECT_INDEX[p.effect]);
    gl.uniform1f(e.u.uCols, p.columns);
    gl.uniform1f(e.u.uDot, p.dot);
    gl.uniform1i(e.u.uShape, SHAPE_INDEX[p.shape]);
    gl.uniform1f(e.u.uAngle, p.angle);
    gl.uniform1f(e.u.uGap, p.gap);
    gl.uniform1f(e.u.uLevels, p.levels);
    gl.uniform1i(e.u.uMatrix, p.matrix);
    gl.uniform1f(e.u.uGlyphCount, this.glyphCount);
    gl.uniform1i(e.u.uGlyphRandom, p.glyphMode === 'random' ? 1 : 0);
    gl.uniform1f(e.u.uBright, p.brightness);
    gl.uniform1f(e.u.uContrast, p.contrast);
    gl.uniform1f(e.u.uGamma, p.gamma);
    gl.uniform1f(e.u.uBlack, p.blackPoint);
    gl.uniform1f(e.u.uInvert, p.invert ? 1 : 0);
    gl.uniform3fv(e.u.uBg, bg);
    gl.uniform3fv(e.u.uMid, hexToRgb(p.mid));
    gl.uniform3fv(e.u.uHigh, hexToRgb(p.high));
    gl.uniform1i(e.u.uColorMode, p.colorMode === 'source' ? 1 : 0);
    gl.uniform1f(e.u.uAmbient, p.ambient);
    gl.uniform1i(e.u.uAnim, A);
    gl.uniform1f(e.u.uPhase, phase);
    gl.uniform1f(e.u.uCycles, p.cycles);
    gl.uniform1f(e.u.uIntensity, p.intensity);
    this.draw(e, main, w, h);

    // 2. Glow: bright pass at 1/4, blur, then a wider blur at 1/8
    const gw = Math.max(1, Math.round(w / 4)), gh = Math.max(1, Math.round(h / 4));
    const gw2 = Math.max(1, Math.round(w / 8)), gh2 = Math.max(1, Math.round(h / 8));
    const g1 = this.target('g1', gw, gh), g2 = this.target('g2', gw, gh);
    const h1 = this.target('h1', gw2, gh2), h2 = this.target('h2', gw2, gh2);
    if (p.glow > 0.001) {
      const b = this.bright;
      gl.useProgram(b.prog);
      this.bindTex(0, main.tex, b.u.uTex);
      gl.uniform3fv(b.u.uBg, bg);
      this.draw(b, g1, gw, gh);

      const rad = 0.4 + p.glowRadius * 2.2;
      const bl = this.blur;
      const pass = (from: Target, to: Target, dx: number, dy: number) => {
        gl.useProgram(bl.prog);
        this.bindTex(0, from.tex, bl.u.uTex);
        gl.uniform2f(bl.u.uDir, dx / from.w, dy / from.h);
        this.draw(bl, to, to.w, to.h);
      };
      pass(g1, g2, rad, 0);
      pass(g2, g1, 0, rad);
      pass(g1, h1, rad * 0.5, 0); // downsample + blur
      pass(h1, h2, rad * 1.5, 0);
      pass(h2, h1, 0, rad * 1.5);
    } else {
      for (const t of [g1, h1]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    }

    // 3. Composite to screen
    const c = this.composite;
    gl.useProgram(c.prog);
    this.bindTex(0, main.tex, c.u.uImg);
    this.bindTex(1, g1.tex, c.u.uGlow);
    this.bindTex(2, h1.tex, c.u.uGlow2);
    gl.uniform2f(c.u.uRes, w, h);
    gl.uniform3fv(c.u.uBg, bg);
    gl.uniform1f(c.u.uGlowAmt, p.glow);
    gl.uniform1f(c.u.uScan, p.scanlines);
    gl.uniform1f(c.u.uNoise, p.noise);
    gl.uniform1f(c.u.uVig, p.vignette);
    gl.uniform1f(c.u.uAberr, p.aberration);
    gl.uniform1f(c.u.uCurve, p.curvature);
    gl.uniform1i(c.u.uAnim, A);
    gl.uniform1f(c.u.uPhase, phase);
    gl.uniform1f(c.u.uCycles, p.cycles);
    gl.uniform1f(c.u.uIntensity, p.intensity);
    this.draw(c, null, w, h);
  }

  dispose() {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
