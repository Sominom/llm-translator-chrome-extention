/**
 * 공유 API 모듈
 * Chrome Extension의 모든 컴포넌트에서 사용할 수 있는 통합 API 인터페이스
 */

const CONTEXT_INVALIDATED_MESSAGE = "확장 프로그램이 업데이트되었습니다. 페이지를 새로고침해주세요.";

function getRuntime() {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.sendMessage || !runtime?.onMessage) {
    throw new Error(CONTEXT_INVALIDATED_MESSAGE);
  }
  return runtime;
}

function removeRuntimeListener(runtime, listener) {
  runtime?.onMessage?.removeListener?.(listener);
}

class TranslationAPI {
  constructor() {
    this.activeRequests = new Map(); // 활성 요청 관리
  }

  /**
   * 설정 가져오기
   * @returns {Promise<Object>} 설정 객체
   */
  async getSettings() {
    return new Promise((resolve, reject) => {
      let runtime;
      try {
        runtime = getRuntime();
        runtime.sendMessage({ action: "getSettings" }, (response) => {
          if (runtime.lastError) {
            console.error("설정 가져오기 오류:", runtime.lastError);
            reject(runtime.lastError);
            return;
          }
          
          if (response && response.success && response.settings) {
            resolve(response.settings);
          } else {
            console.error("설정 가져오기 실패:", response);
            reject(new Error("설정 가져오기 실패"));
          }
        });
      } catch (error) {
        reject(error.message?.includes("Extension context invalidated")
          ? new Error(CONTEXT_INVALIDATED_MESSAGE)
          : error);
      }
    });
  }

  /**
   * 스트리밍 번역 API 호출
   * @param {string} text - 번역할 텍스트
   * @param {Object} options - 옵션 객체
   * @param {Function} options.onStreamUpdate - 스트림 업데이트 콜백
   * @param {Function} options.onComplete - 완료 콜백
   * @param {Function} options.onError - 에러 콜백
   * @returns {Promise<string>} 최종 번역 결과
   */
  async translateWithStream(text, options = {}, targetLanguage, learningLanguage) {
    const { onStreamUpdate, onComplete, onError } = options;
    const requestId = crypto.randomUUID();
    
    return new Promise((resolve, reject) => {
      let accumulatedText = '';
      let runtime;
      
      // 스트림 리스너
      const streamListener = (message) => {
        if (message.action === "translationStream" && message.requestId === requestId) {
          if (message.type === 'chunk') {
            // 스트림 청크 처리
            accumulatedText += message.content;
            if (onStreamUpdate) {
              onStreamUpdate(message.content, accumulatedText, { type: 'chunk' });
            }
          } else if (message.type === 'complete') {
            // 번역 완료
            removeRuntimeListener(runtime, streamListener);
            this.activeRequests.delete(requestId);
            
            if (onComplete) {
              onComplete(accumulatedText);
            }
            resolve(accumulatedText);
          } else if (message.type === 'error') {
            // 에러 처리
            removeRuntimeListener(runtime, streamListener);
            this.activeRequests.delete(requestId);
            
            const error = new Error(message.error || '번역 중 오류가 발생했습니다.');
            if (onError) {
              onError(error);
            }
            reject(error);
          }
        }
      };
      
      try {
        runtime = getRuntime();
        runtime.onMessage.addListener(streamListener);
        this.activeRequests.set(requestId, { listener: streamListener, reject, kind: 'translation' });
        
        runtime.sendMessage({
          action: "translateStream", 
          text: text,
          requestId: requestId,
          targetLanguage: targetLanguage,
          learningLanguage: learningLanguage
        }, (response) => {
          if (runtime.lastError) {
            console.error("번역 요청 오류:", runtime.lastError);
            removeRuntimeListener(runtime, streamListener);
            this.activeRequests.delete(requestId);
            
            const error = new Error(runtime.lastError.message);
            if (onError) {
              onError(error);
            }
            reject(error);
          }
        });
      } catch (error) {
        removeRuntimeListener(runtime, streamListener);
        this.activeRequests.delete(requestId);
        
        const errorMessage = error.message.includes("Extension context invalidated") 
          ? CONTEXT_INVALIDATED_MESSAGE
          : error.message;
          
        const wrappedError = new Error(errorMessage);
        if (onError) {
          onError(wrappedError);
        }
        reject(wrappedError);
      }
    });
  }

