import { useRef, useEffect, useState, useCallback } from 'react'
import MessageBubble from './MessageBubble'

const styles = {
  container: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    WebkitOverflowScrolling: 'touch',
  },
  toast: {
    position: 'fixed',
    bottom: 'calc(24px + var(--safe-bottom))',
    right: 16,
    background: 'var(--primary)',
    color: 'white',
    borderRadius: 8,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 500,
    zIndex: 9999,
    transition: 'opacity 0.3s ease',
  },
}

export default function MessageList({ messages }) {
  const endRef = useRef(null)
  const containerRef = useRef(null)
  const [toastVisible, setToastVisible] = useState(false)
  const toastTimer = useRef(null)

  const handleCopy = useCallback(() => {
    setToastVisible(true)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastVisible(false), 1500)
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div style={styles.container} ref={containerRef}>
      {messages.map((msg, i) => (
        <MessageBubble key={msg.id || i} message={msg} onCopy={handleCopy} />
      ))}
      <div ref={endRef} />
      {toastVisible && (
        <div style={{ ...styles.toast, opacity: 1 }}>Copied!</div>
      )}
    </div>
  )
}
