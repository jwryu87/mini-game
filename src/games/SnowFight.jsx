import { useState, useEffect, useRef } from 'react'
import { db, ref, onValue, update, set } from '../firebase'

const W = 800, H = 500, MAX_HP = 3, PR = 22, SR = 5
const MOVE_SPEED = 2.5, COOLDOWN = 1500, MAX_RESPAWNS = 3
const COLORS = ['#E53935','#1E88E5','#43A047','#FB8C00','#8E24AA','#00897B','#D81B60','#5E35B1']
const TREES = [[50,45],[750,45],[50,455],[750,455],[400,20],[400,480],[130,240],[670,240]]
const SNOW = [[80,70,30,18],[200,350,40,20],[500,100,35,15],[650,400,28,22],
  [350,250,25,12],[120,420,32,16],[700,200,20,10],[400,450,38,14]]
const ROCKS = [
  { x: 200, y: 130, w: 50, h: 32 },
  { x: 600, y: 370, w: 55, h: 35 },
  { x: 380, y: 250, w: 60, h: 38 },
  { x: 150, y: 380, w: 45, h: 30 },
  { x: 650, y: 130, w: 48, h: 32 },
  { x: 500, y: 440, w: 42, h: 28 },
]

function collidesRock(px, py, radius) {
  for (const r of ROCKS) {
    const dx = Math.abs(px - r.x), dy = Math.abs(py - r.y)
    if (dx < r.w / 2 + radius && dy < r.h / 2 + radius) return true
  }
  return false
}

const INIT_CHARS = ['🐶','🐱','🐰','🦊','🐻','🐧','🐸','🐯']
const RESPAWN_CHARS = ['🐶','🐱','🐰','🦊','🐻','🐧','🐸','🐯','🐼','🦁','🐮','🐷','🐵','🦄','🐺','🐲']

function initState(players) {
  const ids = players.map(p => p.id)
  const positions = {}
  const cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.32
  ids.forEach((id, i) => {
    const a = (i / ids.length) * Math.PI * 2 - Math.PI / 2
    positions[id] = {
      x: Math.round(cx + Math.cos(a) * r),
      y: Math.round(cy + Math.sin(a) * r),
      hp: MAX_HP, color: COLORS[i % COLORS.length],
      kills: 0, char: INIT_CHARS[i % INIT_CHARS.length], respawnsLeft: MAX_RESPAWNS,
    }
  })
  return { phase: 'playing', positions, eliminated: [], log: [], winner: null }
}

function getAlive(pos, elim) {
  return Object.keys(pos || {}).filter(id => !(elim || []).includes(id))
}

