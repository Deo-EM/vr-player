/**
 * 片段着色器源码。
 *
 * 采样视频纹理，按插值后的 UV 输出颜色。
 * precision mediump float 兼顾质量与性能。
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
