/**
 * Motion helpers: the JS half of motion.css.
 *
 * Everything here only toggles classes and custom properties; timing lives
 * in CSS tokens. Waiting for an animation always has a timeout as well,
 * because animationend never fires for hidden or detached elements.
 *
 * Plain ES2020 without imports or destructuring (Safari 14 builds), so it
 * runs as a module and inside dist/ds.js (DS.motion).
 */

/** Must match --ds-delay-loader (tokens.css; test/tokens.test.js checks it). */
export const LOADER_DELAY_MS = 200;

/**
 * Once a loading indicator became visible it stays at least this long: one
 * that appears and vanishes a moment later is what reads as flickering.
 */
export const LOADER_MIN_VISIBLE_MS = 450;

/** Longest animation of the system (--ds-dur-glide) plus a margin. */
const DEFAULT_TIMEOUT_MS = 1000;

/** @param {Window|undefined} [win] */
export function prefersReducedMotion(win = globalThis.window) {
  try {
    return Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

/** Highest stagger index: 30ms × at most six steps (0…5), the motion rule. */
export const STAGGER_MAX = 5;

/**
 * Numbers the items of a list for staggered entrances (`--ds-i`, used by
 * .ds-enter and every component that staggers). Set through the CSSOM, so it
 * also works on pages whose CSP forbids inline style attributes. Items after
 * the sixth share the last step, so a long list never trails in.
 * @param {Iterable<Element>} elements
 * @param {{ from?: number, max?: number }} [options] `max` caps the index
 *   (default STAGGER_MAX)
 */
export function stagger(elements, options = {}) {
  const from = options.from || 0;
  const max = options.max === undefined ? STAGGER_MAX : options.max;
  let index = 0;
  for (const element of elements) {
    /** @type {HTMLElement} */ (element).style.setProperty('--ds-i', String(Math.min(from + index, max)));
    index += 1;
  }
}

/**
 * Restarts a one-shot animation class on an element that may already carry
 * it (the browser only replays an animation when its name changes).
 * @param {Element|null|undefined} element
 * @param {...string} classNames
 */
export function replay(element, ...classNames) {
  if (!element) return;
  element.classList.remove(...classNames);
  // Reading layout commits the removal, so adding the class starts afresh.
  void (/** @type {HTMLElement} */ (element).offsetWidth);
  element.classList.add(...classNames);
}

/**
 * Resolves when the element's own animation or transition ends (events of
 * children are ignored), or after `timeout`. `property` waits for the
 * transition of one CSS property when several run at once.
 * @param {Element} element
 * @param {{ timeout?: number, event?: 'animationend'|'transitionend', property?: string }} [options]
 * @returns {Promise<void>}
 */
export function settled(element, options = {}) {
  const timeout = options.timeout || DEFAULT_TIMEOUT_MS;
  const event = options.event || 'animationend';
  return new Promise((resolve) => {
    let timer = 0;
    const done = (/** @type {any} */ evt) => {
      if (evt && (evt.target !== element || (options.property && evt.propertyName !== options.property))) return;
      clearTimeout(timer);
      element.removeEventListener(event, done);
      resolve();
    };
    element.addEventListener(event, done);
    timer = /** @type {any} */ (setTimeout(done, timeout));
  });
}

/**
 * Plays a .ds-enter animation once (see motion.css for variants) and
 * cleans the classes up afterwards, so later re-renders do not replay it.
 * @param {Element|null|undefined} element
 * @param {''|'fade'|'scale'|'slide'|'swap'|'delayed'|'pop'|'fill-x'|'fill-y'} [variant]
 * @returns {Promise<void>}
 */
export function enter(element, variant = '') {
  if (!element) return Promise.resolve();
  const classes = variant ? ['ds-enter', `ds-enter--${variant}`] : ['ds-enter'];
  element.classList.remove('ds-leave');
  replay(element, ...classes);
  return settled(element).then(() => element.classList.remove(...classes));
}

/**
 * Plays a .ds-leave animation, then removes or hides the element.
 * @param {Element|null|undefined} element
 * @param {''|'sink'|'scale'|'slide'} [variant]
 * @param {{ then?: 'remove'|'hide'|'keep' }} [options]
 * @returns {Promise<void>}
 */
export function leave(element, variant = '', options = {}) {
  if (!element) return Promise.resolve();
  const then = options.then || 'remove';
  const classes = variant ? ['ds-leave', `ds-leave--${variant}`] : ['ds-leave'];
  element.classList.remove('ds-enter');
  element.classList.add(...classes);
  return settled(element).then(() => {
    if (then === 'remove') element.remove();
    else if (then === 'hide') {
      /** @type {HTMLElement} */ (element).hidden = true;
      element.classList.remove(...classes);
    }
  });
}

/**
 * How much longer a loading indicator inserted at `startedAt` must stay
 * before its content may replace it: none when it never became visible (it
 * fades in after LOADER_DELAY_MS), else until it was visible for
 * LOADER_MIN_VISIBLE_MS, so it never flashes up and away half-faded.
 * @param {number} startedAt  Date.now() when the indicator was inserted
 * @param {number} [now]
 * @returns {number} ms
 */
export function loaderHoldMs(startedAt, now = Date.now()) {
  const visible = now - startedAt - LOADER_DELAY_MS;
  if (visible <= 0 || visible >= LOADER_MIN_VISIBLE_MS) return 0;
  return LOADER_MIN_VISIBLE_MS - visible;
}

/**
 * Waits until a loading indicator inserted at `startedAt` may disappear
 * (see loaderHoldMs).
 * @param {number} startedAt  Date.now() when the indicator was inserted
 * @param {number} [now]
 * @returns {Promise<void>}
 */
export function settleLoader(startedAt, now = Date.now()) {
  const ms = loaderHoldMs(startedAt, now);
  return ms ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/** Must match --ds-dur-glide (tokens.css; test/tokens.test.js checks it). */
export const COUNT_UP_MS = 600;

/** Ease-out (cubic) for values that count up: fast start, soft landing. */
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;

/**
 * Counts a number up to `to` in the element's text (key figures). Without
 * animation frames or with reduced motion it shows the final value at once.
 * @param {Element|null|undefined} element
 * @param {number} to
 * @param {{ format?: (value: number) => string, duration?: number, win?: any }} [options]
 */
export function countUp(element, to, options = {}) {
  if (!element) return;
  const format = options.format || ((value) => String(Math.round(value)));
  // --ds-dur-glide: counting is a value travelling, like a progress bar.
  const duration = options.duration || COUNT_UP_MS;
  const win = 'win' in options ? options.win : globalThis.window;
  const target = Number(to) || 0;
  if (!win?.requestAnimationFrame || prefersReducedMotion(win) || target === 0) {
    element.textContent = format(target);
    return;
  }
  const start = win.performance?.now?.() ?? Date.now();
  const tick = (/** @type {number} */ time) => {
    const progress = Math.min(1, Math.max(0, (time - start) / duration));
    element.textContent = format(progress >= 1 ? target : target * easeOutCubic(progress));
    if (progress < 1 && element.isConnected) win.requestAnimationFrame(tick);
  };
  element.textContent = format(0);
  win.requestAnimationFrame(tick);
}
