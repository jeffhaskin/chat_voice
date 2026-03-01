import { useRef, useState, useCallback, useEffect } from 'react'

export default function useWebSocket(onMessage) {
  const wsRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const reconnectDelay = useRef(1000)
  const reconnectTimer = useRef(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState < 2) return

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)
    wsRef.current = ws

    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      setConnected(true)
      reconnectDelay.current = 1000
    }

    ws.onclose = () => {
      setConnected(false)
      const delay = reconnectDelay.current
      reconnectDelay.current = Math.min(delay * 2, 30000)
      reconnectTimer.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        onMessageRef.current?.({ type: 'audio_data', data: event.data })
      } else {
        try {
          const msg = JSON.parse(event.data)
          onMessageRef.current?.(msg)
        } catch {
          // ignore parse errors
        }
      }
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [connect])

  const sendMessage = useCallback((content, conversationId) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'text_message',
        content,
        conversation_id: conversationId,
      }))
    }
  }, [])

  const sendAudio = useCallback((audioBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(audioBuffer)
    }
  }, [])

  const sendAudioComplete = useCallback((conversationId) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'audio_complete',
        conversation_id: conversationId,
      }))
    }
  }, [])

  const sendInterrupt = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'interrupt' }))
    }
  }, [])

  const switchMode = useCallback((mode) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'mode_switch', mode }))
    }
  }, [])

  return { connected, sendMessage, sendAudio, sendAudioComplete, sendInterrupt, switchMode }
}
