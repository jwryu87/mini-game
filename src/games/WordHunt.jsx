import { useState, useEffect } from 'react'
import { db, ref, onValue, update, set } from '../firebase'
import { DICT, DICT_SET } from './wordhuntDict'

const P = '#7C6BF0'
const DUR = 120000
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]

function shuffle(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[b[i], b[j]] = [b[j], b[i]] } return b }
function boardSizeFor(n) { return n <= 1 ? 5 : n <= 6 ? 6 : 7 }
function genBoard(size) {
  const cells = Array(size * size).fill(null)
  const pool = shuffle(DICT.filter(w => w.length >= 2 && w.length <= 4))
  let seeded = 0
  const maxSeeds = Math.floor(size * size / 2)
  for (const word of pool) {
    if (seeded >= maxSeeds) break
    for (let t = 0; t < 25; t++) {
      const start = Math.floor(Math.random() * size * size)
      if (cells[start] !== null && cells[start] !== word[0]) continue
      const path = [start]
      const used = new Set([start])
      let ok = true
      for (let i = 1; i < word.length; i++) {
        const cur = path[i - 1], r = Math.floor(cur / size), c = cur % size
        const opts = shuffle(DIRS
          .map(([dr, dc]) => [r + dr, c + dc])
          .filter(([nr, nc]) => nr >= 0 && nc >= 0 && nr < size && nc < size)
          .map(([nr, nc]) => nr * size + nc)
          .filter(p => !used.has(p) && (cells[p] === null || cells[p] === word[i])))
        if (!opts.length) { ok = false; break }
        path.push(opts[0]); used.add(opts[0])
      }
      if (ok) { path.forEach((p, i) => { cells[p] = word[i] }); seeded++; break }
    }
  }
  const syls = DICT.join('').split('')
  for (let i = 0; i < cells.length; i++) if (cells[i] === null) cells[i] = syls[Math.floor(Math.random() * syls.length)]
  return cells
}
const ptsFor = w => w.length >= 4 ? 3 : w.length === 3 ? 2 : 1

