import { useState } from 'react'

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
    whiteSpace: 'pre-wrap',
  },
  inlineCode: {
    background: 'var(--code-bg)',
    padding: '2px 6px',
    borderRadius: 4,
    fontFamily: 'monospace',
    fontSize: 13,
  },
}

function CodeBlock({ code }) {
  const [expanded, setExpanded] = useState(false)
  const lines = code.split('\n')
  const needsCollapse = lines.length > 6

  return (
    <div>
      <div style={{
        ...styles.codeBlock,
        ...(needsCollapse && !expanded ? { maxHeight: 120, overflow: 'hidden', position: 'relative' } : {}),
      }}>
        {needsCollapse && !expanded ? lines.slice(0, 6).join('\n') : code}
        {needsCollapse && !expanded && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 40,
            background: 'linear-gradient(transparent, var(--code-bg))',
            pointerEvents: 'none',
          }} />
        )}
      </div>
      {needsCollapse && (
        <div
          onClick={() => setExpanded(e => !e)}
          style={{ color: 'var(--accent)', fontSize: 13, cursor: 'pointer', marginTop: 4 }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </div>
      )}
    </div>
  )
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
        parts.push(<CodeBlock key={key++} code={codeLines.join('\n')} />)
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

    // Horizontal rule
    if (line.trim() === '---') {
      parts.push(<hr key={key++} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />)
      continue
    }

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const sizes = { 1: 20, 2: 18, 3: 16 }
      const rendered = renderInline(headingMatch[2], key)
      key = rendered.nextKey
      parts.push(
        <div key={key++} style={{ fontSize: sizes[level], fontWeight: 'bold', margin: '8px 0 4px' }}>
          {rendered.elements}
        </div>
      )
      continue
    }

    // Unordered list
    if ((line.startsWith('- ') || (line.startsWith('* ') && !line.startsWith('**')))) {
      const content = line.startsWith('- ') ? line.slice(2) : line.slice(2)
      const rendered = renderInline(content, key)
      key = rendered.nextKey
      parts.push(
        <div key={key++} style={{ paddingLeft: 20 }}>
          {'\u2022 '}{rendered.elements}
        </div>
      )
      continue
    }

    // Ordered list
    const olMatch = line.match(/^(\d+)\.\s+(.+)/)
    if (olMatch) {
      const rendered = renderInline(olMatch[2], key)
      key = rendered.nextKey
      parts.push(
        <div key={key++} style={{ paddingLeft: 20 }}>
          {olMatch[1]}. {rendered.elements}
        </div>
      )
      continue
    }

    const rendered = renderInline(line, key)
    key = rendered.nextKey
    parts.push(<div key={key++}>{rendered.elements.length > 0 ? rendered.elements : '\u00A0'}</div>)
  }

  if (inCodeBlock && codeLines.length > 0) {
    parts.push(<CodeBlock key={key++} code={codeLines.join('\n')} />)
  }

  return parts
}

function renderInline(text, startKey) {
  let key = startKey
  const elements = []
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>)
    }

    if (match[2]) {
      elements.push(<strong key={key++}>{match[2]}</strong>)
    } else if (match[3]) {
      elements.push(<em key={key++}>{match[3]}</em>)
    } else if (match[4]) {
      elements.push(<code key={key++} style={styles.inlineCode}>{match[4]}</code>)
    } else if (match[5] && match[6]) {
      elements.push(
        <a key={key++} href={match[6]} target="_blank" rel="noopener noreferrer">
          {match[5]}
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
