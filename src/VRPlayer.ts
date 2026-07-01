import { Camera } from './core/Camera';
import { DragController } from './core/DragController';
import { GyroscopeController } from './core/GyroscopeController';
import { Renderer } from './core/Renderer';
import { VideoTexture } from './core/VideoTexture';
import type { VRPlayerOptions } from './types';

/**
 * VRPlayer：轻量级 360° 全景视频 VR 播放器。
 *
 * 基于纯 WebGL 实现，零运行时依赖。
 * 将全景视频贴附到内表面球体上，相机位于球心，
 * 用户通过拖动转动视角浏览全景，支持 FOV 视野角度配置。
 *
 * @example
 * ```ts
 * const player = new VRPlayer({
 *   container: document.getElementById('player')!,
 *   fov: 75,
 * });
 * await player.load('/video/panorama.mp4');
 * ```
 */
export class VRPlayer {
  /** 配置项（合并默认值后） */
  private readonly options: Required<VRPlayerOptions>;
  /** 相机 */
  private camera: Camera;
  /** 视频纹理 */
  private videoTexture: VideoTexture;
  /** 渲染器 */
  private renderer: Renderer;
  /** 拖动控制器 */
  private dragController: DragController;
  /** 陀螺仪控制器 */
  private gyroController: GyroscopeController;
  /** 是否已销毁 */
  private destroyed = false;

  constructor(options: VRPlayerOptions) {
    // 合并默认值
    this.options = {
      container: options.container,
      fov: options.fov ?? 90,
      muted: options.muted ?? false,
      loop: options.loop ?? false,
      webgl: options.webgl ?? 1,
      renderScale: options.renderScale ?? 1,
      gyroscope: options.gyroscope ?? false,
    };

    // 初始化各模块（顺序很重要）
    this.camera = new Camera();
    this.camera.setFov(this.options.fov);

    // 先创建 Renderer（含 GL 上下文），再用 GL 上下文创建 VideoTexture。
    // 解决 VideoTexture 依赖 GL 上下文、Renderer 依赖 VideoTexture 的循环依赖。
    this.renderer = new Renderer(
      this.options.container,
      this.camera,
      this.options.webgl,
      this.options.renderScale,
    );
    this.videoTexture = new VideoTexture(this.renderer.gl);
    this.renderer.setVideoTexture(this.videoTexture);

    this.videoTexture.setLoop(this.options.loop);
    this.videoTexture.setMuted(this.options.muted);

    // 拖动控制器
    this.dragController = new DragController(this.renderer.canvas, this.camera);

    // 陀螺仪控制器（与拖动控制器共存，均通过增量叠加修改 Camera）
    this.gyroController = new GyroscopeController(this.camera);
    if (this.options.gyroscope) {
      // 异步尝试开启；iOS 13+ 在无用户手势时会失败，仅 warn 不影响其他功能。
      // dispose 后 enable 会安全返回 false，不会残留监听。
      void this.gyroController
        .enable()
        .then((ok) => {
          if (!ok && !this.destroyed) {
            console.warn(
              '[VRPlayer] Gyroscope failed to enable on construction. Call setGyroscope(true) within a user gesture on iOS.',
            );
          }
        })
        .catch(() => {});
    }

    // 启动渲染循环
    this.renderer.start();
  }

  /**
   * 加载视频源并初始化渲染管线。
   * @param src 视频 URL
   */
  async load(src: string): Promise<void> {
    this.ensureAlive();
    this.videoTexture.setSrc(src);

    // 等待视频可播放
    await this.waitReady();
  }

  /** 等待 video 元素 readyState >= 2（HAVE_CURRENT_DATA），带 15s 超时 */
  private waitReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const video = this.videoTexture.video;
      if (video.readyState >= 2) {
        resolve();
        return;
      }

