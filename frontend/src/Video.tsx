import { Link, useLocation } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import "./Video.css";

interface SceneData {
  video_prompt: string;
  voiceover: string;
  audio_url: string;
}

interface GenerateResponse {
  scenes: SceneData[];
}

export default function Video() {
  const { state } = useLocation();
  const prompt = state?.prompt;
  
  const [isLoading, setIsLoading] = useState(false);
  const [generatedData, setGeneratedData] = useState<GenerateResponse | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [wsStatus, setWsStatus] = useState<string>("");
  const [currentScene, setCurrentScene] = useState(0);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const framesRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioElementsRef = useRef<HTMLAudioElement[]>([]);

  // Auto-start: Call /generate endpoint and then immediately connect to WebSocket
  useEffect(() => {
    if (!prompt) {
      console.log("No prompt provided, skipping API call");
      return;
    }

    const generateAndStream = async () => {
      setIsLoading(true);
      
      try {
        // Step 1: Call the /generate endpoint to get scene data
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

        const data: GenerateResponse = await response.json();
        console.log("Generated video and audio data:", data);
        setGeneratedData(data);
        
        // Preload all audio files
        const audioElements = data.scenes.map((scene, idx) => {
          const audio = new Audio(`http://localhost:8000${scene.audio_url}`);
          audio.preload = 'auto';
          console.log(`Preloading audio ${idx + 1}:`, scene.audio_url);
          return audio;
        });
        audioElementsRef.current = audioElements;
        
        setIsLoading(false);

        // Step 2: Immediately connect to WebSocket to get frames
        startWebSocketGeneration(data);

      } catch (error) {
        console.error("Error generating video and audio:", error);
        setIsLoading(false);
      }
    };

    generateAndStream();
  }, [prompt]);

  // Connect to WebSocket and stream frames
  const startWebSocketGeneration = (sceneData: GenerateResponse) => {
    setFrameCount(0);
    setTotalFrames(0);
    framesRef.current = [];

    const wsUrl = "ws://localhost:8010/ws/generate";
    console.log("Connecting to WebSocket:", wsUrl);
    setWsStatus("Connecting to video generation...");

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setWsStatus("Generating frames...");

      // Extract prompts from the generated scene data
      const prompts = sceneData.scenes.map(scene => scene.video_prompt);
      console.log("Sending prompts to WebSocket:", prompts);

      // Send request to WebSocket server
      ws.send(JSON.stringify({
        prompts: prompts,
        blocks_per_chunk: 5,
        switch_frame_indices: [96, 192, 288, 384],
        reprompts: null
      }));
      
      // Start playing first audio when WebSocket is ready
      if (audioElementsRef.current.length > 0) {
        setTimeout(() => {
          // Make sure all audio is stopped first
          audioElementsRef.current.forEach((audio, idx) => {
            audio.pause();
            audio.currentTime = 0;
          });
          
          // Play only the first audio
          audioElementsRef.current[0].play().catch(err => {
            console.error("Error playing first audio:", err);
          });
          console.log("Started playing audio for scene 1");
          setCurrentScene(0);
        }, 100); // Small delay to ensure everything is ready
      }
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log("WebSocket message type:", data.type, "frame_index:", data.frame_index);

      if (data.type === 'frame') {
        const canvas = canvasRef.current;
        if (!canvas) {
          console.error("Canvas not found!");
          return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          console.error("Cannot get canvas context!");
          return;
        }

        // Handle JPEG format (used by mock_websocket.py)
        if (data.format === 'jpeg') {
          // Decode base64 to binary
          const binaryString = atob(data.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          // Create blob from JPEG data
          const blob = new Blob([bytes], { type: 'image/jpeg' });
          const imageUrl = URL.createObjectURL(blob);
          
          // Create image element to load the JPEG
          const img = new Image();
          
          img.onload = () => {
            // Set canvas size on first frame
            if (data.frame_index === 0) {
              canvas.width = img.width;
              canvas.height = img.height;
              console.log(`Canvas initialized: ${img.width}x${img.height}`);
            }
            
            // Draw image to canvas
            ctx.drawImage(img, 0, 0);
            
            // Store frame as blob
            canvas.toBlob((frameBlob) => {
              if (frameBlob) {
                framesRef.current.push(frameBlob);
              }
            }, 'image/png');
            
            setFrameCount(data.frame_index + 1);
            setWsStatus(`Generating frame ${data.frame_index + 1}...`);
            
            // Determine which scene we're in based on frame index
            // switch_frame_indices: [96, 192, 288, 384] for 5 scenes over 480 frames
            let sceneIndex = 0;
            if (data.frame_index >= 384) sceneIndex = 4;
            else if (data.frame_index >= 288) sceneIndex = 3;
            else if (data.frame_index >= 192) sceneIndex = 2;
            else if (data.frame_index >= 96) sceneIndex = 1;
            
            // If we've switched to a new scene, switch audio
            if (sceneIndex !== currentScene) {
              console.log(`Scene change detected: ${currentScene} -> ${sceneIndex} at frame ${data.frame_index}`);
              
              // Stop ALL audio first to ensure only one plays
              audioElementsRef.current.forEach((audio, idx) => {
                audio.pause();
                audio.currentTime = 0;
              });
              
              // Play new scene's audio
              if (audioElementsRef.current[sceneIndex]) {
                audioElementsRef.current[sceneIndex].play().catch(err => {
                  console.error(`Error playing audio for scene ${sceneIndex + 1}:`, err);
                });
                console.log(`Now playing audio for scene ${sceneIndex + 1}`);
              }
              
              setCurrentScene(sceneIndex);
            }
            
            // Clean up
            URL.revokeObjectURL(imageUrl);
          };
          
          img.onerror = (error) => {
            console.error('Error loading JPEG image:', error);
          };
          
          img.src = imageUrl;
        }

      } else if (data.type === 'done') {
        console.log(`✓ Generation complete! Total frames: ${data.total_frames}`);
        setWsStatus(`✓ Complete! Generated ${data.total_frames} frames`);
        setTotalFrames(data.total_frames);
        ws.close();

      } else if (data.type === 'error') {
        console.error("WebSocket error:", data.message);
        setWsStatus(`✗ Error: ${data.message}`);
        ws.close();
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setWsStatus("WebSocket error occurred");
    };

    ws.onclose = () => {
      console.log("WebSocket closed");
      if (frameCount === 0) {
        setWsStatus("Connection closed");
      }
    };
  };

  // Cleanup WebSocket and audio on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      // Stop and cleanup all audio elements
      audioElementsRef.current.forEach(audio => {
        audio.pause();
        audio.src = '';
      });
    };
  }, []);

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
            <p>Preparing scenes and audio...</p>
          </div>
        )}

        {/* Video canvas container - shown as soon as WebSocket connects */}
        {(wsStatus || frameCount > 0) && (
          <div className="video-container" style={{ 
            marginTop: '30px',
            background: '#000',
            borderRadius: '12px',
            overflow: 'hidden',
            position: 'relative'
          }}>
            <canvas 
              ref={canvasRef} 
              id="canvas"
              style={{
                width: '100%',
                height: 'auto',
                display: 'block'
              }}
            />
            {frameCount > 0 && (
              <div className="frame-info" style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: 'rgba(0,0,0,0.7)',
                color: 'white',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontFamily: 'monospace'
              }}>
                Frame: {frameCount}{totalFrames > 0 ? ` / ${totalFrames}` : ''}
              </div>
            )}
          </div>
        )}

        {/* Status message below the video */}
        {wsStatus && (
          <p className="ws-status" style={{
            marginTop: '15px',
            padding: '12px',
            background: '#f0f0f0',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            {wsStatus}
          </p>
        )}
      </main>
    </div>
  );
}