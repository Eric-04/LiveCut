import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import "./Video.css";

export default function Video() {
  const { state } = useLocation();
  const prompt = state?.prompt;
  // For now use video from public/videos; later we'll get the URL from the backend
  const videoSrc = state?.videoSrc ?? "/videos/video1.mp4";
  
  const [isLoading, setIsLoading] = useState(false);
  const [generatedData, setGeneratedData] = useState(null);

  useEffect(() => {
    // Call the generate endpoint when component mounts
    const generateVideoAndAudio = async () => {
      if (!prompt) {
        console.log("No prompt provided, skipping API call");
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch("http://localhost:8000/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            script: prompt,
            num_scenes: 5,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log("Generated video and audio data:", data);
        setGeneratedData(data);
      } catch (error) {
        console.error("Error generating video and audio:", error);
      } finally {
        setIsLoading(false);
      }
    };

    generateVideoAndAudio();
  }, [prompt]);

  return (
    <div className="video-page">
      <div className="video-page-bg" aria-hidden="true" />
      <nav className="video-nav">
        <Link to="/" className="video-nav-create">
          Create another video
        </Link>
        <Link to="/edit" className="video-nav-edit">
          Edit
        </Link>
      </nav>

      <main className="video-main">
        {isLoading && (
          <div className="loading-indicator">
            <p>Generating scenes and audio...</p>
          </div>
        )}
        {!isLoading && (
          <div className="video-player-wrapper">
          <video
            className="video-player"
            src={videoSrc}
            controls
            autoPlay
            playsInline
          />
        </div>
        )}
        {prompt && <p className="video-prompt">Prompt: {prompt}</p>}
      </main>
    </div>
  );
}