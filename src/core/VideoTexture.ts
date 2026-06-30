/**
 * 视频纹理：管理 video 元素与 WebGL 纹理对象。
 *
 * - 创建 `<video>` 元素，配置 muted/playsInline/loop 满足自动播放策略
 * - 首帧用 texImage2D 分配，后续用 texSubImage2D 区域更新
 * - 双重检测机制：优先 requestVideoFrameCallback 精确感知新帧，
 *   降级使用 currentTime dirty check（覆盖 VFC 停止触发的场景）
 */
export class VideoTexture {
  /** video 元素 */
  readonly video: HTMLVideoElement;
  /** WebGL 纹理对象 */
  readonly texture: WebGLTexture;

  /** 上次上传的 currentTime（用于降级 dirty check） */
  private lastUploadedTime = -1;
  /** 是否已分配纹理内存（首帧） */
  private textureInitialized = false;
  /** requestVideoFrameCallback 标记有新帧待上传 */
  private pendingFrame = false;
  /** rVFC 句柄 */
  private vfcId: number | null = null;
  /** 是否支持 requestVideoFrameCallback */
  private readonly supportsVFC: boolean;

  constructor(gl: WebGLRenderingContext) {
    // 创建 video 元素
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.loop = false;
    this.video.crossOrigin = 'anonymous';
    this.video.preload = 'auto';

    // 创建并初始化纹理
    const texture = gl.createTexture();
    if (!texture) throw new Error('VideoTexture: failed to create WebGLTexture');
    this.texture = texture;

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // UNPACK_FLIP_Y_WEBGL 只需设置一次
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    // 检测 API 支持
    this.supportsVFC = typeof HTMLVideoElement !== 'undefined'
      && 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

    if (this.supportsVFC) {
      this.scheduleVFC();
    }
  }

  /** 注册 requestVideoFrameCallback：每次解码出新帧时标记待上传 */
  private scheduleVFC(): void {
    const cb = /* @__PURE__ */ () => {
      this.pendingFrame = true;
      this.vfcId = (
        this.video as { requestVideoFrameCallback(fn: () => void): number; }
      ).requestVideoFrameCallback(cb);
    };
    this.vfcId = (
      this.video as { requestVideoFrameCallback(fn: () => void): number; }
    ).requestVideoFrameCallback(cb);
  }

  /**
   * 设置视频源。
   */
  setSrc(src: string): void {
    this.video.src = src;
    this.video.load();
    this.resetState();
  }

  /** 重置状态（换源时调用） */
  private resetState(): void {
    this.lastUploadedTime = -1;
    this.textureInitialized = false;
    this.pendingFrame = false;
  }

  /**
   * 设置是否循环。
   */
  setLoop(loop: boolean): void {
    this.video.loop = loop;
  }

  /**
   * 设置是否静音。
   */
  setMuted(muted: boolean): void {
    this.video.muted = muted;
  }

  /**
   * 检测是否有新帧需要上传，如果有则执行上传。
   *
   * 检测策略：
   * 1. 支持 VFC 时：优先用 VFC 标记（精确）
   * 2. VFC 未触发时（浏览器缓冲/stalled 等）：降级用 currentTime dirty check
   * 3. 不支持 VFC 时：纯 currentTime dirty check
   *
   * @returns true 表示本次有新帧（无论是否实际上传）
   */
  update(gl: WebGLRenderingContext): boolean {
    const v = this.video;

    // 视频未就绪或已结束时不更新
    if (v.readyState < 2 || v.ended) {
      return false;
    }

    // 判断是否有新帧需要上传
    const hasNewFrame = this.detectNewFrame();
    if (!hasNewFrame) {
      return false;
    }

    // 执行上传
    this.upload(gl);

    return true;
  }

  /**
   * 检测是否有新视频帧可用。
   */
  private detectNewFrame(): boolean {
    const v = this.video;

    if (this.supportsVFC) {
      // 路径 A：VFC 已标记新帧 → 立即上传
      if (this.pendingFrame) {
        this.pendingFrame = false;
        this.lastUploadedTime = v.currentTime;
        return true;
      }

      // 路径 B：VFC 未触发（浏览器可能处于 stalled/waiting 状态）
      // 用 currentTime dirty check 作为兜底，防止纹理冻结
      // 使用 > 0.05s 阈值避免浮点精度导致的重复上传
      if (Math.abs(v.currentTime - this.lastUploadedTime) > 0.05) {
        this.lastUploadedTime = v.currentTime;
        return true;
      }

      return false;
    } else {
      // 不支持 VFC：纯 dirty check
      if (Math.abs(v.currentTime - this.lastUploadedTime) > 0.05) {
        this.lastUploadedTime = v.currentTime;
        return true;
      }
      return false;
    }
  }

  /**
   * 执行实际的像素上传到 GPU。
   * 这是同步操作（CPU→GPU 拷贝），是唯一的阻塞点。
   */
  private upload(gl: WebGLRenderingContext): void {
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    if (!this.textureInitialized) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
      this.textureInitialized = true;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
    }
  }

  /**
   * 绑定纹理到指定纹理单元。
   */
  bind(gl: WebGLRenderingContext, unit: number): void {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
  }

  /** 释放全部资源 */
  dispose(gl: WebGLRenderingContext): void {
    if (this.vfcId !== null) {
      (
        this.video as { cancelVideoFrameCallback(id: number): void; }
      ).cancelVideoFrameCallback(this.vfcId);
      this.vfcId = null;
    }
    gl.deleteTexture(this.texture);
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }
}
