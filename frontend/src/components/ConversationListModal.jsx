import { useState, useRef, useEffect } from 'react'
import TrashIcon from '../icons/TrashIcon'
import PencilIcon from '../icons/PencilIcon'

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'var(--overlay)',
    zIndex: 100,
    display: 'flex',
  },
  panel: {
    width: '100%',
    maxWidth: 320,
    background: 'var(--surface)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 600,
  },
  closeBtn: {
    width: 44,
    height: 44,
    fontSize: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newBtn: {
    margin: '12px 16px',
    padding: '12px',
    background: 'var(--accent)',
    borderRadius: 10,
    textAlign: 'center',
    fontWeight: 600,
    fontSize: 15,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 16px',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
    gap: 10,
  },
  itemActive: {
    background: 'var(--hover)',
  },
  itemText: {
    flex: 1,
    overflow: 'hidden',
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemDate: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginTop: 2,
  },
  editInput: {
    fontSize: 15,
    fontWeight: 500,
    width: '100%',
    padding: '2px 4px',
    border: '1px solid var(--border)',
    borderRadius: 4,
    background: 'var(--surface)',
    color: 'inherit',
    outline: 'none',
  },
  actionBtn: {
    width: 36,
    height: 36,
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function ConversationListModal({
  conversations,
  currentId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onClose,
}) {
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  const startEditing = (conv, e) => {
    e.stopPropagation()
    setEditingId(conv.id)
    setEditValue(conv.title || '')
  }

  const commitEdit = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim())
    }
    setEditingId(null)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') setEditingId(null)
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>Conversations</span>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <button style={styles.newBtn} onClick={onNew}>
          + New Chat
        </button>

        <div style={styles.list}>
          {conversations.map((conv) => (
            <div
              key={conv.id}
              style={{
                ...styles.item,
                ...(conv.id === currentId ? styles.itemActive : {}),
              }}
              onClick={() => onSelect(conv.id)}
            >
              <div style={styles.itemText}>
                {editingId === conv.id ? (
                  <input
                    ref={inputRef}
                    style={styles.editInput}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={handleKeyDown}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <div style={styles.itemTitle}>{conv.title || 'Untitled'}</div>
                    <div style={styles.itemDate}>{formatDate(conv.updated_at || conv.created_at)}</div>
                  </>
                )}
              </div>
              <button
                style={styles.actionBtn}
                onClick={(e) => startEditing(conv, e)}
                aria-label="Rename conversation"
              >
                <PencilIcon size={14} />
              </button>
              <button
                style={styles.actionBtn}
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(conv.id)
                }}
                aria-label="Delete conversation"
              >
                <TrashIcon size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
