import { useState, useEffect } from 'react'
import { db, ref, onValue, update, set } from '../firebase'

const P = '#7C6BF0'
function shuffle(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[b[i], b[j]] = [b[j], b[i]] } return b }

export default function TwoTruths({ roomCode, playerId, players, isHost, onEndGame }) {
  const [gs, setGs] = useState(null)
  const [f, setF] = useState(['', '', ''])
  const [lieIdx, setLieIdx] = useState(2)
  const [vote, setVote] = useState(null)
  const gsRef = ref(db, `rooms/${roomCode}/gameState`)

  useEffect(() => { const u = onValue(gsRef, s => setGs(s.val())); return () => u() }, [roomCode])
  useEffect(() => { if (!gs && isHost) set(gsRef, { phase: 'input', entries: {} }) }, [gs, isHost])
  useEffect(() => { setVote(null) }, [gs?.curIdx, gs?.phase])

  const getName = id => players.find(p => p.id === id)?.name || '?'
  const entries = gs?.entries || {}
  const submitted = !!entries[playerId]

  const submit = async () => {
    if (f.some(x => !x.trim())) return
    const items = shuffle(f.map((t, i) => ({ t: t.trim(), lie: i === lieIdx })))
    await update(ref(db, `rooms/${roomCode}/gameState/entries`), { [playerId]: { items } })
  }
  const startPresent = async () => update(gsRef, { phase: 'present', order: shuffle(Object.keys(entries)), curIdx: 0, votes: {} })
  const castVote = async (i) => { setVote(i); await update(ref(db, `rooms/${roomCode}/gameState/votes`), { [playerId]: i }) }
  const proceed = async () => {
    if (gs.phase === 'present') return update(gsRef, { phase: 'reveal' })
    const ni = gs.curIdx + 1
    if (ni >= gs.order.length) return update(gsRef, { phase: 'end' })
    update(gsRef, { phase: 'present', curIdx: ni, votes: {} })
  }

  if (!gs) return <div className="card" style={{ padding: 40, textAlign: 'center' }}>준비 중...</div>
  const Head = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>🕵️ 투 트루스 원 라이</h2>
      <button className="btn-secondary" onClick={onEndGame} style={{ padding: '4px 12px', fontSize: 12 }}>로비로</button>
    </div>
  )

  if (gs.phase === 'end') return (
    <div className="card" style={{ textAlign: 'center' }}><Head /><p style={{ fontSize: 40 }}>🎉</p>
      <p style={{ fontWeight: 800, fontSize: 18 }}>모두의 거짓말 공개 완료!</p>
      {isHost && <button className="btn-primary" onClick={() => set(gsRef, { phase: 'input', entries: {} })} style={{ marginTop: 12 }}>🔄 다시하기</button>}
      <button className="btn-secondary" onClick={onEndGame} style={{ display: 'block', margin: '10px auto 0' }}>로비로</button></div>
  )

  if (gs.phase === 'input') {
    const doneCnt = Object.keys(entries).length
    return (
      <div className="card"><Head />
        {!submitted ? (
          <div>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>나에 대한 문장 3개 — 진실 2, 거짓 1. 아래에서 <b>거짓</b>을 골라 표시하세요.</p>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input value={f[i]} onChange={e => setF(f.map((v, j) => j === i ? e.target.value : v))} placeholder={`문장 ${i + 1}`} maxLength={40} style={{ flex: 1 }} />
                <button onClick={() => setLieIdx(i)} style={{ padding: '8px 12px', fontSize: 12, borderRadius: 12, border: '2px solid', borderColor: lieIdx === i ? P : '#ddd', background: lieIdx === i ? P : '#fff', color: lieIdx === i ? '#fff' : '#999', fontWeight: 800, boxShadow: 'none' }}>거짓</button>
              </div>
            ))}
            <button className="btn-primary" onClick={submit} style={{ width: '100%', marginTop: 8 }}>제출</button>
          </div>
        ) : <p style={{ textAlign: 'center', color: '#2E7D32', fontWeight: 700 }}>✅ 제출 완료 — 대기 중 ({doneCnt}/{players.length})</p>}
        {isHost && doneCnt >= 1 && <button className="btn-primary" onClick={startPresent} style={{ width: '100%', marginTop: 10 }}>발표 시작 ({doneCnt}명) →</button>}
      </div>
    )
  }

  const curId = gs.order?.[gs.curIdx]
  const cur = entries[curId]
  const votes = gs.votes || {}
  const isMe = curId === playerId
  const lieRealIdx = cur.items.findIndex(x => x.lie)
  const tally = {}; Object.values(votes).forEach(v => tally[v] = (tally[v] || 0) + 1)
  return (
    <div className="card"><Head />
      <p style={{ textAlign: 'center', fontSize: 13, color: '#888' }}>{gs.curIdx + 1} / {gs.order.length}</p>
      <p style={{ textAlign: 'center', fontWeight: 800, fontSize: 18, marginBottom: 12 }}>{getName(curId)}님의 3문장 중 거짓은?</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {cur.items.map((it, i) => {
          const revealed = gs.phase === 'reveal', picked = vote === i, isLie = i === lieRealIdx
          return (
            <button key={i} onClick={() => gs.phase === 'present' && !isMe && castVote(i)} disabled={gs.phase !== 'present' || isMe}
              style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 14, fontSize: 14, fontWeight: 600, boxShadow: 'none',
                border: '2px solid', borderColor: revealed ? (isLie ? '#E53935' : '#ddd') : picked ? P : '#eee',
                background: revealed ? (isLie ? '#FFEBEE' : '#fff') : picked ? '#F0EDFE' : '#fff', color: '#322C4E',
                cursor: (gs.phase === 'present' && !isMe) ? 'pointer' : 'default' }}>
              {it.t}{revealed && isLie ? ' ❌ 거짓!' : ''}{revealed && tally[i] ? ` · ${tally[i]}표` : ''}
            </button>
          )
        })}
      </div>
      {isMe && gs.phase === 'present' && <p style={{ textAlign: 'center', color: '#888', fontSize: 12, marginTop: 8 }}>내 차례 — 남들이 거짓을 맞히는 중</p>}
      {isHost && <button className="btn-primary" onClick={proceed} style={{ width: '100%', marginTop: 12 }}>
        {gs.phase === 'present' ? '정답 공개' : (gs.curIdx + 1 >= gs.order.length ? '끝내기 🏁' : '다음 사람 →')}</button>}
    </div>
  )
}
