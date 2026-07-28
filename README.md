# VoteMeeting

Apartment Vote Meeting 초기 개발 골격입니다.

## 실행

브라우저에서 [vote.html](vote.html)를 직접 열면 됩니다.

## 현재 포함 기능

동작하는 초기 화면, 샘플 데이터, 내부 데이터 구조, 동적 안건 확장, CSV 내보내기를 포함합니다.

PDF.js와 Tesseract.js 연결을 통해 PDF 페이지 추출과 OCR 처리 흐름을 추가했습니다.

## 내부 데이터 구조

```text
dong, ho, name, phone, voteMethod, voteDate, agenda1...agendaN, duplicate
```

내부 관리번호는 별도로 생성하지만 화면과 CSV에는 노출하지 않습니다.

중복 판정은 동/호/이름 기준으로 적용하고, OCR 실패나 핵심 항목 누락 시 확인필요로 처리합니다.

## 개발 방향

관리사무소 업무용으로 확장 가능한 구조를 유지하면서 PDF 분석, OCR, 중복 검사, 수동 입력을 순차적으로 추가합니다.
