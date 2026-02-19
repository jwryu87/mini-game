import { useState, useEffect } from 'react'
import { db, ref, onValue, update, set } from '../firebase'

const DEFAULT_TEAM_NAMES = ['홍팀', '청팀', '녹팀', '주황팀']
const TEAM_EMOJI = ['🔴', '🔵', '🟢', '🟠']
const TEAM_COLORS = ['#E53935', '#1E88E5', '#43A047', '#FB8C00']
const THROW_NAMES = ['빽도', '도', '개', '걸', '윷', '모']
const THROW_MOVES = [-1, 1, 2, 3, 4, 5]
const FINISH = 99

// Board: start bottom-RIGHT, move UP-RIGHT (counterclockwise)
const POS = {
  0:  [88, 87],  1:  [88, 71],  2:  [88, 55],  3:  [88, 39],  4:  [88, 23],
  5:  [88, 7],   6:  [72, 7],   7:  [55, 7],   8:  [38, 7],   9:  [22, 7],
  10: [8, 7],   11: [8, 23],  12: [8, 39],  13: [8, 55],  14: [8, 71],
  15: [8, 87],  16: [24, 87],  17: [40, 87],  18: [56, 87],  19: [72, 87],
  20: [76, 20],  21: [65, 32],
  22: [48, 47],
  23: [65, 62],  24: [76, 74],
  25: [20, 20],  26: [32, 32],
  27: [32, 62],  28: [20, 74],
}

const OUTER_PATH = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
// 대각선: 꼭지점 → 중심 → 반대편 꼭지점
const DIAG_FROM_5 = [5, 20, 21, 22, 27, 28, 15]    // 우상→중앙→좌하
const DIAG_FROM_10 = [10, 25, 26, 22, 23, 24]       // 좌상→중앙→우하(출발쪽)

const BOARD_LINES = [
  [0,1],[1,2],[2,3],[3,4],[4,5],
  [5,6],[6,7],[7,8],[8,9],[9,10],
  [10,11],[11,12],[12,13],[13,14],[14,15],
  [15,16],[16,17],[17,18],[18,19],[19,0],
  [5,20],[20,21],[21,22],[22,23],[23,24],[24,0],
  [10,25],[25,26],[26,22],[22,27],[27,28],[28,15],
]

function getPath(pos, diag) {
  if (diag === 'from5') {
    const idx = DIAG_FROM_5.indexOf(pos)
    if (idx >= 0) {
      const path = DIAG_FROM_5.slice(idx)
      const i15 = path.indexOf(15)
      if (i15 >= 0) return [...path.slice(0, i15), ...OUTER_PATH.slice(OUTER_PATH.indexOf(15))]
      return path
    }
    return OUTER_PATH.slice(OUTER_PATH.indexOf(pos))
  }
  if (diag === 'from10') {
    const idx = DIAG_FROM_10.indexOf(pos)
    if (idx >= 0) return DIAG_FROM_10.slice(idx)
    return OUTER_PATH.slice(OUTER_PATH.indexOf(pos))
  }
  const idx = OUTER_PATH.indexOf(pos)
  if (idx >= 0) return OUTER_PATH.slice(idx)
  return [pos]
}

function calcMove(pos, steps, diag) {
  if (pos === FINISH) return { pos: FINISH, diag: null }
  if (pos === -1) {
    if (steps <= 0) return { pos: -1, diag: null }
    if (steps >= OUTER_PATH.length) return { pos: FINISH, diag: null }
    const np = OUTER_PATH[steps]
    return { pos: np ?? FINISH, diag: null }
  }
  if (steps < 0) {
    if (diag === 'from5' || diag === 'from10') {
      const full = diag === 'from5' ? DIAG_FROM_5 : DIAG_FROM_10
      const idx = full.indexOf(pos)
      if (idx > 0) return { pos: full[idx - 1], diag }
      const outerIdx = OUTER_PATH.indexOf(pos)
      if (outerIdx > 0) return { pos: OUTER_PATH[outerIdx - 1], diag: null }
      return { pos: -1, diag: null }
    }
    const idx = OUTER_PATH.indexOf(pos)
    if (idx === 0) return { pos: FINISH, diag: null }
    if (idx < 0) return { pos: -1, diag: null }
    return { pos: OUTER_PATH[idx - 1], diag: null }
  }
  const path = getPath(pos, diag)
  if (steps >= path.length) return { pos: FINISH, diag: null }
  const np = path[steps]
  return { pos: np ?? FINISH, diag: diag }
}

