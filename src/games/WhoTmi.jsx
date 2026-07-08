import { useState, useEffect } from 'react'
import { db, ref, onValue, update, set } from '../firebase'

const P = '#7C6BF0'
function shuffle(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[b[i], b[j]] = [b[j], b[i]] } return b }

export default function WhoTmi({ roomCode, playerId, players, isHost, onEndGame }) {
  const [gs, setGs] = useState(null)
  const [tmi, setTmi] = useState('')
  const [vote, setVote] = useState(null)
  const gsRef = ref(db, `rooms/${roomCode}/gameState`)
  useEffect(() => { const u = onValue(gsRef, s => setGs(s.val())); return () => u() }, [roomCode])
  useEffect(() => { if (!gs && isHost) set(gsRef, { phase: 'input', entries: {} }) }, [gs, isHost])
  useEffect(() => { setVote(null) }, [gs?.curIdx, gs?.phase])

  const getName = id => players.find(p => p.id === id)?.name || '?'
  const entries = gs?.entries || {}
  const submitted = !!entries[playerId]
  const submit = async () => { if (!tmi.trim()) return; await update(ref(db, `rooms/${roomCode}/gameState/entries`), { [playerId]: tmi.trim() }) }
  const start = async () => update(gsRef, { phase: 'guess', order: shuffle(Object.keys(entries)), curIdx: 0, votes: {} })
  const castVote = async (id) => { setVote(id); await update(ref(db, `rooms/${roomCode}/gameState/votes`), { [playerId]: id }) }
  const proceed = async () => {
    if (gs.phase === 'guess') return update(gsRef, { phase: 'reveal' })
    const ni = gs.curIdx + 1
    if (ni >= gs.order.length) return update(gsRef, { phase: 'end' })
    update(gsRef, { phase: 'guess', curIdx: ni, votes: {} })
  }

  if (!gs) return <div className="card" style={{ padding: 40, textAlign: 'center' }}>준비 중...</div>
  const Head = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>🙈 누구게 (TMI)</h2>
      <button className="btn-secondary" onClick={onEndGame} style={{ padding: '4px 12px', fontSize: 12 }}>로비로</button>
    </div>
  )
  if (gs.phase === 'end') return (
    <div className="card" style={{ textAlign: 'center' }}><Head /><p style={{ fontSize: 40 }}>🎉</p><p style={{ fontWeight: 800, fontSize: 18 }}>서로 조금 더 알게 됐네요!</p>
      {isHost && <button className="btn-primary" onClick={() => set(gsRef, { phase: 'input', entries: {} })} style={{ marginTop: 12 }}>🔄 다시하기</button>}
      <button className="btn-secondary" onClick={onEndGame} style={{ display: 'block', margin: '10px auto 0' }}>로비로</button></div>
  )

  if (gs.phase === 'input') {
    const doneCnt = Object.keys(entries).length
    return (
      <div className="card"><Head />
        {!submitted ? (
          <div>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>남들이 모를 나만의 <b>TMI</b> 하나를 익명으로 적어주세요.</p>
            <input value={tmi} onChange={e => setTmi(e.target.value)} placeholder="예: 사실 번지점프 3번 해봤다" maxLength={50} style={{ width: '100%' }} />
            <button className="btn-primary" onClick={submit} style={{ width: '100%', marginTop: 10 }}>제출</button>
          </div>
        ) : <p style={{ textAlign: 'center', color: '#2E7D32', fontWeight: 700 }}>✅ 제출 완료 ({doneCnt}/{players.length})</p>}
        {isHost && doneCnt >= 2 && <button className="btn-primary" onClick={start} style={{ width: '100%', marginTop: 10 }}>맞히기 시작 ({doneCnt}개) →</button>}
      </div>
    )
  }

  const curOwner = gs.order?.[gs.curIdx]
  const votes = gs.votes || {}
  const tally = {}; Object.values(votes).forEach(v => tally[v] = (tally[v] || 0) + 1)
  return (
    <div className="card"><Head />
      <p style={{ textAlign: 'center', fontSize: 12, color: '#888' }}>{gs.curIdx + 1} / {gs.order.length}</p>
      <div className="card" style={{ background: '#F0EDFE', boxShadow: 'none', textAlign: 'center', margin: '8px 0 14px', fontSize: 16, fontWeight: 700 }}>“{entries[curOwner]}”</div>
      <p style={{ textAlign: 'center', fontSize: 13, color: '#888', marginBottom: 8 }}>{gs.phase === 'reveal' ? '정답 공개!' : '누구의 TMI일까요?'}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {players.map(p => {
          const revealed = gs.phase === 'reveal', isOwner = p.id === curOwner
          return <button key={p.id} onClick={() => gs.phase === 'guess' && castVote(p.id)} disabled={gs.phase !== 'guess'}
            style={{ padding: '10px 16px', borderRadius: 14, fontWeight: 700, fontSize: 14, boxShadow: 'none', border: '2px solid',
              borderColor: revealed ? (isOwner ? '#2E7D32' : '#eee') : vote === p.id ? P : '#eee',
              background: revealed ? (isOwner ? '#E8F5E9' : '#fff') : vote === p.id ? '#F0EDFE' : '#fff', color: '#322C4E', cursor: gs.phase === 'guess' ? 'pointer' : 'default' }}>
            {p.name}{revealed && isOwner ? ' 🎯' : ''}{revealed && tally[p.id] ? ` ·${tally[p.id]}` : ''}</button>
        })}
      </div>
      {isHost && <button className="btn-primary" onClick={proceed} style={{ width: '100%', marginTop: 14 }}>
        {gs.phase === 'guess' ? '정답 공개' : (gs.curIdx + 1 >= gs.order.length ? '끝내기 🏁' : '다음 →')}</button>}
    </div>
  )
}
