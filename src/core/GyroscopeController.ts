import type { Camera } from './Camera';

/**
 * 陀螺仪控制器：监听设备方向传感器，将角度变化转换为视角增量。
 *
 * - 监听 `deviceorientation` 事件，计算与上一帧的角度增量（delta）
 * - 以增量叠加方式修改 Camera 的 yaw/pitch，与拖动控制器天然共存互不覆盖
 * - 处理角度环绕（0/360 跨越）避免视角跳变
 * - 低通滤波平滑传感器噪声，消除静止抖动
 * - 根据屏幕方向修正轴映射，横竖屏均正确
 * - iOS 13+ 需在用户手势内调用 `enable()` 以通过权限请求
 * - 不支持传感器或不授予权限时优雅降级，不影响其他功能
 * - 并发安全：enable/disable/dispose 可安全交叉调用
 */
export class GyroscopeController {
  /** 被控制的相机（dispose 后置 null） */
  private camera: Camera | null;
  /** 灵敏度倍数，1.0 表示 1:1 映射 */
  private readonly sensitivity: number;
  /** 低通滤波系数，越大越平滑（0~1，0 表示不滤波） */
  private readonly smoothing: number;

  /** 当前是否已开启监听 */
  private enabled = false;
  /** 是否正在等待权限请求（防止并发 enable 重复弹窗） */
  private enabling = false;
  /** 是否已销毁 */
  private disposed = false;
  /** 上一帧的 alpha（弧度），null 表示首帧尚未建立基准 */
  private lastAlpha: number | null = null;
  /** 上一帧的 beta（弧度），null 表示首帧尚未建立基准 */
  private lastBeta: number | null = null;
  /** 平滑后的 yaw 增量（低通滤波中间态） */
  private smoothDYaw = 0;
  /** 平滑后的 pitch 增量（低通滤波中间态） */
  private smoothDPitch = 0;

  // 绑定的事件处理器引用（用于解绑）
  private readonly onDeviceOrientation: (e: DeviceOrientationEvent) => void;

  /**
   * @param camera      被控制的相机
   * @param sensitivity 灵敏度倍数，默认 1.0
   * @param smoothing   低通滤波系数 [0, 1)，0 = 不滤波，越大越平滑。默认 0.25
   */
  constructor(camera: Camera, sensitivity = 1.0, smoothing = 0.25) {
    this.camera = camera;
    this.sensitivity = sensitivity;
    this.smoothing = Math.max(0, Math.min(0.95, smoothing));
    this.onDeviceOrientation = this.handleDeviceOrientation.bind(this);
  }

  /**
   * 开启陀螺仪。
   *
   * iOS 13+ 需在用户手势（如点击）内调用以通过 `requestPermission()` 权限请求；
   * 在非手势上下文中调用将无法获取权限，返回 `false`。
   *
   * 并发安全：正在请求权限期间重复调用会复用同一个 Promise，不会弹出多个权限框。
   * dispose 后调用返回 `false`。
   *
   * @returns 是否成功开启（不支持传感器、权限被拒绝或已销毁时返回 false）
   */
  async enable(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.enabled) return true;
    // 正在请求权限时，复用进行中的 Promise 避免重复弹窗
    if (this.enabling) return this.pendingEnable ?? Promise.resolve(false);

    this.enabling = true;
    this.pendingEnable = this.doEnable();
    try {
      return await this.pendingEnable;
    } finally {
      this.enabling = false;
      this.pendingEnable = null;
    }
  }

  private pendingEnable: Promise<boolean> | null = null;

  private async doEnable(): Promise<boolean> {
    if (this.disposed) return false;

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

    // 权限请求期间可能已 dispose
    if (this.disposed) return false;

    // 重置基准，首帧不施加 delta 避免跳变
    this.lastAlpha = null;
    this.lastBeta = null;
    this.smoothDYaw = 0;
    this.smoothDPitch = 0;
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
    this.smoothDYaw = 0;
    this.smoothDPitch = 0;
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
   * - 低通滤波平滑增量，消除传感器高频噪声
   */
  private handleDeviceOrientation(e: DeviceOrientationEvent): void {
    if (!this.enabled || !this.camera) return;
    if (e.alpha === null || e.beta === null) return;

    const { alphaAxis, betaAxis, alphaSign, betaSign } = this.getAxisMapping();

    const alphaRad = (alphaAxis(e.alpha) * Math.PI) / 180;
    const betaRad = (betaAxis(e.beta) * Math.PI) / 180;

    // 首帧建立基准，不施加增量
    if (this.lastAlpha === null || this.lastBeta === null) {
      this.lastAlpha = alphaRad;
      this.lastBeta = betaRad;
      return;
    }

    // 计算环绕安全的增量（处理 0/2π 跨越）
    const dAlpha = angleDelta(alphaRad, this.lastAlpha) * alphaSign;
    const dBeta = angleDelta(betaRad, this.lastBeta) * betaSign;

    this.lastAlpha = alphaRad;
    this.lastBeta = betaRad;

    // 低通滤波：smoothed = prev + alpha * (raw - prev)
    // alpha = 1 - smoothing，alpha 越大（smoothing 越小）越跟随原始值
    // smoothing=0 时 alpha=1，无滤波；smoothing 越大越平滑（有轻微延迟）
    const alpha = 1 - this.smoothing;
    this.smoothDYaw = this.smoothDYaw + alpha * (dAlpha - this.smoothDYaw);
    this.smoothDPitch = this.smoothDPitch + alpha * (dBeta - this.smoothDPitch);

    // 设备右转（alpha 增大）→ 视角向左转（yaw 减小），故取反
    // 设备前倾（beta 增大）→ 视角向上看（pitch 减小），故取反
    const yaw = this.camera.getYaw() - this.smoothDYaw * this.sensitivity;
    const pitch = this.camera.getPitch() - this.smoothDPitch * this.sensitivity;
    this.camera.setYawPitch(yaw, pitch);
  }

  /**
   * 根据屏幕方向返回轴映射函数与符号。
   *
   * `deviceorientation` 的坐标系是相对设备硬件（竖屏为基准），
   * 横屏时需要交换/取反轴以保持"转动设备 → 视角同步旋转"的直觉。
   */
  private getAxisMapping(): {
    alphaAxis: (v: number) => number;
    betaAxis: (v: number) => number;
    alphaSign: number;
    betaSign: number;
  } {
    const orient =
      typeof screen !== 'undefined' && screen.orientation
        ? screen.orientation.type
        : 'portrait-primary';

    // 横屏：alpha 与 beta 的物理含义需调整
    if (orient.startsWith('landscape')) {
      const sign = orient === 'landscape-secondary' ? -1 : 1;
      return {
        alphaAxis: (v) => v,
        betaAxis: (v) => v,
        alphaSign: sign,
        betaSign: sign,
      };
    }
    // 竖屏（默认）
    return {
      alphaAxis: (v) => v,
      betaAxis: (v) => v,
      alphaSign: 1,
      betaSign: 1,
    };
  }

  /** 释放资源（移除事件监听）。 */
  dispose(): void {
    this.disposed = true;
    this.disable();
    this.camera = null;
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
