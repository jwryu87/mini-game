import { useState, useEffect, useRef, useCallback } from 'react'
import { db, ref, onValue, update, set } from '../firebase'

const P = '#7C6BF0'
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

const BLINK_ON = 0.5      // 감김 판정 임계
const BLINK_OFF = 0.3     // 뜸 판정 임계 (히스테리시스 — 경계에서 떨림 방지)
const BLINK_FRAMES = 2    // 연속 프레임 수 (단발 오탐 컷)
const CALIB_TARGET = 3    // 입장 검증용 깜빡임 횟수
const NOFACE_MS = 2000    // 얼굴 이탈 허용 시간
const MAX_MS = 90000      // 라운드 상한 (눈 건조 방지)
const COUNTDOWN_MS = 3000

const DISTRACTIONS = ['🤣', '🍕', '💩', '🐶', '👻', '🔥', '🎉', '🐔', '🦄', '💸']
const FAKE_ALERTS = [
  '새 메시지: "지금 잠깐 통화 가능?"',
  '배포 파이프라인 실패 ❌',
  '캘린더: 5분 뒤 회의 시작',
  '배터리 부족 10%',
  '누군가 당신을 멘션했습니다',
]

// 반드시 모듈 최상위에 둔다. 컴포넌트 함수 안에서 정의하면 렌더마다 타입이 새로 만들어져
// React가 <video>를 파괴/재생성하고, 그때마다 카메라 스트림이 끊겨 검은 화면이 된다.
function CamBox({ videoRef, cam, faceOn, openness, big }) {
  return (
    <div style={{
      position: 'relative', width: big ? 340 : 180, margin: '0 auto',
      borderRadius: 16, overflow: 'hidden', background: '#111',
      border: `3px solid ${faceOn ? (openness > 0.5 ? '#37CFBE' : '#FFC44D') : '#E53935'}`,
      transition: 'border-color .12s',
    }}>
      <video ref={videoRef} playsInline muted autoPlay
        style={{ width: '100%', display: 'block', transform: 'scaleX(-1)', background: '#111' }} />
      {cam === 'on' && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.55)', padding: '4px 8px' }}>
          <div style={{ height: 6, borderRadius: 3, background: '#444', overflow: 'hidden' }}>
            <div style={{ width: `${openness * 100}%`, height: '100%', background: openness > 0.5 ? '#37CFBE' : '#FFC44D', transition: 'width .08s' }} />
          </div>
          <div style={{ color: '#fff', fontSize: 10, marginTop: 2 }}>
            {faceOn ? `눈 열림 ${Math.round(openness * 100)}%` : '⚠️ 얼굴이 안 보여요'}
          </div>
        </div>
      )}
    </div>
  )
}

