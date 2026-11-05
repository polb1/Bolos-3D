export interface InputHandlers {
  grab(clientX: number, clientY: number, time: number): boolean;
  /** `time` is the event's own timestamp (ms), so stroke speed is exact even if frames stall. */
  move(clientX: number, clientY: number, time: number): void;
  release(): void;
  spin(delta: number): void;
  camera(): void;
  mute(): void;
  pause(): void;
  skip(): void;
}

/**
 * Pointer (mouse / touch) drives the throw: grab the ball, swing, let go.
 * Keyboard only handles wrist spin presets and shortcuts.
 */
export class Input {
  /** Held wrist-spin direction: -1, 0 or 1 (Q/E keys or touch buttons). */
  spinHeld = 0;
  private touchSpin = 0;
  private readonly keys = new Set<string>();
  private pointer: number | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly h: InputHandlers) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  setTouchSpin(v: number) {
    this.touchSpin = v;
  }

  poll() {
    this.spinHeld = (this.keys.has('KeyQ') ? -1 : 0) + (this.keys.has('KeyE') ? 1 : 0) || this.touchSpin;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || e.repeat) return;
    this.keys.add(e.code);
    if (e.code === 'KeyC') this.h.camera();
    if (e.code === 'KeyM') this.h.mute();
    if (e.code === 'Escape') this.h.pause();
    if (e.code === 'Space' || e.code === 'Enter') this.h.skip();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
    if (this.pointer !== null) this.h.release();
    this.pointer = null;
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.pointer !== null) return;
    if (this.h.grab(e.clientX, e.clientY, e.timeStamp)) {
      this.pointer = e.pointerId;
      this.canvas.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== this.pointer) return;
    // Use coalesced events for an accurate stroke velocity on fast swipes.
    const events = e.getCoalescedEvents?.() ?? [];
    for (const c of events.length ? events : [e]) this.h.move(c.clientX, c.clientY, c.timeStamp);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointer) return;
    this.pointer = null;
    this.h.release();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.h.spin(-Math.sign(e.deltaY) * 0.08);
  };

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }
}
