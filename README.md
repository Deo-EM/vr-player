# VR Player

**English** · [简体中文](https://github.com/Deo-EM/vr-player/blob/main/README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/vr-player?color=2563eb&label=npm)](https://www.npmjs.com/package/vr-player)
[![npm downloads](https://img.shields.io/npm/dm/vr-player)](https://www.npmjs.com/package/vr-player)
[![minzip size](https://img.shields.io/bundlephobia/minzip/vr-player)](https://bundlephobia.com/package/vr-player)
[![CI](https://github.com/Deo-EM/vr-player/actions/workflows/ci.yml/badge.svg)](https://github.com/Deo-EM/vr-player/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/vr-player)](./LICENSE)

A lightweight **360° panoramic video VR player** built directly on WebGL. No Three.js, no runtime dependencies, **~6 KB gzipped**.

![VR Player — dragging to look around a 360° video](https://raw.githubusercontent.com/Deo-EM/vr-player/main/docs/demo.gif)

> **[▶ Try the live demo](https://deo-em.github.io/vr-player/)** — open it on a phone and tap **Gyro: off** to look around by moving your device.

## Why VR Player?

| Library | Minified | Gzipped | Approach |
| --- | --- | --- | --- |
| **vr-player** | **~20 KB** | **~6.3 KB** | Pure WebGL, zero dependencies |
| Pannellum | ~100 KB | ~35 KB | Lightweight panorama viewer |
| Marzipano | ~200 KB | ~60 KB | Panorama toolchain |
| Three.js (VR video scene, tree-shaken) | ~150–200 KB | ~50 KB | General-purpose 3D engine |
| Three.js (full build) | ~600 KB | ~150 KB | General-purpose 3D engine |
| Video.js + VR plugin | ~600 KB | ~180 KB | General video player + VR |

If you only need to play **equirectangular 360° video** — no 3D models, no scene graph, no plugin ecosystem — vr-player gives you that in a fraction of the size.

## Features

- 🎥 **360° panoramic video playback** (equirectangular projection)
- 🖱️ **Drag to look around** — horizontal and vertical, pitch clamped to ±85°; two-finger pinch to zoom on mobile
- 📱 **Gyroscope control** — turn your device to look around, toggleable at runtime, works alongside dragging
- 🔭 **Configurable FOV** — range [30°, 120°]
- 🎛️ **WebGL 1.0 / 2.0** — switchable; 2.0 enables trilinear mipmap filtering for noticeably sharper output
- 🔍 **Sharpness-oriented rendering** — anisotropic filtering, highp shader precision, high-tessellation sphere, supersampling (`renderScale`)
- 🪶 **Zero runtime dependencies** — a single ~6 KB (gzipped) module
- 📐 **Responsive** — adapts to container size via `ResizeObserver`
- 🧹 **Clean teardown** — `destroy()` releases every resource

## Browser support

| Browser | Minimum | Released |
| --- | --- | --- |
| Chrome / Edge | ≥ 94 | 2021-09 |
| Firefox | ≥ 93 | 2021-10 |
| Safari (macOS / iOS) | ≥ 16.4 | 2023-03 |
| Samsung Internet | ≥ 18 | — |

> These floors come mainly from the Class Static Blocks syntax. WebGL and the device-orientation APIs require reasonably modern browsers anyway, so the range matches real-world VR / panoramic video usage. For older browsers, run the output through swc / Babel to downlevel the syntax.

## Install

```bash
npm install vr-player
```

## Quick start

```ts
import { VRPlayer } from 'vr-player';

const player = new VRPlayer({
  container: document.getElementById('player')!,
  fov: 75,
  webgl: 2, // optional: use WebGL 2.0 for better sharpness (default 1)
  renderScale: 1.5, // optional: supersampling factor, > 1 is sharper but costs GPU (default 1)
});

await player.load('/video/panorama.mp4');
```

## Live demo

The repository ships a full-featured playground with source URL input, seek bar, FOV / WebGL version / supersampling controls and a gyroscope toggle.

**[▶ https://deo-em.github.io/vr-player/](https://deo-em.github.io/vr-player/)**

![VR Player demo page with controls](https://raw.githubusercontent.com/Deo-EM/vr-player/main/docs/preview.png)

Run it locally:

```bash
pnpm install
pnpm demo          # http://localhost:5173
pnpm demo:https    # HTTPS — required for gyroscope on a real device
```

Append `?debug` to the URL to load an in-page vConsole for mobile debugging.

## API

### `new VRPlayer(options)`

Creates a player instance.

#### `VRPlayerOptions`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `container` | `HTMLElement` | — | **Required.** Element the canvas is mounted into |
| `fov` | `number` | `90` | Field of view in degrees, clamped to [30, 120] |
| `muted` | `boolean` | `false` | Start muted |
| `loop` | `boolean` | `false` | Loop playback |
| `webgl` | `1 \| 2` | `1` | WebGL version. `1` has the widest compatibility; `2` enables mipmap trilinear filtering, a denser sphere and highp precision. Falls back to `1` automatically when `2` is unavailable |
| `renderScale` | `number` | `1` | Render scale relative to `devicePixelRatio`. `> 1` is supersampling (SSAA) — sharper but more GPU work; `< 1` downsamples. Clamped to [0.25, 4] |
| `gyroscope` | `boolean` | `false` | Enable gyroscope control right after construction (see [Gyroscope notes](#gyroscope-notes)) |

### Methods

#### `player.load(src: string): Promise<void>`

Loads a video source and initializes the render pipeline. Resolves once the video is playable.

#### `player.play(): Promise<void>`

Starts playback. May be blocked by the browser's autoplay policy — use `muted: true` or trigger it from a user gesture.

#### `player.pause(): void`

Pauses playback.

#### `player.setFov(fov: number): void`

Sets the field of view in degrees, clamped to [30, 120].

#### `player.getFov(): number`

Returns the current field of view in degrees.

#### `player.onFovChange(cb: (fov: number) => void): () => void`

Registers a callback fired whenever the FOV changes through wheel zoom or `setFov()`. Returns an unsubscribe function.

```ts
const unsubscribe = player.onFovChange((fov) => {
  console.log('current FOV:', fov);
});
// later
unsubscribe();
```

#### `player.video` (read-only getter)

The underlying `<video>` element, exposed for custom integrations.

Use it for playback control (`play` / `pause` / `seek` / `currentTime` / `duration`), media events (`timeupdate` / `ended` / `error` / `loadedmetadata`), volume, playback rate, and anything else you need — no need to wait for the library to wrap it.

```ts
const video = player.video;

video.addEventListener('timeupdate', () => {
  console.log(`${video.currentTime} / ${video.duration}`);
});

video.currentTime = 30; // seek to 30s
video.playbackRate = 1.5; // 1.5x speed
```

> Note: `src` is managed by `load()` — do not assign `video.src` directly.

#### `player.getWebGLVersion(): 1 | 2`

Returns the WebGL version actually in use. When you request `webgl: 2` but the environment does not support it, this returns `1` so you can detect the downgrade.

```ts
const version = player.getWebGLVersion();
if (version === 1) {
  console.warn('WebGL 2.0 is unavailable; running on 1.0');
}
```

#### `player.setRenderScale(scale: number): void`

Adjusts the render scale immediately, without rebuilding the player. Clamped to [0.25, 4].

- `1.0` — native device pixels (default; balanced)
- `1.5`–`2.0` — supersampling: render at a higher resolution and let CSS scale it back down, effectively full-scene antialiasing. Markedly sharper edges and detail, at higher GPU cost.

```ts
player.setRenderScale(2); // maximum sharpness
```

#### `player.setGyroscope(enabled: boolean): Promise<boolean>`

Enables or disables gyroscope-based view control. Rotating a mobile device rotates the view; it composes with dragging instead of conflicting.

- Returns whether enabling succeeded (`false` if unsupported or permission denied)
- Returns `true` when disabling

> **iOS 13+**: you must call `setGyroscope(true)` inside a user gesture (e.g. a button click) so `requestPermission()` can run. Calling it outside a gesture returns `false`.

```ts
const btn = document.getElementById('gyro-toggle')!;
btn.addEventListener('click', async () => {
  const target = !player.isGyroscopeEnabled();
  const ok = await player.setGyroscope(target);
  if (target && !ok) {
    console.warn('Failed to enable gyroscope (unsupported or permission denied)');
  }
});
```

#### `player.isGyroscopeEnabled(): boolean`

Returns whether gyroscope control is currently enabled.

#### `player.destroy(): void`

Destroys the player and releases all resources (WebGL context, event listeners, video element, canvas). The instance is unusable afterwards.

## How it works

The player renders an inward-facing UV sphere and maps the panoramic video onto its interior as a texture. The camera sits at the centre looking outward; drag input updates yaw/pitch, and FOV drives the perspective projection.

- **Sphere geometry** — generated procedurally (200×100 segments on WebGL 1, 512×256 on WebGL 2, where `UNSIGNED_INT` indices bypass the 65,535-vertex `Uint16` limit). Flipped UVs face the texture inward. Higher tessellation reduces UV affine-interpolation and perspective-mapping error, which reduces texture swimming while rotating.
- **Video texture** — the first frame is uploaded with `texImage2D`, subsequent frames with `texSubImage2D`, using both `video.currentTime` and `requestVideoFrameCallback` to avoid duplicate uploads. On WebGL 2, mipmaps plus trilinear filtering (`LINEAR_MIPMAP_LINEAR`) are enabled.
- **Camera** — Y-axis (yaw) + X-axis (pitch) Euler angles, with pitch clamped to ±85° to prevent flipping.
- **Input** — Pointer Events unify mouse and touch; pointer capture keeps dragging alive outside the element. Two-finger pinch zooms on mobile. Gyroscope (`DeviceOrientation`) modifies the view incrementally, composing with dragging.
- **WebGL versions** — WebGL 1.0 by default (widest compatibility). With `webgl: 2`, NPOT mipmaps and trilinear filtering become available, meaningfully improving sharpness. Unsupported environments downgrade automatically.

## Sharpness optimizations

Sharpness is optimized across four layers: texture sampling, shader precision, geometry precision and supersampling.

### Texture sampling

| Optimization | Effect | Notes |
| --- | --- | --- |
| **Trilinear filtering** (`LINEAR_MIPMAP_LINEAR`) | Removes moiré / shimmer at the far end of the sphere | WebGL 2 only; `generateMipmap` each frame |
| **Anisotropic filtering** (`EXT_texture_filter_anisotropic`) | Removes grazing-angle blur | **The biggest win for VR sphere rendering.** Uses the device's maximum anisotropy level, sampling elliptically along the texture gradient |
| **Color space preservation** (`UNPACK_COLORSPACE_CONVERSION_WEBGL = NONE`) | Preserves original pixels | Disables the browser's default color space conversion to avoid precision loss |

### Shader precision

The fragment shader defaults to `precision mediump float` (fp16) as a safe baseline; `Renderer` upgrades it to `highp` (fp32) at runtime when the device supports it:

- **WebGL 2.0** — `highp` is guaranteed, always enabled
- **WebGL 1.0** — detected via `getShaderPrecisionFormat(FRAGMENT_SHADER, HIGH_FLOAT)`, upgraded when supported

`highp` eliminates the color banding `mediump` produces across gradients.

### Geometry precision

On WebGL 2 the sphere tessellation rises from 200×100 to 512×256 (131,841 vertices), using `UNSIGNED_INT` indices to exceed the `Uint16` limit of 65,535 vertices. Higher tessellation reduces sphere UV affine-interpolation and perspective-mapping error, reducing texture swimming while rotating.

### Supersampling (`renderScale`)

`renderScale` renders the canvas above native resolution and lets CSS scale it back down — full-scene antialiasing (SSAA):

```ts
const player = new VRPlayer({ container, renderScale: 2 }); // at construction
player.setRenderScale(1.5); // or at runtime
```

| renderScale | Effect | GPU cost | When to use |
| --- | --- | --- | --- |
| `0.5` | Downsampled, less sharp | Low | Low-end devices |
| `1.0` | Native resolution (default) | Medium | Recommended default |
| `1.5` | Moderate supersampling | High | Mid-to-high-end GPU |
| `2.0` | 2× supersampling, near-maximum sharpness | Very high | High-end GPU |

> **Maximum sharpness:** `webgl: 2` + `renderScale: 2`

## Bundle size

Zero runtime dependencies:

| Artifact | Size | Notes |
| --- | --- | --- |
| `dist/index.js` (ESM) | ~20 KB | Minified, includes inline GLSL shaders |
| `dist/index.cjs` (CJS) | ~20 KB | Same |
| gzipped | **~6.3 KB** | Actual over-the-wire size |

## Gyroscope notes

Gyroscope control depends on the browser's `DeviceOrientation` API, which comes with platform constraints:

### Requires a secure context (HTTPS)

`DeviceOrientationEvent` is only available in a **secure context**:

- ✅ `https://` sites
- ✅ `http://localhost` / `http://127.0.0.1` (local development)
- ❌ `http://` sites in production — orientation events never fire

Always deploy over HTTPS in production, or gyroscope support is silently dead on mobile.

### iOS 13+ requires a user gesture

Safari on iOS 13+ requires an explicit `DeviceOrientationEvent.requestPermission()` call, and it **must happen inside a user gesture** (a tap). Constructing the player with gyroscope enabled at page load will fail. See the [`setGyroscope()`](#playersetgyroscopeenabled-boolean-promiseboolean) example — call it from a button handler.

### Other caveats

- **Hardware support** — some desktop browsers and low-end devices have no gyroscope; `setGyroscope(true)` returns `false`
- **Permission denied** — after a denial, re-requesting needs another gesture
- **Backgrounding** — orientation events may stop when the page is backgrounded and usually resume on return; if not, call `setGyroscope` again

## Contributing

See [CONTRIBUTING.md](https://github.com/Deo-EM/vr-player/blob/main/CONTRIBUTING.md).

```bash
pnpm install
pnpm test        # unit tests
pnpm lint        # Biome
pnpm build       # ESM + CJS + type declarations
```

## License

[MIT](./LICENSE)
