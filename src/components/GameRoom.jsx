import { useState, useEffect } from 'react'
import { db, ref, onValue, update, remove } from '../firebase'
import YutNori from '../games/YutNori'
import LiarGame from '../games/LiarGame'
import SnowFight from '../games/SnowFight'

const DEFAULT_TEAM_NAMES = ['홍팀', '청팀', '녹팀', '주황팀']
const TEAM_EMOJI = ['🔴', '🔵', '🟢', '🟠']
const TEAM_CSS = ['team-0', 'team-1', 'team-2', 'team-3']

const GAME_COMPONENTS = {
  yutnori: YutNori,
  liar: LiarGame,
  snowfight: SnowFight,
}

export default function GameRoom({ roomCode, playerId, playerName, games, onLeave }) {
  const [roomData, setRoomData] = useState(null)
  const [selectedGame, setSelectedGame] = useState(null)
  const [editingTeam, setEditingTeam] = useState(null)
  const [teamNameInput, setTeamNameInput] = useState('')

  useEffect(() => {
    const roomRef = ref(db, `rooms/${roomCode}`)
    const unsub = onValue(roomRef, snap => {
      if (snap.exists()) {
        setRoomData(snap.val())
      } else {
        onLeave()
      }
    })
    return () => unsub()
  }, [roomCode, onLeave])

  if (!roomData) return <div className="card" style={{ textAlign: 'center', padding: 40 }}>로딩 중...</div>

  const isHost = roomData.host === playerId
  const players = roomData.players || {}
  const playerList = Object.entries(players).map(([id, p]) => ({ id, ...p }))
  const currentGame = roomData.currentGame

  const teamNames = roomData.teamNames || {}
  const getTeamName = (idx) => `${TEAM_EMOJI[idx]} ${teamNames[idx] || DEFAULT_TEAM_NAMES[idx]}`

  const startGame = async (gameId) => {
    await update(ref(db, `rooms/${roomCode}`), {
      currentGame: gameId,
      status: 'playing',
    })
  }

  const endGame = async () => {
    await update(ref(db, `rooms/${roomCode}`), {
      currentGame: null,
      status: 'lobby',
    })
    await remove(ref(db, `rooms/${roomCode}/gameState`))
  }

  const changeTeam = async (targetPlayerId, newTeam) => {
    if (!isHost) return
    await update(ref(db, `rooms/${roomCode}/players/${targetPlayerId}`), { team: newTeam })
  }

  const shuffleTeams = async () => {
    if (!isHost) return
    const ids = playerList.map(p => p.id)
    // Fisher-Yates shuffle
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]]
    }
    const numTeams = Math.min(4, Math.ceil(ids.length / 2))
    const updates = {}
    ids.forEach((id, i) => {
      updates[`rooms/${roomCode}/players/${id}/team`] = i % numTeams
    })
    await update(ref(db), updates)
  }

  const saveTeamName = async (teamIdx) => {
    if (!isHost || !teamNameInput.trim()) {
      setEditingTeam(null)
      return
    }
    await update(ref(db, `rooms/${roomCode}/teamNames`), { [teamIdx]: teamNameInput.trim() })
    setEditingTeam(null)
    setTeamNameInput('')
  }

  const leaveRoom = async () => {
    await remove(ref(db, `rooms/${roomCode}/players/${playerId}`))
    if (isHost && playerList.length <= 1) {
      await remove(ref(db, `rooms/${roomCode}`))
    }
    onLeave()
  }

  if (currentGame && GAME_COMPONENTS[currentGame]) {
    const GameComponent = GAME_COMPONENTS[currentGame]
    const gameInfo = games.find(g => g.id === currentGame)
    return (
      <div>
        <GameComponent
          roomCode={roomCode}
          playerId={playerId}
          playerName={playerName}
          players={playerList}
          isHost={isHost}
          roomData={roomData}
          teamNames={teamNames}
          onEndGame={endGame}
        />
      </div>
    )
  }

  // Find which teams are actually in use
  const usedTeams = [...new Set(playerList.map(p => p.team))].sort()

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>🏠 대기실</h2>
        <button className="btn-secondary" onClick={leaveRoom} style={{ padding: '8px 16px', fontSize: 14 }}>
          나가기
        </button>
      </div>

      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#888', marginBottom: 4 }}>방 코드를 공유하세요</p>
        <div className="room-code">{roomCode}</div>
        <p style={{ color: '#888' }}>{playerList.length}/8명 참가 중</p>
      </div>

      {/* Team Name Editor */}
      {isHost && usedTeams.length > 0 && (
        <>
          <h3 style={{ margin: '20px 0 8px' }}>✏️ 팀 이름 설정</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ flex: '1 1 45%', minWidth: 140 }}>
                {editingTeam === i ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      value={teamNameInput}
                      onChange={e => setTeamNameInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveTeamName(i)}
                      maxLength={6}
                      autoFocus
                      style={{ flex: 1, padding: 8, fontSize: 14 }}
                      placeholder={DEFAULT_TEAM_NAMES[i]}
                    />
                    <button className="btn-primary" onClick={() => saveTeamName(i)}
                      style={{ padding: '8px 12px', fontSize: 12 }}>
                      ✓
                    </button>
                  </div>
                ) : (
                  <button
                    className={`player-card ${TEAM_CSS[i]}`}
                    onClick={() => { setEditingTeam(i); setTeamNameInput(teamNames[i] || '') }}
                    style={{ width: '100%', cursor: 'pointer', fontSize: 14 }}
                  >
                    {getTeamName(i)} ✏️
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 8px' }}>
        <h3>👥 참가자</h3>
        {isHost && playerList.length >= 2 && (
          <button className="btn-secondary" onClick={shuffleTeams}
            style={{ padding: '6px 14px', fontSize: 13 }}>
            🎲 팀 랜덤 배정
          </button>
        )}
      </div>
      <div className="player-list">
        {playerList
          .sort((a, b) => a.order - b.order)
          .map(p => (
            <div key={p.id} className={`player-card ${TEAM_CSS[p.team]}`}>
              <div>{p.name} {p.id === roomData.host ? '👑' : ''}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{getTeamName(p.team)}</div>
              {isHost && p.id !== playerId && (
                <select
                  value={p.team}
                  onChange={e => changeTeam(p.id, Number(e.target.value))}
                  style={{ marginTop: 6, padding: 4, fontSize: 12, width: '100%' }}
                >
                  {[0, 1, 2, 3].map(i => (
                    <option key={i} value={i}>{getTeamName(i)}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
      </div>

      {isHost && (
        <>
          <h3 style={{ margin: '24px 0 8px' }}>🎮 게임 선택</h3>
          <div className="game-selector">
            {games.map(g => (
              <button
                key={g.id}
                className={`game-btn ${selectedGame === g.id ? 'active' : ''}`}
                onClick={() => setSelectedGame(g.id)}
              >
                <span className="emoji">{g.emoji}</span>
                <span className="name">{g.name}</span>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{g.desc}</div>
              </button>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button
              className="btn-primary"
              onClick={() => selectedGame && startGame(selectedGame)}
              disabled={!selectedGame}
              style={{ fontSize: 18, padding: '16px 48px' }}
            >
              🚀 게임 시작!
            </button>
          </div>
        </>
      )}

      {!isHost && (
        <div style={{ textAlign: 'center', margin: '24px 0', color: '#888' }}>
          <p style={{ fontSize: 24 }}>⏳</p>
          <p>방장이 게임을 선택하고 있습니다...</p>
        </div>
      )}
    </div>
  )
}
