/** Stripe time scale hardcoded in Paper's Liquid Metal shader (`t = 0.3 * u_time`). */
export const STRIPE_RATE = 0.3;

export function loopPeriodSeconds(speed: number): number {
  return 1 / (STRIPE_RATE * Math.max(Math.abs(speed), 0.001));
}

/** Speed that fits `cycles` chrome passes into `duration` wall-clock seconds. */
export function speedForDuration(duration: number, cycles = 1): number {
  return cycles / (STRIPE_RATE * Math.max(duration, 0.1));
}