export default function WordHunt({ roomCode, playerId, players, isHost, onEndGame }) {
  const [gs, setGs] = useState(null)
  const [sel, setSel] = useState([])
  const [msg, setMsg] = useState('')
  const [sizeChoice, setSizeChoice] = useState('auto')
  const [, setTick] = useState(0)
  const gsRef = ref(db, `rooms/${roomCode}/gameState`)

  useEffect(() => { const u = onValue(gsRef, s => setGs(s.val())); return () => u() }, [roomCode])
  useEffect(() => { if (!gs && isHost) set(gsRef, { phase: 'ready' }) }, [gs, isHost])

  const now = Date.now()
  const running = gs?.phase === 'run'
  const stage = !running ? 'ready' : now < gs.startAt ? 'count' : now < gs.endAt ? 'play' : 'end'
  useEffect(() => {
    if (stage !== 'count' && stage !== 'play') return
    const t = setInterval(() => setTick(x => x + 1), 400)
    return () => clearInterval(t)
  }, [stage])
  useEffect(() => { if (stage !== 'play') { setSel([]); setMsg('') } }, [stage])

  const size = gs?.size || 5
  const board = gs?.board || []
  const found = gs?.found || {}
  const myFound = found[playerId] || {}
  const getName = id => players.find(p => p.id === id)?.name || '?'

  const startGame = () => {
    const sz = sizeChoice === 'auto' ? boardSizeFor(players.length) : sizeChoice
    set(gsRef, { phase: 'run', size: sz, board: genBoard(sz), startAt: Date.now() + 3000, endAt: Date.now() + 3000 + DUR, found: {} })
  }
  const tap = (i) => {
    if (stage !== 'play') return
    if (sel.length === 0) return setSel([i])
    const last = sel[sel.length - 1]
    if (i === last) return setSel(sel.slice(0, -1))
    if (sel.includes(i)) return
    const adj = Math.abs(Math.floor(i / size) - Math.floor(last / size)) <= 1 && Math.abs(i % size - last % size) <= 1
    setSel(adj ? [...sel, i] : [i])
  }
  const submit = async () => {
    const word = sel.map(i => board[i]).join('')
    setSel([])
    if (word.length < 2) return setMsg('2글자 이상 이어주세요')
    if (!DICT_SET.has(word)) return setMsg(`"${word}"는 사전에 없어요`)
    if (myFound[word]) return setMsg(`"${word}" 이미 찾았어요`)
    const pts = ptsFor(word)
    setMsg(`✅ ${word} +${pts}점!`)
    await update(ref(db, `rooms/${roomCode}/gameState/found/${playerId}`), { [word]: pts })
    await update(gsRef, { lastFind: { name: getName(playerId), pts, ts: Date.now() } })
  }

  if (!gs) return <div className="card" style={{ padding: 40, textAlign: 'center' }}>준비 중...</div>
  const scoreOf = m => Object.values(m || {}).reduce((a, b) => a + b, 0)
  const board2 = players.map(p => ({ ...p, words: found[p.id] || {}, score: scoreOf(found[p.id]) }))
    .sort((a, b) => b.score - a.score)
  const Head = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>🔠 단어 사냥{running ? ` · ${size}x${size}` : ''}</h2>
      <button className="btn-secondary" onClick={onEndGame} style={{ padding: '4px 12px', fontSize: 12 }}>로비로</button>
    </div>
  )

  const resolvedSize = sizeChoice === 'auto' ? boardSizeFor(players.length) : sizeChoice
  if (stage === 'ready') return (
    <div className="card" style={{ textAlign: 'center' }}><Head />
      <p style={{ fontSize: 40, margin: '8px 0' }}>🔠</p>
      <p style={{ fontSize: 13, color: '#888', lineHeight: 1.7 }}>
        붙어 있는 글자(대각선 OK)를 이어 <b>사전 단어</b>를 만들어요.<br />
        2음절 1점, 3음절 2점, 4음절+ 3점 — 2분 동안 최다 득점!
      </p>
      {isHost ? (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 12, color: '#948CB6', marginBottom: 6 }}>보드 크기 (클수록 숨은 단어 많음)</p>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[['auto', '자동'], [5, '5×5'], [7, '7×7'], [10, '10×10']].map(([v, label]) => (
              <button key={String(v)} onClick={() => setSizeChoice(v)}
                style={{ padding: '7px 14px', borderRadius: 12, fontSize: 13, fontWeight: 800, boxShadow: 'none', cursor: 'pointer',
                  border: '2px solid', borderColor: sizeChoice === v ? P : '#EDE9FB',
                  background: sizeChoice === v ? '#F0EDFE' : '#fff', color: sizeChoice === v ? '#5B4BD6' : '#948CB6' }}>{label}</button>
            ))}
          </div>
          <button className="btn-primary" onClick={startGame} style={{ marginTop: 12, padding: '12px 32px' }}>시작! 🚀 ({resolvedSize}×{resolvedSize})</button>
        </div>
      ) : <p style={{ color: '#aaa', marginTop: 12 }}>방장 대기 중...</p>}
    </div>
  )
  if (stage === 'count') return (
    <div className="card" style={{ textAlign: 'center' }}><Head />
      <p style={{ fontSize: 64, fontWeight: 900, color: P, margin: '30px 0' }}>{Math.ceil((gs.startAt - now) / 1000)}</p>
    </div>
  )

  if (stage === 'end') return (
    <div className="card"><Head />
      <p style={{ textAlign: 'center', fontSize: 32, margin: '4px 0' }}>🏁</p>
      {board2[0] && <p style={{ textAlign: 'center', fontWeight: 900, fontSize: 18 }}>우승: {board2[0].name} ({board2[0].score}점)</p>}
      <div style={{ maxWidth: 380, margin: '12px auto 0', display: 'grid', gap: 8 }}>
        {board2.map((p, i) => (
          <div key={p.id} style={{ padding: '8px 12px', borderRadius: 14, background: i === 0 ? '#F0EDFE' : '#F8F7FC' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 13 }}>
              <span>{i + 1}. {p.name}</span><span style={{ color: P }}>{p.score}점 · {Object.keys(p.words).length}개</span>
            </div>
            <div style={{ fontSize: 11, color: '#948CB6', marginTop: 3 }}>{Object.keys(p.words).join(', ') || '—'}</div>
          </div>
        ))}
      </div>
      {isHost && <button className="btn-primary" onClick={startGame} style={{ width: '100%', marginTop: 12 }}>🔄 새 보드로 한 판 더</button>}
    </div>
  )

  const remain = Math.max(0, (gs.endAt - now) / 1000)
  const curWord = sel.map(i => board[i]).join('')
  return (
    <div className="card"><Head />
      <div style={{ height: 6, borderRadius: 3, background: '#EDE9FB', marginBottom: 10 }}>
        <div style={{ height: 6, borderRadius: 3, background: remain < 15 ? '#E53935' : P, width: `${(remain * 1000 / DUR) * 100}%`, transition: 'width 0.4s linear' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 4 }}>
        <span style={{ fontWeight: 900, color: remain < 15 ? '#E53935' : '#322C4E' }}>⏰ {Math.ceil(remain)}초</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#5B4BD6' }}>내 점수 {scoreOf(myFound)}점 · {Object.keys(myFound).length}개</span>
      </div>
      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: size >= 10 ? '0 1 560px' : '0 1 440px', minWidth: 280 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${size}, 1fr)`, gap: size >= 10 ? 3 : 5 }}>
            {board.map((s, i) => {
              const idx = sel.indexOf(i)
              return (
                <button key={i} onClick={() => tap(i)}
                  style={{ aspectRatio: '1', padding: 0, borderRadius: size >= 10 ? 8 : 12, fontSize: size >= 10 ? 13 : size >= 7 ? 16 : 19, fontWeight: 900, boxShadow: 'none',
                    border: '2px solid', borderColor: idx >= 0 ? P : '#EDE9FB',
                    background: idx >= 0 ? P : '#fff', color: idx >= 0 ? '#fff' : '#322C4E', position: 'relative' }}>
                  {s}
                  {idx >= 0 && <span style={{ position: 'absolute', top: 0, right: 3, fontSize: 8, opacity: 0.8 }}>{idx + 1}</span>}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0 0' }}>
            <span style={{ flex: 1, fontWeight: 900, fontSize: 17, color: P, minHeight: 24 }}>{curWord || <span style={{ color: '#C9C2E8', fontSize: 13, fontWeight: 600 }}>글자를 이어보세요</span>}</span>
            <button className="btn-secondary" onClick={() => setSel([])} style={{ padding: '7px 14px', fontSize: 13 }}>지움</button>
            <button className="btn-primary" onClick={submit} disabled={sel.length < 2} style={{ padding: '7px 18px', fontSize: 14 }}>제출</button>
          </div>
          {msg && <p style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: msg.startsWith('✅') ? '#2E7D32' : '#E53935', marginTop: 6 }}>{msg}</p>}
        </div>
        <div style={{ flex: '0 1 200px', minWidth: 170 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: '#948CB6', margin: '0 0 6px' }}>📝 내가 찾은 단어</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {Object.entries(myFound).map(([w, p]) => (
              <span key={w} style={{ fontSize: 12, fontWeight: 800, background: '#F0EDFE', color: '#5B4BD6', borderRadius: 20, padding: '3px 10px' }}>{w} +{p}</span>
            ))}
            {!Object.keys(myFound).length && <span style={{ fontSize: 12, color: '#C9C2E8' }}>아직 없음</span>}
          </div>
          {gs.lastFind && Date.now() - gs.lastFind.ts < 5000 && gs.lastFind.name !== getName(playerId) && (
            <p style={{ fontSize: 12, fontWeight: 800, color: '#E65100', marginTop: 10 }}>🔔 {gs.lastFind.name}님이 {gs.lastFind.pts}점 단어 발견!</p>
          )}
          <p style={{ fontSize: 12, fontWeight: 800, color: '#948CB6', margin: '14px 0 6px' }}>🏆 실시간 순위</p>
          <div style={{ display: 'grid', gap: 4 }}>
            {board2.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800, background: i === 0 ? '#F0EDFE' : '#F8F7FC', color: '#5B4BD6', borderRadius: 10, padding: '4px 10px' }}>
                <span>{p.name}</span><span>{p.score}점 · {Object.keys(p.words).length}개</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
