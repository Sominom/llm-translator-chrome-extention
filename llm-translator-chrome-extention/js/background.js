const welcomePage = "template/welcome.html";
const sidePanelPage = "template/sidepanel.html";

// 기본 설정 값
const defaultSettings = {
  defaultLanguage: 'ko',
  learningLanguage: 'en',
  apiProvider: 'openai',
  apiUrl: 'https://api.openai.com/v1/',
  apiKey: '',
  apiModel: 'gpt-4.1-nano',
  isTooltipEnabled: true,
  disabledSites: []
};

/**
 * 언어 이름 변환 함수
 * @param {string} code - 언어 코드
 * @returns {string} - 언어 이름
 */
function getLanguageName(code) {
  const languageMap = {
    ko: '한국어',
    en: '영어',
    ja: '일본어',
    zh: '중국어',
    es: '스페인어',
    fr: '프랑스어',
    de: '독일어',
    ru: '러시아어',
    it: '이탈리아어',
    pt: '포르투갈어'
  };
  return languageMap[code] || '영어';
}

/**
 * 언어 감지 함수
 * @param {string} text - 감지할 텍스트
 * @param {Object} settings - API 설정
 * @returns {Promise<string>} - 감지된 언어 코드
 */
async function detectLanguage(text, settings) {
  try {
    const apiKey = settings.apiProvider == 'openai' ? settings.apiKey : 'ollama';

    const response = await fetch(`${settings.apiUrl}chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: settings.apiModel,
        messages: [
          {
            role: 'system',
            content: '당신은 텍스트의 언어를 감지하는 언어 감지기입니다. 감지된 언어 코드만 간단히 반환하세요. 반드시 번역만 제공하고 다른 설명은 절대 하지마세요. "알겠습니다." 등의 대답도 절대 하지마세요. 가능한 언어 코드: ko(한국어), en(영어), ja(일본어), zh(중국어), es(스페인어), fr(프랑스어), de(독일어), ru(러시아어), it(이탈리아어), pt(포르투갈어)'
          },
          {
            role: 'user',
            content: `다음 텍스트의 언어를 감지: "${text}". 반드시 언어 코드만 반환하세요. 감지 결과: `
          }
        ],
        temperature: 0.1,
        max_tokens: 10
      })
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    const data = await response.json();
    const detectedLanguage = data.choices[0].message.content.trim().toLowerCase();
    return detectedLanguage;
  } catch (error) {
    console.error('언어 감지 오류:', error);
    return 'auto';
  }
}

/**
 * 스트리밍 번역 API 호출 함수
 * @param {string} selectedText - 번역할 텍스트
 * @param {Object} settings - API 설정
 * @param {string} requestId - 요청 ID
 * @param {Object} sender - 메시지 발신자
 * @returns {Promise<void>}
 */
async function callTranslationAPIStream(selectedText, settings, sender, requestId, isSidePanel, targetLanguage = settings.defaultLanguage, learningLanguage = settings.learningLanguage) {
  try {
    // API 키 확인
    if (!settings.apiKey && settings.apiProvider === 'openai') {
      throw new Error("API 키를 설정해주세요.");
    }

    // 응답을 보낼 대상 결정
    const sendResponse = (message) => {
      if (sender.tab?.id) {
        // 콘텐츠 스크립트로부터의 요청
        chrome.tabs.sendMessage(sender.tab.id, message);
      } else {
        // 사이드패널 또는 다른 확장 프로그램 페이지로부터의 요청
        chrome.runtime.sendMessage(message);
      }
    };

    console.log("isSidePanel", isSidePanel);
    console.log("Translation Language (Primary):", targetLanguage);
    console.log("Learning Language (Secondary):", learningLanguage);
    
    // 언어 감지 먼저 수행
    const detectedLanguage = await detectLanguage(selectedText, settings);
    console.log("감지된 언어:", detectedLanguage);

    let finalTargetLanguage = targetLanguage;

    // 감지된 언어가 번역 목표 언어(Primary)와 같다면, 학습 언어(Secondary)로 전환
    if (detectedLanguage && targetLanguage && (detectedLanguage === targetLanguage || detectedLanguage.startsWith(targetLanguage))) {
      console.log("감지된 언어가 번역 언어와 일치함. 학습 언어로 변경.");
      finalTargetLanguage = learningLanguage;
    } else {
      console.log("감지된 언어가 번역 언어와 다름. 번역 언어로 유지.");
      // finalTargetLanguage is already targetLanguage
    }

    if (detectedLanguage == finalTargetLanguage) {
      console.log("경고: 원본 언어와 타겟 언어가 동일합니다.");
    }

    const sourceLangName = getLanguageName(detectedLanguage);
    const targetLangName = getLanguageName(finalTargetLanguage);

    // 번역 요청 준비
    let apiUrl = settings.apiUrl;
    if (!apiUrl.endsWith('/')) apiUrl += '/';
    const fetchUrl = apiUrl + 'chat/completions';

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    };

    const messages = [
      {
        role: "system",
        content: `당신은 매우 유능한 번역가입니다. ${sourceLangName}에서 ${targetLangName}로 주어진 텍스트를 정확하게 번역하세요. 반드시 번역만 제공하고 다른 설명은 절대 하지마세요.`
      },
      {
        role: "user",
        content: `번역할 텍스트: \`${selectedText}\`\n번역 결과:`
      }
    ];

    // 스트리밍 번역 요청
    const response = await fetch(fetchUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: settings.apiModel || 'gpt-4',
        messages: messages,
        temperature: 0.8,
        max_tokens: 2000,
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // 스트림 읽기
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          sendResponse({
            action: "translationStream",
            requestId: requestId,
            type: "complete"
          });
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              sendResponse({
                action: "translationStream",
                requestId: requestId,
                type: "complete"
              });
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;

              if (content) {
                // 스트림 청크 전송
                sendResponse({
                  action: "translationStream",
                  requestId: requestId,
                  type: "chunk",
                  content: content
                });
              }
            } catch (parseError) {
              console.warn("JSON 파싱 오류:", parseError);
            }
          }
        }
      }
    } catch (streamError) {
      console.error("스트림 처리 오류:", streamError);
      sendResponse({
        action: "translationStream",
        requestId: requestId,
        type: "error",
        error: "스트림 처리 중 오류가 발생했습니다."
      });
    }

  } catch (error) {
    console.error("번역 오류:", error);
    const sendResponse = (message) => {
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, message);
      } else {
        chrome.runtime.sendMessage(message);
      }
    };

    sendResponse({
      action: "translationStream",
      requestId: requestId,
      type: "error",
      error: error.message || "통신 오류가 발생했습니다."
    });
  }
}

