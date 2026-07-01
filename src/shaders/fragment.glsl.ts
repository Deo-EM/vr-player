/**
 * 片段着色器源码。
 *
 * 采样视频纹理，按插值后的 UV 输出颜色。
 * 默认 precision mediump float 作为安全基线，Renderer 会在设备支持时
 * 动态替换为 highp 以消除色带、提升精度。
 */

/** WebGL 1.0（GLSL ES 1.00） */
export const FRAGMENT_SHADER_SOURCE = /* glsl */ `
precision mediump float;

varying vec2 vUv;

uniform sampler2D uTexture;

void main() {
  gl_FragColor = texture2D(uTexture, vUv);
}
`;

/** WebGL 2.0（GLSL ES 3.00） */
export const FRAGMENT_SHADER_SOURCE_300 = /* glsl */ `#version 300 es

precision mediump float;

in vec2 vUv;

uniform sampler2D uTexture;

out vec4 fragColor;

void main() {
  fragColor = texture(uTexture, vUv);
}
`;
