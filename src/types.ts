/**
 * VRPlayer 配置项。
 */
export interface VRPlayerOptions {
  /** 挂载容器元素，播放器 canvas 将插入其中 */
  container: HTMLElement;
  /** FOV 视野角度（度），默认 90，范围 [30, 120] */
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
  /**
   * 渲染缩放倍数（相对于 devicePixelRatio），默认 1.0。
   * - `1.0`：按设备原生像素渲染（推荐，性能与清晰度平衡）
   * - `> 1.0`：超采样（SSAA），以更高分辨率渲染后由 CSS 缩放，显著提升清晰度但增加 GPU 开销
   *   - `1.5`：中等超采样，适合中高端 GPU
   *   - `2.0`：2x 超采样，极致清晰度，仅推荐高端 GPU
   * - `< 1.0`：降采样，牺牲清晰度换取性能
   */
  renderScale?: number;
}
