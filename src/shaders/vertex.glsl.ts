/**
 * 顶点着色器源码。
 *
 * 全景视频播放：球体内表面贴图，相机在球心。
 * 顶点位置经投影×视图变换后输出，UV 传递给片段着色器采样视频纹理。
 */

/** WebGL 1.0（GLSL ES 1.00） */
export const VERTEX_SHADER_SOURCE = /* glsl */ `
attribute vec3 aPosition;
attribute vec2 aUv;

uniform mat4 uProjection;
uniform mat4 uView;

varying vec2 vUv;

void main() {
  vUv = aUv;
  gl_Position = uProjection * uView * vec4(aPosition, 1.0);
}
`;

/** WebGL 2.0（GLSL ES 3.00） */
export const VERTEX_SHADER_SOURCE_300 = /* glsl */ `#version 300 es

in vec3 aPosition;
in vec2 aUv;

uniform mat4 uProjection;
uniform mat4 uView;

out vec2 vUv;

void main() {
  vUv = aUv;
  gl_Position = uProjection * uView * vec4(aPosition, 1.0);
}
`;
