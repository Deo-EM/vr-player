/**
 * VRPlayer 配置项。
 */
export interface VRPlayerOptions {
  /** 挂载容器元素，播放器 canvas 将插入其中 */
  container: HTMLElement;
  /** FOV 视野角度（度），默认 75，范围 [30, 120] */
  fov?: number;
  /** 是否静音，默认 true（浏览器自动播放策略要求） */
  muted?: boolean;
  /** 是否循环播放，默认 false */
  loop?: boolean;
  /**
   * WebGL 版本，1 或 2，默认 1。
   * - `1`：WebGL 1.0，兼容性最广（双线性过滤）
   * - `2`：WebGL 2.0，启用 mipmap 三线性过滤，清晰度更高
   *
   * 若选择 `2` 但浏览器不支持，将自动降级到 `1` 并输出 warning。
   */
  webgl?: 1 | 2;
}
