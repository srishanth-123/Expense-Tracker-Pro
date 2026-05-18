import React from 'react';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

const Button = ({
  children,
  onClick,
  variant = 'primary', // primary, secondary, danger, ghost
  type = 'button',
  disabled = false,
  loading = false,
  className = '',
  style = {},
  fullWidth = false,
  icon: Icon,
  ...props
}) => {
  let btnClass = 'btn';
  if (variant === 'secondary') btnClass += ' btn-secondary';
  if (variant === 'danger') btnClass += ' btn-danger';
  
  if (variant === 'ghost') {
    // We don't have a global ghost class yet, add inline styles for it
    style = {
      ...style,
      background: 'transparent',
      color: 'var(--text-secondary)',
      border: 'none',
      boxShadow: 'none',
    };
  }

  if (fullWidth) {
    style = { ...style, width: '100%' };
  }

  return (
    <motion.button
      whileTap={{ scale: disabled || loading ? 1 : 0.97 }}
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${btnClass} ${className}`}
      style={{
        ...style,
        opacity: (disabled || loading) ? 0.6 : 1,
        cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
      }}
      {...props}
    >
      {loading ? (
        <Loader2 style={{ animation: 'spin 1s linear infinite' }} size={18} />
      ) : (
        Icon && <Icon size={18} />
      )}
      {children}
    </motion.button>
  );
};

export default Button;