// 실제 윷놀이 확률 기반 (각 막대 앞/뒤 독립 50%)
// 빽도(3.125%), 도(25%), 개(37.5%), 걸(25%), 윷(6.25%), 모(3.125%)
function throwYut() {
  const sticks = [0, 1, 2, 3].map(() => Math.random() < 0.5 ? 1 : 0)
  const flat = sticks.reduce((a, b) => a + b, 0)
  let result
  if (flat === 0) result = 5       // 모: 전부 뒤
  else if (flat === 1) {
    if (sticks[0] === 1 && sticks[1] === 0 && sticks[2] === 0 && sticks[3] === 0) result = 0 // 빽도: 첫째만 앞
    else result = 1                // 도: 하나만 앞
  }
  else if (flat === 2) result = 2  // 개: 두개 앞
  else if (flat === 3) result = 3  // 걸: 세개 앞
  else result = 4                  // 윷: 전부 앞
  return { result, sticks }
}

function toPieces(raw) {
  if (!raw) return [0, 1, 2, 3].map(() => ({ pos: -1, diag: null }))
  const arr = Array.isArray(raw) ? raw : [0, 1, 2, 3].map(i => raw[i])
  return arr.map(p => ({ pos: p?.pos ?? -1, diag: (p?.diag && p.diag !== '_') ? p.diag : null }))
}

function pieceToDB(p) {
  return { pos: p.pos, diag: p.diag || '_' }
}

function initGame(players) {
  const teams = {}
  players.forEach(p => {
    if (!teams[p.team]) {
      teams[p.team] = {
        pieces: [0, 1, 2, 3].map(() => ({ pos: -1, diag: '_' })),
        finished: 0,
      }
    }
  })
  return {
    teams,
    teamOrder: Object.keys(teams).map(Number).sort(),
    currentTeamIdx: 0,
    throwResult: null,
    pendingMoves: [],
    phase: 'throw',
    winner: null,
    log: [],
  }
}

