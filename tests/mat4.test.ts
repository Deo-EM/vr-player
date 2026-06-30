import { describe, expect, it } from 'vitest';
import { identity, multiply, perspective, rotationYawPitch, transpose } from '../src/math/mat4';

describe('mat4', () => {
  describe('identity', () => {
    it('应生成正确的单位矩阵', () => {
      const out = new Float32Array(16);
      identity(out);
      expect(Array.from(out)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    });
  });

  describe('multiply', () => {
    it('单位矩阵乘任意矩阵应等于原矩阵', () => {
      const I = new Float32Array(16);
      identity(I);
      const A = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
      const out = new Float32Array(16);
      multiply(out, A, I);
      expect(Array.from(out)).toEqual(Array.from(A));
    });

    it('应满足结合律 (A*B)*C == A*(B*C)', () => {
      const A = new Float32Array([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0, 1, 1, 1, 1]);
      const B = new Float32Array([2, 0, 1, 0, 3, 1, 0, 0, 1, 2, 1, 0, 0, 0, 0, 1]);
      const C = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1]);

      const AB = new Float32Array(16);
      multiply(AB, A, B);
      const AB_C = new Float32Array(16);
      multiply(AB_C, AB, C);

      const BC = new Float32Array(16);
      multiply(BC, B, C);
      const A_BC = new Float32Array(16);
      multiply(A_BC, A, BC);

      for (let i = 0; i < 16; i++) {
        expect(AB_C[i]).toBeCloseTo(A_BC[i], 5);
      }
    });
  });

  describe('perspective', () => {
    it('FOV=90° aspect=1 near=1 far=101 应生成标准透视矩阵', () => {
      const out = new Float32Array(16);
      const fovRad = (90 * Math.PI) / 180;
      perspective(out, fovRad, 1, 1, 101);

      // tan(45°) = 1, f = 1/tan(45) = 1
      expect(out[0]).toBeCloseTo(1, 5); // f/aspect = 1/1
      expect(out[5]).toBeCloseTo(1, 5); // f
      // nf = 1/(1-101) = -1/100
      // out[10] = (far+near)*nf = 102 * (-0.01) = -1.02
      expect(out[10]).toBeCloseTo(-1.02, 5);
      expect(out[11]).toBe(-1);
      // out[14] = 2*far*near*nf = 2*101*1*(-0.01) = -2.02
      expect(out[14]).toBeCloseTo(-2.02, 5);
      expect(out[15]).toBe(0);
    });
  });

  describe('rotationYawPitch', () => {
    it('yaw=0 pitch=0 应为单位矩阵', () => {
      const out = new Float32Array(16);
      rotationYawPitch(out, 0, 0);
      const I = new Float32Array(16);
      identity(I);
      for (let i = 0; i < 16; i++) {
        expect(out[i]).toBeCloseTo(I[i], 5);
      }
    });

    it('纯 yaw 旋转应保持 Y 轴不变', () => {
      const out = new Float32Array(16);
      const yaw = Math.PI / 4; // 45°
      rotationYawPitch(out, yaw, 0);
      // Y 轴列（第 2 列，索引 4..7）应为 [0,1,0,0]
      expect(out[4]).toBeCloseTo(0, 5);
      expect(out[5]).toBeCloseTo(1, 5);
      expect(out[6]).toBeCloseTo(0, 5);
      expect(out[7]).toBeCloseTo(0, 5);
    });

    it('纯 pitch 旋转应保持 X 轴不变', () => {
      const out = new Float32Array(16);
      const pitch = Math.PI / 6; // 30°
      rotationYawPitch(out, 0, pitch);
      // X 轴列（第 1 列，索引 0..3）应为 [1,0,0,0]
      expect(out[0]).toBeCloseTo(1, 5);
      expect(out[1]).toBeCloseTo(0, 5);
      expect(out[2]).toBeCloseTo(0, 5);
      expect(out[3]).toBeCloseTo(0, 5);
    });

    it('旋转矩阵应为正交矩阵（R*R^T = I）', () => {
      const R = new Float32Array(16);
      const yaw = Math.PI / 3;
      const pitch = Math.PI / 6;
      rotationYawPitch(R, yaw, pitch);

      const Rt = new Float32Array(16);
      transpose(Rt, R);
      const RRT = new Float32Array(16);
      multiply(RRT, R, Rt);

      const I = new Float32Array(16);
      identity(I);
      for (let i = 0; i < 16; i++) {
        expect(RRT[i]).toBeCloseTo(I[i], 5);
      }
    });
  });
});
