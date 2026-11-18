import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Intro.css';

const Intro = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/home');
    }, 2900); // Redirect after ~2.8 seconds
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <><div className="intro-container">

      <div className="music-note note-1">♪♫</div>
      <div className="music-note note-2">♪♫</div>
      <div className="music-note note-3">♪♫</div>
      <div className="music-note note-4">♪♫</div>

      <div className="content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <h1 className="logo-text" style={{ fontSize: '7rem', margin: '0 0 1rem 0' }}>Signify</h1>
        <p className="subtitle" style={{ fontSize: '2rem', fontStyle: 'italic', fontWeight: 500, color: '#7C3AED' }}>
          "Music that understands you"
        </p>
      </div>

      <div className="footer-text">
        Developed by VenZenith
      </div>
    </div></>
  );
};

export default Intro;
