import { useState, useRef, useCallback } from 'react'
import SoundwaveIcon from '../icons/SoundwaveIcon'
import SendIcon from '../icons/SendIcon'

const styles = {
  container: {
    display: 'flex',
    alignItems: 'flex-end',
    padding: '8px 12px',
    paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 8px))',
    gap: 8,
    borderTop: '1px solid var(--border)',
    background: 'var(--surface)',
    flexShrink: 0,
  },
  textarea: {
    flex: 1,
    resize: 'none',
    background: 'var(--input-bg)',
    borderRadius: 20,
    padding: '10px 16px',
    maxHeight: 120,
    lineHeight: 1.4,
    fontSize: 15,
    color: 'var(--text)',
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    flexShrink: 0,
  },
  sendBtn: {
    background: 'var(--accent)',
  },
  voiceBtn: {
    background: 'var(--input-bg)',
  },
  disabled: {
    opacity: 0.5,
    pointerEvents: 'none',
  },
}

export default function InputBar({ onSend, disabled, onVoiceToggle }) {
  const [text, setText] = useState('')
  const textareaRef = useRef(null)

  const handleInput = useCallback((e) => {
    setText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [])

  const handleSend = useCallback(() => {
    if (!text.trim() || disabled) return
    onSend(text.trim())
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [text, disabled, onSend])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <div style={styles.container}>
      <textarea
        ref={textareaRef}
        style={{ ...styles.textarea, ...(disabled ? styles.disabled : {}) }}
        value={text}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        rows={1}
        disabled={disabled}
      />
      <button
        style={{ ...styles.btn, ...styles.voiceBtn }}
        onClick={onVoiceToggle}
        aria-label="Voice mode"
      >
        <SoundwaveIcon size={20} />
      </button>
      <button
        style={{
          ...styles.btn,
          ...styles.sendBtn,
          ...((!text.trim() || disabled) ? styles.disabled : {}),
        }}
        onClick={handleSend}
        disabled={!text.trim() || disabled}
        aria-label="Send"
      >
        <SendIcon size={20} />
      </button>
    </div>
  )
}
