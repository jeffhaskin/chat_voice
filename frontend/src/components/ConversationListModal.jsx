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
  deleteBtn: {
    width: 36,
    height: 36,
    fontSize: 16,
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
  onClose,
}) {
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
                <div style={styles.itemTitle}>{conv.title || 'Untitled'}</div>
                <div style={styles.itemDate}>{formatDate(conv.updated_at || conv.created_at)}</div>
              </div>
              <button
                style={styles.deleteBtn}
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(conv.id)
                }}
                aria-label="Delete conversation"
              >
                &#128465;
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
