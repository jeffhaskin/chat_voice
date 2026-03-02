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
  menuOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
  },
  menu: {
    position: 'fixed',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    boxShadow: 'var(--shadow)',
    zIndex: 9999,
    overflow: 'hidden',
  },
  menuItem: {
    padding: '10px 16px',
    cursor: 'pointer',
    fontSize: 14,
    color: 'var(--text-primary)',
    background: 'transparent',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    display: 'block',
  },
  editOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  editBox: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxWidth: 500,
  },
  editTextarea: {
    width: '100%',
    minHeight: 100,
    padding: 10,
    fontSize: 14,
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    color: 'var(--text-primary)',
    resize: 'vertical',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  editButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  editBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: 14,
  },
  editBtnSave: {
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 14,
  },
}

export default function MessageList({ messages, onEditMessage, onDeleteMessage, conversationId }) {
  const endRef = useRef(null)
  const containerRef = useRef(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [editModal, setEditModal] = useState(null)
  const longPressTimer = useRef(null)
  const touchMoved = useRef(false)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const openMenu = useCallback((x, y, message) => {
    setContextMenu({ x, y, message })
  }, [])

  const closeMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handleContextMenu = useCallback((e, message) => {
    e.preventDefault()
    openMenu(e.clientX, e.clientY, message)
  }, [openMenu])

  const handleTouchStart = useCallback((e, message) => {
    touchMoved.current = false
    const touch = e.touches[0]
    const x = touch.clientX
    const y = touch.clientY
    longPressTimer.current = setTimeout(() => {
      openMenu(x, y, message)
    }, 500)
  }, [openMenu])

  const handleTouchEnd = useCallback(() => {
    clearTimeout(longPressTimer.current)
  }, [])

  const handleTouchMove = useCallback(() => {
    touchMoved.current = true
    clearTimeout(longPressTimer.current)
  }, [])

  const handleEdit = useCallback(() => {
    if (contextMenu) {
      setEditModal({ message: contextMenu.message, content: contextMenu.message.content })
      setContextMenu(null)
    }
  }, [contextMenu])

  const handleDelete = useCallback(() => {
    if (contextMenu && onDeleteMessage) {
      onDeleteMessage(contextMenu.message.id)
      setContextMenu(null)
    }
  }, [contextMenu, onDeleteMessage])

  const handleEditSave = useCallback(() => {
    if (editModal && onEditMessage) {
      onEditMessage(editModal.message.id, editModal.content)
      setEditModal(null)
    }
  }, [editModal, onEditMessage])

  return (
    <div style={styles.container} ref={containerRef}>
      {messages.map((msg, i) => (
        <div
          key={msg.id || i}
          onContextMenu={(e) => handleContextMenu(e, msg)}
          onTouchStart={(e) => handleTouchStart(e, msg)}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchMove}
        >
          <MessageBubble message={msg} />
        </div>
      ))}
      <div ref={endRef} />

      {contextMenu && (
        <>
          <div style={styles.menuOverlay} onClick={closeMenu} />
          <div style={{ ...styles.menu, left: contextMenu.x, top: contextMenu.y }}>
            {contextMenu.message.role === 'user' && (
              <button style={styles.menuItem} onClick={handleEdit}>Edit</button>
            )}
            <button style={styles.menuItem} onClick={handleDelete}>Delete</button>
          </div>
        </>
      )}

      {editModal && (
        <div style={styles.editOverlay} onClick={() => setEditModal(null)}>
          <div style={styles.editBox} onClick={(e) => e.stopPropagation()}>
            <textarea
              style={styles.editTextarea}
              value={editModal.content}
              onChange={(e) => setEditModal(prev => ({ ...prev, content: e.target.value }))}
              autoFocus
            />
            <div style={styles.editButtons}>
              <button style={styles.editBtn} onClick={() => setEditModal(null)}>Cancel</button>
              <button style={styles.editBtnSave} onClick={handleEditSave}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
