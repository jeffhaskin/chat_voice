import { useRef, useEffect } from 'react'
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
}

export default function MessageList({ messages }) {
  const endRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div style={styles.container} ref={containerRef}>
      {messages.map((msg, i) => (
        <MessageBubble key={msg.id || i} message={msg} />
      ))}
      <div ref={endRef} />
    </div>
  )
}