/**
 * 스트리밍 채팅 API 호출 함수 (OpenAI 호환 /chat/completions)
 * @param {Array<{role: 'system'|'user'|'assistant', content: string}>} messages
 * @param {Object} settings
 * @param {Object} sender
 * @param {string} requestId
 */
async function callChatAPIStream(messages, settings, sender, requestId) {
  const sendResponse = (message) => {
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, message);
    } else {
      chrome.runtime.sendMessage(message);
    }
  };

  try {
    if (!settings.apiKey && settings.apiProvider === 'openai') {
      throw new Error("API 키를 설정해주세요.");
    }

    let apiUrl = settings.apiUrl;
    if (!apiUrl.endsWith('/')) apiUrl += '/';
    const fetchUrl = apiUrl + 'chat/completions';

    const headers = {
      'Content-Type': 'application/json',
    };

    // 키가 없으면 Authorization 자체를 생략(ollama/lmstudio 등 호환 엔드포인트)
    if (settings.apiKey) {
      headers['Authorization'] = `Bearer ${settings.apiKey}`;
    }

    const response = await fetch(fetchUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: settings.apiModel || 'gpt-4',
        messages: Array.isArray(messages) ? messages : [],
        temperature: 0.8,
        max_tokens: 2000,
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          sendResponse({
            action: "chatStream",
            requestId,
            type: "complete"
          });
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);

          if (data === '[DONE]') {
            sendResponse({
              action: "chatStream",
              requestId,
              type: "complete"
            });
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;

            if (content) {
              sendResponse({
                action: "chatStream",
                requestId,
                type: "chunk",
                content
              });
            }
          } catch (parseError) {
            console.warn("JSON 파싱 오류:", parseError);
          }
        }
      }
    } catch (streamError) {
      console.error("스트림 처리 오류:", streamError);
      sendResponse({
        action: "chatStream",
        requestId,
        type: "error",
        error: "스트림 처리 중 오류가 발생했습니다."
      });
    }
  } catch (error) {
    console.error("채팅 오류:", error);
    sendResponse({
      action: "chatStream",
      requestId,
      type: "error",
      error: error.message || "통신 오류가 발생했습니다."
    });
  }
}

