# VR Player
# https://vjs.zencdn.net/v/oceans.mp4

一个轻量级的 360° 全景视频 VR 播放器，基于纯 WebGL 实现，零运行时依赖。

## 特性

- 🎥 支持 360° 全景视频播放（等距柱状投影）
- 🖱️ 拖动旋转视角（水平/垂直），垂直视角限制在 ±85°
- 🔭 可配置 FOV 视野角度，范围 [30°, 120°]
- 🎛️ 支持 WebGL 1.0 / 2.0 双版本，按需切换（2.0 启用 mipmap 三线性过滤，清晰度更高）
- 🔍 **极致清晰度优化**：各向异性过滤、highp 着色器精度、高细分球体、超采样（renderScale）
- 🪶 纯 WebGL 实现，无 Three.js 依赖，零运行时依赖（~15KB gzip）
- 📐 通过 `ResizeObserver` 自适应容器尺寸
- 🧹 `destroy()` 一键释放全部资源

## 安装

```bash
npm install vr-player
```

## 快速开始

```ts
import { VRPlayer } from 'vr-player';

const player = new VRPlayer({
  container: document.getElementById('player')!,
  fov: 75,
  webgl: 2, // 可选：使用 WebGL 2.0 获得更佳清晰度（默认 1）
  renderScale: 1.5, // 可选：超采样倍数，> 1 提升清晰度但增加 GPU 开销（默认 1）
});

await player.load('/video/panorama.mp4');
```

## API

### `new VRPlayer(options)`

创建 VR 播放器实例。

#### `VRPlayerOptions`

| 参数       | 类型            | 默认值  | 说明                                   |
| ---------- | --------------- | ------- | -------------------------------------- |
| `container`| `HTMLElement`   | -       | **必填。** canvas 的挂载容器           |
| `fov`      | `number`        | `90`    | 视野角度（度），自动限制在 [30, 120] 范围 |
| `muted`    | `boolean`       | `false` | 是否静音                               |
| `loop`     | `boolean`       | `false` | 循环播放                               |
| `webgl`    | `1 \| 2`        | `1`     | WebGL 版本。`1` 兼容性最广；`2` 启用 mipmap 三线性过滤、高细分球体、highp 精度，清晰度更高。若 `2` 不可用自动降级到 `1` |
| `renderScale` | `number`     | `1`     | 渲染缩放倍数（相对于 devicePixelRatio）。`> 1` 为超采样（SSAA），提升清晰度但增加 GPU 开销；`< 1` 为降采样。钳制到 [0.25, 4] |

### 方法

#### `player.load(src: string): Promise<void>`

加载视频源并初始化渲染管线。视频可播放时 resolve。

#### `player.play(): Promise<void>`

播放视频。可能因浏览器自动播放策略被拦截（建议使用 `muted: true` 或由用户手势触发）。

#### `player.pause(): void`

暂停视频。

#### `player.setFov(fov: number): void`

设置视野角度（度），自动限制在 [30, 120] 范围。

#### `player.getFov(): number`

获取当前视野角度（度）。

#### `player.onFovChange(cb: (fov: number) => void): () => void`

注册 FOV 变更回调，当 FOV 因滚轮缩放或 `setFov()` 改变时触发。返回一个取消订阅函数，调用后移除该回调。

```ts
const unsubscribe = player.onFovChange((fov) => {
  console.log('当前 FOV:', fov);
});
// 不再需要时取消订阅
unsubscribe();
```

#### `player.setRenderScale(scale: number): void`

动态调整渲染缩放倍数，立即生效（无需重建播放器）。钳制到 [0.25, 4]。

- `1.0`：按设备原生像素渲染（默认，性能与清晰度平衡）
- `1.5`~`2.0`：超采样，以更高分辨率渲染后由 CSS 缩放，相当于全场景抗锯齿，显著提升边缘与细节清晰度，但增加 GPU 开销

```ts
// 极致清晰度：2x 超采样
player.setRenderScale(2);
```

#### `player.destroy(): void`

销毁播放器，释放所有资源（WebGL 上下文、事件监听、video 元素、canvas）。调用后实例不再可用。

## 工作原理

播放器渲染一个内部可见的 UV 球体，将全景视频作为纹理映射到球体内表面。相机位于球心向外观察，通过拖动输入计算 yaw/pitch 角度控制视角方向，FOV 控制透视投影。

