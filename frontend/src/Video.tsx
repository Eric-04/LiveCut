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
  const [isGenerationComplete, setIsGenerationComplete] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlaybackFrame, setCurrentPlaybackFrame] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const framesRef = useRef<string[]>([]); // Store frame URLs
  const audioElementsRef = useRef<HTMLAudioElement[]>([]);
  const audioUrlsRef = useRef<string[]>([]); // Store audio URLs for Edit page
  const currentSceneRef = useRef<number>(0);
  const frameQueueRef = useRef<Map<number, string>>(new Map());
  const nextFrameToDrawRef = useRef<number>(0);
  const isDrawingRef = useRef<boolean>(false);
  const playbackIntervalRef = useRef<number | null>(null);
  const canvasSizeRef = useRef<{width: number, height: number} | null>(null);

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
        audioUrlsRef.current = data.scenes.map(scene => scene.audio_url);

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
    setIsGenerationComplete(false);
    setIsPlaying(false);
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

      // Reset frame queue for new generation
      frameQueueRef.current.clear();
      nextFrameToDrawRef.current = 0;
      currentSceneRef.current = 0;
      // No audio playback during generation - will play after all frames are ready
    };

    // Function to process queued frames in order (during generation - no audio)
    const processFrameQueue = () => {
      if (isDrawingRef.current) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const nextFrame = nextFrameToDrawRef.current;
      const imageUrl = frameQueueRef.current.get(nextFrame);

      if (!imageUrl) return; // Frame not ready yet

      isDrawingRef.current = true;

      const img = new Image();

      img.onload = () => {
        // Set canvas size on first frame
        if (nextFrame === 0) {
          canvas.width = img.width;
          canvas.height = img.height;
          canvasSizeRef.current = { width: img.width, height: img.height };
          console.log(`Canvas initialized: ${img.width}x${img.height}`);
        }

        // Draw image to canvas
        ctx.drawImage(img, 0, 0);

        // Store frame URL for later playback (don't revoke yet)
        framesRef.current[nextFrame] = imageUrl;

        // Update state less frequently (every 10 frames) to reduce re-renders
        if (nextFrame % 10 === 0 || nextFrame === 0) {
          setFrameCount(nextFrame + 1);
          setWsStatus(`Generating frame ${nextFrame + 1}...`);
        }

        // Clean up queue entry and move to next frame
        frameQueueRef.current.delete(nextFrame);
        nextFrameToDrawRef.current = nextFrame + 1;
        isDrawingRef.current = false;

        // Process next frame if available
        requestAnimationFrame(processFrameQueue);
      };

      img.onerror = (error) => {
        console.error('Error loading JPEG image for frame', nextFrame, error);
        URL.revokeObjectURL(imageUrl);
        frameQueueRef.current.delete(nextFrame);
        nextFrameToDrawRef.current = nextFrame + 1;
        isDrawingRef.current = false;
        requestAnimationFrame(processFrameQueue);
      };

      img.src = imageUrl;
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'frame') {
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
          // Convert to data URL so it persists across page navigation
          const reader = new FileReader();
          reader.onloadend = () => {
            const imageUrl = reader.result as string;
            frameQueueRef.current.set(data.frame_index, imageUrl);
            processFrameQueue();
          };
          reader.readAsDataURL(blob);

          // // Add to queue and process
          // frameQueueRef.current.set(data.frame_index, imageUrl);
          // processFrameQueue();
        }

      } else if (data.type === 'done') {
        console.log(`✓ Generation complete! Total frames: ${data.total_frames}`);
        setFrameCount(data.total_frames);
        setTotalFrames(data.total_frames);
        setIsGenerationComplete(true);
        setWsStatus(`✓ Complete! Generated ${data.total_frames} frames. Click Play to watch with audio.`);
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
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
      // Stop and cleanup all audio elements
      audioElementsRef.current.forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      // Cleanup frame URLs
      framesRef.current.forEach(url => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, []);

  // Play the full video with audio after generation is complete
  const playVideo = () => {
    if (!isGenerationComplete || framesRef.current.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset to beginning
    setCurrentPlaybackFrame(0);
    setIsPlaying(true);
    currentSceneRef.current = 0;
    setCurrentScene(0);

    // Reset canvas size if needed
    if (canvasSizeRef.current) {
      canvas.width = canvasSizeRef.current.width;
      canvas.height = canvasSizeRef.current.height;
    }

    // Stop any existing audio and reset
    audioElementsRef.current.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });

    // Start first audio
    if (audioElementsRef.current.length > 0) {
      audioElementsRef.current[0].play().catch(err => {
        console.error("Error playing first audio:", err);
      });
    }

    let frameIndex = 0;
    const fps = 24; // Assuming 24 FPS
    const frameInterval = 1000 / fps;

    // Clear any existing interval
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
    }

    const playFrame = () => {
      if (frameIndex >= framesRef.current.length) {
        // Playback complete
        setIsPlaying(false);
        setWsStatus("✓ Playback complete!");
        if (playbackIntervalRef.current) {
          clearInterval(playbackIntervalRef.current);
          playbackIntervalRef.current = null;
        }
        // Stop all audio
        audioElementsRef.current.forEach(audio => {
          audio.pause();
        });
        return;
      }

      const imageUrl = framesRef.current[frameIndex];
      if (!imageUrl) {
        frameIndex++;
        return;
      }

      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        setCurrentPlaybackFrame(frameIndex);

        // Determine which scene we're in based on frame index
        let sceneIndex = 0;
        if (frameIndex >= 384) sceneIndex = 4;
        else if (frameIndex >= 288) sceneIndex = 3;
        else if (frameIndex >= 192) sceneIndex = 2;
        else if (frameIndex >= 96) sceneIndex = 1;

        // If we've switched to a new scene, switch audio
        if (sceneIndex !== currentSceneRef.current) {
          console.log(`Playback scene change: ${currentSceneRef.current} -> ${sceneIndex} at frame ${frameIndex}`);

          // Stop all audio
          audioElementsRef.current.forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
          });

          // Play new scene's audio
          if (audioElementsRef.current[sceneIndex]) {
            audioElementsRef.current[sceneIndex].play().catch(err => {
              console.error(`Error playing audio for scene ${sceneIndex + 1}:`, err);
            });
          }

          currentSceneRef.current = sceneIndex;
          setCurrentScene(sceneIndex);
        }
      };
      img.src = imageUrl;
      frameIndex++;
    };

    // Start playback loop
    playbackIntervalRef.current = window.setInterval(playFrame, frameInterval);
    playFrame(); // Play first frame immediately
  };

  // Stop playback
  const stopVideo = () => {
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }
    setIsPlaying(false);
    // Stop all audio
    audioElementsRef.current.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
    setWsStatus("Playback stopped. Click Play to watch again.");
  };

  return (
    <div className="video-page">
      <div className="video-page-bg" aria-hidden="true" />
      <nav className="video-nav">
        <Link to="/" className="video-nav-create">
          Create another video
        </Link>
        <Link
          to="/edit"
          state={{
            frames: framesRef.current,
            audioUrls: audioUrlsRef.current,
            canvasSize: canvasSizeRef.current,
            totalFrames: totalFrames,
            scenes: generatedData?.scenes || []
          }}
          className="video-nav-edit"
        >
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
            {/* Frame counter overlay */}
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
                {isPlaying
                  ? `Playing: ${currentPlaybackFrame + 1} / ${totalFrames}`
                  : `Frame: ${frameCount}${totalFrames > 0 ? ` / ${totalFrames}` : ''}`
                }
              </div>
            )}
            {/* Generation overlay */}
            {!isGenerationComplete && frameCount > 0 && (
              <div style={{
                position: 'absolute',
                top: '10px',
                left: '10px',
                background: 'rgba(255,165,0,0.9)',
                color: 'white',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
                ⏳ Generating...
              </div>
            )}
          </div>
        )}

        {/* Playback controls - shown after generation complete */}
        {isGenerationComplete && (
          <div style={{
            marginTop: '15px',
            display: 'flex',
            gap: '10px',
            justifyContent: 'center'
          }}>
            {!isPlaying ? (
              <button
                onClick={playVideo}
                style={{
                  padding: '12px 30px',
                  fontSize: '16px',
                  background: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                ▶ Play Video with Audio
              </button>
            ) : (
              <button
                onClick={stopVideo}
                style={{
                  padding: '12px 30px',
                  fontSize: '16px',
                  background: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                ⏹ Stop
              </button>
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