/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Camera } from '../src/core/Camera';
import { GyroscopeController, angleDelta } from '../src/core/GyroscopeController';

/**
 * 触发 deviceorientation 事件的辅助函数。
 * jsdom 中 addEventListener 注册的回调可通过 window.dispatchEvent 触发。
 */
function dispatchDeviceOrientation(
  alpha: number | null,
  beta: number | null,
  gamma: number | null,
) {
  const event = new Event('deviceorientation') as DeviceOrientationEvent;
  Object.defineProperties(event, {
    alpha: { value: alpha, configurable: true },
    beta: { value: beta, configurable: true },
    gamma: { value: gamma, configurable: true },
  });
  window.dispatchEvent(event);
}

describe('angleDelta', () => {
  it('正常递增', () => {
    expect(angleDelta(1.0, 0.5)).toBeCloseTo(0.5, 6);
  });

  it('正常递减', () => {
    expect(angleDelta(0.3, 0.8)).toBeCloseTo(-0.5, 6);
  });

  it('正向跨越 2π 应取最短路径', () => {
    // current ≈ 2π, prev ≈ 0 → delta 应为接近 0 的正小量，而非 ~2π
    expect(angleDelta(2 * Math.PI - 0.1, 0.1)).toBeCloseTo(-0.2, 6);
  });

  it('反向跨越 2π 应取最短路径', () => {
    // current ≈ 0, prev ≈ 2π → delta 应为接近 0 的正小量
    expect(angleDelta(0.1, 2 * Math.PI - 0.1)).toBeCloseTo(0.2, 6);
  });

  it('相等角度增量为 0', () => {
    expect(angleDelta(1.5, 1.5)).toBe(0);
  });
});

describe('GyroscopeController', () => {
  let camera: Camera;
  let controller: GyroscopeController;
  // 保留原始 DeviceOrientationEvent 引用以便恢复
  const originalDOE = (globalThis as { DeviceOrientationEvent?: typeof DeviceOrientationEvent })
    .DeviceOrientationEvent;

  beforeEach(() => {
    camera = new Camera();
    controller = new GyroscopeController(camera, 1.0);
    // 默认提供最小可用的 DeviceOrientationEvent（无 requestPermission）
    (
      globalThis as { DeviceOrientationEvent: typeof DeviceOrientationEvent }
    ).DeviceOrientationEvent = class MockDOE {} as unknown as typeof DeviceOrientationEvent;
  });

  afterEach(() => {
    controller.dispose();
    if (originalDOE) {
      (
        globalThis as { DeviceOrientationEvent: typeof DeviceOrientationEvent }
      ).DeviceOrientationEvent = originalDOE;
    } else {
      (
        globalThis as { DeviceOrientationEvent?: typeof DeviceOrientationEvent }
      ).DeviceOrientationEvent = undefined;
    }
  });

  describe('enable / disable / isEnabled', () => {
    it('初始状态应为关闭', () => {
      expect(controller.isEnabled()).toBe(false);
    });

    it('enable 成功后应处于开启状态', async () => {
      const ok = await controller.enable();
      expect(ok).toBe(true);
      expect(controller.isEnabled()).toBe(true);
    });

    it('重复 enable 应返回 true 且不重复监听', async () => {
      await controller.enable();
      const addSpy = vi.spyOn(window, 'addEventListener');
      const ok = await controller.enable();
      expect(ok).toBe(true);
      expect(addSpy).not.toHaveBeenCalled();
      addSpy.mockRestore();
    });

    it('disable 后应处于关闭状态', async () => {
      await controller.enable();
      controller.disable();
      expect(controller.isEnabled()).toBe(false);
    });

    it('未开启时 disable 应为空操作', () => {
      controller.disable();
      expect(controller.isEnabled()).toBe(false);
    });
  });

  describe('不支持设备降级', () => {
    it('DeviceOrientationEvent 不存在时 enable 应返回 false', async () => {
      (
        globalThis as { DeviceOrientationEvent?: typeof DeviceOrientationEvent }
      ).DeviceOrientationEvent = undefined;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const ok = await controller.enable();
      expect(ok).toBe(false);
      expect(controller.isEnabled()).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('事件处理', () => {
    it('首帧建立基准，不施加增量', async () => {
      await controller.enable();
      // 初始 yaw=0, pitch=0；首帧 alpha=90, beta=10
      dispatchDeviceOrientation(90, 10, 0);
      expect(camera.getYaw()).toBe(0);
      expect(camera.getPitch()).toBe(0);
    });

    it('第二帧应施加增量（设备右转 → 视角左转，yaw 减小）', async () => {
      await controller.enable();
      // 首帧基准
      dispatchDeviceOrientation(90, 10, 0);
      // 第二帧：alpha 从 90 → 100（设备向右转 10°）
      dispatchDeviceOrientation(100, 10, 0);
      // 设备右转 → yaw 应减小（取反），约 -10° = -0.1745 rad
      expect(camera.getYaw()).toBeCloseTo(-(10 * Math.PI) / 180, 4);
      expect(camera.getPitch()).toBe(0);
    });

    it('beta 增大 → pitch 减小（取反）', async () => {
      await controller.enable();
      dispatchDeviceOrientation(0, 0, 0);
      // beta 从 0 → 15
      dispatchDeviceOrientation(0, 15, 0);
      expect(camera.getPitch()).toBeCloseTo(-(15 * Math.PI) / 180, 4);
    });

    it('alpha 跨越 360° 边界不应跳变', async () => {
      await controller.enable();
      // 基准接近 360
      dispatchDeviceOrientation(355, 0, 0);
      // 越过 360 回到 5，实际只转了 10°
      dispatchDeviceOrientation(5, 0, 0);
      // 设备右转 10° → yaw 减小约 -10°
      expect(camera.getYaw()).toBeCloseTo(-(10 * Math.PI) / 180, 4);
    });

    it('alpha/beta 为 null 时不应修改视角', async () => {
      await controller.enable();
      dispatchDeviceOrientation(90, 10, 0); // 基准
      dispatchDeviceOrientation(null, null, null); // 无效帧
      dispatchDeviceOrientation(100, 10, 0); // 后续正常帧以无效帧之前的基准计算？
      // null 帧不更新 lastAlpha，故此帧 delta = 100-90 = 10°
      expect(camera.getYaw()).toBeCloseTo(-(10 * Math.PI) / 180, 4);
    });

    it('关闭后不再响应事件', async () => {
      await controller.enable();
      dispatchDeviceOrientation(0, 0, 0); // 基准
      controller.disable();
      dispatchDeviceOrientation(30, 20, 0);
      expect(camera.getYaw()).toBe(0);
      expect(camera.getPitch()).toBe(0);
    });

    it('灵敏度缩放增量', async () => {
      const cam = new Camera();
      const ctrl = new GyroscopeController(cam, 2.0);
      await ctrl.enable();
      dispatchDeviceOrientation(0, 0, 0);
      dispatchDeviceOrientation(10, 0, 0);
      // 灵敏度 2.0 → yaw 减小 20°
      expect(cam.getYaw()).toBeCloseTo(-(20 * Math.PI) / 180, 4);
      ctrl.dispose();
    });
  });

  describe('dispose', () => {
    it('dispose 后应关闭并移除监听', async () => {
      await controller.enable();
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      controller.dispose();
      expect(controller.isEnabled()).toBe(false);
      expect(removeSpy).toHaveBeenCalled();
      removeSpy.mockRestore();
    });
  });
});
