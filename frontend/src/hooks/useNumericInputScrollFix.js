import { useEffect } from 'react';

/**
 * Global hook to prevent unintended amount modifications on focused number inputs.
 * - Blurs the focused input on wheel/trackpad scrolling to keep input value intact and scroll the page.
 * - Prevents ArrowUp/ArrowDown keys from incrementing/decrementing numeric inputs when focused.
 */
export const useNumericInputScrollFix = () => {
  useEffect(() => {
    const handleWheel = () => {
      const activeEl = document.activeElement;
      if (activeEl && activeEl.tagName === 'INPUT' && activeEl.type === 'number') {
        activeEl.blur();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const activeEl = document.activeElement;
        if (activeEl && activeEl.tagName === 'INPUT' && activeEl.type === 'number') {
          e.preventDefault();
        }
      }
    };

    // Use passive: true for wheel since we do not preventDefault and want optimal scrolling performance.
    document.addEventListener('wheel', handleWheel, { passive: true });
    // Use capture: true for keydown to intercept arrow key presses early.
    document.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      document.removeEventListener('wheel', handleWheel);
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, []);
};
