import type { Mat4 } from '../math/mat4';

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
    rotationYawPitchTransposed(this.rotation, this.yaw, this.pitch);
    // 转置后的旋转矩阵即逆矩阵，作为 view 矩阵
    out.set(this.rotation);
  }

  /**
   * 获取透视投影矩阵。
   *
   * @param aspect 宽高比（width / height）
   * @param out    预分配的 Float32Array(16)
   */
  getProjectionMatrix(aspect: number, out: Mat4): void {
    const fovRad = (this.fov * Math.PI) / 180;
    perspective(out, fovRad, aspect, 0.1, 100);
  }
}

// 以下为内联优化函数，避免引入 mat4 模块的循环依赖且保持 Camera 自洽
function rotationYawPitchTransposed(out: Mat4, yaw: number, pitch: number): void {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  // rotationYawPitch 矩阵（列主序）后转置：
  // 原矩阵列序: [cy,0,-sy,0,  sp*sy,cp,sp*cy,0,  cp*sy,-sp,cp*cy,0,  0,0,0,1]
  // 转置后按列序写入：
  out[0] = cy;
  out[1] = sp * sy;
  out[2] = cp * sy;
  out[3] = 0;
  out[4] = 0;
  out[5] = cp;
  out[6] = -sp;
  out[7] = 0;
  out[8] = -sy;
  out[9] = sp * cy;
  out[10] = cp * cy;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
}

// 内联 perspective 以避免运行时循环依赖；与 mat4.perspective 行为一致
function perspective(out: Mat4, fovRad: number, aspect: number, near: number, far: number): void {
  const f = 1.0 / Math.tan(fovRad / 2);
  const nf = 1 / (near - far);
  out[0] = f / aspect;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[14] = 2 * far * near * nf;
  out[15] = 0;
}
