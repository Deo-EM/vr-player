/**
 * 程序化生成 UV 球体几何数据，并创建 WebGL buffers。
 *
 * 球体法线朝内（相机在球心观察内表面）。
 * 顶点位置 = 半径 * (sin(θ)cos(φ), sin(θ)sin(φ), cos(θ))，
 * 由于观察内表面，需将 position 缩放为负或翻转绕序。
 * 这里采用"翻转 UV.x"的方式让贴图正面朝内。
 */
export class SphereGeometry {
  /** 顶点位置 buffer */
  readonly positionBuffer: WebGLBuffer;
  /** UV buffer */
  readonly uvBuffer: WebGLBuffer;
  /** 索引 buffer */
  readonly indexBuffer: WebGLBuffer;
  /** 索引数量 */
  readonly indexCount: number;

  /**
   * @param gl        WebGL 上下文
   * @param radius    球体半径
   * @param widthSegments  经度细分（纵向切片数），默认 200（4K 推荐）
   * @param heightSegments 纬度细分（横向切片数），默认 100（4K 推荐）
   */
  constructor(gl: WebGLRenderingContext, radius = 50, widthSegments = 200, heightSegments = 100) {
    // 预校验顶点数，避免分配 buffer 后才 throw 浪费 GL 资源
    const vertexCount = (widthSegments + 1) * (heightSegments + 1);
    if (vertexCount > 65535) {
      throw new Error(
        `SphereGeometry: vertex count ${vertexCount} exceeds Uint16 index limit (65535). Reduce segments.`,
      );
    }

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let y = 0; y <= heightSegments; y++) {
      const v = y / heightSegments;
      const theta = v * Math.PI; // 0..π（北极到南极）

      for (let x = 0; x <= widthSegments; x++) {
        const u = x / widthSegments;
        const phi = u * 2 * Math.PI; // 0..2π

        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        // 顶点位置（球面坐标）
        const px = radius * sinTheta * cosPhi;
        const py = radius * cosTheta;
        const pz = radius * sinTheta * sinPhi;
        positions.push(px, py, pz);

        // UV：翻转 Y 方向，修正视频源的方向问题
        uvs.push(u, 1 - v);
      }
    }

    // 索引：按列主序生成四边形（两个三角形）
    for (let y = 0; y < heightSegments; y++) {
      for (let x = 0; x < widthSegments; x++) {
        const a = y * (widthSegments + 1) + x;
        const b = a + 1;
        const c = a + widthSegments + 1;
        const d = c + 1;

        // 逆时针绕序（从球外看），配合 gl.enable(CULL_FACE) 剔除外表面
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    this.indexCount = indices.length;

    // 创建并填充 position buffer
    this.positionBuffer = createBuffer(gl, new Float32Array(positions));
    this.uvBuffer = createBuffer(gl, new Float32Array(uvs));
    this.indexBuffer = createIndexBuffer(gl, new Uint16Array(indices));
  }

  /**
   * 绑定 attributes 并绘制。
   * @param gl              WebGL 上下文
   * @param positionLoc     aPosition attribute location
   * @param uvLoc           aUv attribute location
   */
  draw(gl: WebGLRenderingContext, positionLoc: number, uvLoc: number): void {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
  }

  /** 释放 GL 资源 */
  dispose(gl: WebGLRenderingContext): void {
    gl.deleteBuffer(this.positionBuffer);
    gl.deleteBuffer(this.uvBuffer);
    gl.deleteBuffer(this.indexBuffer);
  }
}

function createBuffer(gl: WebGLRenderingContext, data: Float32Array): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error('SphereGeometry: failed to create WebGLBuffer');
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}

function createIndexBuffer(gl: WebGLRenderingContext, data: Uint16Array): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error('SphereGeometry: failed to create WebGLBuffer for indices');
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}
