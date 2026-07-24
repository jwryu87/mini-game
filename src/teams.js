export const TEAM_NAMES = ['불꽃', '파도', '새싹', '햇살']
export const TEAM_EMOJI = ['🔥', '🌊', '🌱', '☀️']
export const TEAM_HEX = ['#FF7B7B', '#6BA6FF', '#37CFBE', '#FFC44D']
export const TEAM_CSS = ['team-0', 'team-1', 'team-2', 'team-3']

// 인원수에 맞는 팀 수.
// 순서대로 4팀에 흩뿌리면 4명일 때 1인 1팀이 되어 팀전이 성립하지 않는다.
// 한 팀에 최소 2명은 모이도록 인원의 절반을 팀 수로 잡고 2~4팀으로 제한한다.
// 2~5명=2팀, 6~7명=3팀, 8명 이상=4팀.
export function teamCountFor(n) {
  if (n <= 1) return 1
  return Math.min(4, Math.max(2, Math.floor(n / 2)))
}

// 현재 팀별 인원(counts) 중 가장 적은 팀. 동점이면 앞 팀부터.
export function pickTeamFor(counts, teamCount) {
  let best = 0
  for (let i = 1; i < teamCount; i++) {
    if ((counts[i] || 0) < (counts[best] || 0)) best = i
  }
  return best
}
