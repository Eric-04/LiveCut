import { Link, useLocation } from "react-router-dom";
import "./Video.css";

export default function Video() {
  const { state } = useLocation();
  const prompt = state?.prompt;
  // For now use video from public/videos; later we'll get the URL from the backend
  const videoSrc = state?.videoSrc ?? "/videos/video1.mp4";

  return (
    <div className="video-page">
      <nav className="video-nav">
        <Link to="/" className="video-nav-create">
          Create another video
        </Link>
        <Link to="/edit" className="video-nav-edit">
          Edit
        </Link>
      </nav>

      <main className="video-main">
        <div className="video-player-wrapper">
          <video
            className="video-player"
            src={videoSrc}
            controls
            autoPlay
            playsInline
          />
        </div>
        {prompt && <p className="video-prompt">Prompt: {prompt}</p>}
      </main>
    </div>
  );
}
