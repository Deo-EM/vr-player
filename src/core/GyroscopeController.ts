import type { Camera } from './Camera';

/**
 * 陀螺仪控制器：监听设备方向传感器，将角度变化转换为视角增量。
 *
 * - 监听 `deviceorientation` 事件，计算与上一帧的角度增量（delta）
 * - 以增量叠加方式修改 Camera 的 yaw/pitch，与拖动控制器天然共存互不覆盖
 * - 处理角度环绕（0/360 跨越）避免视角跳变
 * - iOS 13+ 需在用户手势内调用 `enable()` 以通过权限请求
 * - 不支持传感器或不授予权限时优雅降级，不影响其他功能
 */
export class GyroscopeController {
  private camera: Camera;
  /** 灵敏度倍数，1.0 表示 1:1 映射 */
  private sensitivity: number;

  /** 当前是否已开启监听 */
  private enabled = false;
  /** 上一帧的 alpha（弧度），null 表示首帧尚未建立基准 */
  private lastAlpha: number | null = null;
  /** 上一帧的 beta（弧度），null 表示首帧尚未建立基准 */
  private lastBeta: number | null = null;

  // 绑定的事件处理器引用（用于解绑）
  private readonly onDeviceOrientation: (e: DeviceOrientationEvent) => void;

  /**
   * @param camera      被控制的相机
   * @param sensitivity 灵敏度倍数，默认 1.0
   */
  constructor(camera: Camera, sensitivity = 1.0) {
    this.camera = camera;
    this.sensitivity = sensitivity;
    this.onDeviceOrientation = this.handleDeviceOrientation.bind(this);
  }

  /**
   * 开启陀螺仪。
   *
   * iOS 13+ 需在用户手势（如点击）内调用以通过 `requestPermission()` 权限请求；
   * 在非手势上下文中调用将无法获取权限，返回 `false`。
   *
   * @returns 是否成功开启（不支持传感器或权限被拒绝时返回 false）
   */
  async enable(): Promise<boolean> {
    if (this.enabled) return true;

    // 检测环境是否支持 DeviceOrientationEvent
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
      console.warn('[VRPlayer] Gyroscope: DeviceOrientationEvent is not supported.');
      return false;
    }

    // iOS 13+ 需要显式请求权限（必须在用户手势内调用）
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (typeof DOE.requestPermission === 'function') {
      try {
        const result = await DOE.requestPermission();
        if (result !== 'granted') {
          console.warn('[VRPlayer] Gyroscope: permission denied by user.');
          return false;
        }
      } catch (e) {
        console.warn(
          '[VRPlayer] Gyroscope: requestPermission failed.',
          e instanceof Error ? e.message : '',
        );
        return false;
      }
    }

    // 重置基准，首帧不施加 delta 避免跳变
    this.lastAlpha = null;
    this.lastBeta = null;
    this.enabled = true;
    window.addEventListener('deviceorientation', this.onDeviceOrientation);
    return true;
  }

  /** 关闭陀螺仪。 */
  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.lastAlpha = null;
    this.lastBeta = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('deviceorientation', this.onDeviceOrientation);
    }
  }

  /** 当前是否已开启。 */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * deviceorientation 事件处理：计算角度增量并叠加到 Camera。
   *
   * - `alpha`（绕 Z 轴 / 罗盘方向，0~360°）→ yaw（水平偏航）
   * - `beta`（绕 X 轴 / 前后倾斜，-180~180°）→ pitch（垂直俯仰）
   * - 方向取反：设备右转时画面应向左移动（模拟"转头看"）
   */
  private handleDeviceOrientation(e: DeviceOrientationEvent): void {
    if (!this.enabled) return;
    if (e.alpha === null || e.beta === null) return;

    const alphaRad = (e.alpha * Math.PI) / 180;
    const betaRad = (e.beta * Math.PI) / 180;

    // 首帧建立基准，不施加增量
    if (this.lastAlpha === null || this.lastBeta === null) {
      this.lastAlpha = alphaRad;
      this.lastBeta = betaRad;
      return;
    }

    // 计算环绕安全的增量（处理 0/2π 跨越）
    const dAlpha = angleDelta(alphaRad, this.lastAlpha);
    const dBeta = angleDelta(betaRad, this.lastBeta);

    this.lastAlpha = alphaRad;
    this.lastBeta = betaRad;

    // 设备右转（alpha 增大）→ 视角向左转（yaw 减小），故取反
    // 设备前倾（beta 增大）→ 视角向上看（pitch 减小），故取反
    const yaw = this.camera.getYaw() - dAlpha * this.sensitivity;
    const pitch = this.camera.getPitch() - dBeta * this.sensitivity;
    this.camera.setYawPitch(yaw, pitch);
  }

  /** 释放资源（移除事件监听）。 */
  dispose(): void {
    this.disable();
    this.camera = undefined as unknown as Camera;
  }
}

/**
 * 计算两个角度之间的最短增量，处理 0/2π 环绕。
 *
 * @param current 当前角度（弧度）
 * @param prev    上一帧角度（弧度）
 * @returns 范围在 [-π, π] 的增量
 */
export function angleDelta(current: number, prev: number): number {
  let delta = current - prev;
  if (delta > Math.PI) delta -= 2 * Math.PI;
  else if (delta < -Math.PI) delta += 2 * Math.PI;
  return delta;
}
