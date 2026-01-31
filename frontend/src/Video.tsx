import { Link, useLocation } from "react-router-dom";

export default function Video() {
  const { state } = useLocation();
  const prompt = state?.prompt;

  return (
    <div className="video-page">
      <nav>
        <Link to="/">← Back</Link>
      </nav>
      <h2>Video Page</h2>
      {prompt && <p>Prompt: {prompt}</p>}
      <p>This is a placeholder for your generated video.</p>
    </div>
  );
}
