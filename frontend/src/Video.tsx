import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import "./Video.css";

interface Scene {
  scene_index: number;
  video_base64: string;
}

export default function Video() {
  const { state } = useLocation();
  const prompt = state?.prompt;
  const isGenerating = state?.isGenerating;
  
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [loading, setLoading] = useState(isGenerating);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isGenerating || !prompt) return;

    const generateVideo = async () => {
      try {
        const response = await fetch('http://localhost:8000/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            script: prompt,
            num_scenes: 2, // Hardcoded
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = ''; // Buffer to accumulate partial data

        if (!reader) {
          throw new Error('No response body');
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonString = line.slice(6).trim();
                if (!jsonString) continue;
                
                const data = JSON.parse(jsonString);
                
                console.log('Received data:', data);
                
                if (data.error) {
                  setError(data.error);
                  setLoading(false);
                  return;
                }
                
                if (data.done) {
                  setLoading(false);
                  return;
                }
                
                // Add scene to the list
                if (data.scene_index !== undefined && data.video_base64) {
                  console.log('Adding scene:', data.scene_index);
                  setScenes(prev => {
                    const newScenes = [...prev];
                    newScenes[data.scene_index] = {
                      scene_index: data.scene_index,
                      video_base64: data.video_base64,
                    };
                    // Save to localStorage for Edit page
                    localStorage.setItem('generatedScenes', JSON.stringify(newScenes));
                    return newScenes;
                  });
                }
              } catch (e) {
                console.error('Failed to parse SSE data:', line, e);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error generating video:', err);
        setError(err instanceof Error ? err.message : 'Failed to generate video');
        setLoading(false);
      }
    };

    generateVideo();
  }, [prompt, isGenerating]);

  // Convert base64 to blob URL for video player
  const getVideoSrc = (scene: Scene): string => {
    try {
      // Decode base64 to binary
      const binaryString = atob(scene.video_base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Create blob and URL
      const blob = new Blob([bytes], { type: 'video/mp4' });
      return URL.createObjectURL(blob);
    } catch (e) {
      console.error('Error creating video URL:', e);
      return '';
    }
  };

  const currentScene = scenes[currentSceneIndex];
  const videoSrc = currentScene ? getVideoSrc(currentScene) : state?.videoSrc || "/videos/video1.mp4";

  return (
    <div className="video-page">
      <div className="video-page-bg" aria-hidden="true" />
      <nav className="video-nav">
        <Link to="/" className="video-nav-create">
          Create another video
        </Link>
        <Link 
          to="/edit" 
          className="video-nav-edit"
          onClick={(e) => {
            if (scenes.length === 0) {
              e.preventDefault();
            }
          }}
        >
          Edit
        </Link>
      </nav>

      <main className="video-main">
        {loading && (
          <div className="loading-message">
            <p>Generating your video...</p>
            {scenes.length > 0 && <p>Scene {scenes.length} ready</p>}
          </div>
        )}
        
        {error && (
          <div className="error-message">
            <p>Error: {error}</p>
          </div>
        )}
        
        {!loading && scenes.length === 0 && !error && (
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
        
        {scenes.length > 0 && (
          <>
            <div className="video-player-wrapper">
              <video
                key={currentSceneIndex}
                className="video-player"
                src={videoSrc}
                controls
                autoPlay
                playsInline
              />
            </div>
            
            {scenes.length > 1 && (
              <div className="scene-navigation">
                <button 
                  onClick={() => setCurrentSceneIndex(prev => Math.max(0, prev - 1))}
                  disabled={currentSceneIndex === 0}
                >
                  Previous Scene
                </button>
                <span>Scene {currentSceneIndex + 1} of {scenes.length}</span>
                <button 
                  onClick={() => setCurrentSceneIndex(prev => Math.min(scenes.length - 1, prev + 1))}
                  disabled={currentSceneIndex === scenes.length - 1}
                >
                  Next Scene
                </button>
              </div>
            )}
            
          </>
        )}
      </main>
    </div>
  );
}