import type { Mat4 } from '../math/mat4';
import { transpose } from '../math/mat4';
import { FRAGMENT_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE_300 } from '../shaders/fragment.glsl';
import { VERTEX_SHADER_SOURCE, VERTEX_SHADER_SOURCE_300 } from '../shaders/vertex.glsl';
import type { Camera } from './Camera';
import { SphereGeometry } from './SphereGeometry';
import type { VideoTexture } from './VideoTexture';

/** WebGL 上下文联合类型（兼容 WebGL 1.0 与 2.0） */
export type GLContext = WebGLRenderingContext | WebGL2RenderingContext;

/**
 * WebGL 渲染器：管理 GL 上下文、Shader Program、渲染循环、Canvas resize。
 *
 * 职责：
 * - 按 webglVersion 获取 WebGL 1.0 / 2.0 上下文（2.0 不可用时自动降级）
 * - 编译/链接对应版本的 Shader Program（GLSL 1.00 / 3.00）
 * - 驱动 requestAnimationFrame 渲染循环
 * - 通过 ResizeObserver 自适应容器尺寸
 */
export class Renderer {
  /** canvas 元素 */
  readonly canvas: HTMLCanvasElement;
  /** WebGL 上下文（1.0 或 2.0） */
  readonly gl: GLContext;
  /** 实际使用的 WebGL 版本（可能因降级与请求值不同） */
  readonly webglVersion: 1 | 2;

  /** Shader program */
  private program: WebGLProgram;
  /** 球体几何 */
  private geometry: SphereGeometry;
  /** 视频纹理（通过 setVideoTexture 注入，解决与 VideoTexture 的循环创建依赖） */
  private videoTexture: VideoTexture | null = null;
  /** 相机 */
  private camera: Camera;

  // attribute / uniform locations
  private readonly positionLoc: number;
  private readonly projectionLoc: WebGLUniformLocation;
  private readonly viewLoc: WebGLUniformLocation;
  private readonly textureLoc: WebGLUniformLocation;
  private readonly invViewLoc: WebGLUniformLocation;

  /** 预分配的矩阵，避免每帧 GC */
  private readonly viewMatrix: Mat4 = new Float32Array(16);
  private readonly projectionMatrix: Mat4 = new Float32Array(16);
  /** 逆视图矩阵（视图矩阵为纯旋转，其逆 = 转置） */
  private readonly invViewMatrix: Mat4 = new Float32Array(16);

  /** 渲染缩放倍数（相对于 devicePixelRatio），> 1 为超采样 */
  private renderScale: number;

  /** RAF id */
  private rafId = 0;
  /** 是否正在渲染 */
  private running = false;
  /** ResizeObserver */
  private resizeObserver: ResizeObserver | null = null;
  /** webglcontextlost 事件处理器引用（用于 dispose 时移除） */
  private readonly onContextLost: (e: Event) => void;

