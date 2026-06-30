import { describe, expect, it } from 'vitest';
import { Camera } from '../src/core/Camera';

describe('Camera', () => {
  it('默认 FOV 应为 75', () => {
    const cam = new Camera();
    expect(cam.getFov()).toBe(75);
  });

  it('默认 yaw/pitch 应为 0', () => {
    const cam = new Camera();
    expect(cam.getYaw()).toBe(0);
    expect(cam.getPitch()).toBe(0);
  });

  describe('setFov 钳制', () => {
    it('FOV 低于下限应钳制到 30', () => {
      const cam = new Camera();
      cam.setFov(10);
      expect(cam.getFov()).toBe(30);
    });

    it('FOV 高于上限应钳制到 120', () => {
      const cam = new Camera();
      cam.setFov(200);
      expect(cam.getFov()).toBe(120);
    });

    it('正常范围内的 FOV 应原样保存', () => {
      const cam = new Camera();
      cam.setFov(60);
      expect(cam.getFov()).toBe(60);
    });
  });

  describe('setYawPitch pitch 钳制', () => {
    it('pitch 超过 85° 应钳制到 85°', () => {
      const cam = new Camera();
      const overPitch = (100 * Math.PI) / 180;
      cam.setYawPitch(0, overPitch);
      const maxPitch = (85 * Math.PI) / 180;
      expect(cam.getPitch()).toBeCloseTo(maxPitch, 6);
    });

    it('pitch 低于 -85° 应钳制到 -85°', () => {
      const cam = new Camera();
      const underPitch = (-100 * Math.PI) / 180;
      cam.setYawPitch(0, underPitch);
      const minPitch = (-85 * Math.PI) / 180;
      expect(cam.getPitch()).toBeCloseTo(minPitch, 6);
    });

    it('yaw 不受钳制', () => {
      const cam = new Camera();
      const bigYaw = (1000 * Math.PI) / 180;
      cam.setYawPitch(bigYaw, 0);
      expect(cam.getYaw()).toBe(bigYaw);
    });
  });

  describe('getProjectionMatrix', () => {
    it('应返回非零投影矩阵，且 out[11] = -1', () => {
      const cam = new Camera();
      const out = new Float32Array(16);
      cam.getProjectionMatrix(1, out);
      expect(out[11]).toBe(-1); // 透视投影标志
      expect(out[15]).toBe(0);
    });
  });

  describe('getViewMatrix', () => {
    it('yaw=0 pitch=0 时视图矩阵应为单位矩阵的转置（即单位矩阵）', () => {
      const cam = new Camera();
      const out = new Float32Array(16);
      cam.getViewMatrix(out);
      // 单位矩阵
      expect(out[0]).toBeCloseTo(1, 5);
      expect(out[5]).toBeCloseTo(1, 5);
      expect(out[10]).toBeCloseTo(1, 5);
      expect(out[15]).toBeCloseTo(1, 5);
    });
  });
});
