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
    expect(angleDelta(2 * Math.PI - 0.1, 0.1)).toBeCloseTo(-0.2, 6);
  });

  it('反向跨越 2π 应取最短路径', () => {
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
    // smoothing=0 保证测试断言精确（无滤波延迟）
    controller = new GyroscopeController(camera, 1.0, 0);
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

  describe('并发 enable 与权限去重', () => {
    it('并发 enable 应只触发一次 requestPermission', async () => {
      let permissionCallCount = 0;
      let resolvePermission: ((v: 'granted' | 'denied') => void) | null = null;
      (
        globalThis as { DeviceOrientationEvent: typeof DeviceOrientationEvent }
      ).DeviceOrientationEvent = {
        requestPermission: () => {
          permissionCallCount++;
          return new Promise<'granted' | 'denied'>((resolve) => {
            resolvePermission = resolve;
          });
        },
      } as unknown as typeof DeviceOrientationEvent;

      // 同时发起两个 enable，权限请求尚未 resolve
      const p1 = controller.enable();
      const p2 = controller.enable();
      expect(permissionCallCount).toBe(1);

      const resolve = resolvePermission as unknown as
        | ((v: 'granted' | 'denied') => undefined)
        | null;
      if (resolve) resolve('granted');
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe(true);
      expect(r2).toBe(true);
      expect(permissionCallCount).toBe(1);
    });

    it('权限被拒绝应返回 false', async () => {
      (
        globalThis as { DeviceOrientationEvent: typeof DeviceOrientationEvent }
      ).DeviceOrientationEvent = {
        requestPermission: () => Promise.resolve('denied'),
      } as unknown as typeof DeviceOrientationEvent;

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const ok = await controller.enable();
      expect(ok).toBe(false);
      expect(controller.isEnabled()).toBe(false);
      warnSpy.mockRestore();
    });

    it('requestPermission 抛错应返回 false', async () => {
      (
        globalThis as { DeviceOrientationEvent: typeof DeviceOrientationEvent }
      ).DeviceOrientationEvent = {
        requestPermission: () => Promise.reject(new Error('not in user gesture')),
      } as unknown as typeof DeviceOrientationEvent;

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const ok = await controller.enable();
      expect(ok).toBe(false);
      expect(controller.isEnabled()).toBe(false);
      warnSpy.mockRestore();
    });
  });

  describe('事件处理', () => {
    it('首帧建立基准，不施加增量', async () => {
      await controller.enable();
      dispatchDeviceOrientation(90, 10, 0);
      expect(camera.getYaw()).toBe(0);
      expect(camera.getPitch()).toBe(0);
    });

    it('第二帧应施加增量（设备右转 → 视角左转，yaw 减小）', async () => {
      await controller.enable();
      dispatchDeviceOrientation(90, 10, 0);
      dispatchDeviceOrientation(100, 10, 0);
      expect(camera.getYaw()).toBeCloseTo(-(10 * Math.PI) / 180, 4);
      expect(camera.getPitch()).toBe(0);
    });

    it('beta 增大 → pitch 减小（取反）', async () => {
      await controller.enable();
      dispatchDeviceOrientation(0, 0, 0);
      dispatchDeviceOrientation(0, 15, 0);
      expect(camera.getPitch()).toBeCloseTo(-(15 * Math.PI) / 180, 4);
    });

    it('alpha 跨越 360° 边界不应跳变', async () => {
      await controller.enable();
      dispatchDeviceOrientation(355, 0, 0);
      dispatchDeviceOrientation(5, 0, 0);
      expect(camera.getYaw()).toBeCloseTo(-(10 * Math.PI) / 180, 4);
    });

    it('alpha/beta 为 null 时不应修改视角', async () => {
      await controller.enable();
      dispatchDeviceOrientation(90, 10, 0); // 基准
      dispatchDeviceOrientation(null, null, null); // 无效帧
      dispatchDeviceOrientation(100, 10, 0); // null 帧不更新基准，delta=100-90=10°
      expect(camera.getYaw()).toBeCloseTo(-(10 * Math.PI) / 180, 4);
    });

    it('关闭后不再响应事件', async () => {
      await controller.enable();
      dispatchDeviceOrientation(0, 0, 0);
      controller.disable();
      dispatchDeviceOrientation(30, 20, 0);
      expect(camera.getYaw()).toBe(0);
      expect(camera.getPitch()).toBe(0);
    });

    it('灵敏度缩放增量', async () => {
      const cam = new Camera();
      const ctrl = new GyroscopeController(cam, 2.0, 0);
      await ctrl.enable();
      dispatchDeviceOrientation(0, 0, 0);
      dispatchDeviceOrientation(10, 0, 0);
      expect(cam.getYaw()).toBeCloseTo(-(20 * Math.PI) / 180, 4);
      ctrl.dispose();
    });
  });

  describe('低通滤波平滑', () => {
    it('smoothing > 0 时增量应小于原始值（首帧后）', async () => {
      const cam = new Camera();
      // smoothing=0.5：首帧增量会被拉低
      const ctrl = new GyroscopeController(cam, 1.0, 0.5);
      await ctrl.enable();
      dispatchDeviceOrientation(0, 0, 0);
      dispatchDeviceOrientation(10, 0, 0);
      // 原始 delta = -10°，滤波后 = (1-0.5)*(-10°) = -5°
      // smoothDYaw 初始 0 → 0 + 0.5*(dAlpha - 0) = 0.5*dAlpha
      // yaw = 0 - 0.5*dAlpha * 1.0
      const dAlpha = (10 * Math.PI) / 180;
      const expectedYaw = -0.5 * dAlpha;
      expect(cam.getYaw()).toBeCloseTo(expectedYaw, 4);
      ctrl.dispose();
    });

    it('smoothing=0 时无滤波（精确增量）', async () => {
      const cam = new Camera();
      const ctrl = new GyroscopeController(cam, 1.0, 0);
      await ctrl.enable();
      dispatchDeviceOrientation(0, 0, 0);
      dispatchDeviceOrientation(20, 0, 0);
      expect(cam.getYaw()).toBeCloseTo(-(20 * Math.PI) / 180, 4);
      ctrl.dispose();
    });

    it('连续多帧滤波应逐渐收敛到目标值', async () => {
      const cam = new Camera();
      const ctrl = new GyroscopeController(cam, 1.0, 0.5);
      await ctrl.enable();
      dispatchDeviceOrientation(0, 0, 0);
      // 每帧固定 +10°，平滑后视角增量应逐步逼近 -10°
      for (let i = 1; i <= 10; i++) {
        dispatchDeviceOrientation(i * 10, 0, 0);
      }
      // 10 帧后 smoothDYaw 应接近 dAlpha（约 10°）
      const dAlpha = (10 * Math.PI) / 180;
      // yaw 累积应接近 -10 帧 * 10°（但受滤波影响略小）
      // 主要验证不发散、方向正确
      expect(cam.getYaw()).toBeLessThan(0);
      expect(cam.getYaw()).toBeGreaterThan(-10 * dAlpha * 1.1);
      ctrl.dispose();
    });
  });

  describe('dispose 安全性', () => {
    it('dispose 后应关闭并移除监听', async () => {
      await controller.enable();
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      controller.dispose();
      expect(controller.isEnabled()).toBe(false);
      expect(removeSpy).toHaveBeenCalled();
      removeSpy.mockRestore();
    });

    it('dispose 后 enable 应返回 false', async () => {
      controller.dispose();
      const ok = await controller.enable();
      expect(ok).toBe(false);
    });

    it('dispose 后事件触发不应崩溃', async () => {
      await controller.enable();
      dispatchDeviceOrientation(0, 0, 0); // 基准
      controller.dispose();
      // dispose 后 dispatch 不应抛错（camera 已 null）
      expect(() => dispatchDeviceOrientation(90, 45, 0)).not.toThrow();
    });

    it('权限请求期间 dispose 应安全返回 false', async () => {
      let resolvePermission: ((v: 'granted' | 'denied') => void) | null = null;
      (
        globalThis as { DeviceOrientationEvent: typeof DeviceOrientationEvent }
      ).DeviceOrientationEvent = {
        requestPermission: () =>
          new Promise<'granted' | 'denied'>((resolve) => {
            resolvePermission = resolve;
          }),
      } as unknown as typeof DeviceOrientationEvent;

      const p = controller.enable();
      controller.dispose();
      const resolve = resolvePermission as unknown as
        | ((v: 'granted' | 'denied') => undefined)
        | null;
      if (resolve) resolve('granted');
      const ok = await p;
      expect(ok).toBe(false);
    });
  });
});
