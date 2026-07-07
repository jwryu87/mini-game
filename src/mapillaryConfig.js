// Mapillary 설정 (GeoGuessr 팀전용)
// ─────────────────────────────────────────────────────────────
// 무료 토큰 발급: https://www.mapillary.com 가입 → 프로필 → Developers
//   → "Register application" → 생성 후 "Client token"(MLY|... 형식) 복사.
// 토큰은 레포에 직접 박지 않고 .env 의 VITE_MAPILLARY_TOKEN 으로 주입한다.
//   - 로컬: 프로젝트 루트 .env 에  VITE_MAPILLARY_TOKEN=MLY|...
//   - 배포: Netlify 사이트 환경변수에 동일 키 등록
export const MAPILLARY_TOKEN = import.meta.env.VITE_MAPILLARY_TOKEN || ''

// 라운드마다 랜덤으로 뽑는 도시 풀. 해당 좌표 주변에서 실제 스트리트뷰 이미지를 검색해 사용.
// (Mapillary 커버리지가 좋은 도심 위주)
export const CITY_POOL = [
  { label: '서울, 대한민국', lat: 37.5665, lng: 126.9780 },
  { label: '도쿄, 일본', lat: 35.6762, lng: 139.6503 },
  { label: '파리, 프랑스', lat: 48.8566, lng: 2.3522 },
  { label: '뉴욕, 미국', lat: 40.7128, lng: -74.0060 },
  { label: '런던, 영국', lat: 51.5074, lng: -0.1278 },
  { label: '베를린, 독일', lat: 52.5200, lng: 13.4050 },
  { label: '암스테르담, 네덜란드', lat: 52.3676, lng: 4.9041 },
  { label: '바르셀로나, 스페인', lat: 41.3874, lng: 2.1686 },
  { label: '로마, 이탈리아', lat: 41.9028, lng: 12.4964 },
  { label: '시드니, 호주', lat: -33.8688, lng: 151.2093 },
  { label: '샌프란시스코, 미국', lat: 37.7749, lng: -122.4194 },
  { label: '토론토, 캐나다', lat: 43.6532, lng: -79.3832 },
  { label: '방콕, 태국', lat: 13.7563, lng: 100.5018 },
  { label: '싱가포르', lat: 1.3521, lng: 103.8198 },
  { label: '이스탄불, 튀르키예', lat: 41.0082, lng: 28.9784 },
  { label: '멕시코시티, 멕시코', lat: 19.4326, lng: -99.1332 },
  { label: '헬싱키, 핀란드', lat: 60.1699, lng: 24.9384 },
  { label: '프라하, 체코', lat: 50.0755, lng: 14.4378 },
  { label: '비엔나, 오스트리아', lat: 48.2082, lng: 16.3738 },
  { label: '리스본, 포르투갈', lat: 38.7223, lng: -9.1393 },
]

// 좌표 주변 bbox에서 Mapillary 이미지 하나를 검색 (적응형 bbox)
// Mapillary는 이미지 밀도가 높은 곳에서 넓은 bbox 요청을 "too much data"로 거부한다.
// → 넓게 시작해 거부당하면 bbox를 좁혀 재시도. (저밀도 도시는 넓게, 고밀도 도시는 좁게 잡힘)
async function fetchImageNear(lat, lng, token) {
  for (const d of [0.008, 0.004, 0.002, 0.001]) {
    const bbox = [lng - d, lat - d, lng + d, lat + d].join(',')
    const url = `https://graph.mapillary.com/images?access_token=${token}&bbox=${bbox}&limit=50&fields=id,computed_geometry,geometry`
    const res = await fetch(url)
    if (!res.ok) continue
    const data = await res.json()
    if (data.error) continue // 데이터 과다 거부 → 더 좁은 bbox로 재시도
    // 좌표가 실제 bbox 안에 들어오는 이미지만 (일부 항목 좌표가 엉뚱하게 튀는 경우 방어)
    const imgs = (data.data || []).filter(i => {
      const c = (i.computed_geometry || i.geometry || {}).coordinates
      return i.id && c && c[0] >= lng - d && c[0] <= lng + d && c[1] >= lat - d && c[1] <= lat + d
    })
    if (imgs.length) {
      const pick = imgs[Math.floor(Math.random() * imgs.length)]
      const geo = pick.computed_geometry || pick.geometry
      return { imageId: pick.id, lat: geo.coordinates[1], lng: geo.coordinates[0] }
    }
    return null // 정상 응답인데 이미지 없음 → 이 도시는 커버리지 부족(다음 도시 시도)
  }
  return null
}

// 이미지가 있는 도시를 찾을 때까지 최대 maxTries번 시도
export async function fetchRandomLocation(token, maxTries = 8) {
  const pool = [...CITY_POOL]
  for (let t = 0; t < maxTries && pool.length; t++) {
    const idx = Math.floor(Math.random() * pool.length)
    const city = pool.splice(idx, 1)[0]
    try {
      const loc = await fetchImageNear(city.lat, city.lng, token)
      if (loc) return { ...loc, label: city.label }
    } catch (e) { /* 다음 도시 시도 */ }
  }
  return null
}
