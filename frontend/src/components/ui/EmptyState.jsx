import React from 'react';
import { motion } from 'framer-motion';

const EmptyState = ({ 
  icon: Icon, 
  title = "No Data Found", 
  description = "There is nothing to display here yet.",
  actionButton = null,
  style = {}
}) => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        textAlign: 'center',
        gap: '16px',
        ...style
      }}
    >
      {Icon && (
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--surface-border)'
        }}>
          <Icon size={40} />
        </div>
      )}
      
      <div>
        <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', marginBottom: '8px' }}>
          {title}
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: '400px', margin: '0 auto' }}>
          {description}
        </p>
      </div>

      {actionButton && (
        <div style={{ marginTop: '16px' }}>
          {actionButton}
        </div>
      )}
    </motion.div>
  );
};

export default EmptyState;
