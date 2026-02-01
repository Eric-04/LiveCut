import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Home.css";

export default function HomePage() {
    const [inputValue, setInputValue] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const navigate = useNavigate();
    const trimmed = inputValue.trim();
  
    const goToVideoPage = async () => {
      if (trimmed && !isGenerating) {
        setIsGenerating(true);
        // Navigate to video page with the prompt and generating state
        navigate("/video", { 
          state: { 
            prompt: trimmed,
            isGenerating: true 
          } 
        });
      }
    };
  
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        goToVideoPage();
      }
    };
  
    return (
      <div className="home-page-root">
        <div className="home-page-bg" aria-hidden="true" />
        <main className="center">
          <h1>Create Any Video</h1>
  
          <div className="input-wrapper">
            <input
              type="text"
              placeholder="Ask anything"
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
              {isGenerating ? "Generating..." : "Go"}
            </button>
          </div>
        </main>
      </div>
    );
  }