import { useState, useEffect, useRef, useCallback } from 'react'
import Lobby from './components/Lobby'
import GameRoom from './components/GameRoom'

const GAMES = [
  { id: 'yutnori', name: '윷놀이', emoji: '🎯', desc: '전통 보드게임' },
  { id: 'liar', name: '라이어 게임', emoji: '🤥', desc: '거짓말쟁이를 찾아라' },
  { id: 'snowfight', name: '눈싸움 배틀', emoji: '🐾', desc: '동물 눈싸움 대전' },
  { id: 'geoguessr', name: 'GeoGuessr 팀전', emoji: '🌍', desc: '거리뷰 보고 위치 맞히기' },
]

const THEMES = [
  { id: '', label: '🔲 기본' },
  { id: 'theme-win95', label: '🖥️ Win95' },
  { id: 'theme-slack', label: '💬 Slack' },
  { id: 'theme-pixel', label: '👾 도트' },
  { id: 'theme-baemin', label: '🛵 배민' },
]

export default function App() {
  const [room, setRoom] = useState(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || '')
  const [playerId, setPlayerId] = useState(() => {
    let id = sessionStorage.getItem('playerId')
    if (!id) {
      id = Math.random().toString(36).substring(2, 10)
      sessionStorage.setItem('playerId', id)
    }
    return id
  })
  const [playerName, setPlayerName] = useState(() =>
    sessionStorage.getItem('playerName') || ''
  )

  const audioRef = useRef(null)
  const [bgmPlaying, setBgmPlaying] = useState(false)
  const [bgmVolume, setBgmVolume] = useState(() => {
    const v = localStorage.getItem('bgmVolume')
    return v !== null ? Number(v) : 0.3
  })

  useEffect(() => {
    document.body.className = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio(`${import.meta.env.BASE_URL}bgm.mp3`)
      audio.loop = true
      audio.volume = bgmVolume
      audioRef.current = audio
    }
  }, [])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = bgmVolume
      localStorage.setItem('bgmVolume', String(bgmVolume))
    }
  }, [bgmVolume])

  const toggleBgm = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (bgmPlaying) {
      audio.pause()
    } else {
      audio.play().catch(() => {})
    }
    setBgmPlaying(!bgmPlaying)
  }, [bgmPlaying])

  const handleJoinRoom = (roomCode, name) => {
    sessionStorage.setItem('playerName', name)
    setPlayerName(name)
    setRoom(roomCode)
  }

  const handleLeaveRoom = () => setRoom(null)

  return (
    <div className="container">
      <div className={`header${room ? ' compact' : ''}`}>
        <h1>🎮 미니게임 파티</h1>
        <p>다 같이 즐겨요!</p>
      </div>
      <div className="top-bar">
        <div className="theme-picker">
          {THEMES.map(t => (
            <button key={t.id} className={theme === t.id ? 'active' : ''}
              onClick={() => setTheme(theme === t.id ? '' : t.id)}>{t.label}</button>
          ))}
        </div>
        <div className="bgm-control">
          <button className={`bgm-btn${bgmPlaying ? ' playing' : ''}`} onClick={toggleBgm}>
            {bgmPlaying ? '♫' : '♪'}
          </button>
          {bgmPlaying && (
            <>
              <button className="bgm-vol" onClick={() => setBgmVolume(v => Math.max(0, v - 0.1))}>−</button>
              <span className="bgm-level">{Math.round(bgmVolume * 10)}</span>
              <button className="bgm-vol" onClick={() => setBgmVolume(v => Math.min(1, v + 0.1))}>+</button>
            </>
          )}
        </div>
      </div>
      {!room ? (
        <Lobby
          playerId={playerId}
          playerName={playerName}
          onJoin={handleJoinRoom}
          games={GAMES}
        />
      ) : (
        <GameRoom
          roomCode={room}
          playerId={playerId}
          playerName={playerName}
          games={GAMES}
          onLeave={handleLeaveRoom}
        />
      )}
    </div>
  )
}
