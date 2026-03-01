import { useState, useEffect } from 'react'

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'var(--overlay)',
    zIndex: 200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  panel: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '80vh',
    background: 'var(--surface)',
    borderRadius: 16,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
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
  body: {
    padding: 20,
    flex: 1,
    overflowY: 'auto',
  },
  label: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 8,
    display: 'block',
    color: 'var(--text-muted)',
  },
  textarea: {
    width: '100%',
    minHeight: 150,
    background: 'var(--input-bg)',
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    lineHeight: 1.5,
    color: 'var(--text)',
    resize: 'vertical',
  },
  saveBtn: {
    margin: '16px 20px 20px',
    padding: 14,
    background: 'var(--accent)',
    borderRadius: 10,
    textAlign: 'center',
    fontWeight: 600,
    fontSize: 15,
  },
  saveBtnDisabled: {
    opacity: 0.5,
    pointerEvents: 'none',
  },
  status: {
    fontSize: 13,
    color: 'var(--text-muted)',
    textAlign: 'center',
    marginBottom: 10,
    padding: '0 20px',
  },
}

export default function SettingsModal({ onClose }) {
  const [systemPrompt, setSystemPrompt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    fetch('/api/settings/system_prompt')
      .then((r) => r.ok ? r.json() : { system_prompt: '' })
      .then((data) => {
        setSystemPrompt(data.system_prompt || '')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setStatus('')
    try {
      const res = await fetch('/api/settings/system_prompt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system_prompt: systemPrompt }),
      })
      if (res.ok) {
        setStatus('Saved')
        setTimeout(() => setStatus(''), 2000)
      } else {
        setStatus('Failed to save')
      }
    } catch {
      setStatus('Failed to save')
    }
    setSaving(false)
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>Settings</span>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div style={styles.body}>
          <label style={styles.label}>System Prompt</label>
          <textarea
            style={styles.textarea}
            value={loading ? 'Loading...' : systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            disabled={loading}
            placeholder="Enter a system prompt..."
          />
        </div>
        {status && <div style={styles.status}>{status}</div>}
        <button
          style={{
            ...styles.saveBtn,
            ...(saving || loading ? styles.saveBtnDisabled : {}),
          }}
          onClick={handleSave}
          disabled={saving || loading}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
