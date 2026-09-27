# 서울대학교 3D 캠퍼스

관악캠퍼스 건물 258개를 보여주는 정적 웹입니다. 제작 기준은 `AGENTS.md`, 동별 진행 상황은 `CHECKLIST.md`에 기록합니다.

## 실행

프로젝트 폴더에서 실행하고 http://127.0.0.1:8080 에 접속합니다.

```bash
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist
```

8동 선택 → 정면/측면 구조 보기로 수정된 모델을 확인합니다.
사진 원본과 출처는 `research/index.html`을 브라우저로 열어 검토할 수 있습니다.

## 파일 구성

- `dist/`: 웹 실행 파일·Three.js·배포용 참고 사진 26장·지도 데이터. 단독 배포 가능.
- `research/buildings/`: 동별 참고/검토 대기 사진, 후보 목록, 구조 분석 메모.
- `research/photo-audit.json`: 보관 중인 사진의 출처·관찰·해시.
- `research/rejected-photos.json`: 제외한 사진의 URL·제외 사유만 보관. 사진 파일은 삭제.
- `research/building-ledger.json`: 전체 건물 진행 상황.
- `research/refs.py`: 사진 검색·다운로드·검토·갤러리 갱신. 웹페이지 HTML은 저장하지 않음.
- `research/map-inputs/`: 지도 재생성에 필요한 OSM XML과 공식 건물 목록 JSON 2개. 웹페이지 사본이 아님.
- `research/reference/`: 사용자 디자인 기준과 지도 윤곽 식별 이미지.
- `research/output/coverage.json`: 공식 목록과 지도 윤곽 연결 결과.
- `research/cleanup-log.json`: 파일 정리 내역.

배포 사진과 리서치 원본은 두 화면이 각각 독립적으로 열리도록 유지합니다. 미검토 사진은 후속 모델링 후보이며 삭제 대상에 포함하지 않습니다.

## 점검

```bash
node research/check-models.mjs
node research/check-building-8.mjs
python3 research/check-research.py
```

8동 검사는 입구·옥상 개구부와 다른 동 형상 보존을 확인합니다. 실측 정확성을 보증하지는 않습니다.

## 데이터 작업

```bash
python3 research/refs.py --help
python3 research/refs.py rebuild
```

`rebuild`는 제외·중복 판정 사진을 정리하고 사진 원장과 갤러리를 갱신합니다.
지도 데이터 재생성이 필요할 때만 `process-map.py` → `enrich-map.py` 순서로 실행합니다. 이는 현재 `dist/data/campus.json`과 `buildings.geojson`을 다시 생성하는 작업입니다.
