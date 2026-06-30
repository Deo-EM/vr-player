import { describe, expect, it } from 'vitest';
import { SphereGeometry } from '../src/core/SphereGeometry';

/**
 * SphereGeometry 依赖 WebGL 上下文，在 node 环境中无法直接实例化。
 * 这里通过 mock GL 上下文测试几何数据的生成逻辑（顶点/UV/索引数量与范围）。
 */
describe('SphereGeometry 数据生成', () => {
  it('64x32 球体应生成正确的顶点/索引数量', () => {
    const widthSegments = 64;
    const heightSegments = 32;
    const expectedVertices = (widthSegments + 1) * (heightSegments + 1);
    const expectedIndices = widthSegments * heightSegments * 6;

    const gl = createMockGL();
    const geo = new SphereGeometry(gl, 50, widthSegments, heightSegments);

    const posData = getBuffer(gl, geo.positionBuffer);
    const uvData = getBuffer(gl, geo.uvBuffer);
    const idxData = getBuffer(gl, geo.indexBuffer);

    expect(posData.length).toBe(expectedVertices * 3);
    expect(uvData.length).toBe(expectedVertices * 2);
    expect(idxData.length).toBe(expectedIndices);
    expect(geo.indexCount).toBe(expectedIndices);
  });

  it('UV 坐标应在 [0,1] 范围内', () => {
    const gl = createMockGL();
    const geo = new SphereGeometry(gl, 50, 32, 16);
    const uvData = getBuffer(gl, geo.uvBuffer);

    for (let i = 0; i < uvData.length; i++) {
      expect(uvData[i]).toBeGreaterThanOrEqual(0);
      expect(uvData[i]).toBeLessThanOrEqual(1);
    }
  });

  it('所有顶点应位于给定半径的球面上', () => {
    const radius = 50;
    const gl = createMockGL();
    const geo = new SphereGeometry(gl, radius, 32, 16);
    const posData = getBuffer(gl, geo.positionBuffer);

    for (let i = 0; i < posData.length; i += 3) {
      const x = posData[i];
      const y = posData[i + 1];
      const z = posData[i + 2];
      const dist = Math.sqrt(x * x + y * y + z * z);
      expect(dist).toBeCloseTo(radius, 3);
    }
  });

  it('顶点数量超过 Uint16 上限应抛错', () => {
    const gl = createMockGL();
    // 300x300 -> (301)*(301) = 90601 > 65535
    expect(() => new SphereGeometry(gl, 50, 300, 300)).toThrow(/exceeds Uint16/);
  });
});

// ---- Mock 工具 ----

/**
 * Mock WebGL 上下文。
 * 关键：跟踪 bindBuffer 设置的"当前 buffer"，bufferData 时将数据写入该 buffer。
 */
class MockGL {
  buffers = new Map<WebGLBuffer, Float32Array | Uint16Array>();
  private currentBuffer: WebGLBuffer | null = null;
  private bufId = 0;

  readonly TEXTURE_2D = 0x0de1;
  readonly ARRAY_BUFFER = 0x8892;
  readonly ELEMENT_ARRAY_BUFFER = 0x8893;
  readonly STATIC_DRAW = 0x88e4;
  readonly TEXTURE0 = 0x84c0;
  readonly COMPILE_STATUS = 0x8b81;
  readonly LINK_STATUS = 0x8b82;
  readonly VERTEX_SHADER = 0x8b31;
  readonly FRAGMENT_SHADER = 0x8b30;
  readonly FLOAT = 0x1406;
  readonly UNSIGNED_SHORT = 0x1403;
  readonly TRIANGLES = 0x0004;
  readonly DEPTH_TEST = 0x0b71;
  readonly CULL_FACE = 0x0b44;
  readonly FRONT = 0x0404;
  readonly COLOR_BUFFER_BIT = 0x4000;
  readonly DEPTH_BUFFER_BIT = 0x100;
  readonly CLAMP_TO_EDGE = 0x812f;
  readonly TEXTURE_WRAP_S = 0x2802;
  readonly TEXTURE_WRAP_T = 0x2803;
  readonly TEXTURE_MIN_FILTER = 0x2801;
  readonly TEXTURE_MAG_FILTER = 0x2800;
  readonly LINEAR = 0x2601;
  readonly RGBA = 0x1908;
  readonly UNSIGNED_BYTE = 0x1401;
  readonly UNPACK_FLIP_Y_WEBGL = 0x9240;

  createBuffer(): WebGLBuffer {
    return { __id: this.bufId++ } as unknown as WebGLBuffer;
  }
  createTexture(): WebGLTexture {
    return { __id: this.bufId++ } as unknown as WebGLTexture;
  }
  createShader(): WebGLShader {
    return {} as WebGLShader;
  }
  createProgram(): WebGLProgram {
    return {} as WebGLProgram;
  }
  shaderSource(): void {}
  compileShader(): void {}
  getShaderParameter(): boolean {
    return true;
  }
  getProgramParameter(): boolean {
    return true;
  }
  attachShader(): void {}
  linkProgram(): void {}
  deleteShader(): void {}
  deleteProgram(): void {}
  deleteBuffer(): void {}
  deleteTexture(): void {}
  useProgram(): void {}
  getAttribLocation(): number {
    return 0;
  }
  getUniformLocation(): WebGLUniformLocation {
    return {} as WebGLUniformLocation;
  }
  bindBuffer(_target: number, buffer: WebGLBuffer): void {
    this.currentBuffer = buffer;
  }
  bufferData(_target: number, data: Float32Array | Uint16Array): void {
    if (this.currentBuffer) {
      this.buffers.set(this.currentBuffer, data);
    }
  }
  bindTexture(): void {}
  texParameteri(): void {}
  pixelStorei(): void {}
  texImage2D(): void {}
  texSubImage2D(): void {}
  activeTexture(): void {}
  enable(): void {}
  cullFace(): void {}
  viewport(): void {}
  clearColor(): void {}
  clear(): void {}
  uniformMatrix4fv(): void {}
  uniform1i(): void {}
  enableVertexAttribArray(): void {}
  vertexAttribPointer(): void {}
  drawElements(): void {}
}

function createMockGL(): MockGL {
  return new MockGL();
}

/** 从 mock GL 获取 buffer 数据，缺失则抛错（替代非空断言） */
function getBuffer(gl: MockGL, buffer: WebGLBuffer): Float32Array | Uint16Array {
  const data = gl.buffers.get(buffer);
  if (!data) {
    throw new Error('test: buffer data not found in mock GL');
  }
  return data;
}
