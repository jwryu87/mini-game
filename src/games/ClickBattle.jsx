import { useState, useEffect, useRef } from 'react'
import { db, ref, onValue, update, set } from '../firebase'

const P = '#7C6BF0'

export default function ClickBattle({ roomCode, playerId, players, isHost, onEndGame }) {
  const [gs, setGs] = useState(null)
  const [, setTick] = useState(0)
  const cnt = useRef(0)
  const lastSync = useRef(0)
  const finalSent = useRef(false)
  const gsRef = ref(db, `rooms/${roomCode}/gameState`)

  useEffect(() => { const u = onValue(gsRef, s => setGs(s.val())); return () => u() }, [roomCode])
  useEffect(() => { if (!gs && isHost) set(gsRef, { phase: 'ready' }) }, [gs, isHost])

  const now = Date.now()
  const running = gs?.phase === 'run'
  const stage = !running ? 'ready' : now < gs.startAt ? 'count' : now < gs.endAt ? 'play' : 'end'

  useEffect(() => {
    if (stage !== 'count' && stage !== 'play') return
    const t = setInterval(() => setTick(x => x + 1), 100)
    return () => clearInterval(t)
  }, [stage])

  useEffect(() => {
    if (stage === 'end' && !finalSent.current && cnt.current > 0) {
      finalSent.current = true
      update(ref(db, `rooms/${roomCode}/gameState/clicks`), { [playerId]: cnt.current })
    }
    if (stage === 'ready') { cnt.current = 0; finalSent.current = false }
  }, [stage])

  const startGame = () => set(gsRef, { phase: 'run', startAt: Date.now() + 3000, endAt: Date.now() + 13000, clicks: {} })
  const clickIt = () => {
    if (stage !== 'play') return
    cnt.current++
    const t = Date.now()
    if (t - lastSync.current > 250) {
      lastSync.current = t
      update(ref(db, `rooms/${roomCode}/gameState/clicks`), { [playerId]: cnt.current })
    }
    setTick(x => x + 1)
  }

  if (!gs) return <div className="card" style={{ padding: 40, textAlign: 'center' }}>준비 중...</div>
  const clicks = gs.clicks || {}
  const board = players.map(p => ({ ...p, n: p.id === playerId ? Math.max(cnt.current, clicks[p.id] || 0) : (clicks[p.id] || 0) })).sort((a, b) => b.n - a.n)
  const Head = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>🖱️ 광클 배틀</h2>
      <button className="btn-secondary" onClick={onEndGame} style={{ padding: '4px 12px', fontSize: 12 }}>로비로</button>
    </div>
  )

  return (
    <div className="card" style={{ textAlign: 'center' }}><Head />
      {stage === 'ready' && (<>
        <p style={{ fontSize: 40, margin: '10px 0' }}>🖱️</p>
        <p style={{ fontSize: 14, color: '#888' }}>10초 동안 버튼을 최대한 많이! 준비되면 방장이 시작.</p>
        {isHost ? <button className="btn-primary" onClick={startGame} style={{ marginTop: 14, padding: '12px 32px' }}>시작! 🚀</button>
          : <p style={{ color: '#aaa', marginTop: 14 }}>방장 대기 중...</p>}
      </>)}
      {stage === 'count' && <p style={{ fontSize: 64, fontWeight: 900, color: P, margin: '30px 0' }}>{Math.ceil((gs.startAt - now) / 1000)}</p>}
      {stage === 'play' && (<>
        <p style={{ fontSize: 14, fontWeight: 800, color: '#E53935' }}>⏰ {Math.max(0, (gs.endAt - now) / 1000).toFixed(1)}초</p>
        <button onClick={clickIt}
          style={{ width: 190, height: 190, borderRadius: '50%', border: 'none', background: P, color: '#fff', fontSize: 40, fontWeight: 900, boxShadow: '0 7px 0 #4B3DBE', margin: '14px 0', cursor: 'pointer' }}>
          {cnt.current}
        </button>
        <p style={{ fontSize: 12, color: '#888' }}>광클!!!</p>
      </>)}
      {stage === 'end' && (<>
        <p style={{ fontSize: 36, margin: '4px 0' }}>🏁</p>
        {board[0] && <p style={{ fontWeight: 900, fontSize: 18 }}>우승: {board[0].name} ({board[0].n}클릭)</p>}
      </>)}
      {(stage === 'play' || stage === 'end') && (
        <div style={{ maxWidth: 300, margin: '12px auto 0', display: 'grid', gap: 5 }}>
          {board.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderRadius: 12, background: i === 0 ? '#F0EDFE' : '#F8F7FC', fontWeight: 700, fontSize: 13 }}>
              <span>{i + 1}. {p.name}{p.id === playerId ? ' (나)' : ''}</span><span style={{ color: P }}>{p.n}</span>
            </div>
          ))}
        </div>
      )}
      {stage === 'end' && isHost && <button className="btn-primary" onClick={startGame} style={{ marginTop: 14 }}>🔄 한 판 더</button>}
    </div>
  )
}
