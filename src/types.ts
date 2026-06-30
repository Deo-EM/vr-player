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
}
