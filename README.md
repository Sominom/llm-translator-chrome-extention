# 크롬 번역 확장 프로그램

## 크롬 확장 프로그램 빌드

1. **프로덕션 빌드 생성**
    - `llm-translator-chrome-extention/manifest.json`의 `version` 수정
    - `llm-translator-chrome-extention/manifest.json`의 `name` 을 `Quick Translator Dev`에서 `Quick Translator`로 수정
   ```bash
   npm run build
   ```
   - `build` 명령어를 실행하면 `llm-translator-chrome-extention/build` 폴더에 빌드 파일이 생성됨

2. **압축 파일 생성**
   - 생성된 빌드 폴더(예: `llm-translator-chrome-extention/build/llm-translator-chrome-extention`)의 내용을 ZIP 파일로 압축

## 아이콘 생성
```bash
npm run icon
```