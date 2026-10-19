/**
 * Sliding selection indicator for segmented controls and navigation lists:
 * one element behind the items that glides to the active one instead of
 * each item painting its own background (components/indicator.css).
 *
 * Works horizontally and vertically, in scrolling tracks and with wrapping
 * items, because it measures the active item relative to the track. The
 * first placement and size changes from resizing jump; only a change of the
 * active item animates.
 *
 *   const indicator = createIndicator(nav, { active: '[aria-current="page"]' });
 *   ...change the active item...
 *   indicator.update();
 */

/**
 * @param {HTMLElement} track   positioned container of the items
 * @param {{ active: string, className?: string }} options
 *   active     selector of the active item inside the track
 *   className  extra class for the indicator (its look is up to the component)
 */
export function createIndicator(track, options) {
  // No destructuring: some Safari 14 target builds cannot lower it.
  const active = options.active;
  const className = options.className || '';
  const indicator = document.createElement('span');
  indicator.className = `ds-indicator ds-indicator--instant${className ? ` ${className}` : ''}`;
  indicator.setAttribute('aria-hidden', 'true');
  track.prepend(indicator);
  track.classList.add('ds-has-indicator');

  /** Last placed item: only a different item animates. */
  let placed = /** @type {Element|null} */ (null);
  /**
   * While a glide runs, size changes (the active label turning bold) retarget
   * it instead of cutting it short. Covers --ds-dur-medium with a wide margin.
   */
  let glideUntil = 0;

  function place(animate) {
    const item = track.querySelector(active);
    const trackRect = track.getBoundingClientRect();
    if (!item || trackRect.width === 0) {
      indicator.dataset.empty = '';
      placed = null;
      return;
    }
    const rect = item.getBoundingClientRect();
    const now = Date.now();
    const glide = (animate && placed !== null && placed !== item) || now < glideUntil;
    if (glide && placed !== item) glideUntil = now + 600;
    indicator.classList.toggle('ds-indicator--instant', !glide);
    const style = indicator.style;
    style.setProperty('--ds-indicator-x', `${rect.left - trackRect.left - track.clientLeft + track.scrollLeft}px`);
    style.setProperty('--ds-indicator-y', `${rect.top - trackRect.top - track.clientTop + track.scrollTop}px`);
    style.setProperty('--ds-indicator-w', `${rect.width}px`);
    style.setProperty('--ds-indicator-h', `${rect.height}px`);
    delete indicator.dataset.empty;
    placed = item;
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => place(false)) : null;
  observer?.observe(track);
  // Web fonts change the width of the items once they arrive.
  document.fonts?.ready?.then(() => place(false)).catch(() => {});

  place(false);

  return {
    /** Moves the indicator to the current active item (animated). */
    update() {
      place(true);
    },
    destroy() {
      observer?.disconnect();
      indicator.remove();
      track.classList.remove('ds-has-indicator');
    },
  };
}
