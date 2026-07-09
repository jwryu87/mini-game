import { useState, useEffect } from 'react'
import { db, ref, onValue, update, set, push, serverTimestamp } from '../firebase'

const P = '#7C6BF0'
const WINDOW = 600

export default function Nunchi({ roomCode, playerId, players, isHost, onEndGame }) {
  const [gs, setGs] = useState(null)
  const gsRef = ref(db, `rooms/${roomCode}/gameState`)

  useEffect(() => { const u = onValue(gsRef, s => setGs(s.val())); return () => u() }, [roomCode])
  useEffect(() => { if (!gs && isHost) set(gsRef, { phase: 'play', round: 1, claims: {} }) }, [gs, isHost])

  if (!gs) return <div className="card" style={{ padding: 40, textAlign: 'center' }}>준비 중...</div>

  const claims = Object.values(gs.claims || {}).filter(c => typeof c.ts === 'number').sort((a, b) => a.ts - b.ts)
  const myClaimed = claims.some(c => c.pid === playerId)
  let collision = null
  for (let i = 1; i < claims.length; i++) {
    if (claims[i].ts - claims[i - 1].ts < WINDOW) { collision = [claims[i - 1], claims[i]]; break }
  }
  const allDone = !collision && claims.length >= players.length
  const loser = collision ? null : allDone ? claims[claims.length - 1] : null
  const over = !!collision || allDone

  const shout = () => {
    if (myClaimed || over) return
    push(ref(db, `rooms/${roomCode}/gameState/claims`), { pid: playerId, name: players.find(p => p.id === playerId)?.name || '?', ts: serverTimestamp() })
  }
  const reset = () => set(gsRef, { phase: 'play', round: (gs.round || 1) + 1, claims: {} })

  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>🔢 눈치 게임 — R{gs.round}</h2>
        <button className="btn-secondary" onClick={onEndGame} style={{ padding: '4px 12px', fontSize: 12 }}>로비로</button>
      </div>
      <p style={{ fontSize: 13, color: '#888' }}>1부터 차례로! 아무나 눌러 외치되, <b>0.6초 안에 겹치면 💥</b> 마지막까지 못 외친 사람이 술래.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', margin: '14px 0' }}>
        {players.map((_, i) => {
          const c = claims[i]
          const boom = collision && c && (c === collision[0] || c === collision[1])
          return (
            <div key={i} style={{ width: 74, padding: '10px 4px', borderRadius: 14, border: '2px solid',
              borderColor: boom ? '#E53935' : c ? P : '#EDE9FB', background: boom ? '#FFEBEE' : c ? '#F0EDFE' : '#fff' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: boom ? '#E53935' : c ? P : '#ccc' }}>{i + 1}</div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#666', minHeight: 14 }}>{boom ? '💥' : ''}{c ? c.name : ''}</div>
            </div>
          )
        })}
      </div>

      {collision && (
        <p style={{ fontWeight: 900, color: '#E53935', fontSize: 16 }}>💥 {collision[0].name} vs {collision[1].name} 동시에! 둘 다 술래!</p>
      )}
      {allDone && loser && (
        <p style={{ fontWeight: 900, color: '#E65100', fontSize: 16 }}>🐢 끝까지 눈치보다 마지막... {loser.name} 술래!</p>
      )}

      {!over && (
        <button onClick={shout} disabled={myClaimed}
          style={{ width: 170, height: 170, borderRadius: '50%', border: 'none', margin: '6px 0',
            background: myClaimed ? '#ddd' : P, color: '#fff', fontSize: 22, fontWeight: 900,
            boxShadow: myClaimed ? 'none' : '0 6px 0 #4B3DBE', cursor: myClaimed ? 'default' : 'pointer' }}>
          {myClaimed ? '외침 ✓' : `${claims.length + 1} 외치기!`}
        </button>
      )}
      {over && isHost && <button className="btn-primary" onClick={reset} style={{ marginTop: 10 }}>🔄 다음 라운드</button>}
    </div>
  )
}
