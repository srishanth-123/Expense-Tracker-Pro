import { useEffect, useRef, useState } from 'react';

/**
 * Measures its own size with ResizeObserver and renders children as a function
 * with explicit numeric width/height. Avoids Recharts ResponsiveContainer's
 * -1 dimension warning during initial mount.
 */
const ChartContainer = ({ height = 300, children }) => {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ width: Math.floor(width), height: Math.floor(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ width: '100%', height, minWidth: 0 }}>
      {size.width > 0 && size.height > 0 && children(size)}
    </div>
  );
};

export default ChartContainer;
