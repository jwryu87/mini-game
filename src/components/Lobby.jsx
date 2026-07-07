import { useState } from 'react'
import { db, ref, set, get } from '../firebase'

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export default function Lobby({ playerId, playerName: savedName, onJoin }) {
  const [name, setName] = useState(savedName)
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const createRoom = async () => {
    if (!name.trim()) return setError('이름을 입력해주세요')
    setLoading(true)
    setError('')
    try {
      const code = generateRoomCode()
      await set(ref(db, `rooms/${code}`), {
        host: playerId,
        status: 'lobby',
        currentGame: null,
        createdAt: Date.now(),
        players: {
          [playerId]: { name: name.trim(), team: 0, order: 0 }
        }
      })
      onJoin(code, name.trim())
    } catch (e) {
      setError('방 생성에 실패했습니다: ' + e.message)
    }
    setLoading(false)
  }

  const joinRoom = async () => {
    if (!name.trim()) return setError('이름을 입력해주세요')
    if (!joinCode.trim()) return setError('방 코드를 입력해주세요')
    setLoading(true)
    setError('')
    const code = joinCode.trim().toUpperCase()
    try {
      const snapshot = await get(ref(db, `rooms/${code}`))
      if (!snapshot.exists()) {
        setError('존재하지 않는 방입니다')
        setLoading(false)
        return
      }
      const room = snapshot.val()
      const playerCount = room.players ? Object.keys(room.players).length : 0
      if (playerCount >= 15) {
        setError('방이 가득 찼습니다 (최대 15명)')
        setLoading(false)
        return
      }
      const team = playerCount % 4
      await set(ref(db, `rooms/${code}/players/${playerId}`), {
        name: name.trim(), team, order: playerCount
      })
      onJoin(code, name.trim())
    } catch (e) {
      setError('참가에 실패했습니다: ' + e.message)
    }
    setLoading(false)
  }

  return (
    <div className="card lobby">
      <h2 style={{ marginBottom: 20 }}>🏠 게임 로비</h2>
      <div>
        <input
          placeholder="닉네임 입력"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={8}
        />
      </div>
      <div className="actions">
        <button className="btn-primary" onClick={createRoom} disabled={loading}>
          🎮 방 만들기
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
        <input
          placeholder="방 코드 입력"
          value={joinCode}
          onChange={e => setJoinCode(e.target.value.toUpperCase())}
          maxLength={4}
          style={{ width: 140, letterSpacing: 4, fontWeight: 700 }}
        />
        <button className="btn-secondary" onClick={joinRoom} disabled={loading}>
          입장하기
        </button>
      </div>
      {error && <p style={{ color: '#E53935', marginTop: 12, fontWeight: 600 }}>{error}</p>}
    </div>
  )
}
