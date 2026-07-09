import { useState, useEffect } from 'react'
import { db, ref, onValue, update, set } from '../firebase'

const P = '#7C6BF0'
const CATS = ['치킨 브랜드', '라면 종류', '아이돌 그룹', '영화 제목', '나라 이름', '과일', '배달 음식', '김치 종류', '자동차 브랜드', '동물', '편의점 간식', '회사에서 쓰는 툴', '떡 종류', '반찬', '음료수', '지하철역 이름']
function shuffle(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[b[i], b[j]] = [b[j], b[i]] } return b }

export default function BombRelay({ roomCode, playerId, players, isHost, onEndGame }) {
  const [gs, setGs] = useState(null)
  const [, setTick] = useState(0)
  const gsRef = ref(db, `rooms/${roomCode}/gameState`)

  useEffect(() => { const u = onValue(gsRef, s => setGs(s.val())); return () => u() }, [roomCode])
  useEffect(() => { if (!gs && isHost) set(gsRef, { phase: 'ready' }) }, [gs, isHost])

  const playing = gs?.phase === 'play'
  const exploded = playing && Date.now() >= gs.bombAt
  useEffect(() => {
    if (!playing || exploded) return
    const t = setInterval(() => setTick(x => x + 1), 200)
    return () => clearInterval(t)
  }, [playing, exploded])

  const startRound = () => set(gsRef, {
    phase: 'play',
    category: CATS[Math.floor(Math.random() * CATS.length)],
    order: shuffle(players.map(p => p.id)),
    turnIdx: 0,
    bombAt: Date.now() + 15000 + Math.random() * 30000,
  })
  const pass = () => update(gsRef, { turnIdx: gs.turnIdx + 1 })

  if (!gs) return <div className="card" style={{ padding: 40, textAlign: 'center' }}>준비 중...</div>
  const getName = id => players.find(p => p.id === id)?.name || '?'
  const holder = playing ? gs.order[gs.turnIdx % gs.order.length] : null
  const myTurn = holder === playerId
  const Head = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>💣 폭탄 단어 릴레이</h2>
      <button className="btn-secondary" onClick={onEndGame} style={{ padding: '4px 12px', fontSize: 12 }}>로비로</button>
    </div>
  )

  if (gs.phase === 'ready') return (
    <div className="card" style={{ textAlign: 'center' }}><Head />
      <p style={{ fontSize: 40, margin: '10px 0' }}>💣</p>
      <p style={{ fontSize: 13, color: '#888' }}>제시 카테고리의 단어를 <b>말로</b> 외치고 넘기세요. 폭탄이 언제 터질지는 아무도 몰라요!</p>
      {isHost ? <button className="btn-primary" onClick={startRound} style={{ marginTop: 14 }}>시작! 🚀</button> : <p style={{ color: '#aaa', marginTop: 14 }}>방장 대기 중...</p>}
    </div>
  )

  return (
    <div className="card" style={{ textAlign: 'center' }}><Head />
      <span style={{ fontSize: 13, fontWeight: 800, color: '#5B4BD6', background: '#F0EDFE', borderRadius: 20, padding: '4px 14px' }}>주제: {gs.category}</span>
      {!exploded ? (<>
        <p style={{ fontSize: 60, margin: '16px 0 4px', animation: 'bob 0.5s ease-in-out infinite' }}>💣</p>
        <p style={{ fontWeight: 900, fontSize: 20 }}>{getName(holder)}{myTurn ? ' (나!)' : ''} 차례</p>
        {myTurn
          ? <button className="btn-primary" onClick={pass} style={{ marginTop: 12, padding: '14px 36px', fontSize: 17 }}>말했다! 넘기기 →</button>
          : <p style={{ fontSize: 13, color: '#888', marginTop: 12 }}>단어를 외치면 본인이 직접 넘겨요</p>}
      </>) : (<>
        <p style={{ fontSize: 60, margin: '16px 0 4px' }}>💥</p>
        <p style={{ fontWeight: 900, fontSize: 20, color: '#E53935' }}>{getName(holder)} 폭발! 술래!</p>
        {isHost && <button className="btn-primary" onClick={startRound} style={{ marginTop: 12 }}>🔄 다음 라운드</button>}
      </>)}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 16 }}>
        {gs.order.map((id, i) => {
          const cur = i === gs.turnIdx % gs.order.length
          return <span key={id} style={{ fontSize: 12, fontWeight: 800, borderRadius: 20, padding: '4px 12px',
            background: cur ? (exploded ? '#FFEBEE' : P) : '#F8F7FC', color: cur ? (exploded ? '#E53935' : '#fff') : '#948CB6' }}>
            {getName(id)}{cur ? ' 💣' : ''}</span>
        })}
      </div>
    </div>
  )
}
