const BASE_SIZE = 200

const stateColors = {
  idle: 'var(--voice-idle)',
  recording: 'var(--voice-recording)',
  processing: 'var(--voice-processing)',
  speaking: 'var(--voice-speaking)',
}

export default function VoiceCircle({ state, amplitude = 0 }) {
  const scale = 0.8 + amplitude * 0.5
  const color = stateColors[state] || 'var(--voice-idle)'
  const isProcessing = state === 'processing'

  return (
    <div
      style={{
        width: BASE_SIZE,
        height: BASE_SIZE,
        borderRadius: '50%',
        background: color,
        transform: `scale(${scale})`,
        transition: 'transform 0.1s ease-out, background 0.3s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        animation: isProcessing ? 'pulse 2s ease-in-out infinite' : 'none',
        userSelect: 'none',
      }}
    >
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
