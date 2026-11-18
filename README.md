# 길이음

출발지와 도착지를 검색하고, 두 장소 사이의 자동차 도로 거리를 확인하는 한국어 웹앱입니다.

## 실행

별도의 빌드나 패키지 설치 없이 `index.html`을 브라우저에서 열거나 정적 파일 서버로 제공하면 됩니다.

## Vercel 배포

1. 이 폴더를 GitHub 저장소에 올립니다.
2. Vercel에서 **Add New → Project**를 선택하고 해당 저장소를 Import합니다.
3. Framework Preset은 **Other**를 선택하고 Build Command와 Output Directory는 비워 둔 채 Deploy를 누릅니다.

서버리스 함수, Redis, API 키, 환경변수는 필요하지 않습니다. 앱은 브라우저에서 공개 서비스를 직접 호출합니다.

## 데이터 제공 서비스

- 장소 검색: [Nominatim](https://nominatim.openstreetmap.org/), © OpenStreetMap 기여자
- 자동차 도로 경로: [OSRM 데모 서버](https://router.project-osrm.org/)
- 지도 링크: OpenStreetMap 자동차 길찾기

Nominatim 공개 서버는 용량이 제한된 커뮤니티 서비스입니다. 앱은 검색 입력을 지연 처리하고 전체 검색 요청 간 간격을 두며, 대량 사용이나 자동화된 요청에는 적합하지 않습니다. 서비스 정책과 가용성은 바뀔 수 있습니다. OSRM 데모 서버 역시 무상 공개 서비스이므로 상용 서비스 수준의 가용성을 보장하지 않습니다.
