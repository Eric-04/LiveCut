import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Edit.css';

const FADE_OUT_MS = 600;

function Edit() {
  const [exiting, setExiting] = useState(false);
  const navigate = useNavigate();

  const handleDone = () => {
    setExiting(true);
    setTimeout(() => navigate('/video'), FADE_OUT_MS);
  };

  return (
    <div className={`video-page edit-page ${exiting ? 'edit-page-exiting' : ''}`}>
      <button type="button" className="edit-done-btn" onClick={handleDone} disabled={exiting}>
        Done
      </button>
      <h1 className="video-title">LiveCut</h1>
      <div className="video-container">
        {/* Video buildings */}
        {["video1.mp4", "video2.mp4", "video3.mp4"].map((src, _) => (
          <div className="building" key={src}>
            <div className="building-shape"></div>
            <div className="building-window"></div>
            <video className="city-video" src={`/videos/${src}`} controls autoPlay loop muted playsInline />
          </div>
        ))}
      </div>
      <div className="city-skyline" aria-hidden="true" />
    </div>
  );
}

export default Edit;