function MoveSelector({ pendingMoves, isMyTurn, waitingCount, uniquePositions, curPieces, onMove, onSkip }) {
  const [selectedMove, setSelectedMove] = useState(null)

  useEffect(() => { setSelectedMove(null) }, [pendingMoves.length])

  if (pendingMoves.length === 1) {
    // Only 1 move → skip step 1, go directly to piece selection
    return (
      <PieceSelector
        move={pendingMoves[0]} moveIdx={0} pendingMoves={pendingMoves}
        isMyTurn={isMyTurn} waitingCount={waitingCount}
        uniquePositions={uniquePositions} curPieces={curPieces}
        onMove={onMove} onSkip={onSkip} onBack={null}
      />
    )
  }

  if (selectedMove === null) {
    return (
      <div className="yut-throw-area" style={{ padding: 16 }}>
        <p style={{ fontWeight: 700, marginBottom: 8, fontSize: 15 }}>🎯 어떤 이동을 사용할까요?</p>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 10 }}>
          사용할 윷을 먼저 선택하세요 ({pendingMoves.length}개 남음)
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {pendingMoves.map((move, idx) => {
            const steps = THROW_MOVES[move]
            return (
              <button key={idx} onClick={() => setSelectedMove(idx)} disabled={!isMyTurn}
                style={{
                  padding: '12px 20px', borderRadius: 14, border: '3px solid #E65100',
                  background: '#FFF3E0', cursor: 'pointer', fontWeight: 800,
                  fontSize: 17, color: '#E65100', transition: 'all 0.15s', minWidth: 80,
                }}
                onMouseOver={e => { e.currentTarget.style.background = '#FFE0B2'; e.currentTarget.style.transform = 'scale(1.05)' }}
                onMouseOut={e => { e.currentTarget.style.background = '#FFF3E0'; e.currentTarget.style.transform = 'scale(1)' }}
              >
                {THROW_NAMES[move]}<br />
                <span style={{ fontSize: 13 }}>({steps > 0 ? '+' : ''}{steps}칸)</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <PieceSelector
      move={pendingMoves[selectedMove]} moveIdx={selectedMove} pendingMoves={pendingMoves}
      isMyTurn={isMyTurn} waitingCount={waitingCount}
      uniquePositions={uniquePositions} curPieces={curPieces}
      onMove={onMove} onSkip={onSkip} onBack={() => setSelectedMove(null)}
    />
  )
}

function PieceSelector({ move, moveIdx, pendingMoves, isMyTurn, waitingCount, uniquePositions, curPieces, onMove, onSkip, onBack }) {
  const steps = THROW_MOVES[move]
  const canNew = steps > 0 && waitingCount > 0
  const canMove = steps > 0 ? uniquePositions : uniquePositions.filter(p => p.pos >= 0)
  const nothing = !canNew && canMove.length === 0
  const isCorner = (pos) => (pos === 5 || pos === 10) 

  return (
    <div className="yut-throw-area" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ fontWeight: 700, fontSize: 15 }}>🏃 말을 선택하세요</p>
        {onBack && (
          <button onClick={onBack}
            style={{ padding: '4px 12px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', fontSize: 12, cursor: 'pointer' }}>
            ← 다른 윷 선택
          </button>
        )}
      </div>

      <div style={{
        display: 'inline-block', padding: '6px 20px', background: '#FFF3E0',
        borderRadius: 12, marginBottom: 12, fontWeight: 800, fontSize: 18, color: '#E65100',
      }}>
        {THROW_NAMES[move]} ({steps > 0 ? '+' : ''}{steps}칸)
      </div>

      {pendingMoves.length > 1 && (
        <p style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
          남은 이동: {pendingMoves.filter((_, i) => i !== moveIdx).map(m => THROW_NAMES[m]).join(', ')}
        </p>
      )}

      <div className="piece-selector">
        {canNew && (
          <button className="piece-btn btn-gold" disabled={!isMyTurn}
            onClick={() => {
              const wi = curPieces.findIndex(p => p.pos === -1)
              if (wi >= 0) onMove(wi, moveIdx)
            }}>
            🆕 새 말 출발
          </button>
        )}
        {canMove.map(p => {
          if (isCorner(p.pos) && !p.diag && steps > 0) {
            const diagVal = p.pos === 5 ? 'from5' : 'from10'
            return (
              <div key={p.pos} style={{ display: 'flex', gap: 4, width: '100%' }}>
                <button className="piece-btn" disabled={!isMyTurn}
                  onClick={() => onMove(p.idx, moveIdx, diagVal)}
                  style={{ flex: 1, background: '#E8F5E9', border: '2px solid #43A047', color: '#2E7D32', fontWeight: 700, fontSize: 13 }}>
                  {p.count > 1 ? `🐎×${p.count}` : `🐎 말#${p.idx + 1}`}<br />↗ 지름길
                </button>
                <button className="piece-btn" disabled={!isMyTurn}
                  onClick={() => onMove(p.idx, moveIdx, null)}
                  style={{ flex: 1, background: '#E3F2FD', border: '2px solid #1E88E5', color: '#1565C0', fontWeight: 700, fontSize: 13 }}>
                  {p.count > 1 ? `🐎×${p.count}` : `🐎 말#${p.idx + 1}`}<br />→ 바깥길
                </button>
              </div>
            )
          }
          return (
            <button key={p.pos} className="piece-btn btn-primary" disabled={!isMyTurn}
              onClick={() => onMove(p.idx, moveIdx)}>
              {p.count > 1 ? `🐎×${p.count}` : `🐎 말#${p.idx + 1}`}
            </button>
          )
        })}
        {nothing && (
          <button className="piece-btn btn-secondary" disabled={!isMyTurn}
            onClick={() => onSkip(moveIdx)}>
            ⏭️ 패스
          </button>
        )}
      </div>
    </div>
  )
}

function GameChat({ roomCode, playerId, playerName }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const chatRef = ref(db, `rooms/${roomCode}/chat`)
  const listRef = { current: null }

  useEffect(() => {
    const unsub = onValue(chatRef, snap => {
      if (snap.exists()) {
        const data = snap.val()
        const arr = Object.values(data).sort((a, b) => a.ts - b.ts).slice(-50)
        setMessages(arr)
      }
    })
    return () => unsub()
  }, [roomCode])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages.length])

  const [sending, setSending] = useState(false)

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput('')
    const id = Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    await update(ref(db, `rooms/${roomCode}/chat/${id}`), {
      name: playerName, text, ts: Date.now(), pid: playerId,
    })
    setSending(false)
  }

  return (
    <div style={{ marginTop: 10, border: '1px solid #E0E0E0', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ background: '#F5F5F5', padding: '6px 10px', fontSize: 12, fontWeight: 700, color: '#666' }}>
        💬 채팅
      </div>
      <div ref={el => listRef.current = el}
        style={{ height: 120, overflow: 'auto', padding: 8, fontSize: 13, background: '#FAFAFA' }}>
        {messages.length === 0 && <div style={{ color: '#bbb', textAlign: 'center', paddingTop: 20 }}>메시지를 보내보세요!</div>}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 3, wordBreak: 'break-word', textAlign: 'left' }}>
            <span style={{ fontWeight: 700, color: m.pid === playerId ? '#C62828' : '#333' }}>{m.name}:</span>
            <span style={{ color: '#555' }}> {m.text}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid #E0E0E0' }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) send()
          }}
          placeholder="메시지 입력..."
          style={{ flex: 1, border: 'none', padding: '8px 10px', fontSize: 13, outline: 'none', borderRadius: 0 }} />
        <button onClick={send}
          style={{ padding: '8px 14px', border: 'none', background: '#C62828', color: '#FFF', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          전송
        </button>
      </div>
    </div>
  )
}

