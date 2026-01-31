import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Edit.css';

const FADE_OUT_MS = 600;
const VIDEOS = ['video1.mp4', 'video2.mp4', 'video3.mp4'];
const SLOT_VW = 30; // 28vw building + 2vw gap

function Edit() {
  const [exiting, setExiting] = useState(false);
  const [centerIndex, setCenterIndex] = useState(1);
  const navigate = useNavigate();

  const handleDone = () => {
    setExiting(true);
    setTimeout(() => navigate('/video'), FADE_OUT_MS);
  };

  const goLeft = () => {
    setCenterIndex((c) => (c - 1 + VIDEOS.length) % VIDEOS.length);
  };

  const goRight = () => {
    setCenterIndex((c) => (c + 1) % VIDEOS.length);
  };

  return (
    <div className={`video-page edit-page ${exiting ? 'edit-page-exiting' : ''}`}>
      <div className="edit-page-bg" aria-hidden="true" />
      <button type="button" className="edit-done-btn" onClick={handleDone} disabled={exiting}>
        Done
      </button>
      <h1 className="video-title">LiveCut</h1>
      <div className="video-container">
        <div className="video-strip" style={{ transform: `translateX(${(1 - centerIndex) * SLOT_VW}vw)` }}>
          {VIDEOS.map((src, i) => (
            <div className={`building ${i === centerIndex ? 'building-center' : ''}`} key={src}>
              <video className="city-video" src={`/videos/${src}`} controls autoPlay loop muted playsInline />
            </div>
          ))}
        </div>
      </div>
      <div className="edit-scene-bar">
        <button
          type="button"
          className="carousel-btn carousel-btn-left"
          onClick={goLeft}
          aria-label="Previous video"
        >
          ‹
        </button>
        <input
          type="text"
          className="edit-scene-input"
          placeholder="Edit This Scene"
          aria-label="Edit this scene"
        />
        <button
          type="button"
          className="carousel-btn carousel-btn-right"
          onClick={goRight}
          aria-label="Next video"
        >
          ›
        </button>
      </div>
      <div className="city-skyline" aria-hidden="true" />
    </div>
  );
}

export default Edit;