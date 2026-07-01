/**
 * 顶点着色器源码。
 *
 * 全景视频播放：球体内表面贴图，相机在球心。
 *
 * 核心策略：将 view-space 位置传递给片段着色器，
 * 片段着色器逐像素重建 3D 方向并转换为 Equirectangular UV，
 * 消除顶点级 UV 线性插值在宽 FOV / 球面边缘产生的几何拉伸变形。
 */

/** WebGL 1.0（GLSL ES 1.00） */
export const VERTEX_SHADER_SOURCE = /* glsl */ `
attribute vec3 aPosition;

uniform mat4 uProjection;
uniform mat4 uView;

varying vec3 vViewPos;

void main() {
  // 输出 view-space 位置（仅旋转变换，未投影）
  vViewPos = (uView * vec4(aPosition, 1.0)).xyz;
  gl_Position = uProjection * vec4(vViewPos, 1.0);
}
`;

/** WebGL 2.0（GLSL ES 3.00） */
export const VERTEX_SHADER_SOURCE_300 = /* glsl */ `#version 300 es

in vec3 aPosition;

uniform mat4 uProjection;
uniform mat4 uView;

out vec3 vViewPos;

void main() {
  // 输出 view-space 位置（仅旋转变换，未投影）
  vViewPos = (uView * vec4(aPosition, 1.0)).xyz;
  gl_Position = uProjection * vec4(vViewPos, 1.0);
}
`;
