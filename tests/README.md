# DAH 자동 검증 테스트 스크립트

이 폴더는 Claude가 코드 수정할 때마다 매번 새로 짜던 Puppeteer 검증 스크립트를
재사용 가능하도록 정리한 것입니다. **코드를 고칠 때마다 이 스크립트들을 다시 돌려서
같은 버그가 재발하지 않는지 확인하는 용도**입니다.

## 사전 준비 (Claude 환경 기준)
```bash
npm install # puppeteer가 이미 있다면 생략 가능
```
Claude 환경에서는 아래 경로에 puppeteer/chrome이 이미 설치되어 있어 별도 설치가 필요 없습니다:
- puppeteer: `/home/claude/.npm-global/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer`
- chrome: `/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`

다른 환경(예: 사용자 PC)에서 돌리려면 환경변수로 경로를 바꿔줄 수 있습니다:
```bash
export DAH_PUPPETEER_PATH=/path/to/puppeteer
export DAH_CHROME_PATH=/path/to/chrome
```

## 개별 스크립트

| 스크립트 | 검사 내용 | 사용법 |
|---|---|---|
| `font-check.js` | 허용 폰트 크기(11/12/13/15/17/22/26/28/36px) 외 사용 여부 | `node tests/font-check.js dah-dashboard.html 390` |
| `touch-target-check.js` | 버튼/링크 터치 영역 32px 이상 여부 (모바일 기준) | `node tests/touch-target-check.js dah-dashboard.html` |
| `scroll-check.js` | 지정 뷰포트에서 가로 스크롤 발생 여부 | `node tests/scroll-check.js dah-estimate.html 390` |
| `role-permission-check.js` | 마스터 전용 요소가 스태프 화면에서 숨겨지는지 | `node tests/role-permission-check.js dah-dashboard.html` |

## 한번에 전부 실행
```bash
node tests/run-all.js dah-dashboard.html
node tests/run-all.js dah-estimate.html
```

## 한계 (반드시 알고 있어야 할 것)
- **실제 기기 테스트가 아닙니다.** 크롬 엔진으로 화면 크기만 흉내낸 것이라 실제 아이폰 Safari와
  다르게 렌더링될 수 있습니다.
- **Supabase 데이터 접근권한(RLS)은 검사하지 않습니다.** 네트워크 정책상 Claude 환경에서
  Supabase API를 직접 호출할 수 없습니다. 이 부분은 Supabase 대시보드에서 직접 확인해야 합니다.
- **입력값 조합/예외 케이스는 다루지 않습니다.** (음수, 0, 극단적으로 큰 숫자 등은 별도 테스트 필요)
- `role-permission-check.js`는 `dah-dashboard.html`의 버튼 id/구조에 의존합니다.
  로그인 버튼 id(`btn-master-login` 등)가 바뀌면 `_helpers.js`의 `loginAs` 함수와
  `MASTER_ONLY_PATTERNS`도 같이 수정해야 합니다.

## 새 검사 추가하고 싶을 때
`_helpers.js`에 있는 `launchBrowser()`, `startServer()`를 그대로 가져다 쓰면
새 스크립트를 15줄 안쪽으로 짤 수 있습니다. 기존 스크립트 하나를 복사해서 시작하는 걸 추천합니다.
