import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Home.css";

const examplePrompts = [
  "A cat walking through a forest",
  "Waves crashing on a sunset beach",
  "A spaceship flying through an asteroid field",
  "Rain falling on a city street at night",
];

export default function HomePage() {
  const [inputValue, setInputValue] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const navigate = useNavigate();
  const trimmed = inputValue.trim();

  const goToVideoPage = async () => {
    if (trimmed && !isGenerating) {
      setIsGenerating(true);
      navigate("/video", {
        state: {
          prompt: trimmed,
          isGenerating: true,
        },
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      goToVideoPage();
    }
  };

  const handleExampleClick = (prompt: string) => {
    setInputValue(prompt);
  };

  return (
    <div className="home-page-root">
      <div className="home-page-bg" aria-hidden="true" />
      <div className="animated-grid" aria-hidden="true" />

      <main className="home-content">
        <div className="hero-section">
          <div className="logo-badge">
            <span className="live-dot" />
            <span>LIVE</span>
          </div>
          <h1 className="hero-title">
            Real-Time <span className="gradient-text">Video Generation</span>
          </h1>
          <p className="hero-subtitle">
            Stream AI-generated video at ~15 FPS. Change prompts mid-generation
            and watch scenes morph instantly.
          </p>
        </div>

        <div className="input-section">
          <div className="input-wrapper">
            <div className="input-icon">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Describe your video scene..."
              className="chat-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isGenerating}
            />
            <button
              onClick={goToVideoPage}
              className="chat-submit"
              disabled={!trimmed || isGenerating}
            >
              {isGenerating ? (
                <>
                  <span className="spinner" />
                  Generating
                </>
              ) : (
                <>
                  Generate
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </div>

          <div className="example-prompts">
            <span className="example-label">Try:</span>
            {examplePrompts.map((prompt, index) => (
              <button
                key={index}
                className="example-chip"
                onClick={() => handleExampleClick(prompt)}
                disabled={isGenerating}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div className="features-section">
          <div className="feature-card">
            <div className="feature-icon">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h3>Instant Streaming</h3>
            <p>See frames as they generate at ~15 FPS. No waiting for minutes.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <h3>Live Editing</h3>
            <p>Change prompts mid-generation. Scenes morph seamlessly in real-time.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </div>
            <h3>No Regeneration</h3>
            <p>Edit without starting over. Iterate as easily as editing text.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
