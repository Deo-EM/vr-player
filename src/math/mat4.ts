/**
 * mat4 矩阵运算模块（纯函数，列主序存储）。
 * 所有函数接受 out 参数（预分配 Float32Array(16)）以避免 GC。
 */

export type Mat4 = Float32Array;

/** 设置为单位矩阵 */
export function identity(out: Mat4): Mat4 {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = 1;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 1;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}

/**
 * 矩阵乘法 out = a * b。
 * 列主序存储下，out[col*4 + row] = sum_k a[k*4 + row] * b[col*4 + k]。
 */
export function multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  const a00 = a[0];
  const a01 = a[1];
  const a02 = a[2];
  const a03 = a[3];
  const a10 = a[4];
  const a11 = a[5];
  const a12 = a[6];
  const a13 = a[7];
  const a20 = a[8];
  const a21 = a[9];
  const a22 = a[10];
  const a23 = a[11];
  const a30 = a[12];
  const a31 = a[13];
  const a32 = a[14];
  const a33 = a[15];

  let b0 = b[0];
  let b1 = b[1];
  let b2 = b[2];
  let b3 = b[3];
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[4];
  b1 = b[5];
  b2 = b[6];
  b3 = b[7];
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[8];
  b1 = b[9];
  b2 = b[10];
  b3 = b[11];
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[12];
  b1 = b[13];
  b2 = b[14];
  b3 = b[15];
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  return out;
}

/**
 * 透视投影矩阵。
 * 符合 WebGL/GL 标准约定：右手系，看向 -Z，深度范围 [-1, 1]。
 */
export function perspective(
  out: Mat4,
  fovRad: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
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

  return out;
}

/**
 * 由 yaw（绕 Y 轴）和 pitch（绕 X 轴）构建旋转矩阵。
 * 用于相机视图矩阵的旋转部分。
 *
 * @param yaw   偏航角（弧度），绕 Y 轴，正值向右转
 * @param pitch 俯仰角（弧度），绕 X 轴，正值向上看
 */
export function rotationYawPitch(out: Mat4, yaw: number, pitch: number): Mat4 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  // R = Ry(yaw) * Rx(pitch)，列主序
  // Rx = [1 0  0; 0 cp -sp; 0 sp cp]
  // Ry = [cy 0 sy; 0 1 0; -sy 0 cy]
  out[0] = cy;
  out[1] = 0;
  out[2] = -sy;
  out[3] = 0;
  out[4] = sp * sy;
  out[5] = cp;
  out[6] = sp * cy;
  out[7] = 0;
  out[8] = cp * sy;
  out[9] = -sp;
  out[10] = cp * cy;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;

  return out;
}

/**
 * 4x4 矩阵转置（列主序）。
 * @param out 预分配的 Float32Array(16)
 * @param m   输入矩阵
 */
export function transpose(out: Mat4, m: Mat4): Mat4 {
  out[0] = m[0];
  out[1] = m[4];
  out[2] = m[8];
  out[3] = m[12];
  out[4] = m[1];
  out[5] = m[5];
  out[6] = m[9];
  out[7] = m[13];
  out[8] = m[2];
  out[9] = m[6];
  out[10] = m[10];
  out[11] = m[14];
  out[12] = m[3];
  out[13] = m[7];
  out[14] = m[11];
  out[15] = m[15];
  return out;
}
