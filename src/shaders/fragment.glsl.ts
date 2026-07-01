/**
 * 片段着色器源码。
 *
 * 逐像素光线投射（Ray-casting）采样 Equirectangular 视频纹理：
 * 1. 从插值的 view-space 位置归一化得到视线方向
 * 2. 通过逆视图矩阵还原世界方向
 * 3. 将笛卡尔坐标转换为 Equirectangular (经纬度) UV
 * 4. 带 LOD 负偏移采样，抑制 mipmap 过度降级
 *
 * 相比传统"顶点 UV 线性插值 → texture2D"方案，
 * 本方法在宽 FOV / 球面边缘区域完全消除几何拉伸变形。
 */

/** WebGL 1.0（GLSL ES 1.00） */
export const FRAGMENT_SHADER_SOURCE = /* glsl */ `
precision mediump float;

varying vec3 vViewPos;

uniform sampler2D uTexture;
uniform mat4 uInvView;

#define PI 3.14159265359
#define TWO_PI (2.0 * PI)

void main() {
  // 归一化 view-space 位置 → 视线方向（相机在原点，看向球体内表面）
  vec3 viewDir = normalize(vViewPos);

  // 通过逆视图矩阵（仅旋转部分）将视线方向还原到世界坐标系
  vec3 worldDir = normalize((uInvView * vec4(viewDir, 0.0)).xyz);

  // 笛卡尔 → Equirectangular UV（等距圆柱投影）
  float u = atan(worldDir.z, worldDir.x) / TWO_PI + 0.5;
  float v = asin(clamp(worldDir.y, -1.0, 1.0)) / PI + 0.5;

  gl_FragColor = texture2D(uTexture, vec2(u, v), -1.5);
}
`;

/** WebGL 2.0（GLSL ES 3.00） */
export const FRAGMENT_SHADER_SOURCE_300 = /* glsl */ `#version 300 es

precision mediump float;

in vec3 vViewPos;

uniform sampler2D uTexture;
uniform mat4 uInvView;

#define PI 3.14159265359
#define TWO_PI (2.0 * PI)

out vec4 fragColor;

void main() {
  // 归一化 view-space 位置 → 视线方向（相机在原点，看向球体内表面）
  vec3 viewDir = normalize(vViewPos);

  // 通过逆视图矩阵（仅旋转部分）将视线方向还原到世界坐标系
  vec3 worldDir = normalize((uInvView * vec4(viewDir, 0.0)).xyz);

  // 笛卡尔 → Equirectangular UV（等距圆柱投影）
  float u = atan(worldDir.z, worldDir.x) / TWO_PI + 0.5;
  float v = asin(clamp(worldDir.y, -1.0, 1.0)) / PI + 0.5;

  fragColor = texture(uTexture, vec2(u, v), -1.5);
}
`;
