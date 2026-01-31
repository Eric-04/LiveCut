import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./Home.css";

export default function HomePage() {
    const [inputValue, setInputValue] = useState("");
    const navigate = useNavigate();
    const trimmed = inputValue.trim();
  
    const goToVideoPage = () => {
      if (trimmed) {
        navigate("/video", { state: { prompt: trimmed } });
      }
    };
  
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        goToVideoPage();
      }
    };
  
    return (
      <div className="home-page-root">
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
            />
            <Link
              to={trimmed ? "/video" : "#"}
              state={trimmed ? { prompt: trimmed } : undefined}
              className="chat-submit"
              onClick={(e) => !trimmed && e.preventDefault()}
            >
              Go
            </Link>
          </div>
        </main>
      </div>
    );
  }