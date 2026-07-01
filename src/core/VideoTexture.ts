import type { GLContext } from './Renderer';

/**
 * 视频纹理：管理 video 元素与 WebGL 纹理对象。
 *
 * - 创建 `<video>` 元素，配置 muted/playsInline/loop 满足自动播放策略
 * - 首帧用 texImage2D 分配，后续用 texSubImage2D 区域更新
 * - 双重检测机制：优先 requestVideoFrameCallback 精确感知新帧，
 *   降级使用 currentTime dirty check（覆盖 VFC 停止触发的场景）
 * - WebGL2 下启用 mipmap + 三线性过滤（LINEAR_MIPMAP_LINEAR），清晰度更高
 * - 启用各向异性过滤（EXT_texture_filter_anisotropic）消除掠射角模糊
 * - 禁用颜色空间转换（UNPACK_COLORSPACE_CONVERSION_NONE）保留原始像素
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
  /** 是否运行在 WebGL2 上下文（决定是否启用 mipmap） */
  private readonly isWebGL2: boolean;
  /** 各向异性过滤扩展（可能为 null） */
  private readonly anisoExt: {
    TEXTURE_MAX_ANISOTROPY_EXT: number;
    MAX_TEXTURE_MAX_ANISOTROPY_EXT: number;
  } | null;
  /** 最大各向异性采样值（0 表示不支持） */
  private readonly maxAnisotropy: number;

  constructor(gl: GLContext) {
    // 检测上下文版本：WebGL2RenderingContext 继承自 WebGLRenderingContext
    this.isWebGL2 =
      typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;

    // 检测各向异性过滤扩展（消除掠射角的模糊，显著提升球面边缘清晰度）
    this.anisoExt =
      (gl.getExtension('EXT_texture_filter_anisotropic') as {
        TEXTURE_MAX_ANISOTROPY_EXT: number;
        MAX_TEXTURE_MAX_ANISOTROPY_EXT: number;
      } | null) ||
      (gl.getExtension('MOZ_EXT_texture_filter_anisotropic') as {
        TEXTURE_MAX_ANISOTROPY_EXT: number;
        MAX_TEXTURE_MAX_ANISOTROPY_EXT: number;
      } | null) ||
      (gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') as {
        TEXTURE_MAX_ANISOTROPY_EXT: number;
        MAX_TEXTURE_MAX_ANISOTROPY_EXT: number;
      } | null);
    this.maxAnisotropy = this.anisoExt
      ? (gl.getParameter(this.anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number)
      : 0;

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

    if (this.isWebGL2) {
      // WebGL2：支持 NPOT 纹理 mipmap，启用三线性过滤以获得最佳清晰度
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    } else {
      // WebGL1：NPOT 不兼容 mipmap，使用双线性过滤
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    // 各向异性过滤：在掠射角（球面远端）采样时使用各向异性而非各向同性采样，
    // 显著减少远端区域的模糊与摩尔纹，是 VR 球面渲染清晰度的关键提升
    if (this.anisoExt && this.maxAnisotropy > 0) {
      gl.texParameterf(
        gl.TEXTURE_2D,
        this.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT,
        this.maxAnisotropy,
      );
    }

    // UNPACK_FLIP_Y_WEBGL 只需设置一次
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    // 禁用浏览器默认颜色空间转换，保留视频原始像素，避免转换导致的精度损失
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    // 检测 API 支持
    this.supportsVFC =
      typeof HTMLVideoElement !== 'undefined' &&
      'requestVideoFrameCallback' in HTMLVideoElement.prototype;

    if (this.supportsVFC) {
      this.scheduleVFC();
    }
  }

  /** 注册 requestVideoFrameCallback：每次解码出新帧时标记待上传 */
  private scheduleVFC(): void {
    // 先取消旧回调（换源时调用，避免泄漏）
    this.cancelVFC();

    const cb = /* @__PURE__ */ () => {
      this.pendingFrame = true;
      this.vfcId = (
        this.video as { requestVideoFrameCallback(fn: () => void): number }
      ).requestVideoFrameCallback(cb);
    };
    this.vfcId = (
      this.video as { requestVideoFrameCallback(fn: () => void): number }
    ).requestVideoFrameCallback(cb);
  }

  /** 取消当前注册的 VFC 回调 */
  private cancelVFC(): void {
    if (this.vfcId !== null) {
      (this.video as { cancelVideoFrameCallback(id: number): void }).cancelVideoFrameCallback(
        this.vfcId,
      );
      this.vfcId = null;
    }
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
    // 重新注册 VFC，确保新视频源能精确检测新帧
    if (this.supportsVFC) {
      this.scheduleVFC();
    }
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
  update(gl: GLContext): boolean {
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
    }

    // 不支持 VFC：纯 dirty check
    if (Math.abs(v.currentTime - this.lastUploadedTime) > 0.05) {
      this.lastUploadedTime = v.currentTime;
      return true;
    }
    return false;
  }

  /**
   * 执行实际的像素上传到 GPU。
   * 这是同步操作（CPU→GPU 拷贝），是唯一的阻塞点。
   * WebGL2 下额外生成 mipmap 以支持三线性过滤。
   */
  private upload(gl: GLContext): void {
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    if (!this.textureInitialized) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
      this.textureInitialized = true;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
    }

    // WebGL2：每帧上传后重新生成 mipmap，确保缩放时三线性过滤生效
    if (this.isWebGL2) {
      gl.generateMipmap(gl.TEXTURE_2D);
    }
  }

  /**
   * 绑定纹理到指定纹理单元。
   */
  bind(gl: GLContext, unit: number): void {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
  }

  /** 释放全部资源 */
  dispose(gl: GLContext): void {
    this.cancelVFC();
    gl.deleteTexture(this.texture);
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }
}
