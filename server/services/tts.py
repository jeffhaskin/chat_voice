import logging
import asyncio
import numpy as np
from typing import AsyncIterator

logger = logging.getLogger(__name__)

_model = None

def init_tts():
    global _model
    from mlx_audio.tts.utils import load_model
    _model = load_model("mlx-community/Kokoro-82M-4bit")
    logger.info("TTS initialized with Kokoro 4-bit MLX")

def cleanup_tts():
    global _model
    _model = None
    logger.info("TTS cleaned up")

async def generate_speech_chunks(text: str) -> AsyncIterator[bytes]:
    """Generate speech audio chunks from text.

    Yields 24kHz mono int16 PCM bytes.
    Runs TTS in thread pool since it's blocking.
    """
    logger.info(f"Generating speech for: {text[:100]}...")

    def _generate():
        chunks = []
        for result in _model.generate(text=text, voice="af_heart", speed=1.0, lang_code="a"):
            audio = np.array(result.audio)
            # Convert float32 [-1, 1] to int16 PCM
            audio_int16 = (audio * 32767).astype(np.int16)
            chunks.append(audio_int16.tobytes())
        return chunks

    chunks = await asyncio.get_event_loop().run_in_executor(None, _generate)
    logger.info(f"Generated {len(chunks)} audio chunks")
    for chunk in chunks:
        yield chunk
