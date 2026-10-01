import { formatApiError } from './chat-completion.mjs';

export async function listAvailableModels(settings, fetcher = fetch) {
  if (settings.apiProvider === 'openai' && !settings.apiKey) {
    throw new Error('API 키를 설정해주세요.');
  }

  const baseUrl = settings.apiUrl?.trim();
  if (!baseUrl) throw new Error('API URL을 입력해주세요.');

  let url;
  try {
    url = new URL('models', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  } catch {
    throw new Error('API URL 형식이 올바르지 않습니다.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('API URL은 http 또는 https로 시작해야 합니다.');
  }

  const headers = {};
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
  const response = await fetcher(url.toString(), { method: 'GET', headers });
  if (!response.ok) {
    let details;
    try { details = await response.json(); } catch { /* status is still useful */ }
    throw new Error(formatApiError(response.status, response.statusText, details));
  }

  let payload;
  try { payload = await response.json(); } catch {
    throw new Error('모델 목록 응답을 읽을 수 없습니다.');
  }
  if (!Array.isArray(payload?.data)) {
    throw new Error('모델 목록 응답 형식이 올바르지 않습니다.');
  }

  return [...new Set(payload.data
    .map(model => model?.id)
    .filter(id => typeof id === 'string' && id.trim())
    .map(id => id.trim()))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