// 설정 가져오기 함수
async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'defaultLanguage',
      'learningLanguage',
      'apiProvider',
      'apiUrl',
      'apiKey',
      'apiModel',
      'isTooltipEnabled',
      'disabledSites'
    ], (result) => {
      if (chrome.runtime.lastError) {
        console.error("설정 가져오기 오류:", chrome.runtime.lastError);
        resolve({ ...defaultSettings });
        return;
      }

      const settings = {
        defaultLanguage: result.defaultLanguage || defaultSettings.defaultLanguage,
        learningLanguage: result.learningLanguage || defaultSettings.learningLanguage,
        apiProvider: result.apiProvider || defaultSettings.apiProvider,
        apiUrl: result.apiUrl || defaultSettings.apiUrl,
        apiKey: result.apiKey || defaultSettings.apiKey,
        apiModel: result.apiModel || defaultSettings.apiModel,
        isTooltipEnabled: result.isTooltipEnabled === undefined ? defaultSettings.isTooltipEnabled : result.isTooltipEnabled,
        disabledSites: result.disabledSites || defaultSettings.disabledSites
      };

      resolve(settings);
    });
  });
}

// 설정 저장 함수
async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set(settings, () => {
      if (chrome.runtime.lastError) {
        console.error("설정 저장 오류:", chrome.runtime.lastError);
        resolve({ success: false, error: chrome.runtime.lastError.message });
        return;
      }

      console.log("설정이 저장되었습니다:", settings);
      resolve({ success: true, settings: settings });
    });
  });
}

// 확장 프로그램 설치 시 초기화
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("확장 프로그램 설치/업데이트됨:", details.reason);

  // 웰컴 페이지 열기 (새로 설치된 경우만)
  if (details.reason === "install") {
    console.log("신규 설치: 웰컴 페이지 열기");
    chrome.tabs.create({ url: welcomePage });
  }
});


// 브라우저 아이콘 클릭 시 사이드 패널 열기
chrome.action.onClicked.addListener(async (tab) => {
  console.log("브라우저 아이콘 클릭됨");

  try {
    await chrome.sidePanel.open({ tabId: tab.id });
    console.log("아이콘 클릭으로 사이드 패널 열림");
  } catch (error) {
    console.error("사이드 패널 열기 오류:", error);
    // 오류 발생 시 탭 URL 기록 (디버깅용)
    console.error("문제가 발생한 탭 URL:", tab.url);
  }
});

