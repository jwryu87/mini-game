import { useState, useEffect } from 'react'
import { db, ref, onValue, update, set } from '../firebase'
import GhostAvatar from '../components/GhostAvatar'

const P = '#7C6BF0'
const DUR = 3200
const TEAM_HEX = ['#FF7B7B', '#6BA6FF', '#37CFBE', '#FFC44D']

export default function Roulette({ roomCode, playerId, players, isHost, onEndGame }) {
  const [gs, setGs] = useState(null)
  const [prize, setPrize] = useState('')
  const [, setTick] = useState(0)
  const gsRef = ref(db, `rooms/${roomCode}/gameState`)

  useEffect(() => { const u = onValue(gsRef, s => setGs(s.val())); return () => u() }, [roomCode])
  useEffect(() => { if (!gs && isHost) set(gsRef, { phase: 'idle' }) }, [gs, isHost])

  const spinning = gs?.phase === 'spin' && Date.now() - gs.spinAt < DUR
  useEffect(() => {
    if (!spinning) return
    const t = setInterval(() => setTick(x => x + 1), 60)
    return () => clearInterval(t)
  }, [spinning])

  const ordered = [...players].sort((a, b) => (a.order || 0) - (b.order || 0))
  const spin = () => {
    const winner = ordered[Math.floor(Math.random() * ordered.length)]
    update(gsRef, { phase: 'spin', winnerId: winner.id, spinAt: Date.now(), prize: prize.trim() || '당첨' })
  }

  if (!gs) return <div className="card" style={{ padding: 40, textAlign: 'center' }}>준비 중...</div>
  const Head = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>🎰 복불복 룰렛</h2>
      <button className="btn-secondary" onClick={onEndGame} style={{ padding: '4px 12px', fontSize: 12 }}>로비로</button>
    </div>
  )

  let hlIdx = -1
  let landed = false
  if (gs.phase === 'spin') {
    const n = ordered.length
    const winnerIdx = Math.max(0, ordered.findIndex(p => p.id === gs.winnerId))
    const steps = n * 4 + winnerIdx
    const t = Math.min(1, (Date.now() - gs.spinAt) / DUR)
    const eased = 1 - Math.pow(1 - t, 3)
    hlIdx = Math.min(steps, Math.floor(eased * steps)) % n
    landed = t >= 1
  }
  const winner = ordered.find(p => p.id === gs.winnerId)

  return (
    <div className="card" style={{ textAlign: 'center' }}><Head />
      {gs.phase === 'idle' && <p style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>커피 내기, 발표자 뽑기, 청소 당번... 운명에 맡기세요 👻</p>}
      {gs.phase === 'spin' && !landed && <p style={{ fontSize: 14, fontWeight: 800, color: P, marginBottom: 12 }}>두구두구두구... 🥁</p>}
      {landed && winner && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 30, margin: 0 }}>🎉</p>
          <p style={{ fontWeight: 900, fontSize: 20, margin: '2px 0' }}>{winner.name} 당첨!</p>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#5B4BD6', background: '#F0EDFE', borderRadius: 20, padding: '4px 14px' }}>{gs.prize}</span>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8, maxWidth: 460, margin: '0 auto' }}>
        {ordered.map((p, i) => {
          const on = i === hlIdx && gs.phase === 'spin'
          const isWin = landed && p.id === gs.winnerId
          return (
            <div key={p.id} style={{ padding: '10px 4px', borderRadius: 14, border: '3px solid', transition: 'all 0.06s',
              borderColor: isWin ? '#FFC44D' : on ? P : '#EDE9FB', background: isWin ? '#FFF7E0' : on ? '#F0EDFE' : '#fff',
              transform: on || isWin ? 'scale(1.06)' : 'none' }}>
              <GhostAvatar color={p.avatarColor || TEAM_HEX[p.team % 4]} size={34} cheek={false} />
              <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2 }}>{p.name}</div>
            </div>
          )
        })}
      </div>
      {isHost && (gs.phase === 'idle' || landed) && (
        <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <input value={prize} onChange={e => setPrize(e.target.value)} placeholder="걸 것 (예: 커피 쏘기)" maxLength={16} style={{ width: 170 }} />
          <button className="btn-primary" onClick={spin} style={{ padding: '10px 24px' }}>🎰 돌려!</button>
        </div>
      )}
    </div>
  )
}
