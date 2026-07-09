import { useState, useEffect, useRef } from 'react'
import { db, ref, onValue, update, set } from '../firebase'

const P = '#7C6BF0'
const TARGET = 7000

export default function TimingStop({ roomCode, playerId, players, isHost, onEndGame }) {
  const [gs, setGs] = useState(null)
  const [local, setLocal] = useState('idle')
  const [, setTick] = useState(0)
  const t0 = useRef(0)
  const gsRef = ref(db, `rooms/${roomCode}/gameState`)

  useEffect(() => { const u = onValue(gsRef, s => setGs(s.val())); return () => u() }, [roomCode])
  useEffect(() => { if (!gs && isHost) set(gsRef, { phase: 'play', results: {} }) }, [gs, isHost])
  useEffect(() => { if (gs?.phase === 'play' && (gs.round || 0) !== undefined) setLocal(l => l === 'running' ? l : 'idle') }, [gs?.round])
  useEffect(() => {
    if (local !== 'running') return
    const t = setInterval(() => setTick(x => x + 1), 50)
    return () => clearInterval(t)
  }, [local])

  const results = gs?.results || {}
  const myMs = results[playerId]
  const begin = () => { t0.current = performance.now(); setLocal('running') }
  const stop = async () => {
    const ms = Math.round(performance.now() - t0.current)
    setLocal('stopped')
    await update(ref(db, `rooms/${roomCode}/gameState/results`), { [playerId]: ms })
  }

  if (!gs) return <div className="card" style={{ padding: 40, textAlign: 'center' }}>준비 중...</div>
  const doneCnt = Object.keys(results).length
  const elapsed = local === 'running' ? performance.now() - t0.current : 0
  const showTime = elapsed < 3000
  const Head = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>⏱️ 타이밍 스톱 — 목표 7.00초</h2>
      <button className="btn-secondary" onClick={onEndGame} style={{ padding: '4px 12px', fontSize: 12 }}>로비로</button>
    </div>
  )

  if (gs.phase === 'result') {
    const board = players.filter(p => results[p.id] !== undefined)
      .map(p => ({ ...p, ms: results[p.id], diff: Math.abs(results[p.id] - TARGET) }))
      .sort((a, b) => a.diff - b.diff)
    return (
      <div className="card" style={{ textAlign: 'center' }}><Head />
        <p style={{ fontSize: 32, margin: '4px 0' }}>🏁</p>
        {board[0] && <p style={{ fontWeight: 900, fontSize: 17 }}>우승: {board[0].name} (오차 {(board[0].diff / 1000).toFixed(2)}초)</p>}
        <div style={{ maxWidth: 320, margin: '10px auto 0', display: 'grid', gap: 5 }}>
          {board.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderRadius: 12, background: i === 0 ? '#F0EDFE' : '#F8F7FC', fontWeight: 700, fontSize: 13 }}>
              <span>{i + 1}. {p.name}</span><span style={{ color: P }}>{(p.ms / 1000).toFixed(2)}초 (±{(p.diff / 1000).toFixed(2)})</span>
            </div>
          ))}
        </div>
        {isHost && <button className="btn-primary" onClick={() => set(gsRef, { phase: 'play', results: {}, round: (gs.round || 0) + 1 })} style={{ marginTop: 14 }}>🔄 한 판 더</button>}
      </div>
    )
  }

  return (
    <div className="card" style={{ textAlign: 'center' }}><Head />
      <p style={{ fontSize: 13, color: '#888' }}>시작 누르고, 감으로 <b>정확히 7.00초</b>에 멈추세요. 3초 뒤엔 시계가 숨어요!</p>
      {myMs === undefined && local !== 'running' && (
        <button className="btn-primary" onClick={begin} style={{ marginTop: 16, padding: '14px 40px', fontSize: 17 }}>▶ 시작</button>
      )}
      {local === 'running' && (<>
        <p style={{ fontSize: 52, fontWeight: 900, color: showTime ? P : '#ddd', margin: '14px 0', fontVariantNumeric: 'tabular-nums' }}>
          {showTime ? (elapsed / 1000).toFixed(2) : '?.??'}
        </p>
        <button className="btn-primary" onClick={stop} style={{ padding: '14px 40px', fontSize: 17, background: '#E53935', boxShadow: '0 4px 0 #B71C1C' }}>■ 스톱!</button>
      </>)}
      {myMs !== undefined && local !== 'running' && (
        <p style={{ marginTop: 16, fontWeight: 800, color: '#2E7D32' }}>✅ 기록 제출: {(myMs / 1000).toFixed(2)}초 — 결과 대기</p>
      )}
      <p style={{ fontSize: 12, color: '#888', marginTop: 12 }}>제출 {doneCnt}/{players.length}</p>
      {isHost && doneCnt >= 1 && <button className="btn-secondary" onClick={() => update(gsRef, { phase: 'result' })} style={{ marginTop: 6 }}>결과 공개 →</button>}
    </div>
  )
}
