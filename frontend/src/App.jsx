import { useState, useCallback, useEffect, useRef } from 'react'
import useWebSocket from './hooks/useWebSocket'
import ChatView from './components/ChatView'
import VoiceView, { dispatchAudioData } from './components/VoiceView'
import ConversationListModal from './components/ConversationListModal'
import SettingsModal from './components/SettingsModal'

const API = '/api'

export default function App() {
  const [view, setView] = useState('chat')
  const [conversations, setConversations] = useState([])
  const [currentConversationId, setCurrentConversationId] = useState(null)
  const [messages, setMessages] = useState([])
  const [streaming, setStreaming] = useState(false)
  const [showConversations, setShowConversations] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const streamingRef = useRef(false)

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API}/conversations`)
      if (res.ok) {
        const data = await res.json()
        setConversations(data)
      }
    } catch {
      // ignore fetch errors
    }
  }, [])

  const fetchMessages = useCallback(async (convId) => {
    try {
      const res = await fetch(`${API}/conversations/${convId}/messages`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data)
      }
    } catch {
      // ignore
    }
  }, [])

  const handleWsMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'conversation_created':
        setCurrentConversationId(msg.conversation.id)
        fetchConversations()
        break

      case 'response_start':
        streamingRef.current = true
        setStreaming(true)
        setMessages(prev => [...prev, {
          id: msg.message_id || Date.now(),
          role: 'assistant',
          content: '',
          streaming: true,
        }])
        break

      case 'response_delta':
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.role === 'assistant' && last.streaming) {
            updated[updated.length - 1] = { ...last, content: last.content + msg.content }
          }
          return updated
        })
        break

      case 'response_complete':
        streamingRef.current = false
        setStreaming(false)
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              streaming: false,
              toolUse: last.toolUse ? { ...last.toolUse, status: 'done' } : undefined,
              sources: msg.sources?.length ? msg.sources : last.sources,
            }
          }
          return updated
        })
        fetchConversations()
        break

      case 'transcription':
        setMessages(prev => [...prev, {
          id: Date.now(),
          role: 'user',
          content: msg.text,
          source: 'voice',
        }])
        break

      case 'tool_use':
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              toolUse: { name: msg.tool, status: 'running' },
            }
          }
          return updated
        })
        break

      case 'tool_result':
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.role === 'assistant' && last.toolUse) {
            updated[updated.length - 1] = {
              ...last,
              toolUse: { ...last.toolUse, status: 'done' },
            }
          }
          return updated
        })
        break

      case 'error':
        streamingRef.current = false
        setStreaming(false)
        setMessages(prev => [...prev, {
          id: Date.now(),
          role: 'assistant',
          content: `Error: ${msg.message || msg.error || 'Something went wrong'}`,
          isError: true,
        }])
        break

      case 'audio_data':
        dispatchAudioData(msg.data)
        break

      case 'audio_complete':
        window.dispatchEvent(new CustomEvent('voice-audio-complete'))
        break

      default:
        break
    }
  }, [fetchConversations])

  const { connected, sendMessage, sendAudio, sendAudioComplete, sendInterrupt, switchMode } =
    useWebSocket(handleWsMessage)

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  const handleSendMessage = useCallback((content) => {
    if (!content.trim() || streamingRef.current) return
    setMessages(prev => [...prev, {
      id: Date.now(),
      role: 'user',
      content,
    }])
    sendMessage(content, currentConversationId)
  }, [sendMessage, currentConversationId])

  const handleSelectConversation = useCallback((convId) => {
    setCurrentConversationId(convId)
    fetchMessages(convId)
    setShowConversations(false)
  }, [fetchMessages])

  const handleNewConversation = useCallback(() => {
    setCurrentConversationId(null)
    setMessages([])
    setShowConversations(false)
  }, [])

  const handleDeleteConversation = useCallback(async (convId) => {
    try {
      await fetch(`${API}/conversations/${convId}`, { method: 'DELETE' })
      fetchConversations()
      if (convId === currentConversationId) {
        setCurrentConversationId(null)
        setMessages([])
      }
    } catch {
      // ignore
    }
  }, [currentConversationId, fetchConversations])

  const handleRenameConversation = useCallback(async (convId, newTitle) => {
    try {
      await fetch(`${API}/conversations/${convId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      })
      fetchConversations()
    } catch {
      // ignore
    }
  }, [fetchConversations])

  const handleSwitchToVoice = useCallback(() => {
    setView('voice')
    switchMode('voice')
  }, [switchMode])

  const handleSwitchToChat = useCallback(() => {
    setView('chat')
    switchMode('chat')
  }, [switchMode])

  const currentConversation = conversations.find(c => c.id === currentConversationId)

  if (view === 'voice') {
    return (
      <VoiceView
        onBack={handleSwitchToChat}
        sendAudio={sendAudio}
        sendAudioComplete={sendAudioComplete}
        sendInterrupt={sendInterrupt}
        conversationId={currentConversationId}
        messages={messages}
        onWsMessage={handleWsMessage}
        connected={connected}
      />
    )
  }

  return (
    <>
      <ChatView
        messages={messages}
        streaming={streaming}
        onSend={handleSendMessage}
        onOpenConversations={() => setShowConversations(true)}
        onOpenSettings={() => setShowSettings(true)}
        onSwitchToVoice={handleSwitchToVoice}
        conversationTitle={currentConversation?.title || 'New Chat'}
        connected={connected}
      />

      {showConversations && (
        <ConversationListModal
          conversations={conversations}
          currentId={currentConversationId}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onDelete={handleDeleteConversation}
          onRename={handleRenameConversation}
          onClose={() => setShowConversations(false)}
        />
      )}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </>
  )
}
