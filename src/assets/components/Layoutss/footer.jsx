import React from 'react';

const Footer = () => {
  return (
    <footer style={{ 
      textAlign: 'center', 
      padding: '2rem 1rem', 
      color: 'rgba(255, 255, 255, 0.8)', 
      fontSize: '0.95rem',
      width: '100%',
      marginTop: 'auto'
    }}>
      <p style={{ margin: '0 0 0.5rem 0', fontWeight: 500 }}>
        © 2026 Signify. Developed by VenZenith
      </p>
      <p style={{ margin: 0, fontStyle: 'italic', fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.6)' }}>
        "Music that understands you"
      </p>
    </footer>
  );
};

export default Footer;