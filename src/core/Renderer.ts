import type { Mat4 } from '../math/mat4';
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
  private readonly uvLoc: number;
  private readonly projectionLoc: WebGLUniformLocation;
  private readonly viewLoc: WebGLUniformLocation;
  private readonly textureLoc: WebGLUniformLocation;

  /** 预分配的矩阵，避免每帧 GC */
  private readonly viewMatrix: Mat4 = new Float32Array(16);
  private readonly projectionMatrix: Mat4 = new Float32Array(16);

  /** RAF id */
  private rafId = 0;
  /** 是否正在渲染 */
  private running = false;
  /** ResizeObserver */
  private resizeObserver: ResizeObserver | null = null;

  /**
   * @param container     挂载容器，canvas 将插入其中
   * @param camera        相机实例
   * @param webglVersion  请求的 WebGL 版本，默认 1；若请求 2 但不支持则自动降级到 1
   */
  constructor(container: HTMLElement, camera: Camera, webglVersion: 1 | 2 = 1) {
    this.camera = camera;

    // 创建 canvas
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    container.appendChild(this.canvas);

    // 获取 WebGL 上下文（含自动降级逻辑）
    const { gl, version } = this.acquireContext(webglVersion);
    this.gl = gl;
    this.webglVersion = version;

    // 根据版本选择对应 Shader 源码
    const vsSource = version === 2 ? VERTEX_SHADER_SOURCE_300 : VERTEX_SHADER_SOURCE;
    const fsSource = version === 2 ? FRAGMENT_SHADER_SOURCE_300 : FRAGMENT_SHADER_SOURCE;

    // 编译 shader program
    this.program = this.createProgram(vsSource, fsSource);
    gl.useProgram(this.program);

    // 获取 attribute locations（-1 表示未找到）
    const positionLoc = gl.getAttribLocation(this.program, 'aPosition');
    const uvLoc = gl.getAttribLocation(this.program, 'aUv');
    if (positionLoc === -1 || uvLoc === -1) {
      throw new Error('Renderer: missing required attribute location');
    }
    this.positionLoc = positionLoc;
    this.uvLoc = uvLoc;

    // 获取 uniform locations（null 表示未找到；注意 0 是合法的 location 值，不能用 falsy 判断）
    const projectionLoc = gl.getUniformLocation(this.program, 'uProjection');
    const viewLoc = gl.getUniformLocation(this.program, 'uView');
    const textureLoc = gl.getUniformLocation(this.program, 'uTexture');
    if (projectionLoc === null || viewLoc === null || textureLoc === null) {
      throw new Error('Renderer: missing required uniform location');
    }
    this.projectionLoc = projectionLoc;
    this.viewLoc = viewLoc;
    this.textureLoc = textureLoc;

    // 创建球体几何
    this.geometry = new SphereGeometry(gl);

    // 启用深度测试与背面剔除（剔除球体外表面，因相机在内侧观察）
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);

    // 初始 resize
    this.resize();

    // 监听容器尺寸变化
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
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

  /** 调整 canvas 与 viewport 尺寸 */
  resize(): void {
    const container = this.canvas.parentElement;
    if (!container) return;
    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;
    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /** 注入视频纹理 */
  setVideoTexture(texture: VideoTexture): void {
    this.videoTexture = texture;
  }

  /** 启动渲染循环 */
  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.render();
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

    // 视频纹理可能尚未注入
    const texture = this.videoTexture;
    if (!texture) return;

    // 上传视频纹理（仅在检测到新帧时才同步上传）
    texture.update(gl);

    // 清屏
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 计算矩阵
    const aspect = this.canvas.width / this.canvas.height;
    this.camera.getViewMatrix(this.viewMatrix);
    this.camera.getProjectionMatrix(aspect, this.projectionMatrix);

    // 上传 uniform
    gl.uniformMatrix4fv(this.projectionLoc, false, this.projectionMatrix);
    gl.uniformMatrix4fv(this.viewLoc, false, this.viewMatrix);

    // 绑定纹理到单元 0
    texture.bind(gl, 0);
    gl.uniform1i(this.textureLoc, 0);

    // 绘制球体
    this.geometry.draw(gl, this.positionLoc, this.uvLoc);
  }

  /** 释放全部 GL 资源 */
  dispose(): void {
    this.stop();
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
