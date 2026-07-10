import { useState, useEffect } from 'react'
import { db, ref, onValue, update, set } from '../firebase'

const P = '#7C6BF0'
const mods = import.meta.glob('./kpiQuizData.local.js', { eager: true })
const KPI_QUIZ = Object.values(mods)[0]?.KPI_QUIZ || []

function shuffle(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[b[i], b[j]] = [b[j], b[i]] } return b }
function makeOptions(deck, qIdx) {
  const answer = KPI_QUIZ[qIdx].name
  const others = shuffle(KPI_QUIZ.map(x => x.name).filter(n => n !== answer)).slice(0, 3)
  return shuffle([answer, ...others])
}

export default function KpiQuiz({ roomCode, playerId, players, isHost, onEndGame }) {
  const [gs, setGs] = useState(null)
  const gsRef = ref(db, `rooms/${roomCode}/gameState`)
  useEffect(() => { const u = onValue(gsRef, s => setGs(s.val())); return () => u() }, [roomCode])
  useEffect(() => { if (!gs && isHost && KPI_QUIZ.length) set(gsRef, { phase: 'ready', scores: {} }) }, [gs, isHost])

  const Head = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>📈 지표 퀴즈</h2>
      <button className="btn-secondary" onClick={onEndGame} style={{ padding: '4px 12px', fontSize: 12 }}>로비로</button>
    </div>
  )

  if (!KPI_QUIZ.length) return (
    <div className="card" style={{ textAlign: 'center', padding: 30 }}><Head />
      <p style={{ fontSize: 32 }}>📭</p><p style={{ color: '#888', fontSize: 13 }}>퀴즈 데이터가 준비되지 않았어요.</p>
    </div>
  )
  if (!gs) return <div className="card" style={{ padding: 40, textAlign: 'center' }}>준비 중...</div>

  const getName = id => players.find(p => p.id === id)?.name || '?'
  const scores = gs.scores || {}
  const start = () => {
    const deck = shuffle(KPI_QUIZ.map((_, i) => i))
    set(gsRef, { phase: 'quiz', deck, qi: 0, options: makeOptions(deck, deck[0]), answers: {}, reveal: false, scores: {} })
  }
  const pick = async (opt) => { if (!gs.reveal) await update(ref(db, `rooms/${roomCode}/gameState/answers`), { [playerId]: opt }) }
  const reveal = async () => {
    const answer = KPI_QUIZ[gs.deck[gs.qi]].name
    const ns = { ...scores }
    Object.entries(gs.answers || {}).forEach(([pid, a]) => { if (a === answer) ns[pid] = (ns[pid] || 0) + 1 })
    await update(gsRef, { reveal: true, scores: ns })
  }
  const next = async () => {
    const ni = gs.qi + 1
    if (ni >= gs.deck.length) return update(gsRef, { phase: 'end' })
    update(gsRef, { qi: ni, options: makeOptions(gs.deck, gs.deck[ni]), answers: {}, reveal: false })
  }

  if (gs.phase === 'ready') return (
    <div className="card" style={{ textAlign: 'center' }}><Head />
      <p style={{ fontSize: 40, margin: '8px 0' }}>📈</p>
      <p style={{ fontSize: 13, color: '#888' }}>지표 정의를 보고 <b>어떤 지표인지</b> 맞혀보세요. 총 {KPI_QUIZ.length}문제, 정답 1점.</p>
      {isHost ? <button className="btn-primary" onClick={start} style={{ marginTop: 12, padding: '12px 32px' }}>시작! 🚀</button>
        : <p style={{ color: '#aaa', marginTop: 12 }}>방장 대기 중...</p>}
    </div>
  )

  if (gs.phase === 'end') {
    const board = players.map(p => ({ ...p, s: scores[p.id] || 0 })).sort((a, b) => b.s - a.s)
    return (
      <div className="card" style={{ textAlign: 'center' }}><Head />
        <p style={{ fontSize: 32, margin: '4px 0' }}>🏁</p>
        {board[0] && <p style={{ fontWeight: 900, fontSize: 18 }}>지표 마스터: {board[0].name} ({board[0].s}점)</p>}
        <div style={{ maxWidth: 300, margin: '10px auto 0', display: 'grid', gap: 5 }}>
          {board.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderRadius: 12, background: i === 0 ? '#F0EDFE' : '#F8F7FC', fontWeight: 700, fontSize: 13 }}>
              <span>{i + 1}. {p.name}</span><span style={{ color: P }}>{p.s}점</span>
            </div>
          ))}
        </div>
        {isHost && <button className="btn-primary" onClick={start} style={{ marginTop: 12 }}>🔄 다시하기</button>}
      </div>
    )
  }

  const q = KPI_QUIZ[gs.deck[gs.qi]]
  const answers = gs.answers || {}
  const myPick = answers[playerId]
  const tally = {}; Object.values(answers).forEach(a => { tally[a] = (tally[a] || 0) + 1 })
  return (
    <div className="card"><Head />
      <p style={{ textAlign: 'center', fontSize: 12, color: '#888' }}>{gs.qi + 1} / {gs.deck.length}</p>
      <div className="card" style={{ background: '#F0EDFE', boxShadow: 'none', margin: '8px 0 14px', fontSize: 14, fontWeight: 600, lineHeight: 1.7 }}>
        {q.def}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {(gs.options || []).map(opt => {
          const isAns = gs.reveal && opt === q.name
          const picked = myPick === opt
          return (
            <button key={opt} onClick={() => pick(opt)} disabled={gs.reveal}
              style={{ padding: '16px 8px', borderRadius: 16, fontWeight: 800, fontSize: 16, boxShadow: 'none', border: '3px solid',
                borderColor: isAns ? '#2E7D32' : picked ? P : '#EDE9FB',
                background: isAns ? '#E8F5E9' : picked ? '#F0EDFE' : '#fff',
                color: isAns ? '#2E7D32' : '#322C4E', cursor: gs.reveal ? 'default' : 'pointer' }}>
              {opt}{isAns ? ' ✓' : ''}{gs.reveal && tally[opt] ? ` · ${tally[opt]}명` : ''}
            </button>
          )
        })}
      </div>
      <p style={{ textAlign: 'center', fontSize: 12, color: '#888', marginTop: 8 }}>
        {gs.reveal ? '정답 공개!' : `선택 ${Object.keys(answers).length}/${players.length}`}
      </p>
      {isHost && (gs.reveal
        ? <button className="btn-primary" onClick={next} style={{ width: '100%', marginTop: 6 }}>{gs.qi + 1 >= gs.deck.length ? '결과 보기 🏁' : '다음 문제 →'}</button>
        : <button className="btn-primary" onClick={reveal} style={{ width: '100%', marginTop: 6 }}>정답 공개</button>)}
    </div>
  )
}
