# 서울대학교 3D 캠퍼스

관악캠퍼스 건물 258개를 2D/3D로 보여주는 정적 웹앱입니다.
그중 1–15동은 공식 사진 등을 참고한 외관 추정 모형으로 별도 제작되어 있습니다.
동별 완료 단계와 남은 작업은 [작업 체크리스트](CHECKLIST.md)에 기록합니다.
제작 시 반드시 지킬 디자인·건물 모델링·주변 환경 기준은 [AGENTS.md](AGENTS.md)에 있습니다.
사용자 디자인 참고 이미지는 `research/reference/design-reference.png`에 보존했습니다.

## 실행

`import map`을 쓰므로 `file://`로는 동작하지 않습니다. 로컬 서버가 필요합니다.

VS Code에서 `snu-campus-3d` 폴더를 열고 **터미널 → 새 터미널**에서 실행합니다.

```bash
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist
```

브라우저에서 [http://localhost:8080](http://localhost:8080)에 접속하세요.
터미널을 켜 둔 상태로 테스트하고, 종료할 때는 `Ctrl+C`를 누릅니다.
수정 내용이 안 보이면 Mac은 `Cmd+Shift+R`, Windows는 `Ctrl+Shift+R`로 새로고침합니다.

**직접 확인:** 2D/3D 전환 → 1–15동 검토 → 건물 선택 → 사진 비교.
4동·14동은 ‘정면 구조 보기’와 ‘측면 구조 보기’로 입체 구성을 확인하고,
‘가까이 보기’ 또는 정보 패널 닫기로 주변 건물을 다시 표시합니다.
‘외관 추정’ 체크를 끄면 기본 모형과 비교할 수 있습니다.

Node.js가 설치되어 있다면 데이터·사진 파일과 4동·14동 구조 검사도 실행할 수 있습니다.

```bash
node research/check-models.mjs
```

배포는 `.openai/hosting.json`에 정적 디렉터리 `dist`로 설정되어 있습니다.

## 구조

```
snu-campus-3d/
├─ README.md · CHECKLIST.md  실행 안내와 동별 진행 기록
├─ docs/                    기존 모델링 조사·정리 문서
├─ dist/                    배포 대상. 이 폴더만으로 완결됩니다.
│  ├─ index.html · app.js · renderer.js · building-structures.js · styles.css
│  ├─ assets/               three.js 번들, photos/ (1–15동 사진 21장)
│  └─ data/                 campus.json · buildings.geojson · photos.json
│                           profiles.json · snu-campus-map.pdf
└─ research/                데이터 생성 과정
   ├─ process-map.py        ① OSM → campus.json, buildings.geojson
   ├─ enrich-map.py         ② 공식 건물목록 237건 대조 → 번호·이름·미확인 박스
   ├─ fetch-photos.py       ③ 공식 API에서 1–15동 사진 수집
   ├─ source/               원천 자료 (OSM 스냅샷, 공식 지도 API 응답·페이지)
   ├─ photo-research/       보조 사진 원본 2장과 출처·관찰 메모
   ├─ output/               스크립트 산출물 (coverage.json, official-targets.json)
   └─ reference/            작업용 참고 이미지 (UI 컨셉, 윤곽 식별)
```

`dist/data/*`는 `research/`의 스크립트가 생성합니다. 손으로 고치지 말고 스크립트를 다시 돌리세요.
예외는 `profiles.json`(1–15동 외관 프로파일)으로, 사진을 보고 직접 작성한 파일입니다.

## 데이터 재생성

```bash
python3 research/process-map.py    # source/osm-campus-full.xml → dist/data/
python3 research/enrich-map.py     # 공식 목록 대조, dist/data/ 갱신 + output/coverage.json
python3 research/fetch-photos.py   # 네트워크 필요. 사진 재다운로드
```

①②는 로컬 파일만 쓰므로 결과가 항상 같습니다. ③은 `map.snu.ac.kr`에 접속하며,
8동·14동 보조 사진은 `research/photo-research/manifest.json`의 경로에서 복사해 옵니다.
manifest의 `localPath`는 manifest 파일이 있는 폴더 기준 상대경로입니다.

## 자료 출처

- **OpenStreetMap contributors** — 캠퍼스 경계·건물 윤곽·도로·녹지 (ODbL 1.0)
- **서울대학교 공식 캠퍼스 지도** `map.snu.ac.kr` — 건물 번호·이름·좌표·공식 사진
- 수집일 2026-09-20. 사진 저작권은 각 출처에 있으며 공개 재사용 라이선스는 확인되지 않았습니다.

## 한계

1. OSM 윤곽은 측량된 전수 인벤토리가 아닙니다.
2. 면적은 지면 윤곽 기준 근삿값이며 연면적·건축면적이 아닙니다.
3. **지형 고도는 반영하지 않은 평면 지도**입니다.
4. OSM `height` 태그가 있는 경우를 제외한 모든 높이는 추정값입니다.
5. 1–15동 외관은 사진 참고 간략화로, 사진측량·정밀 실측 모델이 아닙니다.
6. 주황색 임시 상자 41건은 위치만 확인된 것이며 16×12m는 임의의 시각화 기본값입니다.
7. 7동은 2026년 증축 공사 중이라 기존 외관 기준 모형입니다.
8. 가로수는 도로 주변의 추정 배치입니다. 최대 240개를 단순한 공유 모형으로 표현하며 실제 수목 위치와 다를 수 있습니다. 2D·건물 단독 구조 보기에서는 숨깁니다.

초기 조사 기록은 [모델링 자료 정리](docs/서울대-3D-모델링-정리.md), 최신 진행 상태는 [체크리스트](CHECKLIST.md)를 참고하세요.


## 4동·14동 구조 수정 (2026-09-24)

`dist/building-structures.js`에서 두 건물을 별도 입체 부재로 제작합니다.
- 4동: 지도 전면 윤곽의 곡선 보간, 후퇴한 저층 유리벽·원형 기둥, 돌출 상부, 후퇴한 지붕층, 돌출 처마·난간.
- 14동: 후퇴한 저층 유리 공간, 돌출된 상부 3개 층과 깊은 수직 차양, 측면 띠창, 실내와 분리된 6층 개방 테라스 및 독립 지붕.
- 상세 패널의 정면/측면 구조 보기는 주변 건물을 숨깁니다. 가까이 보기 또는 건물 정보 닫기로 캠퍼스 표시를 복원합니다.

14동 테라스는 [인문대학 공식 사진](https://humanities.snu.ac.kr/community/department?bbsidx=3485&md=v)을 추가 대조했습니다.
4동 외벽·처마는 [Sungjin Kim의 현장 사진](https://kodos.tistory.com/585)을 추가 대조했습니다.
보조 사진 목록은 `research/source/supplemental-photos.json`에 보존해 사진 재수집 시에도 유지됩니다.

지도 윤곽은 그대로 보존하며 상세 모형의 후퇴 깊이·높이·부재 치수는 사진 비례 추정입니다.
구조적 빈 공간과 덩어리 구성을 수정한 것으로, 실측 도면으로 확인한 정밀 복원은 아닙니다.