export default function StaringContest({ roomCode, playerId, players, isHost, onEndGame }) {
  const [gs, setGs] = useState(null)
  const [cam, setCam] = useState('idle')      // idle | loading | on | error
  const [camErr, setCamErr] = useState('')
  const [blinks, setBlinks] = useState(0)     // 캘리브레이션 카운트
  const [openness, setOpenness] = useState(1) // 눈 열림 0~1
  const [faceOn, setFaceOn] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [fx, setFx] = useState([])            // 방해 이모지
  const [alert, setAlert] = useState(null)

  const videoRef = useRef(null)
  const landmarkerRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(0)
  const lastVideoTime = useRef(-1)
  const closedFrames = useRef(0)
  const eyesClosed = useRef(false)
  const noFaceSince = useRef(0)
  const deadRef = useRef(false)               // 이번 라운드 이미 탈락했는지
  const phaseRef = useRef('ready')

  const gsRef = ref(db, `rooms/${roomCode}/gameState`)

  useEffect(() => { const u = onValue(gsRef, s => setGs(s.val())); return () => u() }, [roomCode])
  useEffect(() => { if (!gs && isHost) set(gsRef, { phase: 'ready', round: 1 }) }, [gs, isHost])

  const phase = gs?.phase || 'ready'
  useEffect(() => { phaseRef.current = phase }, [phase])

  // 라운드가 바뀌면 로컬 판정 상태 초기화
  useEffect(() => {
    deadRef.current = false
    closedFrames.current = 0
    eyesClosed.current = false
    noFaceSince.current = 0
    if (phase === 'calib') setBlinks(0)
  }, [gs?.round, phase])

  // 타이머 틱
  useEffect(() => {
    if (phase !== 'battle' && phase !== 'countdown') return
    const t = setInterval(() => setNow(Date.now()), 50)
    return () => clearInterval(t)
  }, [phase])

  const eliminate = useCallback((reason) => {
    if (deadRef.current) return
    deadRef.current = true
    const startAt = gs?.startAt || Date.now()
    const ms = Math.max(0, Date.now() - startAt)
    update(ref(db, `rooms/${roomCode}/gameState/results`), {
      [playerId]: { ms, reason },
    })
  }, [gs?.startAt, roomCode, playerId])

  const eliminateRef = useRef(eliminate)
  useEffect(() => { eliminateRef.current = eliminate }, [eliminate])

  const handleFrame = useCallback((res) => {
    const face = res.faceBlendshapes?.[0]
    if (!face) {
      setFaceOn(false)
      if (!noFaceSince.current) noFaceSince.current = Date.now()
      else if (phaseRef.current === 'battle' && Date.now() - noFaceSince.current > NOFACE_MS) {
        eliminateRef.current('noface')
      }
      return
    }
    setFaceOn(true)
    noFaceSince.current = 0

    const cats = face.categories
    let blink = 0
    for (const c of cats) {
      if (c.categoryName === 'eyeBlinkLeft' || c.categoryName === 'eyeBlinkRight') {
        blink = Math.max(blink, c.score)
      }
    }
    // 매 프레임 setState하면 리렌더가 폭주하므로 눈에 띄는 변화만 반영한다
    const next = Math.max(0, Math.min(1, 1 - blink))
    setOpenness(prev => Math.abs(prev - next) > 0.03 ? next : prev)

    // 히스테리시스로 감김/뜸 상태 전이
    if (!eyesClosed.current && blink > BLINK_ON) {
      closedFrames.current += 1
      if (closedFrames.current >= BLINK_FRAMES) {
        eyesClosed.current = true
        closedFrames.current = 0
        if (phaseRef.current === 'calib') setBlinks(b => Math.min(CALIB_TARGET, b + 1))
        else if (phaseRef.current === 'battle') eliminateRef.current('blink')
      }
    } else if (eyesClosed.current && blink < BLINK_OFF) {
      eyesClosed.current = false
      closedFrames.current = 0
    } else if (!eyesClosed.current) {
      closedFrames.current = 0
    }
  }, [])

  const stopCam = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    landmarkerRef.current?.close?.()
    landmarkerRef.current = null
  }, [])

  const startCam = useCallback(async () => {
    if (cam === 'loading' || cam === 'on') return
    setCam('loading'); setCamErr('')
    try {
      const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision')
      const vision = await FilesetResolver.forVisionTasks(WASM_URL)
      let lm
      try {
        lm = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          outputFaceBlendshapes: true, runningMode: 'VIDEO', numFaces: 1,
        })
      } catch {
        // 일부 노트북 GPU에서 WebGL delegate 실패 → CPU 폴백
        lm = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          outputFaceBlendshapes: true, runningMode: 'VIDEO', numFaces: 1,
        })
      }
      landmarkerRef.current = lm

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 480, height: 360, facingMode: 'user' }, audio: false,
      })
      streamRef.current = stream
      const v = videoRef.current
      if (v) {
        v.srcObject = stream
        await v.play().catch(() => {})
      }
      setCam('on')

      const loop = () => {
        const vid = videoRef.current
        if (vid && landmarkerRef.current && vid.readyState >= 2) {
          if (vid.currentTime !== lastVideoTime.current) {
            lastVideoTime.current = vid.currentTime
            try { handleFrame(landmarkerRef.current.detectForVideo(vid, performance.now())) } catch { /* 프레임 스킵 */ }
          }
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
    } catch (e) {
      setCam('error')
      setCamErr(e?.name === 'NotAllowedError' ? '카메라 권한이 거부됐어요. 주소창 옆 자물쇠에서 허용해주세요.' : (e?.message || '카메라를 열 수 없어요'))
    }
  }, [cam, handleFrame])

  useEffect(() => () => stopCam(), [stopCam])

  // 단계가 바뀌면 <video>가 다른 트리 위치로 옮겨가며 재마운트된다. 그때 스트림을 다시 붙인다.
  useEffect(() => {
    const v = videoRef.current
    if (v && streamRef.current && v.srcObject !== streamRef.current) {
      v.srcObject = streamRef.current
      v.play().catch(() => {})
    }
  })

  // 캘리브레이션 통과 → 준비 완료 등록
  useEffect(() => {
    if (phase === 'calib' && blinks >= CALIB_TARGET) {
      update(ref(db, `rooms/${roomCode}/gameState/ready`), { [playerId]: true })
    }
  }, [phase, blinks, roomCode, playerId])

  // 방해 요소 (본인 화면에서만 랜덤 — 각자 다른 타이밍이라 더 웃김)
  useEffect(() => {
    if (phase !== 'battle' || deadRef.current) return
    const spawn = setInterval(() => {
      const id = Math.random().toString(36).slice(2, 8)
      setFx(f => [...f.slice(-6), {
        id, emoji: DISTRACTIONS[Math.floor(Math.random() * DISTRACTIONS.length)],
        top: 10 + Math.random() * 70, dur: 2.2 + Math.random() * 1.6, size: 34 + Math.random() * 40,
      }])
      setTimeout(() => setFx(f => f.filter(x => x.id !== id)), 4200)
    }, 1400)
    const alerter = setInterval(() => {
      setAlert(FAKE_ALERTS[Math.floor(Math.random() * FAKE_ALERTS.length)])
      setTimeout(() => setAlert(null), 2600)
    }, 6500)
    return () => { clearInterval(spawn); clearInterval(alerter); setFx([]); setAlert(null) }
  }, [phase, gs?.round])

  const results = gs?.results || {}
  const readyMap = gs?.ready || {}
  const alive = players.filter(p => results[p.id] === undefined)
  const startAt = gs?.startAt || 0
  const elapsed = Math.max(0, now - startAt)

  // 방장: 종료 조건 감시 (1명 남거나 전원 탈락, 또는 시간 상한)
  useEffect(() => {
    if (!isHost || phase !== 'battle') return
    if (alive.length <= 1 || elapsed >= MAX_MS) {
      update(gsRef, { phase: 'result', endedMs: Math.min(elapsed, MAX_MS) })
    }
  }, [isHost, phase, alive.length, elapsed >= MAX_MS])

  // 카운트다운 → 배틀 전환 (방장)
  useEffect(() => {
    if (!isHost || phase !== 'countdown') return
    const t = setTimeout(() => {
      update(gsRef, { phase: 'battle', startAt: Date.now() })
    }, Math.max(0, (gs.goAt || 0) - Date.now()))
    return () => clearTimeout(t)
  }, [isHost, phase, gs?.goAt])

  const openCalib = () => set(gsRef, { phase: 'calib', round: (gs?.round || 1), ready: {}, results: {} })
  const startRound = () => update(gsRef, { phase: 'countdown', goAt: Date.now() + COUNTDOWN_MS, results: {} })
  const nextRound = () => set(gsRef, { phase: 'calib', round: (gs?.round || 1) + 1, ready: {}, results: {} })

  const Head = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>👁️ 진짜 눈싸움 {gs?.round > 1 ? `· ${gs.round}R` : ''}</h2>
      <button className="btn-secondary" onClick={onEndGame} style={{ padding: '4px 12px', fontSize: 12 }}>로비로</button>
    </div>
  )

  const cameraView = (big) => (
    <CamBox videoRef={videoRef} cam={cam} faceOn={faceOn} openness={openness} big={big} />
  )

  if (!gs) return <div className="card" style={{ padding: 40, textAlign: 'center' }}>준비 중...</div>

  // ---------- 설명 ----------
  if (phase === 'ready') {
    return (
      <div className="card" style={{ textAlign: 'center' }}><Head />
        <p style={{ fontSize: 44, margin: '10px 0' }}>👁️👄👁️</p>
        <p style={{ fontSize: 14, color: '#666', lineHeight: 1.7 }}>
          각자 웹캠을 켜고 <b>동시에</b> 눈싸움!<br />
          <b style={{ color: '#E53935' }}>먼저 깜빡이면 탈락</b>, 마지막까지 버틴 1명이 승리.<br />
          중간에 방해 요소가 날아옵니다 😈
        </p>
        <div style={{ background: '#F8F7FC', borderRadius: 12, padding: 12, margin: '14px auto 0', maxWidth: 380, fontSize: 12, color: '#666', textAlign: 'left', lineHeight: 1.8 }}>
          <div>🔒 <b>영상은 내 기기 밖으로 나가지 않아요.</b> 브라우저에서만 분석하고, 서버로는 결과(생존 시간)만 전송돼요.</div>
          <div>💡 얼굴이 화면에서 2초 이상 사라지면 실격</div>
          <div>⏱️ 최대 90초 — 다 버티면 전원 생존</div>
        </div>
        {isHost
          ? <button className="btn-primary" onClick={openCalib} style={{ marginTop: 16, padding: '12px 32px' }}>카메라 준비 시작 📷</button>
          : <p style={{ color: '#aaa', marginTop: 16 }}>방장 대기 중...</p>}
      </div>
    )
  }

  // ---------- 캘리브레이션 ----------
  if (phase === 'calib') {
    const readyCnt = players.filter(p => readyMap[p.id]).length
    const me = blinks >= CALIB_TARGET
    return (
      <div className="card" style={{ textAlign: 'center' }}><Head />
        <p style={{ fontSize: 14, color: '#666', marginTop: 0 }}>
          카메라를 켜고 <b>천천히 {CALIB_TARGET}번 깜빡</b>여 인식을 확인해주세요.
        </p>
        {cam === 'idle' && (
          <button className="btn-primary" onClick={startCam} style={{ margin: '10px 0', padding: '12px 32px' }}>📷 카메라 켜기</button>
        )}
        {cam === 'loading' && <p style={{ color: '#888', margin: '16px 0' }}>모델 불러오는 중... (최초 1회 3MB)</p>}
        {cam === 'error' && (
          <div style={{ margin: '12px 0' }}>
            <p style={{ color: '#E53935', fontSize: 13 }}>{camErr}</p>
            <button className="btn-secondary" onClick={() => { setCam('idle'); startCam() }}>다시 시도</button>
          </div>
        )}
        <div style={{ display: cam === 'on' ? 'block' : 'none' }}>
          {cameraView(true)}
          <p style={{ fontSize: 26, fontWeight: 900, color: me ? '#37CFBE' : P, marginTop: 10 }}>
            {me ? '준비 완료 ✓' : `${blinks} / ${CALIB_TARGET}`}
          </p>
          <p style={{ fontSize: 12, color: '#888' }}>
            {faceOn ? (me ? '이제 눈싸움만 남았습니다' : '깜빡여보세요 👀') : '⚠️ 얼굴이 화면 안에 오도록 조명·거리를 조정해주세요'}
          </p>
        </div>
        <div style={{ marginTop: 14, fontSize: 13, color: '#666' }}>
          준비 완료 <b style={{ color: P }}>{readyCnt}</b> / {players.length}명
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center', marginTop: 6 }}>
          {players.map(p => (
            <span key={p.id} className="team-chip" style={{ background: readyMap[p.id] ? '#E6F7F5' : '#F0F0F0', color: readyMap[p.id] ? '#1B9C8D' : '#999' }}>
              {readyMap[p.id] ? '✓' : '…'} {p.name}
            </span>
          ))}
        </div>
        {isHost && (
          <button className="btn-primary" onClick={startRound} disabled={readyCnt < 1}
            style={{ marginTop: 14, padding: '12px 32px' }}>
            {readyCnt < players.length ? `그냥 시작 (${readyCnt}명) 🚀` : '전원 준비! 시작 🚀'}
          </button>
        )}
      </div>
    )
  }

  // ---------- 카운트다운 ----------
  if (phase === 'countdown') {
    const left = Math.ceil(((gs.goAt || 0) - now) / 1000)
    return (
      <div className="card" style={{ textAlign: 'center' }}><Head />
        {cameraView(true)}
        <p style={{ fontSize: 72, fontWeight: 900, color: P, margin: '10px 0 0' }}>{left > 0 ? left : '👁️'}</p>
        <p style={{ color: '#888', fontSize: 13 }}>눈 크게 뜨고 준비!</p>
      </div>
    )
  }

  // ---------- 배틀 ----------
  if (phase === 'battle') {
    const myResult = results[playerId]
    return (
      <div className="card" style={{ textAlign: 'center', position: 'relative', overflow: 'hidden' }}><Head />
        <style>{`
          @keyframes fly-across { from { left: -12%; } to { left: 108%; } }
          @keyframes drop-in { from { transform: translateY(-16px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        `}</style>
        {!myResult && fx.map(f => (
          <div key={f.id} style={{
            position: 'absolute', top: `${f.top}%`, fontSize: f.size, pointerEvents: 'none', zIndex: 5,
            animation: `fly-across ${f.dur}s linear forwards`,
          }}>{f.emoji}</div>
        ))}
        {!myResult && alert && (
          <div style={{
            position: 'absolute', top: 44, right: 10, zIndex: 6, background: '#2A2247', color: '#fff',
            padding: '8px 12px', borderRadius: 10, fontSize: 12, maxWidth: 220, textAlign: 'left',
            boxShadow: '0 6px 18px rgba(0,0,0,.25)', animation: 'drop-in .2s ease-out',
          }}>🔔 {alert}</div>
        )}

        <p style={{ fontSize: 40, fontWeight: 900, color: myResult ? '#E53935' : P, margin: '0 0 6px' }}>
          {(elapsed / 1000).toFixed(1)}<span style={{ fontSize: 18 }}>초</span>
        </p>

        {myResult ? (
          <div style={{ padding: '14px 0' }}>
            <p style={{ fontSize: 40, margin: 0 }}>{myResult.reason === 'noface' ? '🫥' : '😵'}</p>
            <p style={{ fontSize: 17, fontWeight: 800, color: '#E53935', margin: '6px 0' }}>
              {myResult.reason === 'noface' ? '얼굴 이탈로 실격!' : '깜빡였습니다!'}
            </p>
            <p style={{ fontSize: 13, color: '#888' }}>내 기록 {(myResult.ms / 1000).toFixed(2)}초 · 남은 사람 응원하기 👀</p>
          </div>
        ) : (
          <>
            {cameraView(true)}
            <p style={{ fontSize: 13, color: '#888', marginTop: 8 }}>깜빡이지 마세요...!</p>
          </>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center', marginTop: 12 }}>
          {players.map(p => {
            const r = results[p.id]
            return (
              <span key={p.id} className="team-chip"
                style={{ background: r ? '#FDEAEA' : '#E6F7F5', color: r ? '#C62828' : '#1B9C8D', fontWeight: 700 }}>
                {r ? `💀 ${p.name} ${(r.ms / 1000).toFixed(1)}s` : `👁️ ${p.name}`}
              </span>
            )
          })}
        </div>
        <p style={{ fontSize: 12, color: '#aaa', marginTop: 8 }}>
          생존 {alive.length}/{players.length} · 최대 {MAX_MS / 1000}초
        </p>
      </div>
    )
  }

  // ---------- 결과 ----------
  const board = players.map(p => {
    const r = results[p.id]
    return { ...p, ms: r ? r.ms : (gs.endedMs || MAX_MS), reason: r?.reason, survived: !r }
  }).sort((a, b) => b.ms - a.ms)

  return (
    <div className="card" style={{ textAlign: 'center' }}><Head />
      <p style={{ fontSize: 34, margin: '4px 0' }}>🏆</p>
      <p style={{ fontSize: 15, fontWeight: 800, color: P, margin: 0 }}>
        {board[0] ? `${board[0].name} 승리!` : '결과'}
      </p>
      <div style={{ maxWidth: 340, margin: '12px auto 0', display: 'grid', gap: 5 }}>
        {board.map((p, i) => (
          <div key={p.id} style={{
            display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderRadius: 12,
            background: i === 0 ? '#F0EDFE' : '#F8F7FC', fontWeight: 700, fontSize: 13,
          }}>
            <span>{i === 0 ? '👑' : `${i + 1}.`} {p.name}</span>
            <span style={{ color: p.survived ? '#1B9C8D' : '#E53935' }}>
              {(p.ms / 1000).toFixed(2)}초 {p.survived ? '생존' : p.reason === 'noface' ? '🫥' : '😵'}
            </span>
          </div>
        ))}
      </div>
      {isHost
        ? <button className="btn-primary" onClick={nextRound} style={{ marginTop: 16, padding: '12px 32px' }}>🔄 한 판 더</button>
        : <p style={{ color: '#aaa', marginTop: 16 }}>방장 대기 중...</p>}
    </div>
  )
}
