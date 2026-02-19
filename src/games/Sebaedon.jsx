import { useState, useEffect } from 'react'
import { db, ref, onValue, update, set } from '../firebase'

const AMOUNTS = [1000, 2000, 3000, 5000, 10000, 20000, 30000, 50000, 100000, 500, 777, 8888]
const MESSAGES = {
  100000: '🎉 대박! 10만원!',
  50000: '🥳 오만원! 부자!',
  30000: '😍 삼만원! 넉넉!',
  20000: '😊 이만원! 좋아!',
  10000: '👍 만원! 괜찮아!',
  8888: '🍀 팔팔팔팔! 럭키!',
  5000: '😄 오천원!',
  3000: '🙂 삼천원!',
  2000: '😅 이천원...',
  1000: '😮 천원...?',
  777: '🎰 럭키 세븐!',
  500: '😭 오백원... 다음에!',
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function initState(players) {
  const shuffled = shuffle(AMOUNTS).slice(0, players.length)
  const envelopes = {}
  players.forEach((p, i) => {
    envelopes[p.id] = {
      amount: shuffled[i],
      opened: false,
      name: p.name,
    }
  })
  return {
    envelopes,
    phase: 'picking', // picking | allOpened
    openCount: 0,
    total: players.length,
    log: [],
  }
}

export default function Sebaedon({ roomCode, playerId, players, isHost, onEndGame }) {
  const [gs, setGs] = useState(null)
  const [myRevealed, setMyRevealed] = useState(false)
  const [animating, setAnimating] = useState(false)
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

  const openEnvelope = async () => {
    if (!gs || animating) return
    const envelope = gs.envelopes?.[playerId]
    if (!envelope || envelope.opened) return

    setAnimating(true)
    setTimeout(async () => {
      const playerInfo = players.find(p => p.id === playerId)
      const amount = envelope.amount
      const newOpenCount = (gs.openCount || 0) + 1
      const logs = [...(gs.log || []).slice(-20),
        `${playerInfo?.name}: ${amount.toLocaleString()}원 💰 ${MESSAGES[amount] || ''}`
      ]

      await update(gsRef, {
        [`envelopes/${playerId}/opened`]: true,
        openCount: newOpenCount,
        phase: newOpenCount >= gs.total ? 'allOpened' : 'picking',
        log: logs,
      })
      setMyRevealed(true)
      setAnimating(false)
    }, 1000)
  }

  if (!gs) return <div style={{ textAlign: 'center', padding: 40 }}>게임 준비 중...</div>

  const envelopes = gs.envelopes || {}
  const myEnvelope = envelopes[playerId]
  const allOpened = gs.phase === 'allOpened'

  const ranking = allOpened
    ? Object.entries(envelopes)
        .map(([pid, e]) => ({ id: pid, ...e }))
        .sort((a, b) => b.amount - a.amount)
    : []

  return (
    <div className="card sebaedon-game">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>🧧 세뱃돈 받기</h3>
        {isHost && onEndGame && (
          <button onClick={onEndGame}
            style={{ padding: '4px 12px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', fontSize: 12, cursor: 'pointer' }}>
            ← 로비
          </button>
        )}
      </div>
      <p style={{ color: '#888', marginBottom: 16 }}>
        복주머니를 열어 세뱃돈을 확인하세요!
      </p>

      {/* Envelopes Grid */}
      <div className="envelope-grid">
        {Object.entries(envelopes).map(([pid, env]) => {
          const isMe = pid === playerId
          const isOpened = env.opened

          return (
            <div key={pid}
              className={`envelope ${isOpened ? 'opened' : 'closed'} ${animating && isMe ? 'animate-shake' : ''}`}
              onClick={isMe && !isOpened ? openEnvelope : undefined}
              style={{ cursor: isMe && !isOpened ? 'pointer' : 'default' }}
            >
              {isOpened ? (
                <>
                  <span className="emoji animate-pop">💰</span>
                  <span className="amount">
                    {allOpened || isMe ? `${env.amount.toLocaleString()}원` : '???'}
                  </span>
                  <span className="player-name">{env.name}</span>
                </>
              ) : (
                <>
                  <span className="emoji" style={{ fontSize: 56 }}>🧧</span>
                  <span style={{ fontSize: 14, marginTop: 8, fontWeight: 600 }}>
                    {env.name}
                  </span>
                  {isMe && (
                    <span style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                      👆 터치하여 열기
                    </span>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Status */}
      <div style={{ margin: '16px 0', padding: 12, background: '#FFF8E1', borderRadius: 12 }}>
        <p style={{ fontWeight: 600 }}>
          {allOpened
            ? '🎊 모두 개봉 완료!'
            : `📨 ${gs.openCount || 0}/${gs.total}명 개봉`
          }
        </p>
      </div>

      {/* My result */}
      {myRevealed && myEnvelope && (
        <div style={{
          padding: 20, background: '#FFEBEE', borderRadius: 16,
          textAlign: 'center', margin: '12px 0',
        }} className="animate-pop">
          <div style={{ fontSize: 20, fontWeight: 700, color: '#C62828' }}>
            내 세뱃돈: {myEnvelope.amount?.toLocaleString()}원
          </div>
          <div style={{ fontSize: 16, marginTop: 4 }}>
            {MESSAGES[myEnvelope.amount]}
          </div>
        </div>
      )}

      {/* Ranking */}
      {allOpened && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ marginBottom: 12, color: '#C62828' }}>🏆 세뱃돈 랭킹</h3>
          {ranking.map((p, i) => (
            <div key={p.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: 12, margin: '6px 0', borderRadius: 12,
              background: i === 0 ? '#FFF8E1' : '#F5F5F5',
              fontWeight: i === 0 ? 900 : 400,
              fontSize: i === 0 ? 18 : 16,
              border: p.id === playerId ? '2px solid #C62828' : '2px solid transparent',
            }}>
              <span>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {p.name}
              </span>
              <span style={{ color: '#C62828', fontWeight: 700 }}>
                {p.amount.toLocaleString()}원
              </span>
            </div>
          ))}

          {isHost && (
            <button className="btn-primary" onClick={() => {
              setMyRevealed(false)
              set(gsRef, initState(players))
            }} style={{ marginTop: 16 }}>
              🔄 다시 뽑기
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
