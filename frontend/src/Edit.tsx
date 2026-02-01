import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Edit.css';

const FADE_OUT_MS = 600;
const FRAMES_PER_CHUNK = 96;
const FPS = 24;

function Edit() {
  const { state } = useLocation();
  const navigate = useNavigate();

  // Get frames and audio from Video.tsx
  const frames: string[] = state?.frames || [];
  const audioUrls: string[] = state?.audioUrls || [];
  const canvasSize = state?.canvasSize || { width: 848, height: 480 };
  const totalFrames = state?.totalFrames || frames.length;

  // Calculate number of chunks
  const numChunks = Math.ceil(totalFrames / FRAMES_PER_CHUNK);

  const [exiting, setExiting] = useState(false);
  const [centerIndex, setCenterIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioElementsRef = useRef<HTMLAudioElement[]>([]);
  const playbackIntervalRef = useRef<number | null>(null);

  // Preload audio elements
  useEffect(() => {
    if (audioUrls.length > 0) {
      const audioElements = audioUrls.map((url) => {
        const audio = new Audio(`http://localhost:8000${url}`);
        audio.preload = 'auto';
        return audio;
      });
      audioElementsRef.current = audioElements;
    }

    return () => {
      // Cleanup audio on unmount
      audioElementsRef.current.forEach(audio => {
        audio.pause();
        audio.src = '';
      });
    };
  }, [audioUrls]);

  // Draw first frame of current chunk when chunk changes
  useEffect(() => {
    const startFrame = centerIndex * FRAMES_PER_CHUNK;
    drawFrame(startFrame);
    setCurrentFrame(startFrame);

    // Stop any playing audio when switching chunks
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }
    audioElementsRef.current.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
    setIsPlaying(false);
  }, [centerIndex]);

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCenterIndex((c) => (c - 1 + numChunks) % numChunks);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCenterIndex((c) => (c + 1) % numChunks);
      } else if (e.key === ' ') {
        e.preventDefault();
        if (isPlaying) {
          stopPlayback();
        } else {
          playChunk();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [numChunks, isPlaying, centerIndex]);

  const drawFrame = (frameIndex: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const frameUrl = frames[frameIndex];
    if (!frameUrl) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = canvasSize.width;
      canvas.height = canvasSize.height;
      ctx.drawImage(img, 0, 0);
    };
    img.src = frameUrl;
  };

  const playChunk = () => {
    if (frames.length === 0) return;

    const startFrame = centerIndex * FRAMES_PER_CHUNK;
    const endFrame = Math.min(startFrame + FRAMES_PER_CHUNK, totalFrames);

    setIsPlaying(true);
    setCurrentFrame(startFrame);

    // Stop all audio first
    audioElementsRef.current.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });

    // Start this chunk's audio
    if (audioElementsRef.current[centerIndex]) {
      audioElementsRef.current[centerIndex].play().catch(err => {
        console.error("Error playing audio:", err);
      });
    }

    let frameIndex = startFrame;
    const frameInterval = 1000 / FPS;

    // Clear any existing interval
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
    }

    const playFrame = () => {
      if (frameIndex >= endFrame) {
        // Chunk playback complete
        setIsPlaying(false);
        if (playbackIntervalRef.current) {
          clearInterval(playbackIntervalRef.current);
          playbackIntervalRef.current = null;
        }
        // Stop audio
        if (audioElementsRef.current[centerIndex]) {
          audioElementsRef.current[centerIndex].pause();
        }
        // Reset to first frame of chunk
        drawFrame(startFrame);
        setCurrentFrame(startFrame);
        return;
      }

      drawFrame(frameIndex);
      setCurrentFrame(frameIndex);
      frameIndex++;
    };

    // Start playback loop
    playbackIntervalRef.current = window.setInterval(playFrame, frameInterval);
    playFrame(); // Play first frame immediately
  };

  const stopPlayback = () => {
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }
    setIsPlaying(false);

    // Stop audio
    audioElementsRef.current.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });

    // Reset to first frame of chunk
    const startFrame = centerIndex * FRAMES_PER_CHUNK;
    drawFrame(startFrame);
    setCurrentFrame(startFrame);
  };

  const handleDone = () => {
    stopPlayback();
    setExiting(true);
    setTimeout(() => navigate('/video'), FADE_OUT_MS);
  };

  const goLeft = () => {
    setCenterIndex((c) => (c - 1 + numChunks) % numChunks);
  };

  const goRight = () => {
    setCenterIndex((c) => (c + 1) % numChunks);
  };

  // Calculate frame info for display
  const chunkStartFrame = centerIndex * FRAMES_PER_CHUNK;
  const chunkEndFrame = Math.min(chunkStartFrame + FRAMES_PER_CHUNK, totalFrames);
  const frameInChunk = currentFrame - chunkStartFrame + 1;
  const chunkLength = chunkEndFrame - chunkStartFrame;

  return (
    <div className={`video-page edit-page ${exiting ? 'edit-page-exiting' : ''}`}>
      <div className="edit-page-bg" aria-hidden="true" />
      <button type="button" className="edit-done-btn" onClick={handleDone} disabled={exiting}>
        Done
      </button>
      <h1 className="video-title">LiveCut</h1>

      {/* Canvas for frame playback */}
      <div className="video-container">
        <div className="building building-center">
          <canvas
            ref={canvasRef}
            className="city-video"
            width={canvasSize.width}
            height={canvasSize.height}
            style={{
              width: '100%',
              height: 'auto',
              maxHeight: '50vh'
            }}
          />
          {/* Frame counter overlay */}
          <div style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'rgba(0,0,0,0.7)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontFamily: 'monospace',
            zIndex: 5
          }}>
            {isPlaying
              ? `Frame: ${frameInChunk} / ${chunkLength}`
              : `Chunk ${centerIndex + 1} of ${numChunks}`
            }
          </div>
        </div>
      </div>

      {/* Playback controls */}
      <div className="playback-controls">
        {!isPlaying ? (
          <button onClick={playChunk} className="play-btn" disabled={frames.length === 0}>
            ▶ Play Scene {centerIndex + 1}
          </button>
        ) : (
          <button onClick={stopPlayback} className="stop-btn">
            ⏹ Stop
          </button>
        )}
      </div>

      {/* Scene indicator */}
      <div className="scene-indicator">
        Scene {centerIndex + 1} of {numChunks}
        {isPlaying && ' - Playing...'}
        {frames.length === 0 && ' (No frames available)'}
      </div>

      <div className="edit-scene-bar">
        <button
          type="button"
          className="carousel-btn carousel-btn-left"
          onClick={goLeft}
          aria-label="Previous scene"
          disabled={numChunks <= 1}
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
          aria-label="Next scene"
          disabled={numChunks <= 1}
        >
          ›
        </button>
      </div>
      <div className="city-skyline" aria-hidden="true" />
    </div>
  );
}

export default Edit;
