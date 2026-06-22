import { motion } from 'framer-motion';

// Status -> color mapping (shared with budget cards).
const STATUS_COLORS = {
  safe: 'var(--success)',
  warning: 'var(--warning)',
  exceeded: 'var(--danger)',
};

/**
 * Animated circular progress ring.
 * @param {number} percentage - 0..(can exceed 100, clamped visually to 100)
 * @param {string} status - 'safe' | 'warning' | 'exceeded'
 * @param {number} size - diameter in px
 * @param {number} stroke - ring thickness in px
 */
const CircularProgress = ({ percentage = 0, status = 'safe', size = 120, stroke = 10, label }) => {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(percentage, 0), 100);
  const offset = circumference - (clamped / 100) * circumference;
  const color = STATUS_COLORS[status] || STATUS_COLORS.safe;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-border)"
          strokeWidth={stroke}
          opacity={0.35}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: size * 0.22, fontWeight: 700, color: 'var(--text-primary)' }}>
          {Math.round(percentage)}%
        </span>
        {label && (
          <span style={{ fontSize: size * 0.1, color: 'var(--text-secondary)' }}>{label}</span>
        )}
      </div>
    </div>
  );
};

export default CircularProgress;
