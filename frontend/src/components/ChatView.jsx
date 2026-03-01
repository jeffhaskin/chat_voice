import { useState, useEffect, useCallback } from 'react'
import MessageList from './MessageList'
import InputBar from './InputBar'
import GearIcon from '../icons/GearIcon'

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
    minHeight: 50,
    flexShrink: 0,
  },
  topBtn: {
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    padding: '0 8px',
  },
  connectionDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    marginRight: 8,
    flexShrink: 0,
  },
  messagesArea: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
}

export default function ChatView({
  messages,
  streaming,
  onSend,
  onOpenConversations,
  onOpenSettings,
  onSwitchToVoice,
  conversationTitle,
  connected,
}) {
  const [dark, setDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => setDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const toggleTheme = useCallback(() => setDark(d => !d), [])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <button style={styles.topBtn} onClick={onOpenConversations} aria-label="Conversations">
          &#9776;
        </button>
        <div style={styles.title}>
          <span
            style={{
              ...styles.connectionDot,
              background: connected ? 'var(--status-green)' : 'var(--status-red)',
            }}
          />
          {conversationTitle}
        </div>
        <button style={styles.topBtn} onClick={toggleTheme} aria-label="Toggle theme">
          {dark ? '\u2600' : '\u263D'}
        </button>
        <button style={styles.topBtn} onClick={onOpenSettings} aria-label="Settings">
          <GearIcon size={20} />
        </button>
      </div>
      <div style={styles.messagesArea}>
        <MessageList messages={messages} />
      </div>
      <InputBar onSend={onSend} disabled={streaming} onVoiceToggle={onSwitchToVoice} />
    </div>
  )
}
