import { useState, useEffect } from 'react'
import { db, ref, onValue, update, set } from '../firebase'

const P = '#7C6BF0'
const PROMPTS = [
  '매운 거 제일 잘 먹을 것 같은 순', '아침형 인간일 것 같은 순', '노래방에서 제일 신날 것 같은 순',
  '로또 되면 바로 퇴사할 것 같은 순', '무인도에서 제일 오래 살아남을 것 같은 순', '어릴 때 제일 개구쟁이였을 것 같은 순',
  '길에서 연예인 보면 제일 먼저 알아볼 것 같은 순', '요리를 제일 잘할 것 같은 순', '몰래 춤 연습해봤을 것 같은 순',
  '벌레 나오면 제일 먼저 도망갈 것 같은 순', '게임하면 제일 승부욕 불탈 것 같은 순', '헬스장 등록만 하고 안 갈 것 같은 순',
]
function shuffle(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[b[i], b[j]] = [b[j], b[i]] } return b }

export default function RankUs({ roomCode, playerId, players, isHost, onEndGame }) {
  const [gs, setGs] = useState(null)
  const [myOrder, setMyOrder] = useState([])
  const gsRef = ref(db, `rooms/${roomCode}/gameState`)

  useEffect(() => { const u = onValue(gsRef, s => setGs(s.val())); return () => u() }, [roomCode])
  useEffect(() => { if (!gs && isHost) set(gsRef, { phase: 'rank', deck: shuffle(PROMPTS.map((_, i) => i)), qi: 0, subs: {} }) }, [gs, isHost])
  useEffect(() => { setMyOrder([]) }, [gs?.qi])

  if (!gs) return <div className="card" style={{ padding: 40, textAlign: 'center' }}>준비 중...</div>
  const getName = id => players.find(p => p.id === id)?.name || '?'
  const prompt = PROMPTS[gs.deck?.[gs.qi] ?? 0]
  const subs = gs.subs || {}
  const submitted = !!subs[playerId]
  const remaining = players.filter(p => !myOrder.includes(p.id))
  const Head = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>📊 모두의 순위</h2>
      <button className="btn-secondary" onClick={onEndGame} style={{ padding: '4px 12px', fontSize: 12 }}>로비로</button>
    </div>
  )
  const submit = () => update(ref(db, `rooms/${roomCode}/gameState/subs`), { [playerId]: myOrder })
  const nextQ = () => {
    const ni = gs.qi + 1
    if (ni >= gs.deck.length) return update(gsRef, { phase: 'end' })
    update(gsRef, { phase: 'rank', qi: ni, subs: {} })
  }

  if (gs.phase === 'end') return (
    <div className="card" style={{ textAlign: 'center' }}><Head /><p style={{ fontSize: 40 }}>🎉</p><p style={{ fontWeight: 800, fontSize: 18 }}>서로에 대해 많이 알게 됐죠?</p>
      {isHost && <button className="btn-primary" onClick={() => set(gsRef, { phase: 'rank', deck: shuffle(PROMPTS.map((_, i) => i)), qi: 0, subs: {} })} style={{ marginTop: 12 }}>🔄 다시하기</button>}
      <button className="btn-secondary" onClick={onEndGame} style={{ display: 'block', margin: '10px auto 0' }}>로비로</button></div>
  )

  if (gs.phase === 'reveal') {
    const avg = players.map(p => {
      const ranks = Object.values(subs).map(o => (o || []).indexOf(p.id)).filter(i => i >= 0)
      return { ...p, avg: ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 99, firsts: Object.values(subs).filter(o => o?.[0] === p.id).length }
    }).sort((a, b) => a.avg - b.avg)
    return (
      <div className="card"><Head />
        <p style={{ textAlign: 'center', fontWeight: 800, fontSize: 16, marginBottom: 12 }}>"{prompt}"</p>
        <div style={{ maxWidth: 340, margin: '0 auto', display: 'grid', gap: 6 }}>
          {avg.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 14, background: i === 0 ? '#F0EDFE' : '#F8F7FC' }}>
              <span style={{ fontWeight: 900, color: i === 0 ? P : '#948CB6', width: 22 }}>{i + 1}</span>
              <span style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>{p.name}</span>
              <span style={{ fontSize: 11, color: '#948CB6', fontWeight: 700 }}>{p.firsts > 0 ? `1위 픽 ${p.firsts}명` : ''}</span>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', fontSize: 12, color: '#888', marginTop: 10 }}>순위 보면서 한 명씩 왜 그렇게 뽑았는지 얘기해보세요 🎤</p>
        {isHost && <button className="btn-primary" onClick={nextQ} style={{ width: '100%', marginTop: 10 }}>{gs.qi + 1 >= gs.deck.length ? '끝내기 🏁' : '다음 질문 →'}</button>}
      </div>
    )
  }

  return (
    <div className="card"><Head />
      <p style={{ textAlign: 'center', fontSize: 12, color: '#888' }}>{gs.qi + 1} / {gs.deck.length}</p>
      <p style={{ textAlign: 'center', fontWeight: 800, fontSize: 17, margin: '4px 0 12px' }}>"{prompt}"</p>
      {!submitted ? (<>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>1위부터 차례로 탭 (잘못 눌렀으면 아래 목록에서 탭해 제거)</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {remaining.map(p => (
            <button key={p.id} onClick={() => setMyOrder([...myOrder, p.id])}
              style={{ padding: '9px 16px', borderRadius: 14, border: '2px solid #EDE9FB', background: '#fff', fontWeight: 700, fontSize: 14, boxShadow: 'none', color: '#322C4E' }}>{p.name}</button>
          ))}
        </div>
        {myOrder.length > 0 && (
          <div style={{ marginTop: 12, display: 'grid', gap: 5 }}>
            {myOrder.map((id, i) => (
              <button key={id} onClick={() => setMyOrder(myOrder.filter(x => x !== id))}
                style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 12px', borderRadius: 12, background: '#F0EDFE', border: 'none', boxShadow: 'none', fontSize: 13, fontWeight: 700, color: '#322C4E', textAlign: 'left' }}>
                <span style={{ color: P, fontWeight: 900 }}>{i + 1}위</span> {getName(id)} <span style={{ marginLeft: 'auto', color: '#948CB6' }}>✕</span>
              </button>
            ))}
          </div>
        )}
        {remaining.length === 0 && <button className="btn-primary" onClick={submit} style={{ width: '100%', marginTop: 12 }}>제출 ✓</button>}
      </>) : <p style={{ textAlign: 'center', color: '#2E7D32', fontWeight: 700, padding: '20px 0' }}>✅ 제출 완료 ({Object.keys(subs).length}/{players.length})</p>}
      {isHost && Object.keys(subs).length >= 1 && <button className="btn-secondary" onClick={() => update(gsRef, { phase: 'reveal' })} style={{ width: '100%', marginTop: 10 }}>결과 공개 →</button>}
    </div>
  )
}
