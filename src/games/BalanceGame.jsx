import { useState, useEffect } from 'react'
import { db, ref, onValue, update, set } from '../firebase'

const P = '#7C6BF0'
const QUESTIONS = [
  ['평생 치킨만', '평생 피자만'], ['돈 많은 백수', '박봉의 열정 직장'], ['과거로 여행', '미래로 여행'],
  ['날 수 있기', '투명인간 되기'], ['말 잘하기', '글 잘 쓰기'], ['여름만 계속', '겨울만 계속'],
  ['산으로 휴가', '바다로 휴가'], ['아침형 인간', '저녁형 인간'], ['탕수육 부먹', '탕수육 찍먹'],
  ['민초 좋아', '민초 싫어'], ['연봉 높고 야근', '연봉 낮고 칼퇴'], ['유명하지만 욕먹기', '평범하고 편하기'],
  ['짜장', '짬뽕'], ['고백하기', '고백받기'], ['평생 반팔', '평생 긴팔'],
]
function shuffle(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[b[i], b[j]] = [b[j], b[i]] } return b }

export default function BalanceGame({ roomCode, playerId, players, isHost, onEndGame }) {
  const [gs, setGs] = useState(null)
  const gsRef = ref(db, `rooms/${roomCode}/gameState`)
  useEffect(() => { const u = onValue(gsRef, s => setGs(s.val())); return () => u() }, [roomCode])
  useEffect(() => { if (!gs && isHost) set(gsRef, { phase: 'play', deck: shuffle(QUESTIONS.map((_, i) => i)), qi: 0, choices: {}, reveal: false }) }, [gs, isHost])

  const getName = id => players.find(p => p.id === id)?.name || '?'
  const fresh = () => ({ phase: 'play', deck: shuffle(QUESTIONS.map((_, i) => i)), qi: 0, choices: {}, reveal: false })
  const pick = async (side) => { if (!gs.reveal) await update(ref(db, `rooms/${roomCode}/gameState/choices`), { [playerId]: side }) }
  const next = async () => { const ni = gs.qi + 1; if (ni >= gs.deck.length) return update(gsRef, { phase: 'end' }); update(gsRef, { qi: ni, choices: {}, reveal: false }) }

  if (!gs) return <div className="card" style={{ padding: 40, textAlign: 'center' }}>준비 중...</div>
  const Head = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>⚖️ 밸런스 게임</h2>
      <button className="btn-secondary" onClick={onEndGame} style={{ padding: '4px 12px', fontSize: 12 }}>로비로</button>
    </div>
  )
  if (gs.phase === 'end') return (
    <div className="card" style={{ textAlign: 'center' }}><Head /><p style={{ fontSize: 40 }}>🎉</p><p style={{ fontWeight: 800, fontSize: 18 }}>밸런스 게임 끝!</p>
      {isHost && <button className="btn-primary" onClick={() => set(gsRef, fresh())} style={{ marginTop: 12 }}>🔄 다시하기</button>}
      <button className="btn-secondary" onClick={onEndGame} style={{ display: 'block', margin: '10px auto 0' }}>로비로</button></div>
  )

  const q = QUESTIONS[gs.deck[gs.qi]]
  const choices = gs.choices || {}
  const myChoice = choices[playerId]
  const cnt = [0, 1].map(s => Object.values(choices).filter(v => v === s).length)
  const voters = s => Object.entries(choices).filter(([, v]) => v === s).map(([id]) => getName(id))
  return (
    <div className="card"><Head />
      <p style={{ textAlign: 'center', fontSize: 12, color: '#888' }}>{gs.qi + 1} / {gs.deck.length}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
        {[0, 1].map(s => (
          <button key={s} onClick={() => pick(s)} disabled={gs.reveal}
            style={{ padding: '26px 12px', borderRadius: 18, border: '3px solid', borderColor: myChoice === s ? P : '#eee',
              background: myChoice === s ? '#F0EDFE' : '#fff', fontWeight: 800, fontSize: 16, boxShadow: 'none', color: '#322C4E', cursor: gs.reveal ? 'default' : 'pointer' }}>
            {q[s]}
            {gs.reveal && <div style={{ marginTop: 8, fontSize: 22, color: P }}>{cnt[s]}표</div>}
            {gs.reveal && <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{voters(s).join(', ')}</div>}
          </button>
        ))}
      </div>
      <p style={{ textAlign: 'center', fontSize: 12, color: '#888', marginTop: 10 }}>선택 {Object.keys(choices).length}/{players.length}</p>
      {isHost && (gs.reveal
        ? <button className="btn-primary" onClick={next} style={{ width: '100%', marginTop: 8 }}>{gs.qi + 1 >= gs.deck.length ? '끝내기 🏁' : '다음 질문 →'}</button>
        : <button className="btn-primary" onClick={() => update(gsRef, { reveal: true })} style={{ width: '100%', marginTop: 8 }}>결과 공개 (돌아가며 이유 말하기)</button>)}
    </div>
  )
}
