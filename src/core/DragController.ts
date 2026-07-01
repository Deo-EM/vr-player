import type { Camera } from './Camera';

/**
 * 拖动控制器：监听 Pointer + Wheel 事件，将输入转换为 yaw/pitch/fov 更新 Camera。
 *
 * - 统一处理鼠标/触摸（Pointer Events）
 * - 单指拖动：deltaX → yaw 增量，deltaY → pitch 增量
 * - 双指捏合（pinch）：两指距离变化 → FOV 缩放（张开放大、捏合缩小）
 * - 鼠标滚轮 → FOV 缩放（上滚放大视野/下滚缩小视野）
 * - pointer capture 保证拖动出元素仍能接收事件
 */
export class DragController {
  private target: HTMLElement;
  private camera: Camera;
  /** 拖动灵敏度（弧度/像素） */
  private sensitivity: number;
  /** 滚轮缩放灵敏度（度/像素） */
  private wheelSensitivity: number;
  /** 双指 pinch 缩放灵敏度（度/像素） */
  private pinchSensitivity: number;

  /** 活跃指针表：pointerId → 上次坐标。size===1 拖动，size===2 pinch */
  private readonly activePointers = new Map<number, { x: number; y: number }>();
  /** pinch 模式下上一帧的两指距离（像素），0 表示无效 */
  private lastPinchDistance = 0;

  // 绑定的事件处理器引用（用于解绑）
  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;
  private readonly onWheel: (e: WheelEvent) => void;

  /**
   * @param target              监听拖动的目标元素（通常为 canvas 容器）
   * @param camera              被控制的相机
   * @param sensitivity         单指拖动灵敏度，默认 0.005 弧度/像素
   * @param wheelSensitivity    滚轮缩放灵敏度，默认 0.05 度/像素
   * @param pinchSensitivity    双指 pinch 缩放灵敏度，默认 0.1 度/像素
   */
  constructor(
    target: HTMLElement,
    camera: Camera,
    sensitivity = 0.005,
    wheelSensitivity = 0.05,
    pinchSensitivity = 0.1,
  ) {
    this.target = target;
    this.camera = camera;
    this.sensitivity = sensitivity;
    this.wheelSensitivity = wheelSensitivity;
    this.pinchSensitivity = pinchSensitivity;

    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onWheel = this.handleWheel.bind(this);

    this.attach();
  }

  /** 绑定事件 */
  private attach(): void {
    this.target.addEventListener('pointerdown', this.onPointerDown);
    this.target.addEventListener('pointermove', this.onPointerMove);
    this.target.addEventListener('pointerup', this.onPointerUp);
    this.target.addEventListener('pointercancel', this.onPointerUp);
    this.target.addEventListener('wheel', this.onWheel, { passive: false });
    this.target.style.touchAction = 'none';
  }

  private handlePointerDown(e: PointerEvent): void {
    // 仅响应主按键（左键 / 触摸 / 笔）
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // 最多追踪两指（第二个指针进入 pinch 模式）
    if (this.activePointers.size >= 2) return;

    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    try {
      this.target.setPointerCapture(e.pointerId);
    } catch {
      // 某些环境 setPointerCapture 可能抛错，忽略
    }

    // 第二指落下：进入 pinch 模式，记录初始两指距离
    if (this.activePointers.size === 2) {
      this.lastPinchDistance = this.getPinchDistance();
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    const prev = this.activePointers.get(e.pointerId);
    if (!prev) return;

    if (this.activePointers.size === 1) {
      // 单指拖动：deltaX → yaw，deltaY → pitch
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // 向右拖动 → 视角向右转（yaw 增大）
      // 向下拖动 → 视角向下看（pitch 增大）
      const yaw = this.camera.getYaw() + dx * this.sensitivity;
      const pitch = this.camera.getPitch() + dy * this.sensitivity;
      this.camera.setYawPitch(yaw, pitch);
    } else if (this.activePointers.size === 2) {
      // 双指 pinch：两指距离变化 → FOV 缩放
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const distance = this.getPinchDistance();
      if (this.lastPinchDistance > 0) {
        const delta = distance - this.lastPinchDistance;
        // 张开（距离增大）→ FOV 减小（画面放大/拉近）
        // 捏合（距离减小）→ FOV 增大（画面缩小/拉远）
        // 钳制由 Camera.setFov 内部处理
        this.camera.setFov(this.camera.getFov() - delta * this.pinchSensitivity);
      }
      this.lastPinchDistance = distance;
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (!this.activePointers.has(e.pointerId)) return;

    this.activePointers.delete(e.pointerId);

    try {
      this.target.releasePointerCapture(e.pointerId);
    } catch {
      // 忽略
    }

    // 指针数不足 2 时退出 pinch 模式；
    // 若从双指变为单指，剩余指针的坐标已在 map 中保留，
    // 下一次 move 会以当前坐标为基准，不会产生跳变
    if (this.activePointers.size < 2) {
      this.lastPinchDistance = 0;
    }
  }

  /** 计算当前两个活跃指针间的距离（像素） */
  private getPinchDistance(): number {
    const pointers = [...this.activePointers.values()];
    if (pointers.length < 2) return 0;
    const dx = pointers[0].x - pointers[1].x;
    const dy = pointers[0].y - pointers[1].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** 鼠标滚轮控制 FOV：上滚放大视野，下滚缩小视野 */
  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const delta = e.deltaY * this.wheelSensitivity;
    // 上滚（deltaY < 0）→ FOV 增大；下滚（deltaY > 0）→ FOV 减小
    // 钳制由 Camera.setFov 内部处理
    this.camera.setFov(this.camera.getFov() - delta);
  }

  /** 解绑所有事件，释放资源 */
  dispose(): void {
    this.target.removeEventListener('pointerdown', this.onPointerDown);
    this.target.removeEventListener('pointermove', this.onPointerMove);
    this.target.removeEventListener('pointerup', this.onPointerUp);
    this.target.removeEventListener('pointercancel', this.onPointerUp);
    this.target.removeEventListener('wheel', this.onWheel);
    this.activePointers.clear();
    this.lastPinchDistance = 0;
  }
}