  /**
   * 스트리밍 채팅 API 호출 (OpenAI 호환 /chat/completions)
   * @param {Array<{role: 'system'|'user'|'assistant', content: string}>} messages - 대화 메시지 배열
   * @param {Object} options - 옵션 객체
   * @param {Function} options.onStreamUpdate - 스트림 업데이트 콜백
   * @param {Function} options.onComplete - 완료 콜백
   * @param {Function} options.onError - 에러 콜백
   * @returns {Promise<string>} 최종 응답 텍스트
   */
  async chatWithStream(messages, options = {}) {
    const { onStreamUpdate, onComplete, onError } = options;
    const requestId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      let accumulatedText = '';
      let runtime;

      const streamListener = (message) => {
        if (message.action === "chatStream" && message.requestId === requestId) {
          if (message.type === 'chunk') {
            accumulatedText += message.content;
            if (onStreamUpdate) {
              onStreamUpdate(message.content, accumulatedText, { type: 'chunk' });
            }
          } else if (message.type === 'complete') {
            removeRuntimeListener(runtime, streamListener);
            this.activeRequests.delete(requestId);

            if (onComplete) {
              onComplete(accumulatedText);
            }
            resolve(accumulatedText);
          } else if (message.type === 'error') {
            removeRuntimeListener(runtime, streamListener);
            this.activeRequests.delete(requestId);

            const error = new Error(message.error || '채팅 중 오류가 발생했습니다.');
            if (onError) {
              onError(error);
            }
            reject(error);
          }
        }
      };

      try {
        runtime = getRuntime();
        runtime.onMessage.addListener(streamListener);
        this.activeRequests.set(requestId, { listener: streamListener, reject, kind: 'chat' });

        runtime.sendMessage(
          {
            action: "chatStream",
            requestId,
            messages,
          },
          () => {
            if (runtime.lastError) {
              console.error("채팅 요청 오류:", runtime.lastError);
              removeRuntimeListener(runtime, streamListener);
              this.activeRequests.delete(requestId);

              const error = new Error(runtime.lastError.message);
              if (onError) {
                onError(error);
              }
              reject(error);
            }
          }
        );
      } catch (error) {
        removeRuntimeListener(runtime, streamListener);
        this.activeRequests.delete(requestId);

        const errorMessage = error.message.includes("Extension context invalidated")
          ? CONTEXT_INVALIDATED_MESSAGE
          : error.message;

        const wrappedError = new Error(errorMessage);
        if (onError) {
          onError(wrappedError);
        }
        reject(wrappedError);
      }
    });
  }
  /**
   * 번역 요청 취소
   * @param {string} requestId - 요청 ID
   */
  cancelTranslation(requestId) {
    if (this.activeRequests.has(requestId)) {
      const request = this.activeRequests.get(requestId);
      const runtime = globalThis.chrome?.runtime;
      removeRuntimeListener(runtime, request.listener);
      this.activeRequests.delete(requestId);
      
      runtime?.sendMessage?.({
        action: "cancelTranslation",
        requestId: requestId
      });

      const error = new Error("요청이 취소되었습니다.");
      error.name = 'AbortError';
      request.reject(error);
    }
  }

  /**
   * 모든 번역 요청 취소
   */
  cancelAllTranslations() {
    for (const [requestId, request] of this.activeRequests) {
      if (request.kind === 'translation') this.cancelTranslation(requestId);
    }
  }
}

// 전역 인스턴스
const api = new TranslationAPI();

window.translationAPI = api;