  /**
   * @param container     挂载容器，canvas 将插入其中
   * @param camera        相机实例
   * @param webglVersion  请求的 WebGL 版本，默认 1；若请求 2 但不支持则自动降级到 1
   * @param renderScale   渲染缩放倍数（相对于 DPR），默认 1.0，> 1 为超采样提升清晰度
   */
  constructor(container: HTMLElement, camera: Camera, webglVersion: 1 | 2 = 1, renderScale = 1) {
    this.camera = camera;
    this.renderScale = Math.max(0.25, Math.min(4, renderScale));

    // 创建 canvas
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    container.appendChild(this.canvas);

    // 局部变量跟踪已获取的 GL 上下文，供 catch 中清理使用
    let gl: GLContext | null = null;

    try {
      // 获取 WebGL 上下文（含自动降级逻辑）
      const acquired = this.acquireContext(webglVersion);
      gl = acquired.gl;
      this.gl = acquired.gl;
      this.webglVersion = acquired.version;

      // 根据版本选择对应 Shader 源码，并按设备能力升级片段着色器精度
      const precision = this.getMaxFragmentPrecision();
      const fsBase = acquired.version === 2 ? FRAGMENT_SHADER_SOURCE_300 : FRAGMENT_SHADER_SOURCE;
      const fsSource = fsBase.replace('precision mediump float;', `precision ${precision} float;`);
      const vsSource = acquired.version === 2 ? VERTEX_SHADER_SOURCE_300 : VERTEX_SHADER_SOURCE;

      // 编译 shader program
      this.program = this.createProgram(vsSource, fsSource);
      acquired.gl.useProgram(this.program);

      // 获取 attribute locations（-1 表示未找到）
      const positionLoc = acquired.gl.getAttribLocation(this.program, 'aPosition');
      if (positionLoc === -1) {
        throw new Error('Renderer: missing required attribute location');
      }
      this.positionLoc = positionLoc;

      // 获取 uniform locations（null 表示未找到；注意 0 是合法的 location 值，不能用 falsy 判断）
      const projectionLoc = acquired.gl.getUniformLocation(this.program, 'uProjection');
      const viewLoc = acquired.gl.getUniformLocation(this.program, 'uView');
      const textureLoc = acquired.gl.getUniformLocation(this.program, 'uTexture');
      const invViewLoc = acquired.gl.getUniformLocation(this.program, 'uInvView');
      if (
        projectionLoc === null ||
        viewLoc === null ||
        textureLoc === null ||
        invViewLoc === null
      ) {
        throw new Error('Renderer: missing required uniform location');
      }
      this.projectionLoc = projectionLoc;
      this.viewLoc = viewLoc;
      this.textureLoc = textureLoc;
      this.invViewLoc = invViewLoc;

      // 创建球体几何：WebGL2 使用更高细分度 + Uint32 索引以减少 UV 仿射插值误差
      if (acquired.version === 2) {
        // 512x256 细分，配合 Uint32 索引突破 65535 顶点限制
        this.geometry = new SphereGeometry(acquired.gl, 50, 512, 256, true);
      } else {
        this.geometry = new SphereGeometry(acquired.gl, 50, 200, 100, false);
      }

      // 启用深度测试与背面剔除（剔除球体外表面，因相机在内侧观察）
      acquired.gl.enable(acquired.gl.DEPTH_TEST);
      acquired.gl.enable(acquired.gl.CULL_FACE);
      acquired.gl.cullFace(acquired.gl.FRONT);

      // 初始 resize
      this.resize();

      // 监听容器尺寸变化
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(container);
      }

      // 监听 WebGL 上下文丢失：阻止默认行为以允许后续恢复，
      // 丢失时暂停渲染循环，避免在失效上下文上产生 GL 错误刷屏
      this.onContextLost = (e: Event) => {
        e.preventDefault();
        this.stop();
        console.warn('[VRPlayer] WebGL context lost. Rendering paused.');
      };
      this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    } catch (e) {
      // 构造失败时回滚已分配的资源，避免泄漏
      // 字段在 try 块中赋值，catch 时可能尚未初始化，用类型断言安全访问
      if (gl && !gl.isContextLost()) {
        try {
          const geometry = (this as unknown as { geometry?: SphereGeometry }).geometry;
          geometry?.dispose(gl);
        } catch {
          // 忽略清理过程中的错误
        }
        try {
          const program = (this as unknown as { program?: WebGLProgram }).program;
          if (program) gl.deleteProgram(program);
        } catch {
          // 忽略清理过程中的错误
        }
      }
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      if (this.canvas.parentNode) {
        this.canvas.parentNode.removeChild(this.canvas);
      }
      throw e;
    }
  }

  /**
   * 获取 WebGL 上下文。
   * - 请求 2 时优先 `webgl2`，失败则降级 `webgl` 并输出 warning
   * - 请求 1 时直接用 `webgl`（兼容性最好）
   */
  private acquireContext(requested: 1 | 2): { gl: GLContext; version: 1 | 2 } {
    const attrs: WebGLContextAttributes = {
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: false,
    };

    if (requested === 2) {
      const gl2 = this.canvas.getContext('webgl2', attrs) as WebGL2RenderingContext | null;
      if (gl2) {
        return { gl: gl2, version: 2 };
      }
      // 降级
      console.warn(
        '[VRPlayer] WebGL 2.0 is not available in this environment, falling back to WebGL 1.0.',
      );
    }

    const gl1 = this.canvas.getContext('webgl', attrs) as WebGLRenderingContext | null;
    if (!gl1) {
      throw new Error('Renderer: WebGL is not supported in this environment');
    }
    return { gl: gl1, version: 1 };
  }

  /**
   * 检测片段着色器可用的最高浮点精度。
   * - WebGL2：highp 是核心保证，始终可用
   * - WebGL1：需通过 getShaderPrecisionFormat 检测，不支持则回退 mediump
   *
   * highp（fp32）可消除 mediump（fp16）在渐变色区域产生的色带，提升画质。
   */
  private getMaxFragmentPrecision(): 'highp' | 'mediump' {
    const gl = this.gl;
    if (this.webglVersion === 2) return 'highp';
    const fmt = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    return fmt && fmt.precision > 0 ? 'highp' : 'mediump';
  }

  /** 编译单个 shader */
  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) {
      throw new Error('Renderer: failed to create WebGLShader');
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Renderer: shader compile error: ${info}`);
    }
    return shader;
  }

  /** 创建并链接 program */
  private createProgram(vsSource: string, fsSource: string): WebGLProgram {
    const gl = this.gl;
    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    if (!program) {
      throw new Error('Renderer: failed to create WebGLProgram');
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Renderer: program link error: ${info}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return program;
  }

  /** 调整 canvas 与 viewport 尺寸（按 renderScale × DPR 超采样） */
  resize(): void {
    const container = this.canvas.parentElement;
    if (!container) return;
    const dpr = window.devicePixelRatio || 1;
    const scale = this.renderScale * dpr;
    const width = container.clientWidth;
    const height = container.clientHeight;
    this.canvas.width = Math.max(1, Math.floor(width * scale));
    this.canvas.height = Math.max(1, Math.floor(height * scale));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /** 注入视频纹理 */
  setVideoTexture(texture: VideoTexture): void {
    this.videoTexture = texture;
  }

  /**
   * 动态调整渲染缩放倍数，立即触发 resize 重新计算 canvas 分辨率。
   * @param scale 缩放倍数，钳制到 [0.25, 4]，> 1 为超采样
   */
  setRenderScale(scale: number): void {
    this.renderScale = Math.max(0.25, Math.min(4, scale));
    this.resize();
  }

  /** 启动渲染循环 */
  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      // 单帧渲染异常不应静默终止循环；捕获后记录并停止，避免画面冻结且无日志
      try {
        this.render();
      } catch (e) {
        console.error('[VRPlayer] render loop error:', e);
        this.stop();
        return;
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /** 停止渲染循环 */
  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  /** 单帧渲染 */
  private render(): void {
    const gl = this.gl;

    // 上下文丢失时跳过渲染，避免在失效上下文上产生 GL 错误
    if (gl.isContextLost()) return;

    // 视频纹理可能尚未注入
    const texture = this.videoTexture;
    if (!texture) return;

    // 上传视频纹理（仅在检测到新帧时才同步上传）
    texture.update(gl);

    // 清屏
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 视频纹理尚未初始化（视频未加载/首帧未到达）时跳过绘制，
    // 避免对 incomplete texture 采样产生控制台警告
    if (!texture.ready) return;

    // 计算矩阵
    const aspect = this.canvas.width / this.canvas.height;
    this.camera.getViewMatrix(this.viewMatrix);
    this.camera.getProjectionMatrix(aspect, this.projectionMatrix);

    // 逆视图矩阵：视图矩阵为纯旋转矩阵，逆矩阵 = 转置
    transpose(this.invViewMatrix, this.viewMatrix);

    // 上传 uniform
    gl.uniformMatrix4fv(this.projectionLoc, false, this.projectionMatrix);
    gl.uniformMatrix4fv(this.viewLoc, false, this.viewMatrix);
    gl.uniformMatrix4fv(this.invViewLoc, false, this.invViewMatrix);

    // 绑定纹理到单元 0
    texture.bind(gl, 0);
    gl.uniform1i(this.textureLoc, 0);

    // 绘制球体（逐像素光线投射，不再需要顶点 UV）
    this.geometry.draw(gl, this.positionLoc);
  }

  /** 释放全部 GL 资源 */
  dispose(): void {
    this.stop();
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    const gl = this.gl;
    this.geometry.dispose(gl);
    gl.deleteProgram(this.program);
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}
