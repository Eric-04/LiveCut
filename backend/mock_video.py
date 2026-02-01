import cv2
import numpy as np
import io
import tempfile
import os
from moviepy import VideoFileClip, AudioFileClip, CompositeAudioClip, concatenate_videoclips
import asyncio

AUDIO_DIR = "generated_audio"
os.makedirs(AUDIO_DIR, exist_ok=True)

# Serve video files
VIDEO_DIR = "generated_videos"
os.makedirs(VIDEO_DIR, exist_ok=True)

def generate_blue_video():
    width, height = 1920, 1080
    fps = 30
    duration = 6
    num_frames = fps * duration

    # Neon blue: #00ffe7 → BGR
    blue_color = (231, 255, 0)

    # Use temp file (OpenCV VideoWriter requires a path)
    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    tmp_path = tmp.name
    tmp.close()

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(tmp_path, fourcc, fps, (width, height))

    for _ in range(num_frames):
        frame = np.full((height, width, 3), blue_color, dtype=np.uint8)
        writer.write(frame)

    writer.release()

    video_file = open(tmp_path, "rb")

    return video_file

async def combine_video_and_audio(scene_index: int, audio_url: str, video_file=None) -> str:
    """
    Generate a blue video, combine it with the audio file using moviepy, and return the video URL.
    
    Args:
        scene_index: Index of the scene (for unique filename)
        audio_url: URL path to the audio file (e.g., "/audio/scene_0.mp3")
        video_file: Optional pre-generated video file object from generate_blue_video()
    
    Returns:
        URL path to the combined video file
    """
    try:
        # Generate the blue video if not provided
        if video_file is None:
            video_file = generate_blue_video()
        video_path = video_file.name
        
        # Extract the actual audio file path from the URL
        # audio_url is like "/audio/scene_0.mp3", we need "generated_audio/scene_0.mp3"
        audio_filename = audio_url.split("/")[-1]
        audio_path = os.path.abspath(os.path.join(AUDIO_DIR, audio_filename))
        
        # Output path for the combined video
        output_filename = f"scene_{scene_index}.mp4"
        output_path = os.path.abspath(os.path.join(VIDEO_DIR, output_filename))
        
        # Use moviepy to combine video and audio (run in thread pool since moviepy is blocking)
        await asyncio.to_thread(_combine_with_moviepy, video_path, audio_path, output_path)
        
        # Return the URL path
        return output_path
        
    finally:
        # Clean up temporary video file
        if video_file:
            video_file.close()
            if os.path.exists(video_path):
                os.unlink(video_path)


def _combine_with_moviepy(video_path: str, audio_path: str, output_path: str):
    """
    Helper function to combine video and audio using moviepy.
    Similar to your combine_video_audio method.
    """
    video = None
    audio = None
    combined = None
    
    try:
        video = VideoFileClip(video_path)
        audio = AudioFileClip(audio_path)
        
        # Extend video if audio is longer
        if audio.duration > video.duration:
            freeze_frame = (
                video.to_ImageClip(duration=audio.duration - video.duration)
                    .set_fps(video.fps)
            )
            video = concatenate_videoclips([video, freeze_frame])
        
        # Set audio to video
        audio_clip = CompositeAudioClip([audio])
        combined = video.with_audio(audio_clip)
        
        # Write the output file
        combined.write_videofile(output_path, codec='libx264', audio_codec='aac', logger=None)
        
    except Exception as e:
        raise RuntimeError(f"moviepy failed: {str(e)}")
    
    finally:
        # Clean up
        if combined:
            combined.close()
        if audio:
            audio.close()
        if video:
            video.close()