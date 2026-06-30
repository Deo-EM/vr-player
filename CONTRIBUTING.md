# Contributing to VR Player

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/your-name/vr-player.git
cd vr-player

# Install dependencies
npm install

# Run tests in watch mode
npm run test:watch

# Lint & format
npm run lint:fix
```

## Project Structure

```
src/
  index.ts              # Library entry, exports VRPlayer + types
  VRPlayer.ts           # Main class, orchestrates modules
  types.ts              # VRPlayerOptions interface
  core/
    Renderer.ts         # WebGL context, shaders, render loop, resize
    SphereGeometry.ts   # Procedural UV sphere geometry + buffers
    Camera.ts           # yaw/pitch/fov state, view/projection matrices
    VideoTexture.ts     # video element + texture upload with dirty-check
    DragController.ts   # Pointer events → yaw/pitch
  math/
    mat4.ts             # Pure mat4 functions (column-major)
  shaders/
    vertex.glsl.ts      # Vertex shader source
    fragment.glsl.ts    # Fragment shader source
tests/                  # Vitest unit tests
demo/                   # Local debugging page
```

## Coding Standards

- **TypeScript strict mode** — no `any`, no `// @ts-ignore`.
- **Biome** — run `npm run lint:fix` before committing. The CI enforces `npm run lint`.
- **No runtime dependencies** — keep the bundle lightweight. All math (mat4) is self-implemented.
- **Pure functions for testable logic** — matrix ops, geometry generation, and camera clamping are all pure and unit-tested.

## Adding a Changeset

This project uses [Changesets](https://github.com/changesets/changesets) for versioning. Before submitting a PR that affects the published package, run:

```bash
npm run changeset
```

Follow the prompts to describe the change (major/minor/patch). Commit the generated changeset file alongside your code changes.

## Pull Request Checklist

- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Added a changeset (if the change affects the published API)
- [ ] Updated README if API changed

## Reporting Issues

When filing an issue, please include:

- Browser & OS
- A minimal reproduction (CodeSandbox/JSFiddle link preferred)
- Console errors
- Video source format if relevant

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
