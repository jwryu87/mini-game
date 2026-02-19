# 🎍 설날 미니게임 파티

설날 팀미팅용 실시간 멀티플레이 미니게임 모음

## 게임 목록

| 게임 | 설명 | 인원 |
|------|------|------|
| 🎯 윷놀이 | 전통 윷놀이 보드게임 (팀전) | 2~4팀 |
| 🏹 투호 | 파워+조준 타이밍 게임 | 개인전 |
| 🃏 딱지치기 | 1:1 파워 대결 | 토너먼트 |
| 🧧 세뱃돈 받기 | 복주머니 랜덤 뽑기 | 전원 동시 |

## 시작하기

### 1. Firebase 프로젝트 설정 (5분)

1. [Firebase Console](https://console.firebase.google.com/) 접속
2. **프로젝트 추가** 클릭 → 프로젝트 이름 입력 → 생성
3. 좌측 메뉴 **빌드 > Realtime Database** → **데이터베이스 만들기**
4. 위치: `asia-southeast1` 선택 → **테스트 모드로 시작** 선택
5. 프로젝트 설정(⚙️) > **웹 앱 추가(</>)** → 앱 닉네임 입력 → 등록
6. 표시되는 `firebaseConfig` 값을 복사

### 2. Firebase 설정 적용

`src/firebase.js` 파일에서 `firebaseConfig`를 본인의 설정으로 교체:

```javascript
const firebaseConfig = {
  apiKey: "실제_API_KEY",
  authDomain: "프로젝트명.firebaseapp.com",
  databaseURL: "https://프로젝트명-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "프로젝트명",
  storageBucket: "프로젝트명.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
}
```

### 3. 로컬 실행

```bash
npm install
npm run dev
```

### 4. GitHub Pages 배포

```bash
npm run build
npm run deploy
```

배포 후 접속: `https://jwryu87.github.io/seollal-game/`

## 진행 방법

1. 방장이 **방 만들기** → 방 코드 공유
2. 참가자들이 코드를 입력하여 입장
3. 방장이 팀 배정 후 게임 선택
4. 게임 진행! (윷놀이 → 투호 → 딱지치기 → 세뱃돈 순서 추천)

## 기술 스택

- React 18 + Vite
- Firebase Realtime Database
- GitHub Pages
