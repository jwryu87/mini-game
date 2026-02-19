import { useState, useEffect } from 'react'
import { db, ref, onValue, update, set } from '../firebase'

const KEYWORDS = {
  스포츠: ['축구','야구','농구','배구','탁구','테니스','볼링','골프','스키','스노우보드','배드민턴','등산','수영','스케이트','복싱','태권도','유도','양궁','당구','바둑','체스'],
  음식: ['피자','치킨','햄버거','떡볶이','라면','김밥','초밥','스테이크','삼겹살','갈비','불고기','순대','김치찌개','된장찌개','비빔밥','짜장면','짬뽕','탕수육','파스타','카레','우동','마라탕','삼계탕','떡국','만두'],
  동물: ['고양이','강아지','토끼','햄스터','펭귄','코끼리','사자','호랑이','여우','기린','코알라','원숭이','돼지','소','양','닭','앵무새','고래','상어','돌고래','곰','판다','낙타','캥거루','독수리'],
  직업: ['의사','변호사','경찰','소방관','선생님','요리사','가수','배우','과학자','프로그래머','작가','군인','간호사','비행기 조종사','농부','판사','기자','아나운서','디자이너','건축가','약사','회계사'],
  장소: ['학교','병원','도서관','공원','놀이공원','동물원','영화관','백화점','편의점','바다','산','사막','수영장','공항','박물관','미술관','노래방','PC방','찜질방','카페','경기장'],
  나라: ['한국','미국','일본','중국','영국','프랑스','독일','이탈리아','호주','캐나다','브라질','인도','베트남','태국','이집트','스위스','싱가포르','뉴질랜드','멕시코','러시아'],
  영화: ['해리포터','어벤져스','타이타닉','겨울왕국','알라딘','라이온킹','토이스토리','스파이더맨','기생충','부산행','명량','극한직업','베테랑','범죄도시','올드보이','아저씨','설국열차','살인의추억','오징어게임'],
  물건: ['스마트폰','컴퓨터','냉장고','세탁기','에어컨','선풍기','청소기','칫솔','시계','안경','모자','우산','자전거','엘리베이터','침대','거울','화장품','이어폰','충전기'],
  '과일/채소': ['사과','바나나','포도','딸기','수박','참외','귤','오렌지','복숭아','배','파인애플','망고','키위','토마토','당근','양파','감자','고구마','옥수수','호박','브로콜리','아보카도'],
}

const SUBJECTS = Object.keys(KEYWORDS)
const SUBJECT_EMOJI = { 스포츠:'⚽', 음식:'🍔', 동물:'🐶', 직업:'👨‍⚕️', 장소:'🏖️', 나라:'🌍', 영화:'🎬', 물건:'📱', '과일/채소':'🍎' }

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function initState(players, subject) {
  const ids = players.map(p => p.id)
  const chosenSubject = subject || SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)]
  const words = KEYWORDS[chosenSubject]
  const keyword = words[Math.floor(Math.random() * words.length)]
  const liarIdx = Math.floor(Math.random() * ids.length)
  const order = shuffle(ids)
  return {
    phase: 'reveal',
    subject: chosenSubject,
    keyword,
    liarId: ids[liarIdx],
    speakOrder: order,
    speakIdx: 0,
    votes: {},
    liarGuess: null,
  }
}

