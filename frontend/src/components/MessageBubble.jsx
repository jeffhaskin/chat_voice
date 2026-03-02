const styles = {
  wrapper: {
    display: 'flex',
    maxWidth: '85%',
  },
  bubble: {
    padding: '10px 14px',
    borderRadius: 16,
    fontSize: 15,
    lineHeight: 1.5,
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
  },
  user: {
    alignSelf: 'flex-end',
    marginLeft: 'auto',
  },
  assistant: {
    alignSelf: 'flex-start',
    marginRight: 'auto',
  },
  voiceIcon: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginLeft: 6,
  },
  toolUse: {
    fontSize: 13,
    color: 'var(--text-muted)',
    fontStyle: 'italic',
    marginTop: 4,
  },
  sourcesRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  sourceBadge: {
    display: 'inline-block',
    fontSize: 11,
    padding: '3px 8px',
    borderRadius: 10,
    background: 'var(--code-bg)',
    color: 'var(--text)',
    textDecoration: 'none',
    maxWidth: 180,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cursor: {
    display: 'inline-block',
    width: 2,
    height: '1em',
    background: 'var(--text)',
    marginLeft: 2,
    animation: 'blink 1s step-end infinite',
    verticalAlign: 'text-bottom',
  },
  error: {
    color: 'var(--status-red)',
  },
  codeBlock: {
    background: 'var(--code-bg)',
    padding: '8px 12px',
    borderRadius: 8,
    fontFamily: 'monospace',
    fontSize: 13,
    overflowX: 'auto',
    margin: '4px 0',
  },
  inlineCode: {
    background: 'var(--code-bg)',
    padding: '2px 6px',
    borderRadius: 4,
    fontFamily: 'monospace',
    fontSize: 13,
  },
}

function renderContent(text) {
  if (!text) return null

  const parts = []
  const lines = text.split('\n')
  let inCodeBlock = false
  let codeLines = []
  let key = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        parts.push(
          <div key={key++} style={styles.codeBlock}>
            {codeLines.join('\n')}
          </div>
        )
        codeLines = []
        inCodeBlock = false
      } else {
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    const rendered = renderInline(line, key)
    key = rendered.nextKey
    parts.push(<div key={key++}>{rendered.elements.length > 0 ? rendered.elements : '\u00A0'}</div>)
  }

  if (inCodeBlock && codeLines.length > 0) {
    parts.push(
      <div key={key++} style={styles.codeBlock}>
        {codeLines.join('\n')}
      </div>
    )
  }

  return parts
}

function renderInline(text, startKey) {
  let key = startKey
  const elements = []
  const regex = /(\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>)
    }

    if (match[2]) {
      elements.push(<strong key={key++}>{match[2]}</strong>)
    } else if (match[3]) {
      elements.push(<code key={key++} style={styles.inlineCode}>{match[3]}</code>)
    } else if (match[4] && match[5]) {
      elements.push(
        <a key={key++} href={match[5]} target="_blank" rel="noopener noreferrer">
          {match[4]}
        </a>
      )
    }

    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    elements.push(<span key={key++}>{text.slice(lastIndex)}</span>)
  }

  return { elements, nextKey: key }
}

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user'

  return (
    <div style={{ ...styles.wrapper, ...(isUser ? styles.user : styles.assistant) }}>
      <div
        style={{
          ...styles.bubble,
          background: isUser ? 'var(--user-bubble)' : 'var(--assistant-bubble)',
          borderBottomRightRadius: isUser ? 4 : 16,
          borderBottomLeftRadius: isUser ? 16 : 4,
          ...(message.isError ? styles.error : {}),
        }}
      >
        {renderContent(message.content)}
        {message.streaming && <span style={styles.cursor} />}
        {message.source === 'voice' && <span style={styles.voiceIcon}>&#127908;</span>}
        {message.toolUse && message.toolUse.status === 'running' && (
          <div style={styles.toolUse}>Searching...</div>
        )}
        {message.sources?.length > 0 && (
          <div style={styles.sourcesRow}>
            {message.sources.map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={styles.sourceBadge}>
                {s.title}
              </a>
            ))}
          </div>
        )}
      </div>
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </div>
  )
}
