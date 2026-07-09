import { useState, useEffect, useRef } from 'react'
import { db, ref, onValue, update, set } from '../firebase'

const P = '#7C6BF0'

export default function Reaction({ roomCode, playerId, players, isHost, onEndGame }) {
  const [gs, setGs] = useState(null)
  const [local, setLocal] = useState('idle')
  const goPerf = useRef(0)
  const gsRef = ref(db, `rooms/${roomCode}/gameState`)

  useEffect(() => { const u = onValue(gsRef, s => setGs(s.val())); return () => u() }, [roomCode])
  useEffect(() => { if (!gs && isHost) set(gsRef, { phase: 'ready' }) }, [gs, isHost])

  useEffect(() => {
    if (gs?.phase === 'armed') {
      setLocal(w => w === 'early' || w === 'done' ? w : 'wait')
      const delay = Math.max(0, gs.goAt - Date.now())
      const t = setTimeout(() => { goPerf.current = performance.now(); setLocal(w => w === 'wait' ? 'go' : w) }, delay)
      return () => clearTimeout(t)
    }
    setLocal('idle')
  }, [gs?.phase, gs?.goAt])

  const arm = () => set(gsRef, { phase: 'armed', goAt: Date.now() + 2000 + Math.random() * 4000, results: {} })
  const submit = (ms) => update(ref(db, `rooms/${roomCode}/gameState/results`), { [playerId]: ms })
  const tap = () => {
    if (local === 'wait') { setLocal('early'); submit(-1) }
    else if (local === 'go') { const ms = Math.round(performance.now() - goPerf.current); setLocal('done'); submit(ms) }
  }

  if (!gs) return <div className="card" style={{ padding: 40, textAlign: 'center' }}>준비 중...</div>
  const results = gs.results || {}
  const doneCnt = Object.keys(results).length
  const board = players.filter(p => results[p.id] !== undefined)
    .map(p => ({ ...p, ms: results[p.id] }))
    .sort((a, b) => (a.ms < 0 ? 1e9 : a.ms) - (b.ms < 0 ? 1e9 : b.ms))
  const Head = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>⚡ 반응속도</h2>
      <button className="btn-secondary" onClick={onEndGame} style={{ padding: '4px 12px', fontSize: 12 }}>로비로</button>
    </div>
  )

  if (gs.phase === 'ready' || gs.phase === 'result') {
    return (
      <div className="card" style={{ textAlign: 'center' }}><Head />
        {gs.phase === 'ready' ? (<>
          <p style={{ fontSize: 40, margin: '10px 0' }}>⚡</p>
          <p style={{ fontSize: 14, color: '#888' }}>화면이 <b style={{ color: '#2E7D32' }}>초록</b>이 되는 순간 터치! 빨간불에 누르면 실격.</p>
        </>) : (<>
          <p style={{ fontSize: 32, margin: '4px 0' }}>🏁</p>
          <div style={{ maxWidth: 300, margin: '10px auto 0', display: 'grid', gap: 5 }}>
            {board.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderRadius: 12, background: i === 0 && p.ms >= 0 ? '#F0EDFE' : '#F8F7FC', fontWeight: 700, fontSize: 13 }}>
                <span>{i + 1}. {p.name}</span><span style={{ color: p.ms < 0 ? '#E53935' : P }}>{p.ms < 0 ? '실격 💥' : p.ms + 'ms'}</span>
              </div>
            ))}
          </div>
        </>)}
        {isHost && <button className="btn-primary" onClick={arm} style={{ marginTop: 14, padding: '12px 32px' }}>{gs.phase === 'ready' ? '시작! 🚀' : '🔄 한 판 더'}</button>}
        {!isHost && gs.phase === 'ready' && <p style={{ color: '#aaa', marginTop: 14 }}>방장 대기 중...</p>}
      </div>
    )
  }

  const bg = local === 'go' ? '#37CFBE' : local === 'early' ? '#E53935' : local === 'done' ? P : '#FF7B7B'
  const label = local === 'wait' ? '기다려...' : local === 'go' ? '지금 터치!!!' : local === 'early' ? '너무 빨랐어요 💥' : '기록 완료 ✓'
  return (
    <div className="card" style={{ textAlign: 'center' }}><Head />
      <div onClick={tap}
        style={{ height: 260, borderRadius: 20, background: bg, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', userSelect: 'none', transition: 'background 0.1s' }}>
        <span style={{ fontSize: 30, fontWeight: 900 }}>{label}</span>
        {local === 'done' && <span style={{ fontSize: 16, marginTop: 8 }}>{results[playerId]}ms</span>}
      </div>
      <p style={{ fontSize: 12, color: '#888', marginTop: 10 }}>제출 {doneCnt}/{players.length}</p>
      {isHost && <button className="btn-primary" onClick={() => update(gsRef, { phase: 'result' })} style={{ marginTop: 6 }}>결과 공개 →</button>}
    </div>
  )
}
