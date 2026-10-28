import { CONFIG } from '../sim/config';
export class FixedLoop {
  remainder = 0;
  advance(elapsed: number, speed: number, step: () => void) {
    if (!Number.isFinite(elapsed) || elapsed < 0) return;
    this.remainder += elapsed * speed;
    while (this.remainder >= CONFIG.stepMs) {
      step();
      this.remainder -= CONFIG.stepMs;
    }
  }
  reset() {
    this.remainder = 0;
  }
}
