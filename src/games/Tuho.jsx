import { useState, useEffect, useRef, useCallback } from 'react'
import { db, ref, onValue, update, set } from '../firebase'

const TOTAL_ARROWS = 5
const TEAM_COLORS = ['#E53935', '#1E88E5', '#43A047', '#FB8C00']

function initState(players) {
  const order = players.sort((a, b) => a.order - b.order).map(p => p.id)
  const scores = {}
  players.forEach(p => { scores[p.id] = 0 })
  return {
    playerOrder: order,
    currentIdx: 0,
    scores,
    arrows: TOTAL_ARROWS,
    round: 1,
    totalRounds: order.length,
    phase: 'aiming',
    lastThrow: null,
    landedArrows: [],
    log: [],
  }
}

export default function Tuho({ roomCode, playerId, players, isHost, onEndGame }) {
  const [gs, setGs] = useState(null)
  const [power, setPower] = useState(0)
  const [aimX, setAimX] = useState(50)
  const [charging, setCharging] = useState(false)
  const [throwing, setThrowing] = useState(null)
  const powerRef = useRef(0)
  const aimRef = useRef(null)
  const chargeRef = useRef(null)
  const gsRef = ref(db, `rooms/${roomCode}/gameState`)

  useEffect(() => {
    const unsub = onValue(gsRef, snap => {
      if (snap.exists()) setGs(snap.val())
    })
    return () => unsub()
  }, [roomCode])

  useEffect(() => {
    if (!gs && isHost) set(gsRef, initState(players))
  }, [gs, isHost])

  useEffect(() => {
    if (!gs || gs.phase !== 'aiming') return
    const currentPlayer = gs.playerOrder[gs.currentIdx]
    if (currentPlayer !== playerId) return

    let x = 50
    let dir = 1
    const speed = 1.5
    aimRef.current = setInterval(() => {
      x += dir * speed
      if (x >= 85 || x <= 15) dir *= -1
      setAimX(x)
    }, 30)

    return () => clearInterval(aimRef.current)
  }, [gs?.phase, gs?.currentIdx, playerId])

  const startCharge = useCallback(() => {
    if (!gs || gs.phase !== 'aiming') return
    const currentPlayer = gs.playerOrder[gs.currentIdx]
    if (currentPlayer !== playerId) return

    setCharging(true)
    powerRef.current = 0
    chargeRef.current = setInterval(() => {
      powerRef.current = Math.min(100, powerRef.current + 2)
      setPower(powerRef.current)
    }, 30)
  }, [gs, playerId])

  const release = useCallback(async () => {
    if (!charging || !gs) return
    clearInterval(chargeRef.current)
    clearInterval(aimRef.current)
    setCharging(false)

    const releasedPower = powerRef.current
    const releasedAim = aimX

    const aimError = Math.abs(releasedAim - 50)
    const powerError = Math.abs(releasedPower - 75)
    const accuracy = Math.max(0, 100 - aimError * 2 - powerError * 0.5)

    let points = 0
    let resultText = ''
    if (accuracy >= 85) {
      points = 3
      resultText = '🎯 정중앙! +3점'
    } else if (accuracy >= 60) {
      points = 2
      resultText = '👍 들어갔다! +2점'
    } else if (accuracy >= 35) {
      points = 1
      resultText = '😅 간신히! +1점'
    } else {
      points = 0
      resultText = '😭 빗나갔다!'
    }

    const hit = points > 0
    const landX = hit ? 50 + (releasedAim - 50) * 0.3 : releasedAim
    const landY = hit ? 28 + Math.random() * 10 : 10 + Math.random() * 15

    setThrowing({ fromX: releasedAim, toX: landX, toY: landY, hit })
    setPower(0)

    await new Promise(r => setTimeout(r, 600))
    setThrowing(null)

    const currentPlayer = gs.playerOrder[gs.currentIdx]
    const playerInfo = players.find(p => p.id === currentPlayer)
    const newScores = { ...gs.scores }
    newScores[currentPlayer] = (newScores[currentPlayer] || 0) + points

    const arrowsLeft = gs.arrows - 1

    const landed = [...(gs.landedArrows || [])]
    if (hit) {
      landed.push({ x: landX, y: landY, angle: (releasedAim - 50) * 0.4 })
    }

    const logs = [...(gs.log || []).slice(-20),
      `${playerInfo?.name}: ${resultText} (조준: ${Math.round(releasedAim)}%, 파워: ${Math.round(releasedPower)}%)`
    ]

    await update(gsRef, {
      scores: newScores,
      arrows: arrowsLeft,
      phase: 'result',
      lastThrow: { player: currentPlayer, points, aim: releasedAim, power: releasedPower, text: resultText },
      landedArrows: landed,
      log: logs,
    })
  }, [charging, gs, aimX, playerId, players])

  const nextTurn = async () => {
    if (!gs) return
    const arrowsLeft = gs.arrows

    if (arrowsLeft <= 0) {
      const nextIdx = gs.currentIdx + 1
      if (nextIdx >= gs.playerOrder.length) {
        await update(gsRef, { phase: 'finished' })
        return
      }
      await update(gsRef, {
        currentIdx: nextIdx,
        arrows: TOTAL_ARROWS,
        phase: 'aiming',
        lastThrow: null,
        landedArrows: [],
        round: nextIdx + 1,
      })
    } else {
      await update(gsRef, { phase: 'aiming', lastThrow: null })
    }
  }

  if (!gs) return <div style={{ textAlign: 'center', padding: 40 }}>게임 준비 중...</div>

  const currentPlayer = gs.playerOrder?.[gs.currentIdx]
  const isMyTurn = currentPlayer === playerId
  const currentPlayerInfo = players.find(p => p.id === currentPlayer)
  const sortedScores = Object.entries(gs.scores || {})
    .map(([pid, score]) => ({ ...players.find(p => p.id === pid), score }))
    .sort((a, b) => b.score - a.score)

  return (
    <div className="card tuho-game">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>🏹 투호</h3>
        {isHost && onEndGame && (
          <button onClick={onEndGame}
            style={{ padding: '4px 12px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', fontSize: 12, cursor: 'pointer' }}>
            ← 로비
          </button>
        )}
      </div>

      <div className="score-board">
        {sortedScores.map((p, i) => (
          <div key={p.id} className="score-item" style={{
            background: p.id === currentPlayer ? '#FFF3E0' : '#F5F5F5',
            border: p.id === currentPlayer ? '2px solid #FB8C00' : '2px solid transparent',
          }}>
            {i === 0 && gs.phase === 'finished' ? '🏆 ' : ''}{p.name}: {p.score}점
          </div>
        ))}
      </div>

      {gs.phase !== 'finished' && (
        <>
          <div className="turn-info" style={{
            background: isMyTurn ? '#FFF3E0' : '#F5F5F5',
            color: isMyTurn ? '#E65100' : '#888',
          }}>
            {currentPlayerInfo?.name}의 차례 {isMyTurn ? '(나!)' : ''} | 남은 화살: {'🏹'.repeat(gs.arrows)}
          </div>

          <div className="tuho-container"
            onMouseDown={isMyTurn && gs.phase === 'aiming' && !throwing ? startCharge : undefined}
            onMouseUp={isMyTurn && charging ? release : undefined}
            onTouchStart={isMyTurn && gs.phase === 'aiming' && !throwing ? startCharge : undefined}
            onTouchEnd={isMyTurn && charging ? release : undefined}
          >
            <div className="tuho-pot" />

            {(gs.landedArrows || []).map((a, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: `${a.x}%`, top: `${a.y}%`,
                transform: `translateX(-50%) rotate(${a.angle}deg)`,
                pointerEvents: 'none', zIndex: 2,
              }}>
                <svg width="10" height="50" viewBox="0 0 10 50">
                  <line x1="5" y1="8" x2="5" y2="50" stroke="#8D6E63" strokeWidth="2.5" strokeLinecap="round" />
                  <polygon points="5,0 0,10 10,10" fill="#D32F2F" />
                  <line x1="3" y1="42" x2="7" y2="46" stroke="#A1887F" strokeWidth="1" />
                  <line x1="7" y1="42" x2="3" y2="46" stroke="#A1887F" strokeWidth="1" />
                </svg>
              </div>
            ))}

            {gs.phase === 'aiming' && isMyTurn && !throwing && (
              <>
                <div style={{
                  position: 'absolute', top: 0, left: `${aimX}%`,
                  width: 2, height: '100%', background: 'rgba(255,0,0,0.3)',
                  transform: 'translateX(-50%)', pointerEvents: 'none',
                }} />
                <div style={{
                  position: 'absolute', bottom: 10, left: `${aimX}%`,
                  transform: 'translateX(-50%)',
                  pointerEvents: 'none', zIndex: 5, transition: 'left 0.03s',
                }}>
                  <svg width="14" height="56" viewBox="0 0 14 56">
                    <line x1="7" y1="10" x2="7" y2="56" stroke="#8D6E63" strokeWidth="3" strokeLinecap="round" />
                    <polygon points="7,0 1,12 13,12" fill="#D32F2F" />
                    <line x1="4" y1="46" x2="10" y2="52" stroke="#A1887F" strokeWidth="1.5" />
                    <line x1="10" y1="46" x2="4" y2="52" stroke="#A1887F" strokeWidth="1.5" />
                  </svg>
                </div>
              </>
            )}

            {throwing && (
              <div className="tuho-arrow-fly"
                style={{
                  '--from-x': `${throwing.fromX}%`,
                  '--to-x': `${throwing.toX}%`,
                  '--to-y': `${throwing.toY}%`,
                  position: 'absolute', zIndex: 10, pointerEvents: 'none',
                }}>
                <svg width="14" height="56" viewBox="0 0 14 56">
                  <line x1="7" y1="10" x2="7" y2="56" stroke="#8D6E63" strokeWidth="3" strokeLinecap="round" />
                  <polygon points="7,0 1,12 13,12" fill="#D32F2F" />
                  <line x1="4" y1="46" x2="10" y2="52" stroke="#A1887F" strokeWidth="1.5" />
                  <line x1="10" y1="46" x2="4" y2="52" stroke="#A1887F" strokeWidth="1.5" />
                </svg>
              </div>
            )}

            {gs.lastThrow && !throwing && (
              <div style={{
                position: 'absolute', top: '40%', left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: 24, fontWeight: 900, color: gs.lastThrow.points > 0 ? '#4CAF50' : '#E53935',
                textShadow: '0 2px 4px rgba(0,0,0,0.2)', zIndex: 15,
              }} className="animate-pop">
                {gs.lastThrow.text}
              </div>
            )}
          </div>

          {gs.phase === 'aiming' && isMyTurn && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 14, color: '#888', marginBottom: 6 }}>
                {charging ? '🔥 놓으면 던집니다!' : '👆 꾹 눌러서 파워를 모으세요'}
              </p>
              <div className="tuho-power-bar">
                <div className="tuho-power-fill" style={{ width: `${power}%` }} />
              </div>
            </div>
          )}

          {gs.phase === 'result' && isMyTurn && (
            <button className="btn-primary" onClick={nextTurn} style={{ marginTop: 16 }}>
              {gs.arrows > 0 ? '🏹 다음 화살' : '➡️ 다음 차례'}
            </button>
          )}
        </>
      )}

      {gs.phase === 'finished' && (
        <div style={{ marginTop: 20 }}>
          <h2 style={{ color: '#E65100', marginBottom: 16 }}>🏆 최종 결과</h2>
          {sortedScores.map((p, i) => (
            <div key={p.id} style={{
              padding: 12, margin: '8px 0', borderRadius: 12,
              background: i === 0 ? '#FFF8E1' : '#F5F5F5',
              fontWeight: i === 0 ? 900 : 400,
              fontSize: i === 0 ? 20 : 16,
            }}>
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {p.name}: {p.score}점
            </div>
          ))}
          {isHost && (
            <button className="btn-primary" onClick={() => set(gsRef, initState(players))} style={{ marginTop: 16 }}>
              🔄 다시 하기
            </button>
          )}
        </div>
      )}

      <div style={{ marginTop: 16, maxHeight: 100, overflow: 'auto', fontSize: 13, color: '#888', textAlign: 'left' }}>
        {(gs.log || []).slice().reverse().map((l, i) => (
          <div key={i} style={{ padding: '2px 0' }}>{l}</div>
        ))}
      </div>
    </div>
  )
}
