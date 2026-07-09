import { useState, useEffect, useRef } from 'react'
import { db, ref, onValue, update, set, push, remove } from '../firebase'

const P = '#7C6BF0'
const WORDS = ['사과', '자전거', '무지개', '눈사람', '로봇', '기린', '피자', '우산', '안경', '비행기', '고래', '선인장', '케이크', '유령', '왕관', '나비', '축구공', '커피', '치킨', '라면', '거북이', '문어', '헬리콥터', '병아리', '아이스크림', '등대', '해바라기', '롤러코스터', '지하철', '냉장고', '세탁기', '드론', '마이크', '기타', '낙타', '펭귄', '떡볶이', '김밥', '태권도', '눈썰매']
const COLORS = ['#322C4E', '#E53935', '#1E88E5', '#43A047', '#FB8C00', '#7C6BF0']
const W = 600, H = 400
const norm = s => (s || '').replace(/\s/g, '').toLowerCase()
function pick3() { const a = [...WORDS]; const out = []; for (let i = 0; i < 3; i++) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]); return out }

export default function DrawGuess({ roomCode, playerId, players, isHost, onEndGame }) {
  const [gs, setGs] = useState(null)
  const [guess, setGuess] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const canvasRef = useRef(null)
  const strokeRef = useRef(null)
  const lastPush = useRef(0)
  const base = `rooms/${roomCode}/gameState`
  const gsRef = ref(db, base)

  useEffect(() => { const u = onValue(gsRef, s => setGs(s.val())); return () => u() }, [roomCode])
  useEffect(() => { if (!gs && isHost) set(gsRef, { phase: 'lobby', drawIdx: -1, scores: {} }) }, [gs, isHost])

  const order = [...players].sort((a, b) => (a.order || 0) - (b.order || 0))
  const drawerId = gs?.drawerId
  const amDrawer = drawerId === playerId
  const getName = id => players.find(p => p.id === id)?.name || '?'

  const drawStroke = (ctx, d) => {
    const pts = d.p || []
    if (pts.length < 1) return
    ctx.strokeStyle = d.c; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(pts[0][0] * W, pts[0][1] * H)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * W, pts[i][1] * H)
    ctx.stroke()
  }
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H)
    Object.values(gs?.strokes || {}).forEach(d => drawStroke(ctx, d))
    if (strokeRef.current) drawStroke(ctx, strokeRef.current.d)
  }, [gs?.strokes, gs?.phase])

  const toXY = e => {
    const r = canvasRef.current.getBoundingClientRect()
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]
  }
  const down = e => {
    if (!amDrawer || gs?.phase !== 'draw') return
    e.target.setPointerCapture(e.pointerId)
    const k = push(ref(db, base + '/strokes')).key
    strokeRef.current = { k, d: { c: color, p: [toXY(e)] } }
  }
  const move = e => {
    if (!strokeRef.current) return
    strokeRef.current.d.p.push(toXY(e))
    const ctx = canvasRef.current.getContext('2d')
    drawStroke(ctx, { ...strokeRef.current.d, p: strokeRef.current.d.p.slice(-2) })
    if (Date.now() - lastPush.current > 200) {
      lastPush.current = Date.now()
      set(ref(db, `${base}/strokes/${strokeRef.current.k}`), strokeRef.current.d)
    }
  }
  const up = () => {
    if (!strokeRef.current) return
    set(ref(db, `${base}/strokes/${strokeRef.current.k}`), strokeRef.current.d)
    strokeRef.current = null
  }

  const nextRound = () => {
    const ni = ((gs?.drawIdx ?? -1) + 1) % order.length
    update(gsRef, { phase: 'pick', drawIdx: ni, drawerId: order[ni].id, choices: pick3(), word: null, winnerId: null, strokes: null, guesses: null })
  }
  const chooseWord = w => update(gsRef, { phase: 'draw', word: w, choices: null })
  const submitGuess = async () => {
    const g = guess.trim()
    if (!g || amDrawer) return
    setGuess('')
    if (norm(g) === norm(gs.word)) {
      const sc = { ...(gs.scores || {}) }
      sc[playerId] = (sc[playerId] || 0) + 2
      sc[drawerId] = (sc[drawerId] || 0) + 1
      await update(gsRef, { phase: 'correct', winnerId: playerId, scores: sc })
    } else {
      push(ref(db, base + '/guesses'), { name: getName(playerId), text: g })
    }
  }
  const skip = () => update(gsRef, { phase: 'correct', winnerId: null })

  if (!gs) return <div className="card" style={{ padding: 40, textAlign: 'center' }}>준비 중...</div>
  const feed = Object.values(gs.guesses || {}).slice(-6)
  const scoreBoard = order.map(p => ({ ...p, s: (gs.scores || {})[p.id] || 0 })).sort((a, b) => b.s - a.s)
  const Head = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>🎨 그림 맞히기</h2>
      <button className="btn-secondary" onClick={onEndGame} style={{ padding: '4px 12px', fontSize: 12 }}>로비로</button>
    </div>
  )

  if (gs.phase === 'lobby') return (
    <div className="card" style={{ textAlign: 'center' }}><Head />
      <p style={{ fontSize: 40, margin: '10px 0' }}>🎨</p>
      <p style={{ fontSize: 13, color: '#888' }}>한 명이 그리면 나머지가 맞혀요. 맞히면 +2, 그린 사람 +1.</p>
      {isHost ? <button className="btn-primary" onClick={nextRound} style={{ marginTop: 14 }}>시작! 🚀</button> : <p style={{ color: '#aaa', marginTop: 14 }}>방장 대기 중...</p>}
    </div>
  )

  return (
    <div className="card"><Head />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>✏️ {getName(drawerId)} 차례</span>
        <span style={{ fontSize: 14, fontWeight: 900, color: P }}>
          {gs.phase === 'draw' && (amDrawer ? gs.word : '○'.repeat((gs.word || '').length) + ` (${(gs.word || '').length}글자)`)}
          {gs.phase === 'correct' && `정답: ${gs.word || '?'}`}
        </span>
      </div>

      {gs.phase === 'pick' && (
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          {amDrawer ? (<>
            <p style={{ fontWeight: 800, marginBottom: 12 }}>그릴 단어를 고르세요</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {(gs.choices || []).map(w => <button key={w} className="btn-primary" onClick={() => chooseWord(w)} style={{ padding: '12px 22px' }}>{w}</button>)}
            </div>
          </>) : <p style={{ color: '#888' }}>🎨 {getName(drawerId)}님이 단어를 고르는 중...</p>}
        </div>
      )}

      {(gs.phase === 'draw' || gs.phase === 'correct') && (<>
        <canvas ref={canvasRef} width={W} height={H}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
          style={{ width: '100%', borderRadius: 14, border: '2px solid #EDE9FB', touchAction: 'none', cursor: amDrawer && gs.phase === 'draw' ? 'crosshair' : 'default', background: '#fff' }} />
        {amDrawer && gs.phase === 'draw' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            {COLORS.map(c => <button key={c} onClick={() => setColor(c)} aria-label={c}
              style={{ width: 26, height: 26, borderRadius: '50%', background: c, padding: 0, border: color === c ? '3px solid #FFC44D' : '3px solid transparent', boxShadow: 'none' }} />)}
            <button className="btn-secondary" onClick={() => remove(ref(db, base + '/strokes'))} style={{ padding: '4px 12px', fontSize: 12 }}>🧹 지우기</button>
            {isHost && <button className="btn-secondary" onClick={skip} style={{ padding: '4px 12px', fontSize: 12, marginLeft: 'auto' }}>포기/스킵</button>}
          </div>
        )}
        {!amDrawer && gs.phase === 'draw' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input value={guess} onChange={e => setGuess(e.target.value)} placeholder="정답 입력!"
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submitGuess() }} style={{ flex: 1 }} />
            <button className="btn-primary" onClick={submitGuess} style={{ padding: '10px 20px' }}>제출</button>
          </div>
        )}
        {gs.phase === 'draw' && feed.length > 0 && (
          <p style={{ fontSize: 12, color: '#948CB6', marginTop: 6 }}>{feed.map((g, i) => <span key={i} style={{ marginRight: 10 }}>{g.name}: {g.text}</span>)}</p>
        )}
        {gs.phase === 'correct' && (
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <p style={{ fontWeight: 900, fontSize: 17 }}>{gs.winnerId ? `🎉 ${getName(gs.winnerId)} 정답!` : '⏭️ 스킵!'}</p>
            {isHost && <button className="btn-primary" onClick={nextRound} style={{ marginTop: 8 }}>다음 사람 ✏️ →</button>}
          </div>
        )}
      </>)}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        {scoreBoard.map(p => (
          <span key={p.id} style={{ fontSize: 11, fontWeight: 800, background: p.id === drawerId ? '#F0EDFE' : '#F8F7FC', color: '#5B4BD6', borderRadius: 20, padding: '3px 10px' }}>
            {p.id === drawerId ? '✏️ ' : ''}{p.name} {p.s}
          </span>
        ))}
      </div>
    </div>
  )
}
