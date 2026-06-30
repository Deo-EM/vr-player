import type { Camera } from './Camera';

/**
 * 拖动控制器：监听 Pointer + Wheel 事件，将输入转换为 yaw/pitch/fov 更新 Camera。
 *
 * - 统一处理鼠标/触摸（Pointer Events）
 * - deltaX → yaw 增量，deltaY → pitch 增量
 * - 鼠标滚轮 → FOV 缩放（上滚放大/下滚缩小）
 * - 灵敏度系数可配
 * - pointer capture 保证拖动出元素仍能接收事件
 */
export class DragController {
  private target: HTMLElement;
  private camera: Camera;
  /** 拖动灵敏度（弧度/像素） */
  private sensitivity: number;
  /** 滚轮缩放灵敏度（度/像素） */
  private wheelSensitivity: number;
  /** 当前活跃的 pointerId，-1 表示无 */
  private activePointerId = -1;
  /** 上一次指针 X 坐标 */
  private lastX = 0;
  /** 上一次指针 Y 坐标 */
  private lastY = 0;

  // 绑定的事件处理器引用（用于解绑）
  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;
  private readonly onWheel: (e: WheelEvent) => void;

  /**
   * @param target           监听拖动的目标元素（通常为 canvas 容器）
   * @param camera           被控制的相机
   * @param sensitivity      拖动灵敏度，默认 0.005 弧度/像素
   * @param wheelSensitivity 滚轮灵敏度，默认 0.05 度/像素
   */
  constructor(target: HTMLElement, camera: Camera, sensitivity = 0.005, wheelSensitivity = 0.05) {
    this.target = target;
    this.camera = camera;
    this.sensitivity = sensitivity;
    this.wheelSensitivity = wheelSensitivity;

    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onWheel = this.handleWheel.bind(this);

    this.attach();
  }

  /** 绑定事件 */
  private attach(): void {
    this.target.addEventListener('pointerdown', this.onPointerDown);
    this.target.addEventListener('wheel', this.onWheel, { passive: false });
    this.target.style.touchAction = 'none';
  }

  private handlePointerDown(e: PointerEvent): void {
    // 仅响应主按键（左键 / 触摸 / 笔）
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // 同一时间仅追踪一个 pointer
    if (this.activePointerId !== -1) return;

    this.activePointerId = e.pointerId;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    try {
      this.target.setPointerCapture(e.pointerId);
    } catch {
      // 某些环境 setPointerCapture 可能抛错，忽略
    }
    this.target.addEventListener('pointermove', this.onPointerMove);
    this.target.addEventListener('pointerup', this.onPointerUp);
    this.target.addEventListener('pointercancel', this.onPointerUp);
  }

  private handlePointerMove(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId) return;

    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    // 向右拖动 → 视角向右转（yaw 增大）
    // 向下拖动 → 视角向下看（pitch 增大）
    const yaw = this.camera.getYaw() + dx * this.sensitivity;
    const pitch = this.camera.getPitch() + dy * this.sensitivity;
    this.camera.setYawPitch(yaw, pitch);
  }

  private handlePointerUp(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId) return;

    try {
      this.target.releasePointerCapture(e.pointerId);
    } catch {
      // 忽略
    }
    this.target.removeEventListener('pointermove', this.onPointerMove);
    this.target.removeEventListener('pointerup', this.onPointerUp);
    this.target.removeEventListener('pointercancel', this.onPointerUp);
    this.activePointerId = -1;
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
    this.activePointerId = -1;
  }
}