- **球体几何**：程序化生成（WebGL1 200×100 / WebGL2 512×256 分段，WebGL2 使用 Uint32 索引突破 65535 顶点限制），UV 翻转使纹理朝向内部。高细分度减少 UV 仿射插值与透视映射的误差，降低视角旋转时的纹理游走。
- **视频纹理**：首帧通过 `texImage2D` 上传，后续帧通过 `texSubImage2D` 更新，以 `video.currentTime` + `requestVideoFrameCallback` 双重检测避免重复上传。WebGL 2.0 下额外启用 mipmap + 三线性过滤（`LINEAR_MIPMAP_LINEAR`）。
- **相机**：Y 轴（yaw）+ X 轴（pitch）欧拉角控制，pitch 限制在 ±85° 防止翻转。
- **交互**：Pointer Events 统一鼠标与触摸操作，通过 pointer capture 支持拖出元素仍可响应。
- **WebGL 版本**：默认使用 WebGL 1.0（兼容性最广）；配置 `webgl: 2` 时启用 WebGL 2.0，支持 NPOT 纹理 mipmap 与三线性过滤，清晰度显著提升。若浏览器不支持 2.0 则自动降级。

## 清晰度优化

播放器内置多项清晰度优化，覆盖纹理采样、着色器精度、几何精度与超采样四个层面：

### 纹理采样优化

| 优化项 | 作用 | 说明 |
| ------ | ---- | ---- |
| **三线性过滤**（`LINEAR_MIPMAP_LINEAR`） | 消除球面远端摩尔纹/闪烁 | WebGL 2.0 启用，每帧 `generateMipmap` |
| **各向异性过滤**（`EXT_texture_filter_anisotropic`） | 消除掠射角模糊 | **VR 球面渲染清晰度核心收益项**。使用设备支持的最大各向异性等级，沿纹理梯度方向椭圆形采样 |
| **颜色空间保留**（`UNPACK_COLORSPACE_CONVERSION_WEBGL = NONE`） | 保真原始像素 | 禁用浏览器默认颜色空间转换，避免转换精度损失 |

### 着色器精度优化

片段着色器默认 `precision mediump float`（fp16）作为安全基线，`Renderer` 在设备支持时动态替换为 `highp`（fp32）：

- **WebGL 2.0**：`highp` 是核心保证，始终启用
- **WebGL 1.0**：通过 `getShaderPrecisionFormat(FRAGMENT_SHADER, HIGH_FLOAT)` 检测，支持时升级

`highp` 可消除 `mediump` 在渐变色区域产生的色带。

### 几何精度优化

WebGL 2.0 下球体细分度从 200×100 提升至 512×256（131841 顶点），使用 `UNSIGNED_INT` 索引突破 Uint16 的 65535 顶点限制。更高的细分度减少球面 UV 仿射插值与透视映射的误差，降低视角旋转时的纹理游走（swimming）。

### 超采样（renderScale）

通过 `renderScale` 选项以高于原生分辨率的尺寸渲染 canvas，再由 CSS 缩放回显示尺寸，相当于全场景抗锯齿（SSAA）：

```ts
// 构造时指定
const player = new VRPlayer({ container, renderScale: 2 });

// 或运行时动态调整
player.setRenderScale(1.5);
```

| renderScale | 效果 | GPU 开销 | 适用场景 |
| ----------- | ---- | -------- | -------- |
| `0.5` | 降采样，牺牲清晰度 | 低 | 低端设备 |
| `1.0` | 原生分辨率（默认） | 中 | 通用推荐 |
| `1.5` | 中等超采样 | 较高 | 中高端 GPU |
| `2.0` | 2x 超采样，接近极限清晰度 | 高 | 高端 GPU |

> **极致清晰度推荐配置**：`webgl: 2` + `renderScale: 2`

## 开发指南

```bash
# 安装依赖
pnpm install

# 运行测试
pnpm test

# 代码检查
pnpm run lint

# 构建
pnpm run build

# 运行调试页面（需要本地开发服务器，如 vite）
npx vite demo
```

## 技术栈

| 分类       | 选型      | 说明                           |
| ---------- | --------- | ------------------------------ |
| 构建       | Rolldown | 基于 Rust，ESM + CJS 双格式输出 |
| 语言       | TypeScript (strict) | 类型安全              |
| 代码检查/格式化 | Biome | 集成 lint + format            |
| 测试       | Vitest    | 原生 TS/ESM 支持               |
| 版本管理   | Changesets| 变更日志与发布管理              |
| 渲染       | WebGL 1.0 / 2.0 | 纯 WebGL 双版本，无渲染框架依赖 |

## 开源协议

[MIT](./LICENSE)
