import logging
import tempfile
import os
import asyncio
import wave

logger = logging.getLogger(__name__)

_model_path = None

def init_stt(model_path: str = "/Users/jeff/mlx_models/distil-large-v3"):
    global _model_path
    _model_path = model_path
    logger.info(f"STT initialized with model path: {model_path}")

def cleanup_stt():
    global _model_path
    _model_path = None
    logger.info("STT cleaned up")

async def transcribe_audio(audio_data: bytes) -> str:
    """Transcribe raw 16-bit PCM 16kHz mono audio bytes to text.

    Writes audio to a temp WAV file, runs lightning-whisper-mlx, returns text.
    """
    # Write PCM data as WAV to temp file
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp_path = f.name
            with wave.open(f, 'wb') as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)  # 16-bit = 2 bytes
                wav.setframerate(16000)
                wav.writeframes(audio_data)

        logger.info(f"Transcribing {len(audio_data)} bytes of audio...")

        def _transcribe():
            from lightning_whisper_mlx import LightningWhisperMLX
            whisper = LightningWhisperMLX(model=_model_path, batch_size=12, quant=None)
            result = whisper.transcribe(tmp_path)
            return result["text"].strip()

        text = await asyncio.get_event_loop().run_in_executor(None, _transcribe)
        logger.info(f"Transcription result: {text[:100]}...")
        return text
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
