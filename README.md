# VR Player
# https://vjs.zencdn.net/v/oceans.mp4

一个轻量级的 360° 全景视频 VR 播放器，基于纯 WebGL 实现，零运行时依赖。

## 特性

- 🎥 支持 360° 全景视频播放（等距柱状投影）
- 🖱️ 拖动旋转视角（水平/垂直），垂直视角限制在 ±85°
- 🔭 可配置 FOV 视野角度，范围 [30°, 120°]
- 🪶 纯 WebGL 1.0 实现，无 Three.js 依赖，零运行时依赖（~15KB gzip）
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
| `fov`      | `number`        | `75`    | 视野角度（度），自动限制在 [30, 120] 范围 |
| `autoPlay` | `boolean`       | `false` | `load()` 完成后自动播放                |
| `muted`    | `boolean`       | `true`  | 静音播放（浏览器自动播放策略要求）       |
| `loop`     | `boolean`       | `false` | 循环播放                               |

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

#### `player.destroy(): void`

销毁播放器，释放所有资源（WebGL 上下文、事件监听、video 元素、canvas）。调用后实例不再可用。

## 工作原理

播放器渲染一个内部可见的 UV 球体，将全景视频作为纹理映射到球体内表面。相机位于球心向外观察，通过拖动输入计算 yaw/pitch 角度控制视角方向，FOV 控制透视投影。

- **球体几何**：程序化生成（64×32 分段），UV.x 翻转使纹理朝向内部。
- **视频纹理**：首帧通过 `texImage2D` 上传，后续帧通过 `texSubImage2D` 更新，以 `video.currentTime` 做脏检查避免重复上传。
- **相机**：Y 轴（yaw）+ X 轴（pitch）欧拉角控制，pitch 限制在 ±85° 防止翻转。
- **交互**：Pointer Events 统一鼠标与触摸操作，通过 pointer capture 支持拖出元素仍可响应。

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
| 构建       | Rollldown | 基于 Rust，ESM + CJS 双格式输出 |
| 语言       | TypeScript (strict) | 类型安全              |
| 代码检查/格式化 | Biome | 集成 lint + format            |
| 测试       | Vitest    | 原生 TS/ESM 支持               |
| 版本管理   | Changesets| 变更日志与发布管理              |
| 渲染       | WebGL 1.0 | 纯 WebGL，无渲染框架依赖        |

## 开源协议

[MIT](./LICENSE)
