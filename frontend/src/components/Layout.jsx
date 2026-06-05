import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import AIChatPanel from './AIChatPanel';

const Layout = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef(null);

  // Close mobile menu and scroll to top on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  return (
    <div className="app-container" style={{ position: 'relative' }}>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 40,
              backdropFilter: 'blur(4px)'
            }}
          />
        )}
      </AnimatePresence>

      <Sidebar isOpen={isMobileMenuOpen} setIsOpen={setIsMobileMenuOpen} />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <Navbar onMenuClick={() => setIsMobileMenuOpen(true)} onAIChatToggle={() => setIsAIChatOpen(!isAIChatOpen)} />
        
        <main className="main-content" ref={mainRef} style={{ position: 'relative' }}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ height: '100%' }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>

      {/* Slide-out AI Panel */}
      <AnimatePresence>
        {isAIChatOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 190 }}
            style={{ position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 100 }}
          >
            <AIChatPanel onClose={() => setIsAIChatOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Layout;
