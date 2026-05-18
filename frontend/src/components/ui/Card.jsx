import React from 'react';
import { motion } from 'framer-motion';

const Card = ({
  children,
  className = '',
  hoverEffect = false,
  padding = '24px',
  style = {},
  ...props
}) => {
  return (
    <motion.div
      whileHover={hoverEffect ? { y: -4, boxShadow: '0 20px 40px rgba(0,0,0,0.4)' } : {}}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={`glass-card ${className}`}
      style={{ padding, ...style }}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export default Card;
