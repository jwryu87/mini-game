# 🎮 미니게임 파티

실시간 멀티플레이 미니게임 모음 (최대 8인)

## 🔗 사이트

| 환경 | URL | 비고 |
|------|-----|------|
| **Netlify (메인)** | https://mini-game-party.netlify.app | 팀미팅 시 이 주소 공유 |
| GitHub Pages | https://jwryu87.github.io/mini-game/ | 백업용 (개인 아이디 노출) |

## 게임 목록

| 게임 | 설명 | 방식 |
|------|------|------|
| 🎯 윷놀이 | 전통 윷놀이 보드게임 | 2~4팀 팀전 |
| 🤥 라이어 게임 | 거짓말쟁이를 찾아라 | 전원 참여 |
| 🐾 눈싸움 배틀 | 동물 캐릭터 눈싸움 대전 | 개인전 |

## 기능

- 실시간 멀티플레이 (Firebase Realtime DB)
- 방 코드 기반 입장
- 팀 랜덤 배정 / 커스텀 팀 이름
- 테마 선택 (기본, Win95, Slack, 도트, 배민)
- BGM 재생 (볼륨 조절)
- 인게임 채팅

## 시작하기

```bash
npm install
npm run dev
```

## 배포

```bash
# Netlify 배포 (메인) — 팀에 공유할 주소
npm run deploy:netlify

# GitHub Pages 배포 (백업)
npm run deploy
```

## 기술 스택

- React 18 + Vite
- Firebase Realtime Database
- Netlify / GitHub Pages
