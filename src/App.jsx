import { useState, useEffect } from 'react'
import Lobby from './components/Lobby'
import GameRoom from './components/GameRoom'

const GAMES = [
  { id: 'yutnori', name: '윷놀이', emoji: '🎯', desc: '전통 보드게임' },
  { id: 'liar', name: '라이어 게임', emoji: '🤥', desc: '거짓말쟁이를 찾아라' },
  { id: 'snowfight', name: '눈싸움', emoji: '☃️', desc: '눈덩이 대전' },
]

export default function App() {
  const [room, setRoom] = useState(null)
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
