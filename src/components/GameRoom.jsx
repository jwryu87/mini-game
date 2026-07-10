import { useState, useEffect } from 'react'
import { db, ref, onValue, update, remove } from '../firebase'

function RoomChat({ roomCode, playerId, playerName }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const chatRef = ref(db, `rooms/${roomCode}/chat`)
  const listRef = { current: null }

  useEffect(() => {
    const unsub = onValue(chatRef, snap => {
      if (snap.exists()) {
        const arr = Object.values(snap.val()).sort((a, b) => a.ts - b.ts).slice(-50)
        setMessages(arr)
      }
    })
    return () => unsub()
  }, [roomCode])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages.length])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput('')
    const id = Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    await update(ref(db, `rooms/${roomCode}/chat/${id}`), {
      name: playerName, text, ts: Date.now(), pid: playerId,
    })
    setSending(false)
  }

  return (
    <div style={{ marginTop: 8, border: '1px solid #E0E0E0', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ background: '#F5F5F5', padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#666' }}>
        💬 채팅
      </div>
      <div ref={el => listRef.current = el}
        style={{ height: 220, overflow: 'auto', padding: 6, fontSize: 12, background: '#FAFAFA' }}>
        {messages.length === 0 && <div style={{ color: '#bbb', textAlign: 'center', paddingTop: 20 }}>메시지를 보내보세요!</div>}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 3, wordBreak: 'break-word', textAlign: 'left' }}>
            <span style={{ fontWeight: 700, color: m.pid === playerId ? '#C62828' : '#333' }}>{m.name}:</span>
            <span style={{ color: '#555' }}> {m.text}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid #E0E0E0', padding: '4px' }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send() }}
          placeholder="메시지 입력..."
          style={{ flex: 1, border: 'none', padding: '6px 8px', fontSize: 13, outline: 'none', background: 'transparent' }} />
        <button className="chat-send-btn" onClick={send}>
          <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
            <path d="M1.5 2.25a.755.755 0 0 1 1-.71l15.596 7.807a.73.73 0 0 1 0 1.306L2.5 18.46a.755.755 0 0 1-1-.71V11.5l9.5-1.5-9.5-1.5V2.25z"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
import YutNori from '../games/YutNori'
import LiarGame from '../games/LiarGame'
import SnowFight from '../games/SnowFight'
import GeoGuessrTeam from '../games/GeoGuessrTeam'
import TwoTruths from '../games/TwoTruths'
import BalanceGame from '../games/BalanceGame'
import WhoTmi from '../games/WhoTmi'
import ClickBattle from '../games/ClickBattle'
import Reaction from '../games/Reaction'
import TimingStop from '../games/TimingStop'
import Roulette from '../games/Roulette'
import Nunchi from '../games/Nunchi'
import DrawGuess from '../games/DrawGuess'
import BombRelay from '../games/BombRelay'
import RankUs from '../games/RankUs'
import WordHunt from '../games/WordHunt'
import KpiQuiz from '../games/KpiQuiz'
import GhostAvatar from './GhostAvatar'

const DEFAULT_TEAM_NAMES = ['홍팀', '청팀', '녹팀', '주황팀']
const TEAM_EMOJI = ['🔴', '🔵', '🟢', '🟠']
const TEAM_CSS = ['team-0', 'team-1', 'team-2', 'team-3']
const TEAM_HEX = ['#FF7B7B', '#6BA6FF', '#37CFBE', '#FFC44D']

const GAME_COMPONENTS = {
  yutnori: YutNori,
  liar: LiarGame,
  snowfight: SnowFight,
  geoguessr: GeoGuessrTeam,
  twotruths: TwoTruths,
  balance: BalanceGame,
  whotmi: WhoTmi,
  clickbattle: ClickBattle,
  reaction: Reaction,
  timingstop: TimingStop,
  roulette: Roulette,
  nunchi: Nunchi,
  drawguess: DrawGuess,
  bombrelay: BombRelay,
  rankus: RankUs,
  wordhunt: WordHunt,
  kpiquiz: KpiQuiz,
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
    if (!window.confirm('정말 로비로 돌아가시겠습니까?\n진행 중인 게임이 종료됩니다.')) return
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

  const activeGame = games.find(g => g.id === selectedGame) || games[0]

  return (
    <div className="card" style={{ padding: 12 }}>
      {/* Top row: title + room code + leave */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>🏠 대기실</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ textAlign: 'center' }}>
            <div className="room-code" style={{ fontSize: 28, padding: '4px 16px', letterSpacing: 4 }}>{roomCode}</div>
            <span style={{ color: '#888', fontSize: 11 }}>{playerList.length}/15명</span>
          </div>
          <button className="btn-secondary" onClick={leaveRoom} style={{ padding: '4px 12px', fontSize: 12 }}>
            나가기
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        {/* Left: participants + team names */}
        <div style={{ flex: '0 0 220px', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <h3 style={{ fontSize: 13, margin: 0 }}>👥 참가자</h3>
            {isHost && playerList.length >= 2 && (
              <button className="btn-secondary" onClick={shuffleTeams}
                style={{ padding: '2px 8px', fontSize: 10 }}>🎲 랜덤</button>
            )}
          </div>
          <div className="player-list" style={{ gap: 4 }}>
            {playerList.sort((a, b) => a.order - b.order).map(p => (
              <div key={p.id} className="roster-card" style={{ padding: '8px 6px' }}>
                <GhostAvatar color={p.avatarColor || TEAM_HEX[p.team]} size={34} cheek={false} />
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 3 }}>{p.name}{p.id === roomData.host ? ' 👑' : ''}</div>
                <span className={`team-chip ${TEAM_CSS[p.team]}`} style={{ marginTop: 4 }}>{getTeamName(p.team)}</span>
                {isHost && p.id !== playerId && (
                  <select value={p.team} onChange={e => changeTeam(p.id, Number(e.target.value))}
                    style={{ marginTop: 4, padding: 1, fontSize: 10, width: '100%' }}>
                    {[0, 1, 2, 3].map(i => (
                      <option key={i} value={i}>{teamNames[i] || DEFAULT_TEAM_NAMES[i]}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>

          {isHost && usedTeams.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <h3 style={{ fontSize: 11, margin: '0 0 3px', color: '#888' }}>✏️ 팀 이름</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {usedTeams.map(i => (
                  editingTeam === i ? (
                    <div key={i} style={{ display: 'flex', gap: 2 }}>
                      <input value={teamNameInput} onChange={e => setTeamNameInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveTeamName(i)} maxLength={6} autoFocus
                        style={{ width: 64, padding: '3px 6px', fontSize: 11 }} placeholder={DEFAULT_TEAM_NAMES[i]} />
                      <button className="btn-primary" onClick={() => saveTeamName(i)}
                        style={{ padding: '2px 8px', fontSize: 11 }}>✓</button>
                    </div>
                  ) : (
                    <button key={i} className={`team-chip ${TEAM_CSS[i]}`}
                      onClick={() => { setEditingTeam(i); setTeamNameInput(teamNames[i] || '') }}
                      style={{ cursor: 'pointer', border: 'none' }}>
                      {getTeamName(i)} ✏️
                    </button>
                  )
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Center: game gallery + start */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 13, margin: '0 0 8px' }}>🎮 게임 고르기</h3>
          <div className="game-gallery">
            {games.map(g => (
              <button key={g.id} className={`game-tile${activeGame.id === g.id ? ' sel' : ''}`}
                onClick={() => isHost && setSelectedGame(g.id)} disabled={!isHost}>
                <span className="em">{g.emoji}</span>
                <span className="gn">{g.name}</span>
                <span className="gd">{g.desc}</span>
              </button>
            ))}
          </div>
          {isHost ? (
            <button className="btn-primary" onClick={() => startGame(activeGame.id)}
              style={{ width: '100%', marginTop: 12, padding: '13px' }}>
              🚀 {activeGame.name} 시작!
            </button>
          ) : (
            <p style={{ textAlign: 'center', color: '#888', fontSize: 13, marginTop: 12 }}>⏳ 방장이 게임 고르는 중...</p>
          )}
        </div>

        {/* Right: chat */}
        <div style={{ flex: '0 0 240px', minWidth: 0 }}>
          <RoomChat roomCode={roomCode} playerId={playerId} playerName={playerName} />
        </div>
      </div>
    </div>
  )
}
