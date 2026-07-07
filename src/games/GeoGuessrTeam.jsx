import { useState, useEffect, useRef } from 'react'
import { db, ref, onValue, update, set } from '../firebase'
import { MAPILLARY_TOKEN, fetchRandomLocation } from '../mapillaryConfig'
import { Viewer } from 'mapillary-js'
import 'mapillary-js/dist/mapillary.css'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const TEAM_EMOJI = ['🔴', '🔵', '🟢', '🟠']
const TEAM_CSS = ['team-0', 'team-1', 'team-2', 'team-3']
const DEFAULT_TEAM_NAMES = ['홍팀', '청팀', '녹팀', '주황팀']
const TOTAL_ROUNDS = 5

function haversine(aLat, aLng, bLat, bLng) {
  const R = 6371
  const dLat = (bLat - aLat) * Math.PI / 180
  const dLng = (bLng - aLng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
function scoreFor(distKm) {
  return Math.round(5000 * Math.exp(-distKm / 2000))
}

export default function GeoGuessrTeam({ roomCode, playerId, playerName, players, isHost, teamNames, onEndGame }) {
  const [gs, setGs] = useState(null)
  const [myGuess, setMyGuess] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const mlyElRef = useRef(null)
  const viewerRef = useRef(null)
  const mapElRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)

  useEffect(() => {
    const unsub = onValue(ref(db, `rooms/${roomCode}/gameState`), s => setGs(s.val()))
    return () => unsub()
  }, [roomCode])

  const phase = gs?.phase
  const location = gs?.location
  const round = gs?.round || 0
  const guesses = gs?.guesses || {}
  const teamScores = gs?.teamScores || {}
  const submitted = !!guesses[playerId]

  // Mapillary 파노라마 뷰어
  useEffect(() => {
    if (phase !== 'round' || !location?.imageId || !MAPILLARY_TOKEN || !mlyElRef.current) return
    if (!viewerRef.current) {
      try {
        viewerRef.current = new Viewer({
          accessToken: MAPILLARY_TOKEN,
          container: mlyElRef.current,
          imageId: location.imageId,
        })
      } catch (e) { setErr('파노라마 로드 실패: ' + (e.message || e)) }
    } else {
      viewerRef.current.moveTo(location.imageId).catch(() => {})
    }
  }, [phase, location?.imageId])

  useEffect(() => () => {
    if (viewerRef.current) { try { viewerRef.current.remove() } catch { /* noop */ } viewerRef.current = null }
  }, [])

  // Leaflet 추측 지도
  useEffect(() => {
    if (phase !== 'round' || !mapElRef.current || mapRef.current) return
    const map = L.map(mapElRef.current, { attributionControl: false, worldCopyJump: true }).setView([20, 0], 1)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd' }).addTo(map)
    map.on('click', e => {
      setMyGuess({ lat: e.latlng.lat, lng: e.latlng.lng })
      if (markerRef.current) markerRef.current.setLatLng(e.latlng)
      else markerRef.current = L.circleMarker(e.latlng, { radius: 8, color: '#C62828', fillColor: '#E53935', fillOpacity: 1, weight: 2 }).addTo(map)
    })
    mapRef.current = map
    setTimeout(() => map.invalidateSize(), 120)
  }, [phase])

  useEffect(() => {
    if (phase !== 'round' && mapRef.current) {
      mapRef.current.remove(); mapRef.current = null; markerRef.current = null
    }
  }, [phase])

  // 라운드 전환 시 내 추측/마커 리셋
  useEffect(() => {
    setMyGuess(null)
    if (markerRef.current && mapRef.current) { mapRef.current.removeLayer(markerRef.current); markerRef.current = null }
    if (mapRef.current) mapRef.current.setView([20, 0], 1)
  }, [round])

  // ── 호스트 액션 ──
  // 다음 위치를 백그라운드로 미리 받아 gameState.nextLocation 에 저장 (호스트만)
  const prefetchNext = () => {
    if (!MAPILLARY_TOKEN) return
    fetchRandomLocation(MAPILLARY_TOKEN)
      .then(loc => loc && update(ref(db, `rooms/${roomCode}/gameState`), { nextLocation: loc }))
      .catch(() => {})
  }
  const startGame = async () => {
    await set(ref(db, `rooms/${roomCode}/gameState`), { phase: 'intro', round: 0, teamScores: {}, roundScores: {} })
    prefetchNext() // intro 보는 동안 1라운드 위치 미리 로드
  }
  const loadNextRound = async () => {
    if (!isHost) return
    if (!MAPILLARY_TOKEN) { setErr('Mapillary 토큰 미설정 — .env 의 VITE_MAPILLARY_TOKEN 을 확인해주세요.'); return }
    setBusy(true); setErr('')
    try {
      let loc = gs?.nextLocation || null // 프리페치된 위치가 있으면 즉시 사용
      if (!loc) loc = await fetchRandomLocation(MAPILLARY_TOKEN)
      if (!loc) { setErr('스트리트뷰 위치를 찾지 못했어요. 다시 눌러주세요.'); setBusy(false); return }
      await update(ref(db, `rooms/${roomCode}/gameState`), {
        phase: 'round', round: round + 1, location: loc, guesses: {}, nextLocation: null,
      })
      prefetchNext() // 이번 라운드 진행 중 다음 라운드 미리 로드
    } catch (e) { setErr(String(e.message || e)) }
    setBusy(false)
  }
  const submitGuess = async () => {
    if (!myGuess || submitted) return
    await update(ref(db, `rooms/${roomCode}/gameState/guesses`), { [playerId]: myGuess })
  }
  const revealRound = async () => {
    if (!isHost || !location) return
    const roundScore = {}
    const detail = {}
    players.forEach(p => {
      const gu = guesses[p.id]
      if (!gu) return
      const dist = haversine(location.lat, location.lng, gu.lat, gu.lng)
      const pts = scoreFor(dist)
      roundScore[p.team] = (roundScore[p.team] || 0) + pts
      detail[p.id] = { dist: Math.round(dist), pts }
    })
    const newTeam = { ...teamScores }
    Object.entries(roundScore).forEach(([t, p]) => { newTeam[t] = (newTeam[t] || 0) + p })
    await update(ref(db, `rooms/${roomCode}/gameState`), {
      phase: 'reveal',
      [`roundScores/${round}`]: roundScore,
      roundDetail: detail,
      teamScores: newTeam,
    })
  }
  const proceed = async () => {
    if (!isHost) return
    if (round >= TOTAL_ROUNDS) {
      let win = null, max = -1
      Object.entries(teamScores).forEach(([t, p]) => { if (p > max) { max = p; win = Number(t) } })
      await update(ref(db, `rooms/${roomCode}/gameState`), { phase: 'end', winner: win })
    } else {
      loadNextRound()
    }
  }

  const teamName = (i) => `${TEAM_EMOJI[i]} ${teamNames[i] || DEFAULT_TEAM_NAMES[i]}`
  const usedTeams = [...new Set(players.map(p => p.team))].sort((a, b) => a - b)
  const numSubmitted = Object.keys(guesses).length

  const Header = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>🌍 GeoGuessr 팀전{round > 0 && phase !== 'end' ? ` · R${round}/${TOTAL_ROUNDS}` : ''}</h2>
      <button className="btn-secondary" onClick={onEndGame} style={{ padding: '4px 12px', fontSize: 12 }}>로비로</button>
    </div>
  )

  const ScoreBoard = () => (
    <div className="card" style={{ padding: 10 }}>
      <h3 style={{ fontSize: 13, margin: '0 0 6px' }}>🏆 팀 점수</h3>
      <div style={{ display: 'grid', gap: 4 }}>
        {usedTeams.map(i => (
          <div key={i} className={`player-card ${TEAM_CSS[i]}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px' }}>
            <span style={{ fontSize: 12 }}>{teamName(i)}</span>
            <b style={{ fontSize: 14 }}>{teamScores[i] || 0}</b>
          </div>
        ))}
      </div>
    </div>
  )

  // ── 렌더 ──
  if (!gs) {
    return (
      <div className="card" style={{ padding: 16, textAlign: 'center' }}>
        <Header />
        <p style={{ fontSize: 40, margin: '12px 0' }}>🌍</p>
        <p style={{ color: '#666', fontSize: 13 }}>세계 곳곳의 거리 사진을 보고, 지도에서 위치를 맞혀요. 팀 점수 합산!</p>
        {isHost
          ? <button className="btn-primary" onClick={startGame} style={{ marginTop: 12, padding: '10px 28px' }}>게임 준비</button>
          : <p style={{ color: '#888' }}>방장이 게임을 준비 중...</p>}
      </div>
    )
  }

  if (phase === 'intro') {
    return (
      <div className="card" style={{ padding: 16, textAlign: 'center' }}>
        <Header />
        <p style={{ fontSize: 13, color: '#555' }}>매 라운드 파노라마를 둘러보고, 세계지도를 클릭해 위치를 추측하세요. 실제 위치와 가까울수록 고득점(최대 5000점). 총 {TOTAL_ROUNDS}라운드.</p>
        {!MAPILLARY_TOKEN && <p style={{ color: '#C62828', fontSize: 12, marginTop: 8 }}>⚠️ Mapillary 토큰 미설정: src/mapillaryConfig.js</p>}
        {err && <p style={{ color: '#C62828', fontSize: 12 }}>{err}</p>}
        {isHost
          ? <button className="btn-primary" onClick={loadNextRound} disabled={busy} style={{ marginTop: 12, padding: '10px 28px' }}>{busy ? '위치 불러오는 중...' : '1라운드 시작 🚀'}</button>
          : <p style={{ color: '#888', marginTop: 12 }}>방장이 시작하면 라운드가 열려요.</p>}
      </div>
    )
  }

  if (phase === 'round') {
    return (
      <div className="card" style={{ padding: 12 }}>
        <Header />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 420px', minWidth: 280 }}>
            {MAPILLARY_TOKEN
              ? <div ref={mlyElRef} style={{ width: '100%', height: 'min(58vh, 520px)', borderRadius: 10, overflow: 'hidden', background: '#000' }} />
              : <div style={{ height: 'min(58vh, 520px)', borderRadius: 10, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20 }}>
                  <span style={{ color: '#C62828', fontSize: 13 }}>Mapillary 토큰이 없어 파노라마를 표시할 수 없어요.<br />src/mapillaryConfig.js 에 토큰을 넣어주세요.</span>
                </div>}
            <div style={{ marginTop: 8 }}>
              <div ref={mapElRef} style={{ width: '100%', height: 360, borderRadius: 10, overflow: 'hidden', border: '1px solid #ddd' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <button className="btn-primary" onClick={submitGuess} disabled={!myGuess || submitted} style={{ padding: '8px 20px' }}>
                  {submitted ? '제출 완료 ✓' : myGuess ? '이 위치로 제출' : '지도를 클릭하세요'}
                </button>
                <span style={{ fontSize: 12, color: '#888' }}>제출 {numSubmitted}/{players.length}</span>
              </div>
            </div>
          </div>
          <div style={{ flex: '0 0 180px' }}>
            <ScoreBoard />
            {isHost && <button className="btn-secondary" onClick={revealRound} style={{ marginTop: 8, width: '100%', padding: '8px' }}>결과 공개 →</button>}
          </div>
        </div>
        {err && <p style={{ color: '#C62828', fontSize: 12, marginTop: 6 }}>{err}</p>}
      </div>
    )
  }

  if (phase === 'reveal') {
    const rScore = gs.roundScores?.[round] || {}
    const detail = gs.roundDetail || {}
    return (
      <div className="card" style={{ padding: 16 }}>
        <Header />
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <p style={{ fontSize: 13, color: '#888', margin: 0 }}>정답 위치</p>
          <p style={{ fontSize: 20, fontWeight: 800, margin: '2px 0' }}>📍 {location?.label}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <h3 style={{ fontSize: 13 }}>이번 라운드 팀 점수</h3>
            {usedTeams.map(i => (
              <div key={i} className={`player-card ${TEAM_CSS[i]}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', marginBottom: 3 }}>
                <span style={{ fontSize: 12 }}>{teamName(i)}</span><b>+{rScore[i] || 0}</b>
              </div>
            ))}
          </div>
          <div>
            <h3 style={{ fontSize: 13 }}>내 기록</h3>
            {detail[playerId]
              ? <p style={{ fontSize: 13 }}>거리 {detail[playerId].dist} km · <b>{detail[playerId].pts}점</b></p>
              : <p style={{ fontSize: 12, color: '#999' }}>미제출</p>}
          </div>
        </div>
        <div style={{ marginTop: 12 }}><ScoreBoard /></div>
        {isHost
          ? <button className="btn-primary" onClick={proceed} style={{ marginTop: 12, width: '100%', padding: '10px' }}>{round >= TOTAL_ROUNDS ? '최종 결과 보기 🏁' : `다음 라운드 (${round + 1}/${TOTAL_ROUNDS}) →`}</button>
          : <p style={{ textAlign: 'center', color: '#888', marginTop: 12 }}>방장이 진행하면 다음으로 넘어가요.</p>}
      </div>
    )
  }

  if (phase === 'end') {
    const winner = gs.winner
    const ranking = usedTeams.map(i => ({ i, s: teamScores[i] || 0 })).sort((a, b) => b.s - a.s)
    return (
      <div className="card" style={{ padding: 20, textAlign: 'center' }}>
        <Header />
        <p style={{ fontSize: 48, margin: '8px 0' }}>🏆</p>
        <p style={{ fontSize: 22, fontWeight: 800 }}>우승: {winner != null ? teamName(winner) : '무승부'}</p>
        <div style={{ maxWidth: 320, margin: '16px auto 0', display: 'grid', gap: 6 }}>
          {ranking.map((r, idx) => (
            <div key={r.i} className={`player-card ${TEAM_CSS[r.i]}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px' }}>
              <span>{idx + 1}위 {teamName(r.i)}</span><b>{r.s}</b>
            </div>
          ))}
        </div>
        {isHost && <button className="btn-primary" onClick={startGame} style={{ marginTop: 16, padding: '10px 28px' }}>다시 하기</button>}
        <button className="btn-secondary" onClick={onEndGame} style={{ margin: '8px auto 0', padding: '8px 20px', display: 'block' }}>로비로</button>
      </div>
    )
  }

  return <div className="card" style={{ padding: 20 }}>로딩 중...</div>
}
