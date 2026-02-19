import { useState, useEffect, useRef, useCallback } from 'react'
import { db, ref, onValue, update, set } from '../firebase'

const TEAM_NAMES = ['🔴 홍팀', '🔵 청팀', '🟢 녹팀', '🟠 주황팀']

function initState(players) {
  const order = players.sort((a, b) => a.order - b.order).map(p => p.id)
  const scores = {}
  players.forEach(p => { scores[p.id] = 0 })

  // Create matchups: pair players sequentially
  const matches = []
  for (let i = 0; i < order.length; i += 2) {
    if (order[i + 1]) {
      matches.push([order[i], order[i + 1]])
    }
  }

  return {
    playerOrder: order,
    scores,
    matches,
    currentMatch: 0,
    phase: 'ready', // ready | charging | waiting | result | finished
    matchState: {
      defender: matches[0]?.[0],
      attacker: matches[0]?.[1],
      defenderPower: null,
      attackerPower: null,
    },
    round: 1,
    log: [],
  }
}

export default function Ddakji({ roomCode, playerId, players, isHost, onEndGame }) {
  const [gs, setGs] = useState(null)
  const [power, setPower] = useState(0)
  const [charging, setCharging] = useState(false)
  const powerRef = useRef(0)
  const chargeRef = useRef(null)
  const startTimeRef = useRef(null)
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

  const startCharge = useCallback(() => {
    if (!gs || (gs.phase !== 'ready' && gs.phase !== 'charging')) return
    const { defender, attacker } = gs.matchState || {}
    if (playerId !== defender && playerId !== attacker) return

    setCharging(true)
    startTimeRef.current = Date.now()
    powerRef.current = 0

    chargeRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      // Power oscillates - have to time the release perfectly
      const wave = Math.sin(elapsed / 150) * 50 + 50
      powerRef.current = wave
      setPower(wave)
    }, 30)

    if (gs.phase === 'ready') {
      update(gsRef, { phase: 'charging' })
    }
  }, [gs, playerId])

  const release = useCallback(async () => {
    if (!charging || !gs) return
    clearInterval(chargeRef.current)
    setCharging(false)

    const finalPower = Math.round(powerRef.current)
    const { defender, attacker, defenderPower, attackerPower } = gs.matchState || {}

    const isDefender = playerId === defender
    const isAttacker = playerId === attacker

    if (isDefender && defenderPower === null) {
      await update(gsRef, {
        'matchState/defenderPower': finalPower,
        phase: attackerPower !== null ? 'result' : 'waiting',
      })
    } else if (isAttacker && attackerPower === null) {
      await update(gsRef, {
        'matchState/attackerPower': finalPower,
        phase: defenderPower !== null ? 'result' : 'waiting',
      })
    }

    setPower(0)
    powerRef.current = 0
  }, [charging, gs, playerId])

  const resolveMatch = async () => {
    if (!gs || gs.phase !== 'result') return
    const { defender, attacker, defenderPower, attackerPower } = gs.matchState

    const defInfo = players.find(p => p.id === defender)
    const atkInfo = players.find(p => p.id === attacker)

    // Attacker needs more power to flip the ddakji
    // Add randomness: each power + random(0-30)
    const defTotal = (defenderPower || 0) + Math.random() * 30
    const atkTotal = (attackerPower || 0) + Math.random() * 30

    const attackerWins = atkTotal > defTotal
    const winnerId = attackerWins ? attacker : defender
    const winnerInfo = attackerWins ? atkInfo : defInfo

    const newScores = { ...gs.scores }
    newScores[winnerId] = (newScores[winnerId] || 0) + 1

    const logs = [...(gs.log || []).slice(-20),
      `${defInfo?.name}(${Math.round(defenderPower)}) vs ${atkInfo?.name}(${Math.round(attackerPower)}) → ${winnerInfo?.name} 승! ${attackerWins ? '🔄 뒤집기 성공!' : '🛡️ 방어 성공!'}`
    ]

    // Next match
    const nextMatchIdx = gs.currentMatch + 1
    if (nextMatchIdx >= gs.matches.length) {
      await update(gsRef, { scores: newScores, phase: 'finished', log: logs })
    } else {
      const nextMatch = gs.matches[nextMatchIdx]
      await update(gsRef, {
        scores: newScores,
        currentMatch: nextMatchIdx,
        round: nextMatchIdx + 1,
        phase: 'ready',
        matchState: {
          defender: nextMatch[0],
          attacker: nextMatch[1],
          defenderPower: null,
          attackerPower: null,
        },
        log: logs,
      })
    }
  }

  // Auto-resolve when both powers are in
  useEffect(() => {
    if (gs?.phase === 'result' && isHost) {
      const timer = setTimeout(resolveMatch, 1500)
      return () => clearTimeout(timer)
    }
  }, [gs?.phase])

  if (!gs) return <div style={{ textAlign: 'center', padding: 40 }}>게임 준비 중...</div>

  const { defender, attacker, defenderPower, attackerPower } = gs.matchState || {}
  const defInfo = players.find(p => p.id === defender)
  const atkInfo = players.find(p => p.id === attacker)
  const isInMatch = playerId === defender || playerId === attacker
  const myPowerSubmitted = (playerId === defender && defenderPower !== null) ||
                           (playerId === attacker && attackerPower !== null)

  const sortedScores = Object.entries(gs.scores || {})
    .map(([pid, score]) => ({ ...players.find(p => p.id === pid), score }))
    .sort((a, b) => b.score - a.score)

  return (
    <div className="card ddakji-game">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>🃏 딱지치기</h3>
        {isHost && onEndGame && (
          <button onClick={onEndGame}
            style={{ padding: '4px 12px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', fontSize: 12, cursor: 'pointer' }}>
            ← 로비
          </button>
        )}
      </div>

      {gs.phase !== 'finished' && (
        <>
          <div className="turn-info" style={{ background: '#FFF3E0', color: '#E65100' }}>
            라운드 {gs.round}/{gs.matches?.length} | {defInfo?.name} 🆚 {atkInfo?.name}
          </div>

          <div className="ddakji-arena">
            {/* Defender card */}
            <div className="ddakji-card target"
              style={{
                transform: gs.phase === 'result' && attackerPower > defenderPower
                  ? 'rotateX(180deg)' : 'rotateX(0)',
                top: '30%', left: '25%',
              }}
            >
              🛡️
            </div>
            {/* Attacker card */}
            <div className="ddakji-card attacker"
              style={{
                top: gs.phase === 'result' ? '40%' : '70%',
                left: '45%',
                transition: 'all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              }}
            >
              ⚔️
            </div>

            {gs.phase === 'result' && (
              <div style={{
                position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
                fontSize: 20, fontWeight: 900,
                color: attackerPower > defenderPower ? '#E53935' : '#1E88E5',
              }} className="animate-pop">
                {attackerPower > defenderPower ? '뒤집기 성공!' : '방어 성공!'}
              </div>
            )}
          </div>

          {/* Power charging */}
          {isInMatch && !myPowerSubmitted && (gs.phase === 'ready' || gs.phase === 'charging' || gs.phase === 'waiting') && (
            <div style={{ margin: '16px 0' }}
              onMouseDown={startCharge}
              onMouseUp={release}
              onTouchStart={startCharge}
              onTouchEnd={release}
            >
              <div className="ddakji-power-ring" style={{
                borderColor: `hsl(${power * 1.2}, 80%, 50%)`,
              }}>
                <span className="value">{Math.round(power)}</span>
              </div>
              <p style={{ fontSize: 14, color: '#888' }}>
                {charging ? '🔥 놓으면 확정!' : '👆 꾹 눌러서 파워를 정하세요'}
              </p>
              <p style={{ fontSize: 12, color: '#AAA' }}>
                {playerId === defender ? '🛡️ 수비' : '⚔️ 공격'} |
                타이밍을 맞춰 높은 숫자에서 놓으세요!
              </p>
            </div>
          )}

          {myPowerSubmitted && gs.phase === 'waiting' && (
            <p style={{ margin: 20, color: '#888', fontSize: 18 }}>
              ⏳ 상대방을 기다리는 중...
            </p>
          )}

          {!isInMatch && (
            <p style={{ margin: 20, color: '#888' }}>
              👀 {defInfo?.name} vs {atkInfo?.name} 경기를 관전 중...
            </p>
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
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {p.name}: {p.score}승
            </div>
          ))}
          {isHost && (
            <button className="btn-primary" onClick={() => set(gsRef, initState(players))} style={{ marginTop: 16 }}>
              🔄 다시 하기
            </button>
          )}
        </div>
      )}

      {/* Log */}
      <div style={{ marginTop: 16, maxHeight: 100, overflow: 'auto', fontSize: 13, color: '#888', textAlign: 'left' }}>
        {(gs.log || []).slice().reverse().map((l, i) => (
          <div key={i} style={{ padding: '2px 0' }}>{l}</div>
        ))}
      </div>
    </div>
  )
}
