import { useState, useRef, useCallback, useEffect } from 'react'
import VoiceCircle from './VoiceCircle'

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    width: '100%',
    position: 'relative',
    padding: 20,
  },
  backBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 44,
    height: 44,
    fontSize: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleArea: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  textArea: {
    width: '100%',
    maxWidth: 400,
    textAlign: 'center',
    paddingBottom: 40,
    minHeight: 100,
  },
  transcription: {
    fontSize: 16,
    color: 'var(--text)',
    marginBottom: 12,
  },
  response: {
    fontSize: 15,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
  },
  stateLabel: {
    fontSize: 13,
    color: 'var(--text-muted)',
    marginTop: 16,
  },
}

export default function VoiceView({
  onBack,
  sendAudio,
  sendAudioComplete,
  sendInterrupt,
  conversationId,
  messages,
}) {
  const [state, setState] = useState('idle') // idle, recording, processing, speaking
  const [amplitude, setAmplitude] = useState(0)

  const audioContextRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const workletNodeRef = useRef(null)
  const scriptNodeRef = useRef(null)
  const analyserRef = useRef(null)
  const animFrameRef = useRef(null)

  // Playback refs
  const playbackCtxRef = useRef(null)
  const playbackQueue = useRef([])
  const playbackTime = useRef(0)
  const playbackAnalyserRef = useRef(null)

  // Get last transcription and response from messages
  const lastUserVoice = [...messages].reverse().find(m => m.role === 'user' && m.source === 'voice')
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')

  const stopRecording = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect()
      workletNodeRef.current = null
    }
    if (scriptNodeRef.current) {
      scriptNodeRef.current.disconnect()
      scriptNodeRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop())
      mediaStreamRef.current = null
    }
    if (analyserRef.current) {
      analyserRef.current = null
    }
    cancelAnimationFrame(animFrameRef.current)
  }, [])

  const monitorAmplitude = useCallback((analyser) => {
    const data = new Uint8Array(analyser.fftSize)
    const tick = () => {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / data.length)
      setAmplitude(Math.min(1, rms * 3))
      animFrameRef.current = requestAnimationFrame(tick)
    }
    tick()
  }, [])

  const startRecording = useCallback(async () => {
    try {
      // Create a fresh AudioContext each time (handles device changes on Safari)
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
      }
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      })
      const ctx = audioContextRef.current
      if (ctx.state === 'suspended') await ctx.resume()

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      mediaStreamRef.current = stream

      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      // Use ScriptProcessorNode for broad compatibility
      const scriptNode = ctx.createScriptProcessor(4096, 1, 1)
      scriptNodeRef.current = scriptNode

      scriptNode.onaudioprocess = (e) => {
        const float32 = e.inputBuffer.getChannelData(0)
        const int16 = new Int16Array(float32.length)
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]))
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }
        sendAudio(int16.buffer)
      }

      source.connect(scriptNode)
      scriptNode.connect(ctx.destination)

      monitorAmplitude(analyser)
      setState('recording')
    } catch (err) {
      console.error('Failed to start recording:', err)
      setState('idle')
    }
  }, [sendAudio, monitorAmplitude])

  const handleTap = useCallback(() => {
    switch (state) {
      case 'idle':
        startRecording()
        break

      case 'recording':
        stopRecording()
        setAmplitude(0)
        // Create playback AudioContext on this tap gesture (Safari iOS requirement)
        if (playbackCtxRef.current) {
          playbackCtxRef.current.close().catch(() => {})
        }
        playbackCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 24000,
        })
        const playAnalyser = playbackCtxRef.current.createAnalyser()
        playAnalyser.fftSize = 256
        playAnalyser.connect(playbackCtxRef.current.destination)
        playbackAnalyserRef.current = playAnalyser
        setState('processing')
        sendAudioComplete(conversationId)
        break

      case 'processing':
        // do nothing while waiting
        break

      case 'speaking':
        // Interrupt playback and start recording
        sendInterrupt()
        stopPlayback({ closeContext: true })
        if (window.speechSynthesis) window.speechSynthesis.cancel()
        startRecording()
        break
    }
  }, [state, startRecording, stopRecording, sendAudioComplete, sendInterrupt, conversationId])

  // Audio playback
  const stopPlayback = useCallback(({ closeContext = false } = {}) => {
    if (closeContext && playbackCtxRef.current) {
      playbackCtxRef.current.close().catch(() => {})
      playbackCtxRef.current = null
      playbackAnalyserRef.current = null
    }
    playbackQueue.current = []
    playbackTime.current = 0
    cancelAnimationFrame(animFrameRef.current)
    setAmplitude(0)
  }, [])

  const playAudioChunk = useCallback((arrayBuffer) => {
    if (!playbackCtxRef.current) return

    const ctx = playbackCtxRef.current
    if (ctx.state === 'suspended') ctx.resume()

    const int16 = new Int16Array(arrayBuffer)
    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 0x8000
    }

    const buffer = ctx.createBuffer(1, float32.length, 24000)
    buffer.getChannelData(0).set(float32)

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(playbackAnalyserRef.current)

    const now = ctx.currentTime
    const startTime = Math.max(now, playbackTime.current)
    source.start(startTime)
    playbackTime.current = startTime + buffer.duration

    source.onended = () => {
      // Check if this was the last chunk
      if (ctx.currentTime >= playbackTime.current - 0.05) {
        setState('idle')
        setAmplitude(0)
        cancelAnimationFrame(animFrameRef.current)
      }
    }

    if (state !== 'speaking') {
      setState('speaking')
      monitorAmplitude(playbackAnalyserRef.current)
    }
  }, [state, monitorAmplitude])

  // Listen for audio_data events from parent
  useEffect(() => {
    // The parent App passes audio_data via onWsMessage, but we need a different approach.
    // We'll watch for audio binary frames. The parent should pass them down.
  }, [])

  // We need to intercept audio messages. Let's expose a ref-based approach.
  // Actually, the parent passes onWsMessage which updates messages state.
  // For audio playback, we need the raw binary. Let's handle this via a custom event.

  useEffect(() => {
    const handler = (e) => {
      if (state === 'processing' || state === 'speaking') {
        playAudioChunk(e.detail)
      }
    }
    window.addEventListener('voice-audio-data', handler)
    return () => window.removeEventListener('voice-audio-data', handler)
  }, [state, playAudioChunk])

  // Transition from speaking/processing to idle when server sends audio_complete
  useEffect(() => {
    const handler = () => {
      stopPlayback()
      setState('idle')
    }
    window.addEventListener('voice-audio-complete', handler)
    return () => window.removeEventListener('voice-audio-complete', handler)
  }, [stopPlayback])

  // Browser TTS via speechSynthesis
  useEffect(() => {
    const handler = (e) => {
      const text = e.detail
      if (!window.speechSynthesis || !text) return
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.onstart = () => setState('speaking')
      utterance.onend = () => {
        setState('idle')
        setAmplitude(0)
      }
      utterance.onerror = () => {
        setState('idle')
        setAmplitude(0)
      }
      setState('speaking')
      window.speechSynthesis.speak(utterance)
    }
    window.addEventListener('voice-browser-tts', handler)
    return () => window.removeEventListener('voice-browser-tts', handler)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording()
      stopPlayback()
      if (window.speechSynthesis) window.speechSynthesis.cancel()
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [stopRecording, stopPlayback])

  const stateLabels = {
    idle: 'Tap to speak',
    recording: 'Listening... tap to send',
    processing: 'Thinking...',
    speaking: 'Speaking... tap to interrupt',
  }

  return (
    <div style={styles.container}>
      <button style={styles.backBtn} onClick={onBack} aria-label="Back to chat">
        &#8592;
      </button>

      <div style={styles.circleArea} onClick={handleTap}>
        <VoiceCircle state={state} amplitude={amplitude} />
      </div>

      <div style={styles.textArea}>
        <div style={styles.stateLabel}>{stateLabels[state]}</div>
      </div>
    </div>
  )
}

// Export a helper to dispatch audio data events from App
export function dispatchAudioData(arrayBuffer) {
  window.dispatchEvent(new CustomEvent('voice-audio-data', { detail: arrayBuffer }))
}
