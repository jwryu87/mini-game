// "미니게임 천국" 워드마크 — SVG로 그려서 두꺼운 외곽선(paint-order)을 브라우저 상관없이 보장

// 로고를 받치는 검은 잉크 얼룩 (겹친 원 덩어리 + 튄 자국)
const BACKDROP_BODY = [[300, 170, 106], [186, 164, 90], [414, 168, 88], [98, 174, 64], [502, 178, 60], [300, 108, 76], [236, 218, 68], [364, 214, 66]]
const BACKDROP_DROPS = [[36, 142, 18], [566, 148, 15], [300, 264, 12], [104, 240, 9], [498, 240, 8], [10, 196, 8], [584, 202, 7]]

export default function Wordmark({ compact }) {
  if (compact) {
    return (
      <svg className="wm wm-compact" viewBox="0 0 340 60" role="img" aria-label="MINIGAME PARTY">
        <text className="wm-c-text" x="4" y="44">MINIGAME PARTY</text>
      </svg>
    )
  }
  return (
    <svg className="wm" viewBox="0 0 600 300" role="img" aria-label="MINIGAME PARTY">
      <g className="wm-blob">
        {BACKDROP_BODY.map(([cx, cy, r], i) => <circle key={`b${i}`} cx={cx} cy={cy} r={r} />)}
        {BACKDROP_DROPS.map(([cx, cy, r], i) => <circle key={`d${i}`} cx={cx} cy={cy} r={r} />)}
      </g>
      <g transform="rotate(-4 300 150)">
        <text className="wm-sub" x="300" y="106" textAnchor="middle">MINIGAME</text>
        <text className="wm-main" x="300" y="252" textAnchor="middle">PARTY</text>
      </g>
    </svg>
  )
}