export default function YutNori({ roomCode, playerId, playerName, players, isHost, teamNames: customNames, onEndGame }) {
  const [gs, setGs] = useState(null)
  const [animPhase, setAnimPhase] = useState('idle')
  const [stickFaces, setStickFaces] = useState([false, false, false, false])

  const gsRef = ref(db, `rooms/${roomCode}/gameState`)
  const tn = (i) => `${TEAM_EMOJI[i]} ${customNames?.[i] || DEFAULT_TEAM_NAMES[i]}`

  useEffect(() => {
    const unsub = onValue(gsRef, snap => { if (snap.exists()) setGs(snap.val()) })
    return () => unsub()
  }, [roomCode])

  useEffect(() => {
    if (!gs && isHost) set(gsRef, initGame(players))
  }, [gs, isHost])

  if (!gs) return <div style={{ textAlign: 'center', padding: 40 }}>게임 준비 중...</div>

  const teamOrder = gs.teamOrder || []
  const curTeam = teamOrder[gs.currentTeamIdx || 0]
  const myTeam = players.find(p => p.id === playerId)?.team
  const isMyTurn = curTeam === myTeam
  const td = gs.teams || {}
  const pendingMoves = gs.pendingMoves || []
  const curPieces = toPieces(td[curTeam]?.pieces)

  // ---- Throw ----
  const doThrow = async () => {
    if (!isMyTurn || gs.phase !== 'throw' || animPhase !== 'idle') return
    setAnimPhase('throwing')

    const { result, sticks } = throwYut()
    const faces = sticks.map(s => s === 1)

    setTimeout(() => { setAnimPhase('landing'); setStickFaces(faces) }, 600)

    setTimeout(async () => {
      setAnimPhase('done')
      const newPending = [...pendingMoves, result]
      const extra = result === 4 || result === 5
      const sticksStr = sticks.map(s => s ? '앞' : '뒤').join('·')

      let autoSkip = false
      if (result === 0) {
        if (!curPieces.some(p => p.pos >= 0 && p.pos !== FINISH)) autoSkip = true
      }

      const logs = [...(gs.log || []).slice(-30),
        `${tn(curTeam)} ${THROW_NAMES[result]}! [${sticksStr}] (${THROW_MOVES[result] > 0 ? '+' : ''}${THROW_MOVES[result]}칸)${autoSkip ? ' → 빽도 패스' : ''}`
      ]

      if (autoSkip) {
        const remainPending = [...pendingMoves]
        if (remainPending.length > 0) {
          await update(gsRef, {
            throwResult: result, pendingMoves: remainPending,
            phase: 'move', log: logs,
          })
        } else {
          await update(gsRef, {
            throwResult: result, pendingMoves: [],
            phase: 'throw', currentTeamIdx: (gs.currentTeamIdx + 1) % teamOrder.length, log: logs,
          })
        }
      } else {
        await update(gsRef, {
          throwResult: result, pendingMoves: newPending,
          phase: extra ? 'throw' : 'move', log: logs,
        })
      }
      setTimeout(() => { setAnimPhase('idle'); setStickFaces([false, false, false, false]) }, 400)
    }, 1200)
  }

  // ---- Move (with 업기) ----
  const movePiece = async (pieceIdx, moveIdx, diagChoice) => {
    if (!isMyTurn || gs.phase !== 'move') return
    const pending = [...pendingMoves]
    const mv = pending[moveIdx]
    if (mv === undefined) return

    const piece = curPieces[pieceIdx]
    if (!piece || piece.pos === FINISH) return

    const effectiveDiag = diagChoice !== undefined ? diagChoice : piece.diag
    const steps = THROW_MOVES[mv]
    const { pos: newPos, diag: newDiag } = calcMove(piece.pos, steps, effectiveDiag)

    // 업기: pieces at same board position move together
    // BUT for pieces at -1 (waiting), only move the selected one
    let stackedIdx
    if (piece.pos >= 0) {
      stackedIdx = curPieces
        .map((p, i) => ({ ...p, i }))
        .filter(p => p.pos === piece.pos && p.pos !== FINISH)
        .map(p => p.i)
    } else {
      stackedIdx = [pieceIdx]
    }

    const updatedCurPieces = curPieces.map((p, i) =>
      stackedIdx.includes(i) ? pieceToDB({ pos: newPos, diag: newDiag }) : pieceToDB(p)
    )

    const logs = [...(gs.log || []).slice(-30)]
    if (stackedIdx.length > 1) {
      logs.push(`${tn(curTeam)} 말 ${stackedIdx.length}개가 함께 이동! 🐎🐎`)
    }

    let bonusThrow = false
    const updatedTeams = {}

    for (const [tid, tdata] of Object.entries(td)) {
      updatedTeams[tid] = { ...tdata, pieces: toPieces(tdata.pieces).map(pieceToDB) }
    }
    updatedTeams[curTeam] = { ...td[curTeam], pieces: updatedCurPieces }

    // Capture
    if (newPos !== FINISH && newPos >= 0) {
      for (const [tid, tdata] of Object.entries(updatedTeams)) {
        if (Number(tid) === curTeam) continue
        const opPieces = toPieces(tdata.pieces)
        const capturedCount = opPieces.filter(p => p.pos === newPos).length
        if (capturedCount > 0) {
          bonusThrow = true
          logs.push(`${tn(curTeam)}이 ${tn(Number(tid))} 말 ${capturedCount}개를 잡았다! 🎉`)
          updatedTeams[tid] = {
            ...tdata,
            pieces: opPieces.map(p => p.pos === newPos ? pieceToDB({ pos: -1, diag: null }) : pieceToDB(p)),
          }
        }
      }
    }

    const finCount = updatedCurPieces.filter(p => p.pos === FINISH).length
    updatedTeams[curTeam] = { ...updatedTeams[curTeam], pieces: updatedCurPieces, finished: finCount }

    pending.splice(moveIdx, 1)

    let nextPhase = pending.length > 0 ? 'move' : 'throw'
    let nextIdx = gs.currentTeamIdx
    let winner = null

    if (bonusThrow) {
      nextPhase = 'throw'
      logs.push(`${tn(curTeam)} 말을 잡아서 보너스 던지기! 🎯`)
    }
    if (finCount >= 4) {
      nextPhase = 'finished'
      winner = curTeam
      logs.push(`🏆 ${tn(curTeam)} 승리!`)
    } else if (pending.length === 0 && !bonusThrow) {
      nextIdx = (gs.currentTeamIdx + 1) % teamOrder.length
    }

    await update(gsRef, {
      teams: updatedTeams, pendingMoves: pending,
      phase: nextPhase, currentTeamIdx: nextIdx, winner, throwResult: null, log: logs,
    })
  }

  const skipMove = async (moveIdx) => {
    if (!isMyTurn || gs.phase !== 'move') return
    const pending = [...pendingMoves]
    pending.splice(moveIdx, 1)
    const logs = [...(gs.log || []).slice(-30), `${tn(curTeam)} 이동 패스`]
    let nextIdx = gs.currentTeamIdx
    if (pending.length === 0) nextIdx = (gs.currentTeamIdx + 1) % teamOrder.length
    await update(gsRef, {
      pendingMoves: pending, phase: pending.length > 0 ? 'move' : 'throw',
      currentTeamIdx: nextIdx, throwResult: null, log: logs,
    })
  }

  // ---- Board ----
  const piecesAtPos = {}
  Object.entries(td).forEach(([tid, tdata]) => {
    toPieces(tdata.pieces).forEach((p, idx) => {
      if (p.pos >= 0 && p.pos !== FINISH) {
        if (!piecesAtPos[p.pos]) piecesAtPos[p.pos] = []
        piecesAtPos[p.pos].push({ team: Number(tid), idx })
      }
    })
  })

  const board = (
    <svg viewBox="0 0 96 94" style={{ width: '100%', height: 'auto', background: '#FFF8E1', borderRadius: 16, border: '2px solid #EFEBE9' }}>
      {BOARD_LINES.map(([a, b], i) => (
        <line key={i} x1={POS[a][0]} y1={POS[a][1]} x2={POS[b][0]} y2={POS[b][1]}
          stroke="#D7CCC8" strokeWidth="1.2" />
      ))}
      {Object.entries(POS).map(([id, [x, y]]) => {
        const n = Number(id)
        const isCorner = [0, 5, 10, 15].includes(n)
        const isCenter = n === 22
        const r = isCenter ? 4 : isCorner ? 3.5 : 2.5
        return (
          <g key={id}>
            <circle cx={x} cy={y} r={r}
              fill={isCorner || isCenter ? '#EFEBE9' : '#FFF'}
              stroke="#8D6E63" strokeWidth="0.8" />
            {n === 0 && <text x={x} y={y + 1.2} textAnchor="middle" fontSize="2.8" fill="#C62828" fontWeight="bold">출발</text>}
          </g>
        )
      })}
      {Object.entries(piecesAtPos).map(([posId, pieces]) => {
        const [bx, by] = POS[posId]
        const grouped = {}
        pieces.forEach(p => {
          if (!grouped[p.team]) grouped[p.team] = []
          grouped[p.team].push(p)
        })
        const teamEntries = Object.entries(grouped)
        return teamEntries.map(([tid, tpieces], ti) => {
          const baseOx = (ti - (teamEntries.length - 1) / 2) * 6
          const count = tpieces.length
          const tIdx = Number(tid)
          const R = count > 1 ? 3.0 : 3.5
          return (
            <g key={`${tid}-${posId}`}>
              {tpieces.map((tp, pi) => {
                const dx = count > 1 ? pi * 1.2 : 0
                const dy = count > 1 ? pi * 1.8 : 0
                return (
                  <g key={pi}>
                    <circle cx={bx + baseOx + dx} cy={by - 3.5 - dy} r={R}
                      fill={TEAM_COLORS[tIdx]}
                      stroke="#FFF" strokeWidth={count > 1 ? '0.7' : '0'}
                      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }} />
                    <text x={bx + baseOx + dx} y={by - 2.2 - dy} textAnchor="middle"
                      fontSize={count > 1 ? '2.4' : '2.8'} fill="#FFF" fontWeight="bold">
                      {tp.idx + 1}
                    </text>
                  </g>
                )
              })}
            </g>
          )
        })
      })}
    </svg>
  )

  // Piece selectors
  const onBoardPieces = curPieces.map((p, i) => ({ ...p, idx: i })).filter(p => p.pos >= 0 && p.pos !== FINISH)
  const uniquePositions = []
  const seenPos = new Set()
  onBoardPieces.forEach(p => {
    if (!seenPos.has(p.pos)) {
      seenPos.add(p.pos)
      const stacked = onBoardPieces.filter(pp => pp.pos === p.pos)
      uniquePositions.push({ pos: p.pos, idx: p.idx, count: stacked.length, diag: p.diag })
    }
  })
  const waitingCount = curPieces.filter(p => p.pos === -1).length

  const stickStyle = (i) => {
    if (animPhase === 'throwing') {
      return {
        transform: `translateY(-${40 + i * 10}px) rotate(${600 + i * 120}deg) scale(0.8)`,
        transition: 'transform 0.6s cubic-bezier(0.2, 0, 0.3, 1)', opacity: 0.7,
      }
    }
    if (animPhase === 'landing' || animPhase === 'done') {
      return {
        transform: `rotate(${stickFaces[i] ? 0 : 180}deg)`,
        transition: `transform 0.3s cubic-bezier(0.5, 1.5, 0.5, 1) ${i * 0.06}s`,
      }
    }
    return {}
  }

  // ---- Controls panel ----
  const controlPanel = (
    <div>
      {isHost && (
        <div style={{ textAlign: 'right', marginBottom: 4 }}>
          <button onClick={onEndGame}
            style={{ padding: '3px 10px', fontSize: 11, border: '1px solid #ccc', background: '#fff', borderRadius: 6, color: '#888', cursor: 'pointer' }}>
            ← 로비
          </button>
        </div>
      )}
      {/* Score */}
      <div className="score-board" style={{ marginBottom: 8 }}>
        {teamOrder.map(tid => (
          <div key={tid} className="score-item" style={{
            background: curTeam === tid ? TEAM_COLORS[tid] + '20' : '#F5F5F5',
            border: `2px solid ${curTeam === tid ? TEAM_COLORS[tid] : 'transparent'}`,
            color: TEAM_COLORS[tid], fontSize: 13, padding: '6px 10px',
          }}>
            {tn(tid)} {td[tid]?.finished || 0}/4{curTeam === tid && ' ◀'}
          </div>
        ))}
      </div>


      {/* Turn */}
      <div className="turn-info" style={{
        background: TEAM_COLORS[curTeam] + '15', color: TEAM_COLORS[curTeam],
        fontSize: 16, padding: 10, margin: '8px 0',
      }}>
        {gs.phase === 'finished'
          ? `🏆 ${tn(gs.winner)} 승리!`
          : `${tn(curTeam)}의 차례 ${isMyTurn ? '(내 차례!)' : ''}`}
      </div>

      {/* Throw */}
      {gs.phase === 'throw' && (
        <div className="yut-throw-area" style={{ padding: 16 }}>
          <div style={{ position: 'relative', height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="yut-sticks">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className={`yut-stick ${stickFaces[i] ? 'front' : 'back'}`} style={stickStyle(i)} />
              ))}
            </div>
            {animPhase === 'throwing' && (
              <div style={{ position: 'absolute', fontSize: 32, animation: 'shake 0.12s ease-in-out infinite' }}>🤸</div>
            )}
          </div>

          {(animPhase === 'done' || (gs.throwResult != null && animPhase === 'idle')) && gs.throwResult != null && (
            <div className="yut-result animate-pop" style={{ fontSize: 28 }}>
              {THROW_NAMES[gs.throwResult]}!
              <span style={{ fontSize: 18, marginLeft: 8 }}>
                ({THROW_MOVES[gs.throwResult] > 0 ? '+' : ''}{THROW_MOVES[gs.throwResult]}칸)
              </span>
            </div>
          )}

          <button className="throw-btn" onClick={doThrow} disabled={!isMyTurn || animPhase !== 'idle'}
            style={{ fontSize: 18, padding: '12px 36px' }}>
            {animPhase !== 'idle'
              ? animPhase === 'throwing' ? '🎲 에잇~!' : '🎲 두근두근...'
              : '🎲 윷 던지기!'}
          </button>

          {pendingMoves.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 13, color: '#666', fontWeight: 600, marginBottom: 6 }}>
                📋 남은 이동: {pendingMoves.map(m => THROW_NAMES[m]).join(', ')}
              </p>
              <button className="btn-secondary" disabled={!isMyTurn || animPhase !== 'idle'}
                onClick={async () => {
                  await update(gsRef, { phase: 'move', throwResult: null })
                }}
                style={{ padding: '8px 20px', fontSize: 14 }}>
                🏃 던지지 않고 이동하기
              </button>
            </div>
          )}
        </div>
      )}

      {/* Move: user picks which throw to use, then which piece */}
      {gs.phase === 'move' && (
        <MoveSelector
          pendingMoves={pendingMoves}
          isMyTurn={isMyTurn}
          waitingCount={waitingCount}
          uniquePositions={uniquePositions}
          curPieces={curPieces}
          onMove={movePiece}
          onSkip={skipMove}
        />
      )}

      {gs.phase === 'finished' && isHost && (
        <div style={{ textAlign: 'center', margin: 16 }}>
          <button className="btn-primary" onClick={() => set(gsRef, initGame(players))}>🔄 다시 하기</button>
        </div>
      )}

      <GameChat roomCode={roomCode} playerId={playerId} playerName={playerName} />

      {/* Game Log */}
      <div style={{ marginTop: 6, border: '1px solid #E0E0E0', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: '#F5F5F5', padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#999' }}>
          📋 게임 로그
        </div>
        <div style={{ maxHeight: 80, overflow: 'auto', padding: 6, fontSize: 11, color: '#888', background: '#FAFAFA', textAlign: 'left' }}>
          {(gs.log || []).slice().reverse().map((l, i) => (
            <div key={i} style={{ padding: '1px 0', borderBottom: '1px solid #F0F0F0' }}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <div className="card yut-game">
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '2 1 400px' }}>
          {board}
        </div>
        <div style={{ flex: '1 1 280px', minWidth: 280 }}>
          {controlPanel}
        </div>
      </div>
    </div>
  )
}
