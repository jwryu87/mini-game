// 스플래툰풍 잉크 배경 — 기본 테마에서만 렌더 (다른 테마는 자체 배경을 가짐)
//
// 잉크 얼룩 = 비대칭 원 덩어리(본체) + 본체에서 떨어져 뻗는 가는 타원(튄 자국) + 작은 원(위성 방울).
// 원들에 개별 opacity를 주면 겹친 부분만 진해지므로 opacity는 <g>에 한 번만 준다.
// 배경 잉크는 채도를 낮춰 깔고, 형광색은 로고에만 써서 주인공을 뺏기지 않게 한다.

const SHAPES = [
  {
    body: [[0, 0, 70], [50, -34, 42], [-42, 30, 36], [22, 50, 24], [-30, -46, 22]],
    streaks: [[124, -76, 44, 12, -31], [-112, 96, 36, 10, 41], [58, 126, 28, 9, 70]],
    drops: [[176, -112, 11], [208, -146, 6], [-158, 140, 9], [96, 168, 7], [-136, -84, 8], [30, -132, 5]],
  },
  {
    body: [[0, 0, 62], [-46, -32, 44], [40, 40, 34], [54, -22, 22], [-22, 52, 20]],
    streaks: [[-118, -84, 40, 11, 36], [108, 104, 34, 10, -38], [-64, 118, 26, 8, -66]],
    drops: [[-166, -122, 10], [-196, -152, 5], [150, 146, 9], [-92, 162, 7], [128, -96, 6]],
  },
  {
    body: [[0, 0, 66], [44, 38, 40], [-48, 34, 30], [30, -46, 32], [-56, -24, 18]],
    streaks: [[116, -92, 38, 11, -38], [-104, -96, 32, 10, 42], [86, 116, 26, 9, -58]],
    drops: [[160, -132, 10], [-146, -138, 8], [122, 158, 8], [-168, 58, 6], [16, -146, 5]],
  },
]

// 밝은 보라 배경 위 — 어두운 잉크로 대비를 만들고 형광 잉크로 화사함을 얹는다
const INDIGO = '#332877'
const VIOLET = '#8E79FF'
const TEAL = '#5FDBCB'
const LIME = '#E4FF57'
const ROSE = '#FF9BC7'

function Splat({ i, x, y, scale, rotate, color, opacity }) {
  const s = SHAPES[i % SHAPES.length]
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`} opacity={opacity}>
      <g fill={color}>
        {s.body.map(([cx, cy, r], k) => <circle key={`b${k}`} cx={cx} cy={cy} r={r} />)}
        {s.streaks.map(([cx, cy, rx, ry, rot], k) => (
          <ellipse key={`s${k}`} cx={cx} cy={cy} rx={rx} ry={ry} transform={`rotate(${rot} ${cx} ${cy})`} />
        ))}
        {s.drops.map(([cx, cy, r], k) => <circle key={`d${k}`} cx={cx} cy={cy} r={r} />)}
      </g>
    </g>
  )
}

export default function InkBackground() {
  return (
    <div className="ink-bg" aria-hidden="true">
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <Splat i={0} x={110} y={120} scale={1.15} rotate={-16} color={INDIGO} opacity={0.9} />
        <Splat i={1} x={1310} y={90} scale={1.0} rotate={28} color={LIME} opacity={0.85} />
        <Splat i={2} x={1370} y={640} scale={1.1} rotate={-6} color={INDIGO} opacity={0.8} />
        <Splat i={1} x={120} y={730} scale={0.95} rotate={122} color={TEAL} opacity={0.85} />
        <Splat i={0} x={520} y={860} scale={0.6} rotate={58} color={LIME} opacity={0.8} />
        <Splat i={2} x={780} y={-40} scale={0.5} rotate={196} color={ROSE} opacity={0.8} />
        <Splat i={1} x={1180} y={370} scale={0.42} rotate={-66} color={VIOLET} opacity={0.85} />
        <Splat i={0} x={230} y={430} scale={0.38} rotate={92} color={TEAL} opacity={0.75} />
        <Splat i={2} x={950} y={820} scale={0.45} rotate={140} color={INDIGO} opacity={0.7} />
        <Splat i={0} x={1430} y={280} scale={0.55} rotate={-110} color={ROSE} opacity={0.75} />
      </svg>
    </div>
  )
}
