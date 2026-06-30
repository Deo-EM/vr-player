/**
 * 片段着色器源码。
 *
 * 采样视频纹理，按插值后的 UV 输出颜色。
 * precision mediump float 兼顾质量与性能。
 */
export const FRAGMENT_SHADER_SOURCE = /* glsl */ `
precision mediump float;

varying vec2 vUv;

uniform sampler2D uTexture;

void main() {
  gl_FragColor = texture2D(uTexture, vUv);
}
`;