      const timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error(`VRPlayer: video load timed out (15s) for "${video.src}"`));
      }, 15_000);

      const onLoadedData = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`VRPlayer: failed to load video source "${video.src}"`));
      };
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        video.removeEventListener('loadeddata', onLoadedData);
        video.removeEventListener('error', onError);
      };
      video.addEventListener('loadeddata', onLoadedData);
      video.addEventListener('error', onError);
    });
  }

  /** 播放视频 */
  async play(): Promise<void> {
    this.ensureAlive();
    try {
      await this.videoTexture.video.play();
    } catch (e) {
      // 浏览器自动播放策略可能拒绝，包装错误信息
      throw new Error(
        `VRPlayer: play() was blocked by the browser autoplay policy. Ensure muted=true or user gesture. ${e instanceof Error ? e.message : ''}`,
      );
    }
  }

  /** 暂停视频 */
  pause(): void {
    this.ensureAlive();
    this.videoTexture.video.pause();
  }

  /**
   * 设置 FOV 视野角度（度），范围 [30, 120]。
   * @param fov 视野角度
   */
  setFov(fov: number): void {
    this.ensureAlive();
    this.camera.setFov(fov);
  }

  /**
   * 设置渲染缩放倍数（> 1 为超采样，提升清晰度但增加 GPU 开销）。
   * @param scale 缩放倍数，钳制到 [0.25, 4]
   */
  setRenderScale(scale: number): void {
    this.ensureAlive();
    this.renderer.setRenderScale(scale);
  }

  /** 获取当前 FOV（度） */
  getFov(): number {
    this.ensureAlive();
    return this.camera.getFov();
  }

  /**
   * 注册 FOV 变更回调（滚轮、setFov、slider 等触发时调用）。
   * @returns 取消订阅函数，调用后移除该回调
   */
  onFovChange(cb: (fov: number) => void): () => void {
    this.ensureAlive();
    return this.camera.onFovChange(cb);
  }

  /**
   * 底层 `<video>` 元素，直接暴露给开发者进行定制化二次开发。
   *
   * 通过它可以自由实现播放控制（play/pause/seek/currentTime/duration）、
   * 监听媒体事件（timeupdate/ended/error/loadedmetadata 等）、
   * 调整音量、设置播放速率等任意需求，无需库方逐一封装。
   *
   * 注意：`src` 属性由 `load()` 管理，请勿直接修改；
   * 销毁后访问将抛出异常。
   */
  get video(): HTMLVideoElement {
    this.ensureAlive();
    return this.videoTexture.video;
  }

  /**
   * 获取播放器实际使用的 WebGL 版本。
   *
   * 当请求 `webgl: 2` 但环境不支持而降级到 1.0 时，返回 `1`，
   * 调用方可据此感知降级并做相应处理（如提示用户或切换策略）。
   */
  getWebGLVersion(): 1 | 2 {
    this.ensureAlive();
    return this.renderer.webglVersion;
  }

  /**
   * 开启或关闭陀螺仪视角控制。
   *
   * 移动设备转动时视角同步旋转，与拖动控制器共存叠加。
   *
   * **iOS 13+ 注意**：必须在用户手势（如按钮点击）内调用 `enabled=true`
   * 以通过 `requestPermission()` 权限请求；在非手势上下文中调用将返回 `false`。
   *
   * @param enabled true 开启，false 关闭
   * @returns 开启时返回是否成功（不支持或权限被拒返回 false）；关闭时返回 true
   */
  async setGyroscope(enabled: boolean): Promise<boolean> {
    this.ensureAlive();
    if (enabled) {
      return this.gyroController.enable();
    }
    this.gyroController.disable();
    return true;
  }

  /**
   * 查询陀螺仪视角控制是否已开启。
   */
  isGyroscopeEnabled(): boolean {
    this.ensureAlive();
    return this.gyroController.isEnabled();
  }

  /** 销毁播放器，释放全部资源 */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.dragController.dispose();
    this.gyroController.dispose();
    this.videoTexture.dispose(this.renderer.gl);
    this.renderer.dispose();
  }

  private ensureAlive(): void {
    if (this.destroyed) {
      throw new Error('VRPlayer: operation on destroyed player');
    }
  }
}