export default function SnowFight({ roomCode, playerId, players, isHost, onEndGame }) {
  const canvasRef = useRef(null)
  const dbRef = ref(db, `rooms/${roomCode}/gameState`)
  const gsRef = useRef(null)
  const local = useRef({
    pos: null, target: null,
    charging: false, power: 0, mouse: null,
    balls: [], cooldownUntil: 0, pressStart: 0, lastSync: 0,
  })
  const onUpRef = useRef(null)
  const playersRef = useRef(players)
  playersRef.current = players

  const [phase, setPhase] = useState('loading')
  const [uiData, setUiData] = useState({ winner: null, log: [], status: [] })

  useEffect(() => {
    const unsub = onValue(dbRef, snap => {
      if (!snap.exists()) return
      const data = snap.val()
      gsRef.current = data
      setPhase(data.phase || 'playing')
      if (!local.current.pos && data.positions?.[playerId]) {
        const p = data.positions[playerId]
        local.current.pos = { x: p.x, y: p.y }
      }
      const elim = data.eliminated || []
      setUiData({
        winner: data.winner ? players.find(p => p.id === data.winner)?.name : null,
        log: data.log || [],
        status: Object.entries(data.positions || {}).map(([id, p]) => ({
          id, name: players.find(pl => pl.id === id)?.name,
          hp: p.hp, color: p.color,
          dead: elim.includes(id),
          respawning: !!p.needsRespawn,
          kills: p.kills || 0,
        })),
      })
    })
    return () => unsub()
  }, [roomCode, playerId])

  useEffect(() => {
    if (isHost && (!gsRef.current || !gsRef.current.positions)) set(dbRef, initState(players))
  }, [isHost, phase])

  const toCanvas = (e) => {
    const c = canvasRef.current
    if (!c) return null
    const rect = c.getBoundingClientRect()
    const t = e.touches?.[0] || e
    return { x: (t.clientX - rect.left) * W / rect.width, y: (t.clientY - rect.top) * H / rect.height }
  }

  const onDown = (e) => {
    if (phase !== 'playing') return
    const g = gsRef.current
    if ((g?.eliminated || []).includes(playerId)) return
    if (g?.positions?.[playerId]?.needsRespawn) return
    e.preventDefault()
    local.current.pressStart = Date.now()
    local.current.mouse = toCanvas(e)
  }

  const onMove = (e) => { local.current.mouse = toCanvas(e) }

  onUpRef.current = (e) => {
    const L = local.current
    if (!L.pressStart) return
    const elapsed = Date.now() - L.pressStart
    const pos = (e ? toCanvas(e) : null) || L.mouse

    if (elapsed < 200) {
      if (pos) L.target = { x: Math.max(PR, Math.min(W - PR, pos.x)), y: Math.max(PR, Math.min(H - PR, pos.y)) }
    } else if (L.charging) {
      L.charging = false
      if (L.pos && L.mouse && Date.now() >= L.cooldownUntil) {
        const dx = L.mouse.x - L.pos.x, dy = L.mouse.y - L.pos.y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d > 5) {
          const pwr = Math.max(L.power, 10)
          const speed = (pwr / 100) * 7 + 2.5
          L.balls.push({
            x: L.pos.x, y: L.pos.y,
            vx: (dx / d) * speed, vy: (dy / d) * speed,
            dist: 0, maxDist: pwr * 5 + 80,
            owner: playerId, resolved: false,
          })
          L.cooldownUntil = Date.now() + COOLDOWN
        }
      }
      L.power = 0
    }
    L.pressStart = 0
  }

  useEffect(() => {
    const handler = (e) => onUpRef.current?.(e)
    window.addEventListener('mouseup', handler)
    window.addEventListener('touchend', handler)
    return () => {
      window.removeEventListener('mouseup', handler)
      window.removeEventListener('touchend', handler)
    }
  }, [])

  useEffect(() => {
    const iv = setInterval(() => {
      const L = local.current
      if (L.pressStart > 0 && !L.charging && Date.now() - L.pressStart >= 200) {
        if (Date.now() >= L.cooldownUntil && !(gsRef.current?.eliminated || []).includes(playerId)) {
          L.charging = true
          L.power = 0
        }
      }
    }, 30)
    return () => clearInterval(iv)
  }, [playerId])

  const [respawnPicker, setRespawnPicker] = useState(false)

  const doHit = async (hitId) => {
    const g = gsRef.current
    if (!g) return
    const pls = playersRef.current
    const myName = pls.find(p => p.id === playerId)?.name
    const hitName = pls.find(p => p.id === hitId)?.name
    const hp = Math.max(0, (g.positions[hitId]?.hp || MAX_HP) - 1)
    const logs = [...(g.log || []).slice(-30)]
    logs.push(`❄️ ${myName} → ${hitName} 명중! (HP ${hp}/${MAX_HP})`)
    const myKills = (g.positions[playerId]?.kills || 0)
    const updates = { [`positions/${hitId}/hp`]: hp, log: logs }

    if (hp <= 0) {
      updates[`positions/${playerId}/kills`] = myKills + 1
      const respawns = g.positions[hitId]?.respawnsLeft ?? 0
      if (respawns > 0) {
        logs.push(`💀 ${hitName} 쓰러짐! (부활 ${respawns}회 남음)`)
        updates[`positions/${hitId}/respawnsLeft`] = respawns - 1
        updates[`positions/${hitId}/needsRespawn`] = true
        updates.log = logs
      } else {
        const elim = [...(g.eliminated || []), hitId]
        logs.push(`☠️ ${hitName} 완전 탈락!`)
        updates.eliminated = elim
        updates.log = logs
        const alive = getAlive(g.positions, elim)
        if (alive.length <= 1) {
          const w = alive[0]
          logs.push(`🏆 ${pls.find(p => p.id === w)?.name} 승리!`)
          updates.phase = 'finished'
          updates.winner = w
          updates.log = logs
        }
      }
    }
    await update(dbRef, updates)
  }

  const doRespawn = async (charEmoji) => {
    const g = gsRef.current
    if (!g) return
    let cx, cy, tries = 0
    do {
      cx = W / 2 + (Math.random() - 0.5) * 300
      cy = H / 2 + (Math.random() - 0.5) * 200
      tries++
    } while (collidesRock(cx, cy, PR) && tries < 30)
    await update(dbRef, {
      [`positions/${playerId}/hp`]: MAX_HP,
      [`positions/${playerId}/x`]: Math.round(cx),
      [`positions/${playerId}/y`]: Math.round(cy),
      [`positions/${playerId}/char`]: charEmoji,
      [`positions/${playerId}/needsRespawn`]: false,
    })
    local.current.pos = { x: cx, y: cy }
    local.current.target = null
    setRespawnPicker(false)
  }

  useEffect(() => {
    const g = gsRef.current
    if (g?.positions?.[playerId]?.needsRespawn && !respawnPicker) {
      setRespawnPicker(true)
    }
  })

  useEffect(() => {
    if (phase !== 'playing') return
    let running = true

    const loop = () => {
      if (!running) return
      const L = local.current
      const g = gsRef.current
      if (!g?.positions) { requestAnimationFrame(loop); return }

      const myDead = (g.eliminated || []).includes(playerId) || g.positions[playerId]?.needsRespawn
      if (L.target && L.pos && !myDead) {
        const dx = L.target.x - L.pos.x, dy = L.target.y - L.pos.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > MOVE_SPEED) {
          const nx = L.pos.x + (dx / dist) * MOVE_SPEED
          const ny = L.pos.y + (dy / dist) * MOVE_SPEED
          const cx = Math.max(PR, Math.min(W - PR, nx))
          const cy = Math.max(PR, Math.min(H - PR, ny))
          if (!collidesRock(cx, cy, PR)) {
            L.pos.x = cx; L.pos.y = cy
          } else {
            if (!collidesRock(cx, L.pos.y, PR)) { L.pos.x = cx }
            else if (!collidesRock(L.pos.x, cy, PR)) { L.pos.y = cy }
            else { L.target = null }
          }
        } else {
          const tx = Math.max(PR, Math.min(W - PR, L.target.x))
          const ty = Math.max(PR, Math.min(H - PR, L.target.y))
          if (!collidesRock(tx, ty, PR)) {
            L.pos.x = tx; L.pos.y = ty
          }
          L.target = null
        }
      }

      if (L.charging) L.power = Math.min(L.power + 1.5, 100)

      const elim = g.eliminated || []
      L.balls = L.balls.filter(b => {
        b.x += b.vx; b.y += b.vy
        b.dist += Math.sqrt(b.vx * b.vx + b.vy * b.vy)

        if (b.dist > b.maxDist || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) {
          return false
        }

        for (const r of ROCKS) {
          const dx = b.x - r.x, dy = b.y - r.y
          if (Math.abs(dx) < r.w / 2 + SR && Math.abs(dy) < r.h / 2 + SR) return false
        }

        if (b.owner === playerId && !b.resolved) {
          const alive = getAlive(g.positions, elim).filter(id => id !== playerId && !g.positions[id]?.needsRespawn)
          for (const tid of alive) {
            const tp = g.positions[tid]
            if (!tp) continue
            const ddx = b.x - tp.x, ddy = b.y - tp.y
            if (Math.sqrt(ddx * ddx + ddy * ddy) < PR + SR + 3) {
              b.resolved = true
              doHit(tid)
              return false
            }
          }
        }
        return true
      })

      if (L.pos && !myDead && Date.now() - L.lastSync > 100) {
        update(ref(db, `rooms/${roomCode}/gameState/positions/${playerId}`), {
          x: Math.round(L.pos.x), y: Math.round(L.pos.y),
        })
        L.lastSync = Date.now()
      }

      drawFrame(g, L)
      requestAnimationFrame(loop)
    }

    requestAnimationFrame(loop)
    return () => { running = false }
  }, [phase, playerId, roomCode])

  const emojiCache = useRef({})

  const getEmojiImg = (emoji, size) => {
    const key = `${emoji}_${size}`
    if (emojiCache.current[key]) return emojiCache.current[key]
    const s = size * 4
    const off = document.createElement('canvas')
    off.width = s; off.height = s
    const oc = off.getContext('2d')
    oc.font = `${s * 0.75}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
    oc.textAlign = 'center'; oc.textBaseline = 'middle'
    oc.fillText(emoji, s / 2, s / 2)
    emojiCache.current[key] = off
    return off
  }

  const drawFrame = (g, L) => {
    const c = canvasRef.current
    if (!c || !g?.positions) return
    const ctx = c.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    if (c.width !== W * dpr || c.height !== H * dpr) {
      c.width = W * dpr; c.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#E8F5E9'); bg.addColorStop(1, '#C8E6C9')
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    SNOW.forEach(([x, y, rx, ry]) => {
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill()
    })

    TREES.forEach(([tx, ty]) => {
      ctx.fillStyle = '#5D4037'; ctx.fillRect(tx - 2, ty + 2, 4, 10)
      ctx.fillStyle = '#388E3C'
      ctx.beginPath(); ctx.moveTo(tx, ty - 14); ctx.lineTo(tx - 10, ty + 4); ctx.lineTo(tx + 10, ty + 4); ctx.closePath(); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.beginPath(); ctx.moveTo(tx, ty - 14); ctx.lineTo(tx - 5, ty - 5); ctx.lineTo(tx + 5, ty - 5); ctx.closePath(); ctx.fill()
    })

    ROCKS.forEach(r => {
      ctx.fillStyle = '#9E9E9E'
      ctx.beginPath(); ctx.ellipse(r.x, r.y + r.h * 0.15, r.w / 2, r.h / 2, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#BDBDBD'
      ctx.beginPath(); ctx.ellipse(r.x - r.w * 0.12, r.y - r.h * 0.1, r.w * 0.38, r.h * 0.38, -0.2, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#A0A0A0'
      ctx.beginPath(); ctx.ellipse(r.x + r.w * 0.15, r.y + r.h * 0.05, r.w * 0.3, r.h * 0.35, 0.3, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.beginPath(); ctx.ellipse(r.x - r.w * 0.1, r.y - r.h * 0.25, r.w * 0.2, r.h * 0.15, -0.3, 0, Math.PI * 2); ctx.fill()
    })

    const elim = g.eliminated || []
    const pls = playersRef.current

    Object.entries(g.positions).forEach(([id, p]) => {
      const dead = elim.includes(id) || p.needsRespawn
      const isMe = id === playerId
      const info = pls.find(pl => pl.id === id)
      const px = isMe && L.pos ? L.pos.x : p.x
      const py = isMe && L.pos ? L.pos.y : p.y

      ctx.globalAlpha = dead ? 0.3 : 1

      if (isMe && L.target && !dead) {
        ctx.strokeStyle = 'rgba(100,180,255,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(L.target.x, L.target.y); ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(100,180,255,0.3)'
        ctx.beginPath(); ctx.arc(L.target.x, L.target.y, 5, 0, Math.PI * 2); ctx.fill()
      }

      const emojiChar = dead ? '💀' : (p.char || '🐶')
      const emojiSize = PR * 1.6
      const halfE = emojiSize / 2

      ctx.fillStyle = 'rgba(0,0,0,0.1)'
      ctx.beginPath(); ctx.ellipse(px, py + halfE + 2, halfE * 0.7, halfE * 0.2, 0, 0, Math.PI * 2); ctx.fill()

      if (isMe) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(px, py, halfE + 3, 0, Math.PI * 2); ctx.stroke()
      }

      const emojiImg = getEmojiImg(emojiChar, Math.round(emojiSize))
      ctx.drawImage(emojiImg, px - halfE, py - halfE, emojiSize, emojiSize)

      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = dead ? '#AAA' : isMe ? '#1565C0' : '#444'
      ctx.font = `bold ${isMe ? 11 : 10}px sans-serif`; ctx.textAlign = 'center'
      ctx.fillText((isMe ? '⭐' : '') + (info?.name?.slice(0, 4) || '?'), px, py + PR + 16)

      if (!dead) {
        const hw = 26, hh = 3.5, hx = px - hw / 2, hy = py - PR - 16
        ctx.fillStyle = '#DDD'; ctx.fillRect(hx, hy, hw, hh)
        const ratio = (p.hp || 0) / MAX_HP
        ctx.fillStyle = ratio > 0.5 ? '#4CAF50' : ratio > 0.25 ? '#FF9800' : '#F44336'
        ctx.fillRect(hx, hy, hw * ratio, hh)
      }
      ctx.globalAlpha = 1
    })

    if (L.charging && L.pos && L.mouse) {
      const dx = L.mouse.x - L.pos.x, dy = L.mouse.y - L.pos.y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d > 1) {
        const nx = dx / d, ny = dy / d
        const len = (L.power / 100) * 220 + 30
        const ex = L.pos.x + nx * len, ey = L.pos.y + ny * len
        ctx.strokeStyle = `rgba(255,${Math.max(0, 200 - L.power * 2)},0,0.7)`
        ctx.lineWidth = 2.5
        ctx.beginPath(); ctx.moveTo(L.pos.x, L.pos.y); ctx.lineTo(ex, ey); ctx.stroke()
        const a = Math.atan2(dy, dx)
        ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.moveTo(ex, ey)
        ctx.lineTo(ex - 8 * Math.cos(a - 0.4), ey - 8 * Math.sin(a - 0.4))
        ctx.lineTo(ex - 8 * Math.cos(a + 0.4), ey - 8 * Math.sin(a + 0.4))
        ctx.closePath(); ctx.fill()
      }
    }

    if (L.charging) {
      const gw = 140, gh = 14, gx = W / 2 - gw / 2, gy = H - 32
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(gx - 6, gy - 22, gw + 12, gh + 30)
      ctx.fillStyle = '#444'; ctx.fillRect(gx, gy, gw, gh)
      const r = L.power / 100
      ctx.fillStyle = `rgb(${Math.round(255 * r)},${Math.round(200 * (1 - r))},0)`
      ctx.fillRect(gx, gy, gw * r, gh)
      ctx.strokeStyle = '#666'; ctx.lineWidth = 1; ctx.strokeRect(gx, gy, gw, gh)
      ctx.fillStyle = '#FFF'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`❄️ 파워: ${Math.round(L.power)}%`, W / 2, gy - 6)
    }

    if (!L.charging && Date.now() < L.cooldownUntil) {
      const sec = Math.ceil((L.cooldownUntil - Date.now()) / 1000)
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`재장전 ${sec}초...`, W / 2, H - 16)
    }

    L.balls.forEach(b => {
      ctx.fillStyle = 'rgba(200,220,255,0.4)'
      ctx.beginPath(); ctx.arc(b.x - b.vx * 2, b.y - b.vy * 2, SR * 0.6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#FFF'; ctx.strokeStyle = '#CCC'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(b.x, b.y, SR, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath(); ctx.arc(b.x - 1.5, b.y - 1.5, 1.5, 0, Math.PI * 2); ctx.fill()
    })
  }

  if (phase === 'loading' && !gsRef.current?.positions) {
    return <div style={{ textAlign: 'center', padding: 40, fontSize: 16 }}>게임 준비 중...</div>
  }

  return (
    <div className="card" style={{ maxWidth: 860, margin: '0 auto', padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>🐾 눈싸움 배틀</h3>
        {isHost && onEndGame && (
          <button onClick={onEndGame} style={{ padding: '4px 12px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', fontSize: 12, cursor: 'pointer' }}>← 로비</button>
        )}
      </div>

      {phase === 'playing' && (
        <div style={{ textAlign: 'center', padding: '4px 10px', marginBottom: 8, borderRadius: 8, background: '#F5F5F5', fontSize: 12, color: '#666' }}>
          🖱️ 짧게 클릭: 이동 &nbsp;|&nbsp; 꾹 누르기: 파워 충전 → 놓으면 발사 &nbsp;|&nbsp; 재장전 {COOLDOWN / 1000}초
        </div>
      )}

      <canvas
        ref={canvasRef}
        style={{
          width: '100%', height: 'auto', borderRadius: 12,
          border: '2px solid #C8E6C9', cursor: 'crosshair',
          aspectRatio: `${W}/${H}`, touchAction: 'none',
          userSelect: 'none', WebkitUserSelect: 'none',
        }}
        onMouseMove={onMove}
        onMouseDown={onDown}
        onTouchStart={onDown}
        onTouchMove={onMove}
      />

      {phase === 'finished' && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <div style={{ padding: 20, background: 'linear-gradient(135deg,#E8F5E9,#C8E6C9)', borderRadius: 16 }}>
            <p style={{ fontSize: 36, margin: 0 }}>🏆</p>
            <p style={{ fontSize: 20, fontWeight: 900, color: '#2E7D32', margin: '8px 0 0' }}>{uiData.winner} 승리!</p>
          </div>
          {isHost && (
            <button className="btn-primary" onClick={() => set(dbRef, initState(players))}
              style={{ padding: '12px 24px', fontSize: 15, marginTop: 14 }}>🔄 다시 하기</button>
          )}
        </div>
      )}

      {respawnPicker && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 999,
        }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, textAlign: 'center', maxWidth: 360 }}>
            <p style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>💀 쓰러졌습니다!</p>
            <p style={{ fontSize: 13, color: '#888', margin: '0 0 16px' }}>캐릭터를 선택하고 부활하세요</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 12 }}>
              {RESPAWN_CHARS.map(ch => (
                <button key={ch} onClick={() => doRespawn(ch)}
                  style={{ fontSize: 32, padding: '8px 12px', border: '2px solid #ddd', borderRadius: 12, background: '#FAFAFA', cursor: 'pointer' }}>
                  {ch}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, justifyContent: 'center' }}>
        {uiData.status.map(p => (
          <div key={p.id} style={{
            padding: '3px 10px', borderRadius: 8, fontSize: 12,
            background: p.dead ? '#F5F5F5' : p.id === playerId ? '#E3F2FD' : '#FAFAFA',
            border: `2px solid ${p.dead ? '#EEE' : p.color}`,
            opacity: p.dead ? 0.5 : 1,
          }}>
            <span style={{ color: p.color }}>●</span> {p.name?.slice(0, 4)}
            {!p.dead && !p.respawning && <span style={{ marginLeft: 4 }}>{'❤️'.repeat(p.hp || 0)}{'🖤'.repeat(MAX_HP - (p.hp || 0))}</span>}
            {p.respawning && ' 🔄부활 중'}
            {p.dead && ' 💀'}
            <span style={{ marginLeft: 6, fontSize: 10, color: '#999' }}>🔪{p.kills || 0}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8, maxHeight: 60, overflow: 'auto', fontSize: 11, color: '#888', textAlign: 'left' }}>
        {uiData.log.slice().reverse().map((l, i) => <div key={i} style={{ padding: '1px 0' }}>{l}</div>)}
      </div>
    </div>
  )
}