const S = {
  wrap: { maxWidth: 520, margin: '0 auto', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #f0f0f0' },
  title: { margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: -0.5, color: '#1a1a2e' },
  lobbyBtn: { padding: '6px 14px', borderRadius: 20, border: '1px solid #e0e0e0', background: '#fff', fontSize: 12, color: '#666', cursor: 'pointer', fontWeight: 600, transition: 'all .15s' },
  body: { padding: '24px 20px' },
  section: { textAlign: 'center' },
  badge: (color) => ({ display: 'inline-block', padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: color + '15', color, letterSpacing: -0.3 }),
  heading: { fontSize: 22, fontWeight: 800, color: '#1a1a2e', margin: '12px 0 4px', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#999', margin: '0 0 20px', lineHeight: 1.6 },
  btnPrimary: { padding: '14px 36px', borderRadius: 14, border: 'none', background: '#1a1a2e', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', transition: 'all .15s', letterSpacing: -0.3 },
  btnSecondary: { padding: '14px 36px', borderRadius: 14, border: '2px solid #1a1a2e', background: 'transparent', color: '#1a1a2e', fontSize: 16, fontWeight: 800, cursor: 'pointer', transition: 'all .15s' },
  btnSmall: { padding: '10px 24px', borderRadius: 12, border: 'none', background: '#1a1a2e', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' },
  chip: (active) => ({
    padding: '10px 18px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer',
    border: active ? '2px solid #1a1a2e' : '2px solid #eee',
    background: active ? '#1a1a2e' : '#fff',
    color: active ? '#fff' : '#555',
    transition: 'all .15s', display: 'inline-flex', alignItems: 'center', gap: 6,
  }),
  card: (bg) => ({ padding: 20, borderRadius: 16, background: bg || '#f8f8fa', marginBottom: 12 }),
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  divider: { height: 1, background: '#f0f0f0', margin: '20px 0', border: 'none' },
}

export default function LiarGame({ roomCode, playerId, playerName, players, isHost, onEndGame }) {
  const [gs, setGs] = useState(null)
  const [cardFlipped, setCardFlipped] = useState(false)
  const [selectedVote, setSelectedVote] = useState(null)
  const [guessInput, setGuessInput] = useState('')
  const [subjectChoice, setSubjectChoice] = useState(null)
  const gsRef = ref(db, `rooms/${roomCode}/gameState`)

  useEffect(() => {
    const unsub = onValue(gsRef, snap => {
      if (snap.exists()) setGs(snap.val())
    })
    return () => unsub()
  }, [roomCode])

  useEffect(() => {
    if (!gs && isHost) set(gsRef, { phase: 'setup' })
  }, [gs, isHost])

  useEffect(() => {
    if (gs?.phase === 'reveal') {
      setCardFlipped(false)
      setSelectedVote(null)
    }
  }, [gs?.phase])

  const startRound = async (subject) => {
    setCardFlipped(false)
    setSelectedVote(null)
    setGuessInput('')
    await set(gsRef, initState(players, subject))
  }

  const nextPhase = async (phase) => { await update(gsRef, { phase }) }

  const submitVote = async () => {
    if (!selectedVote) return
    const votesRef = ref(db, `rooms/${roomCode}/gameState/votes`)
    await update(votesRef, { [playerId]: selectedVote })
  }

  const submitGuess = async () => {
    await update(gsRef, { liarGuess: guessInput.trim(), phase: 'final' })
  }

  const getName = (id) => players.find(p => p.id === id)?.name || '?'

  if (!gs) return <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>게임 준비 중...</div>

  const allIds = players.map(p => p.id)
  const votedCount = Object.keys(gs.votes || {}).length
  const allVoted = votedCount >= allIds.length
  const voteTally = {}
  Object.values(gs.votes || {}).forEach(v => { voteTally[v] = (voteTally[v] || 0) + 1 })
  const maxVotes = Math.max(0, ...Object.values(voteTally))
  const mostVoted = Object.entries(voteTally).filter(([, c]) => c === maxVotes).map(([id]) => id)
  const caughtLiar = mostVoted.length === 1 ? mostVoted[0] : null
  const isLiar = gs.liarId === playerId
  const liarCaught = caughtLiar === gs.liarId
  const normalize = s => (s || '').replace(/\s/g, '').toLowerCase()
  const liarGuessCorrect = gs.liarGuess && normalize(gs.liarGuess) === normalize(gs.keyword)

  return (
    <div style={{ ...S.wrap, background: '#fff', borderRadius: 20, boxShadow: '0 2px 20px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={S.header}>
        <h3 style={S.title}>🤥 라이어 게임</h3>
        {isHost && onEndGame && (
          <button onClick={onEndGame} style={S.lobbyBtn}>← 로비</button>
        )}
      </div>

      <div style={S.body}>

        {/* ===== SETUP ===== */}
        {gs.phase === 'setup' && isHost && (
          <div style={S.section}>
            <div style={{ ...S.card('#f8f8fa'), textAlign: 'left', marginBottom: 24 }}>
              <p style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e', marginBottom: 10 }}>게임 방법</p>
              <div style={{ fontSize: 13, color: '#666', lineHeight: 1.8 }}>
                <div>1. 모두에게 같은 <strong>단어</strong>가 주어지지만, <strong style={{ color: '#E53935' }}>라이어 1명</strong>만 단어를 모릅니다</div>
                <div>2. 돌아가며 단어를 <strong>설명</strong>합니다 (단어를 직접 말하면 안 돼요!)</div>
                <div>3. 설명을 듣고 라이어가 누군지 <strong>투표</strong>합니다</div>
                <div>4. 라이어가 적발되면, 라이어는 정답을 <strong>맞출 기회</strong> 1번!</div>
              </div>
            </div>

            <p style={{ ...S.heading, marginTop: 0 }}>주제 선택</p>
            <p style={S.sub}>어떤 주제로 플레이할까요?</p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 28 }}>
              {SUBJECTS.map(s => (
                <button key={s} onClick={() => setSubjectChoice(s)} style={S.chip(subjectChoice === s)}>
                  <span>{SUBJECT_EMOJI[s]}</span> {s}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => startRound(subjectChoice)} disabled={!subjectChoice}
                style={{ ...S.btnPrimary, opacity: subjectChoice ? 1 : 0.4 }}>
                시작하기
              </button>
              <button onClick={() => startRound(null)} style={S.btnSecondary}>
                🎲 랜덤
              </button>
            </div>
          </div>
        )}

        {gs.phase === 'setup' && !isHost && (
          <div style={{ ...S.section, padding: '40px 0' }}>
            <div style={{ ...S.card('#f8f8fa'), textAlign: 'left', marginBottom: 24 }}>
              <p style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e', marginBottom: 10 }}>게임 방법</p>
              <div style={{ fontSize: 13, color: '#666', lineHeight: 1.8 }}>
                <div>1. 모두에게 같은 <strong>단어</strong>가 주어지지만, <strong style={{ color: '#E53935' }}>라이어 1명</strong>만 단어를 모릅니다</div>
                <div>2. 돌아가며 단어를 <strong>설명</strong>합니다 (단어를 직접 말하면 안 돼요!)</div>
                <div>3. 설명을 듣고 라이어가 누군지 <strong>투표</strong>합니다</div>
                <div>4. 라이어가 적발되면, 라이어는 정답을 <strong>맞출 기회</strong> 1번!</div>
              </div>
            </div>
            <div style={{ fontSize: 14, color: '#aaa' }}>방장이 주제를 선택 중입니다...</div>
          </div>
        )}

        {/* ===== REVEAL ===== */}
        {gs.phase === 'reveal' && (
          <div style={S.section}>
            <div style={S.badge('#E65100')}>{SUBJECT_EMOJI[gs.subject]} {gs.subject}</div>
            <p style={S.heading}>카드를 확인하세요</p>
            <p style={S.sub}>터치해서 뒤집기 — 다른 사람에게 보여주지 마세요!</p>

            <div onClick={() => setCardFlipped(!cardFlipped)}
              style={{ width: 240, height: 160, margin: '0 auto 28px', cursor: 'pointer', perspective: 1000, userSelect: 'none' }}>
              <div style={{
                width: '100%', height: '100%', position: 'relative',
                transition: 'transform 0.6s cubic-bezier(.4,.2,.2,1)', transformStyle: 'preserve-3d',
                transform: cardFlipped ? 'rotateY(180deg)' : 'rotateY(0)',
              }}>
                {/* Front */}
                <div style={{
                  position: 'absolute', width: '100%', height: '100%',
                  backfaceVisibility: 'hidden', borderRadius: 20,
                  background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 8px 30px rgba(26,26,46,0.25)',
                }}>
                  <div style={{ fontSize: 32 }}>🃏</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>터치하여 확인</div>
                </div>
                {/* Back */}
                <div style={{
                  position: 'absolute', width: '100%', height: '100%',
                  backfaceVisibility: 'hidden', borderRadius: 20,
                  transform: 'rotateY(180deg)',
                  background: isLiar ? 'linear-gradient(135deg, #1a1a2e, #0f3460)' : '#fff',
                  border: isLiar ? 'none' : '2px solid #f0f0f0',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  boxShadow: isLiar ? '0 8px 30px rgba(0,0,0,0.3)' : '0 8px 30px rgba(0,0,0,0.08)',
                }}>
                  {isLiar ? (
                    <>
                      <div style={{ fontSize: 40 }}>🤥</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: '#E53935', marginTop: 8, letterSpacing: -0.5 }}>당신은 라이어!</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>주제도 알 수 없습니다</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, color: '#aaa', fontWeight: 600 }}>주제: {gs.subject}</div>
                      <div style={{ fontSize: 30, fontWeight: 900, color: '#1a1a2e', marginTop: 8, letterSpacing: -0.5 }}>{gs.keyword}</div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {isHost && (
              <button onClick={() => nextPhase('discuss')} style={S.btnPrimary}>
                모두 확인 완료 →
              </button>
            )}
            {!isHost && <p style={{ fontSize: 13, color: '#bbb' }}>방장이 다음 단계로 넘길 때까지 대기</p>}
          </div>
        )}

        {/* ===== DISCUSS ===== */}
        {gs.phase === 'discuss' && (
          <div style={S.section}>
            <div style={S.badge('#E65100')}>{SUBJECT_EMOJI[gs.subject]} {gs.subject}</div>
            <p style={S.heading}>토론 시간</p>
            <p style={S.sub}>돌아가며 단어를 설명하세요. 단어 자체를 말하면 안 돼요!</p>

            <div style={{ marginBottom: 24 }}>
              {(gs.speakOrder || []).map((id, i) => {
                const isCurrent = i === gs.speakIdx
                const isDone = i < gs.speakIdx
                return (
                  <div key={id} style={{
                    padding: '12px 16px', margin: '6px 0', borderRadius: 14,
                    background: isCurrent ? '#1a1a2e' : isDone ? '#f0faf0' : '#f8f8fa',
                    color: isCurrent ? '#fff' : '#333',
                    display: 'flex', alignItems: 'center', gap: 10,
                    transition: 'all .2s',
                  }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 800,
                      background: isCurrent ? 'rgba(255,255,255,0.15)' : isDone ? '#4CAF50' : '#e8e8e8',
                      color: isCurrent ? '#fff' : isDone ? '#fff' : '#999',
                    }}>
                      {isDone ? '✓' : i + 1}
                    </span>
                    <span style={{ fontWeight: isCurrent ? 800 : 500, fontSize: 15 }}>{getName(id)}</span>
                    {isCurrent && <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.7 }}>설명 중</span>}
                  </div>
                )
              })}
            </div>

            {isHost && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                {gs.speakIdx < (gs.speakOrder?.length || 0) - 1 ? (
                  <button onClick={() => update(gsRef, { speakIdx: gs.speakIdx + 1 })} style={S.btnPrimary}>
                    다음 사람 →
                  </button>
                ) : (
                  <button onClick={() => nextPhase('vote')} style={{ ...S.btnPrimary, background: '#E53935' }}>
                    🗳️ 투표 시작
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== VOTE ===== */}
        {gs.phase === 'vote' && (
          <div style={S.section}>
            <p style={S.heading}>투표</p>
            <p style={S.sub}>라이어라고 생각하는 사람에게 투표하세요</p>

            <div style={{ ...S.badge('#1a1a2e'), marginBottom: 20 }}>
              {votedCount}/{allIds.length}명 투표 완료
            </div>

            {!(gs.votes || {})[playerId] ? (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
                  {allIds.map(id => (
                    <button key={id} onClick={() => id !== playerId && setSelectedVote(id)}
                      style={{
                        padding: '12px 22px', borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: id === playerId ? 'default' : 'pointer',
                        border: selectedVote === id ? '2px solid #E53935' : '2px solid #eee',
                        background: selectedVote === id ? '#FFF0F0' : '#fff',
                        color: id === playerId ? '#ddd' : selectedVote === id ? '#E53935' : '#333',
                        transition: 'all .15s',
                      }}>
                      {getName(id)}{id === playerId ? ' (나)' : ''}
                    </button>
                  ))}
                </div>
                <button onClick={submitVote} disabled={!selectedVote}
                  style={{ ...S.btnPrimary, background: '#E53935', opacity: selectedVote ? 1 : 0.4 }}>
                  투표하기
                </button>
              </>
            ) : (
              <div style={{ ...S.card('#f8f8fa'), color: '#888' }}>
                ✅ 투표 완료! 다른 사람들을 기다리는 중...
              </div>
            )}

            {allVoted && isHost && (
              <button onClick={() => nextPhase('result')} style={{ ...S.btnPrimary, marginTop: 16 }}>
                결과 공개
              </button>
            )}
          </div>
        )}

        {/* ===== RESULT ===== */}
        {gs.phase === 'result' && (
          <div style={S.section}>
            <p style={S.heading}>투표 결과</p>
            <div style={{ marginBottom: 20 }}>
              {allIds.map(id => {
                const count = voteTally[id] || 0
                const isMax = count === maxVotes && maxVotes > 0
                return (
                  <div key={id} style={{
                    padding: '12px 16px', margin: '6px 0', borderRadius: 14,
                    background: isMax ? '#FFF0F0' : '#f8f8fa',
                    border: isMax ? '2px solid #E53935' : '2px solid transparent',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontWeight: isMax ? 800 : 500, fontSize: 15 }}>
                      {getName(id)}
                    </span>
                    <span style={{ fontWeight: 800, color: isMax ? '#E53935' : '#bbb', fontSize: 15 }}>
                      {count}표
                    </span>
                  </div>
                )
              })}
            </div>

            {caughtLiar && liarCaught ? (
              <div style={{ ...S.card('linear-gradient(135deg,#f0faf0,#e8f5e9)'), textAlign: 'center' }}>
                <div style={{ fontSize: 32 }}>🎉</div>
                <p style={{ fontSize: 18, fontWeight: 900, color: '#2E7D32', margin: '8px 0 4px' }}>
                  라이어 {getName(gs.liarId)} 적발!
                </p>
                <p style={{ fontSize: 13, color: '#666' }}>라이어에게 정답을 맞출 기회가 주어집니다</p>
              </div>
            ) : caughtLiar && !liarCaught ? (
              <div style={{ ...S.card('linear-gradient(135deg,#FFF0F0,#FFE0E0)'), textAlign: 'center' }}>
                <div style={{ fontSize: 32 }}>😈</div>
                <p style={{ fontSize: 16, fontWeight: 800, color: '#C62828', margin: '8px 0' }}>
                  {getName(caughtLiar)}은(는) 라이어가 아닙니다!
                </p>
                <p style={{ fontSize: 15, color: '#E53935', fontWeight: 700 }}>진짜 라이어: {getName(gs.liarId)}</p>
                <div style={{ marginTop: 12, padding: '10px 20px', background: 'rgba(255,255,255,0.7)', borderRadius: 12, display: 'inline-block' }}>
                  <span style={{ fontSize: 13, color: '#999' }}>정답: </span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: '#1a1a2e' }}>{gs.keyword}</span>
                </div>
              </div>
            ) : (
              <div style={{ ...S.card('linear-gradient(135deg,#FFF8E1,#FFE082)'), textAlign: 'center' }}>
                <div style={{ fontSize: 32 }}>🤷</div>
                <p style={{ fontSize: 16, fontWeight: 800, color: '#E65100', margin: '8px 0' }}>동률! 라이어를 잡지 못했습니다</p>
                <p style={{ fontSize: 15, color: '#C62828', fontWeight: 700 }}>라이어: {getName(gs.liarId)}</p>
                <div style={{ marginTop: 12, padding: '10px 20px', background: 'rgba(255,255,255,0.7)', borderRadius: 12, display: 'inline-block' }}>
                  <span style={{ fontSize: 13, color: '#999' }}>정답: </span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: '#1a1a2e' }}>{gs.keyword}</span>
                </div>
              </div>
            )}

            {isHost && liarCaught && (
              <button onClick={() => nextPhase('guess')} style={{ ...S.btnPrimary, marginTop: 16 }}>
                라이어 정답 맞추기 →
              </button>
            )}
            {isHost && !liarCaught && (
              <button onClick={() => nextPhase('final')} style={{ ...S.btnPrimary, marginTop: 16 }}>
                다음 →
              </button>
            )}
          </div>
        )}

        {/* ===== GUESS ===== */}
        {gs.phase === 'guess' && (
          <div style={S.section}>
            <div style={S.badge('#E53935')}>라이어: {getName(gs.liarId)}</div>
            <p style={S.heading}>마지막 기회</p>
            <p style={S.sub}>라이어가 정답을 맞추면 라이어의 승리!</p>

            {isLiar ? (
              <div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
                  <input value={guessInput} onChange={e => setGuessInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && guessInput.trim()) submitGuess() }}
                    placeholder="정답을 입력하세요"
                    style={{
                      padding: '14px 18px', fontSize: 16, borderRadius: 14,
                      border: '2px solid #1a1a2e', width: 200, textAlign: 'center',
                      fontWeight: 700, outline: 'none',
                    }}
                  />
                  <button onClick={submitGuess} disabled={!guessInput.trim()}
                    style={{ ...S.btnPrimary, opacity: guessInput.trim() ? 1 : 0.4 }}>
                    제출
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ ...S.card('#f8f8fa'), color: '#999' }}>
                라이어가 정답을 맞추는 중...
              </div>
            )}
          </div>
        )}

        {/* ===== FINAL ===== */}
        {gs.phase === 'final' && (
          <div style={S.section}>
            {liarCaught && !liarGuessCorrect && (
              <div style={{ ...S.card('linear-gradient(135deg,#f0faf0,#c8e6c9)'), textAlign: 'center', padding: 32 }}>
                <div style={{ fontSize: 48 }}>🎉</div>
                <p style={{ fontSize: 24, fontWeight: 900, color: '#2E7D32', margin: '12px 0 8px', letterSpacing: -0.5 }}>시민 승리!</p>
                <p style={{ fontSize: 14, color: '#666' }}>라이어의 추측: <strong>{gs.liarGuess || '(없음)'}</strong></p>
              </div>
            )}
            {liarCaught && liarGuessCorrect && (
              <div style={{ ...S.card('linear-gradient(135deg,#1a1a2e,#16213e)'), textAlign: 'center', padding: 32 }}>
                <div style={{ fontSize: 48 }}>😈</div>
                <p style={{ fontSize: 24, fontWeight: 900, color: '#E53935', margin: '12px 0 8px' }}>라이어 승리!</p>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>라이어가 정답을 맞췄습니다!</p>
              </div>
            )}
            {!liarCaught && (
              <div style={{ ...S.card('linear-gradient(135deg,#1a1a2e,#16213e)'), textAlign: 'center', padding: 32 }}>
                <div style={{ fontSize: 48 }}>😈</div>
                <p style={{ fontSize: 24, fontWeight: 900, color: '#E53935', margin: '12px 0 8px' }}>라이어 승리!</p>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>라이어를 찾지 못했습니다</p>
              </div>
            )}

            <div style={{ ...S.card('#f8f8fa'), marginTop: 16, textAlign: 'center' }}>
              <span style={{ fontSize: 13, color: '#999' }}>라이어: </span>
              <span style={{ fontWeight: 800, color: '#1a1a2e' }}>{getName(gs.liarId)}</span>
              <span style={{ margin: '0 8px', color: '#ddd' }}>|</span>
              <span style={{ fontSize: 13, color: '#999' }}>정답: </span>
              <span style={{ fontWeight: 800, color: '#E65100' }}>{gs.keyword}</span>
            </div>

            {isHost && (
              <button onClick={() => set(gsRef, { phase: 'setup' })} style={{ ...S.btnPrimary, marginTop: 20 }}>
                🔄 다음 라운드
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