// 다양한 메시지 리스너 처리
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("백그라운드 메시지 수신:", request);

  // 설정 가져오기 요청 처리
  if (request.action === "getSettings") {
    console.log("설정 가져오기 요청 받음");

    (async () => {
      try {
        const settings = await getSettings();
        sendResponse({ success: true, settings: settings });
      } catch (error) {
        console.error("설정 가져오기 오류:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // 스트리밍 번역 요청 처리
  if (request.action === "translateStream") {
    (async () => {
      try {
        const settings = await getSettings();
        await callTranslationAPIStream(request.text, settings, sender, request.requestId, request.isSidePanel, request.targetLanguage, request.learningLanguage);
        sendResponse({ success: true });
      } catch (error) {
        console.error("스트리밍 번역 오류:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // 비동기 응답을 위해 true 반환
  }

  // 스트리밍 채팅 요청 처리
  if (request.action === "chatStream") {
    (async () => {
      try {
        const settings = await getSettings();
        await callChatAPIStream(request.messages, settings, sender, request.requestId);
        sendResponse({ success: true });
      } catch (error) {
        console.error("스트리밍 채팅 오류:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // 번역 취소 요청 처리
  if (request.action === "cancelTranslation") {
    console.log("번역 취소 요청:", request.requestId);
    // 실제 취소 로직은 필요에 따라 구현
    sendResponse({ success: true });
    return true;
  }

  // 언어 감지 요청 처리
  if (request.action === "detectLanguage") {
    console.log("언어 감지 요청 받음:", request.text);

    (async () => {
      try {
        const settings = await getSettings();
        const detectedLang = await detectLanguage(request.text, settings);
        sendResponse({ success: true, detectedLanguage: detectedLang });
      } catch (error) {
        console.error("언어 감지 오류:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // 설정 저장 요청 처리
  if (request.action === "saveSettings") {
    console.log("설정 저장 요청 받음:", request.settings);

    (async () => {
      try {
        const result = await saveSettings(request.settings);

        // 설정이 변경되었음을 모든 탭에 알림
        if (result.success) {
          chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
              if (tab.id) {
                chrome.tabs.sendMessage(tab.id, {
                  action: "settingsUpdated",
                  settings: request.settings
                }).catch(() => { });
              }
            });
          });
          chrome.runtime.sendMessage({
            action: "settingsUpdated",
            settings: request.settings
          }).catch(() => { });
        }

        sendResponse(result);
      } catch (error) {
        console.error("설정 저장 오류:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }


  // 사이트 제외 추가 요청 처리
  if (request.action === "addDisabledSite") {
    console.log("사이트 제외 추가 요청:", request.site);

    (async () => {
      try {
        const currentSettings = await getSettings();
        const sites = currentSettings.disabledSites || [];
        
        // 중복 확인
        if (!sites.includes(request.site)) {
          sites.push(request.site);
          const newSettings = { ...currentSettings, disabledSites: sites };
          const result = await saveSettings(newSettings);
          
          if (result.success) {
            // 모든 탭과 팝업에 설정 업데이트 알림
            chrome.tabs.query({}, (tabs) => {
              tabs.forEach(tab => {
                if (tab.id) {
                  chrome.tabs.sendMessage(tab.id, {
                    action: "settingsUpdated",
                    settings: newSettings
                  }).catch(() => { });
                }
              });
            });
            chrome.runtime.sendMessage({
              action: "settingsUpdated",
              settings: newSettings
            }).catch(() => { });
            
            sendResponse({ success: true, settings: newSettings });
          } else {
            sendResponse(result);
          }
        } else {
          // 이미 존재하는 경우 성공
          sendResponse({ success: true, settings: currentSettings, alreadyExists: true });
        }
      } catch (error) {
        console.error("사이트 제외 추가 오류:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // 사이드 패널 열기 요청 처리 (웰컴 페이지 등)
  if (request.action === "openSidePanel") {
    console.log("사이드 패널 열기 요청 받음");
    
    const windowId = sender.tab?.windowId;
    if (windowId) {
      chrome.sidePanel.open({ windowId: windowId })
        .then(() => sendResponse({ success: true }))
        .catch((error) => {
          console.error("사이드 패널 열기 오류:", error);
          sendResponse({ success: false, error: error.message });
        });
    } else {
      sendResponse({ success: false, error: "창 ID를 찾을 수 없습니다." });
    }
    
    return true;
  }

  // 기본 응답
  return false;
});
