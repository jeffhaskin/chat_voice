import logging
import asyncio
import numpy as np
from typing import AsyncIterator

logger = logging.getLogger(__name__)

_model = None

def init_tts():
    global _model
    from mlx_audio.tts.utils import load_model
    _model = load_model("prince-canuma/Kokoro-82M")
    logger.info("TTS initialized with Kokoro MLX")

def cleanup_tts():
    global _model
    _model = None
    logger.info("TTS cleaned up")

async def generate_speech_chunks(text: str, provider: str = "kokoro") -> AsyncIterator[bytes]:
    """Generate speech audio chunks from text.

    Yields 24kHz mono int16 PCM bytes.
    Kokoro runs in thread pool since it's blocking.
    Edge TTS is async natively.
    """
    logger.info(f"Generating speech ({provider}) for: {text[:100]}...")

    if provider == "edge":
        async for chunk in _generate_edge_chunks(text):
            yield chunk
    else:
        async for chunk in _generate_kokoro_chunks(text):
            yield chunk


async def _generate_kokoro_chunks(text: str) -> AsyncIterator[bytes]:
    """Generate speech using local Kokoro MLX model."""
    def _generate():
        chunks = []
        for result in _model.generate(text=text, voice="af_heart", speed=1.0, lang_code="a"):
            audio = np.array(result.audio)
            # Convert float32 [-1, 1] to int16 PCM
            audio_int16 = (audio * 32767).astype(np.int16)
            chunks.append(audio_int16.tobytes())
        return chunks

    chunks = await asyncio.get_event_loop().run_in_executor(None, _generate)
    logger.info(f"Generated {len(chunks)} Kokoro audio chunks")
    for chunk in chunks:
        yield chunk


async def _generate_edge_chunks(text: str) -> AsyncIterator[bytes]:
    """Generate speech using Microsoft Edge TTS."""
    import edge_tts

    communicate = edge_tts.Communicate(text, "en-US-AriaNeural")

    # Collect all MP3 data first
    mp3_data = bytearray()
    async for chunk_msg in communicate.stream():
        if chunk_msg["type"] == "audio":
            mp3_data.extend(chunk_msg["data"])

    if not mp3_data:
        logger.warning("Edge TTS returned no audio data")
        return

    # Decode MP3 to PCM in thread pool (blocking)
    def _decode_mp3(data: bytes) -> bytes:
        import subprocess
        # Use ffmpeg to convert MP3 to 24kHz mono int16 PCM
        proc = subprocess.run(
            [
                "ffmpeg", "-i", "pipe:0",
                "-f", "s16le", "-acodec", "pcm_s16le",
                "-ar", "24000", "-ac", "1",
                "pipe:1",
            ],
            input=data,
            capture_output=True,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {proc.stderr.decode()}")
        return proc.stdout

    pcm_data = await asyncio.get_event_loop().run_in_executor(None, _decode_mp3, bytes(mp3_data))
    # Yield as a single chunk (matches Kokoro pattern of generating all then yielding)
    logger.info(f"Generated Edge TTS audio: {len(pcm_data)} bytes")
    yield pcm_data
