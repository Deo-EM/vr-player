import {
  type Mat4,
  perspective as mat4Perspective,
  rotationYawPitch,
  transpose,
} from '../math/mat4';

/**
 * 相机：管理 yaw/pitch/fov，计算视图与投影矩阵。
 *
 * - yaw：绕 Y 轴水平偏航（弧度），正值向右
 * - pitch：绕 X 轴俯仰（弧度），钳制在 ±85° 防止翻转
 * - fov：视野角度（度），范围 [30, 120]
 */
export class Camera {
  /** 水平偏航角（弧度） */
  private yaw = 0;
  /** 垂直俯仰角（弧度） */
  private pitch = 0;
  /** 视野角度（度） */
  private fov = 75;

  /** pitch 钳制上限（弧度） */
  private static readonly MAX_PITCH = (85 * Math.PI) / 180;
  /** FOV 下限（度） */
  private static readonly MIN_FOV = 30;
  /** FOV 上限（度） */
  private static readonly MAX_FOV = 120;

  /** 预分配的旋转矩阵，避免每帧 GC */
  private readonly rotation: Mat4 = new Float32Array(16);

  /** FOV 变更回调 */
  onFovChange?: (fov: number) => void;

  /**
   * 设置 yaw/pitch。
   * @param yaw   偏航角（弧度）
   * @param pitch 俯仰角（弧度），自动钳制到 ±85°
   */
  setYawPitch(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = Math.max(-Camera.MAX_PITCH, Math.min(Camera.MAX_PITCH, pitch));
  }

  /** 获取当前 yaw（弧度） */
  getYaw(): number {
    return this.yaw;
  }

  /** 获取当前 pitch（弧度） */
  getPitch(): number {
    return this.pitch;
  }

  /**
   * 设置 FOV。
   * @param fovDeg 视野角度（度），钳制到 [30, 120]
   */
  setFov(fovDeg: number): void {
    const clamped = Math.max(Camera.MIN_FOV, Math.min(Camera.MAX_FOV, fovDeg));
    if (this.fov === clamped) return;
    this.fov = clamped;
    this.onFovChange?.(clamped);
  }

  /** 获取当前 FOV（度） */
  getFov(): number {
    return this.fov;
  }

  /**
   * 获取视图矩阵。
   * view = rotationYawPitch(yaw, pitch)^(-1) ≈ 转置（纯旋转）。
   * 由于相机看向 -Z，且通过旋转世界来反向旋转相机，这里用旋转矩阵的转置。
   *
   * @param out 预分配的 Float32Array(16)
   */
  getViewMatrix(out: Mat4): void {
    rotationYawPitch(this.rotation, this.yaw, this.pitch);
    // 转置后的旋转矩阵即逆矩阵，作为 view 矩阵
    transpose(out, this.rotation);
  }

  /**
   * 获取透视投影矩阵。
   *
   * @param aspect 宽高比（width / height）
   * @param out    预分配的 Float32Array(16)
   */
  getProjectionMatrix(aspect: number, out: Mat4): void {
    const fovRad = (this.fov * Math.PI) / 180;
    mat4Perspective(out, fovRad, aspect, 0.1, 100);
  }
}
