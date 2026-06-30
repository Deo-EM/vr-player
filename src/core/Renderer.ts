import type { Mat4 } from '../math/mat4';
import { FRAGMENT_SHADER_SOURCE } from '../shaders/fragment.glsl';
import { VERTEX_SHADER_SOURCE } from '../shaders/vertex.glsl';
import type { Camera } from './Camera';
import { SphereGeometry } from './SphereGeometry';
import type { VideoTexture } from './VideoTexture';

/**
 * WebGL 渲染器：管理 GL 上下文、Shader Program、渲染循环、Canvas resize。
 *
 * 职责：
 * - 获取 WebGL 1.0 上下文
 * - 编译/链接 Shader Program
 * - 驱动 requestAnimationFrame 渲染循环
 * - 通过 ResizeObserver 自适应容器尺寸
 */
export class Renderer {
  /** canvas 元素 */
  readonly canvas: HTMLCanvasElement;
  /** WebGL 上下文 */
  readonly gl: WebGLRenderingContext;

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
  /** 容器元素 */
  private container: HTMLElement;

  /**
   * @param container 挂载容器，canvas 将插入其中
   * @param camera    相机实例
   */
  constructor(container: HTMLElement, camera: Camera) {
    this.container = container;
    this.camera = camera;

    // 创建 canvas
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    container.appendChild(this.canvas);

    // 获取 WebGL 上下文
    const gl = this.canvas.getContext('webgl', {
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      throw new Error('Renderer: WebGL is not supported in this environment');
    }
    this.gl = gl as WebGLRenderingContext;

    // 编译 shader program
    this.program = this.createProgram(VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
    gl.useProgram(this.program);

    // 获取 locations
    this.positionLoc = gl.getAttribLocation(this.program, 'aPosition');
    this.uvLoc = gl.getAttribLocation(this.program, 'aUv');
    const projectionLoc = gl.getUniformLocation(this.program, 'uProjection');
    const viewLoc = gl.getUniformLocation(this.program, 'uView');
    const textureLoc = gl.getUniformLocation(this.program, 'uTexture');
    if (!projectionLoc || !viewLoc || !textureLoc) {
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
    const dpr = window.devicePixelRatio || 1;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
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
