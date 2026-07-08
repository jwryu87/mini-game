export const AVATAR_COLORS = ['#7C6BF0', '#FF7B7B', '#37CFBE', '#FFC44D', '#6BA6FF', '#FF9BC7']

export default function GhostAvatar({ color = '#7C6BF0', size = 34, cheek = true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ display: 'block', margin: '0 auto' }}>
      <path d="M50 11 C28 11 17 30 17 53 L17 86 Q24 79 30 86 Q36 92 42 86 Q48 79 50 86 Q52 79 58 86 Q64 92 70 86 Q76 79 83 86 L83 53 C83 30 72 11 50 11 Z" fill={color} />
      <ellipse cx="39" cy="50" rx="5" ry="6.5" fill="#2A2247" />
      <ellipse cx="61" cy="50" rx="5" ry="6.5" fill="#2A2247" />
      {cheek && (
        <>
          <circle cx="31" cy="60" r="5.5" fill="#FF7B7B" opacity="0.5" />
          <circle cx="69" cy="60" r="5.5" fill="#FF7B7B" opacity="0.5" />
        </>
      )}
      <path d="M44 62 Q50 67 56 62" stroke="#2A2247" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}
