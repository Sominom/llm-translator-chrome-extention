'use strict';

document.addEventListener("DOMContentLoaded", () => {
  const elements = {
    inputBox: document.querySelector("#input-box"),
    outputBox: document.querySelector("#output-box"),
    translationLang: document.querySelector("#translation-lang"),
    learningLang: document.querySelector("#learning-lang"),
    apiProvider: document.querySelector("#api-provider"),
    apiUrl: document.querySelector("#api-url"),
    apiKey: document.querySelector("#api-key"),
    apiModel: document.querySelector("#api-model"),
    saveBtn: document.querySelector("#save-settings"),
    tabButtons: document.querySelectorAll(".tab-button"),
    tabContents: document.querySelectorAll(".tab-content"),
    isTooltipEnabled: document.querySelector("#tooltip-toggle"),
    disabledSitesList: document.querySelector("#disabled-sites-list"),
    newSiteInput: document.querySelector("#new-site-input"),
    addSiteBtn: document.querySelector("#add-site-btn")
  };

  let isTranslating = false;
  let currentRequestId = null;

  async function translateText(text, translationLang, learningLang) {
    if (!text.trim()) {
      if (elements.outputBox) {
        elements.outputBox.textContent = "";
      }
      return;
    }

    if (isTranslating) {
      console.log("이미 번역 중입니다.");
      return;
    }

    isTranslating = true;
    
    if (elements.outputBox) {
      elements.outputBox.textContent = "번역 중...";
    }

    try {
      await waitForAPI();

      currentRequestId = Date.now().toString();

      await window.translationAPI.translateWithStream(text, {
        onStreamUpdate: (chunk, accumulated, data) => {
          if (data.type === 'chunk' && elements.outputBox) {
            elements.outputBox.textContent = accumulated;
          }
        },
        onComplete: (finalText) => {
          console.log("번역 완료:", finalText);
          if (elements.outputBox) {
            elements.outputBox.textContent = finalText;
          }
        },
        onError: (error) => {
          console.error("번역 오류:", error);
          if (elements.outputBox) {
            elements.outputBox.textContent = "번역 중 오류가 발생했습니다: " + error.message;
          }
        }
      }, true, translationLang, learningLang);

    } catch (error) {
      console.error("번역 오류:", error);
      if (elements.outputBox) {
        elements.outputBox.textContent = "번역 중 오류가 발생했습니다.";
      }
    } finally {
      isTranslating = false;
      currentRequestId = null;
    }
  }

  async function waitForAPI() {
    let attempts = 0;
    const maxAttempts = 50;
    
    while (!window.translationAPI && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (!window.translationAPI) {
      throw new Error("API 모듈을 로드할 수 없습니다.");
    }
  }

  function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  const handleInput = debounce(() => {
    const text = elements.inputBox?.value;
    const translationLang = elements.translationLang?.value;
    const learningLang = elements.learningLang?.value;
    
    if (text?.trim()) {
      translateText(text, translationLang, learningLang);
    } else if (elements.outputBox) {
      elements.outputBox.textContent = "";
    }
  }, 500);

  function handleProviderChange() {
    const provider = elements.apiProvider?.value;
    const urlInput = elements.apiUrl;
    const keyInput = elements.apiKey;
    
    if (!provider || !urlInput || !keyInput) return;
    
    if (provider === 'openai') {
      urlInput.value = 'https://api.openai.com/v1/';
      keyInput.placeholder = 'OpenAI API 키를 입력하세요';
    } else if (provider === 'ollama') {
      urlInput.value = 'http://localhost:11434/v1/';
      keyInput.placeholder = 'API 키 (Ollama는 선택사항)';
    } else if (provider === 'lmstudio') {
      urlInput.value = 'http://localhost:1234/v1/';
      keyInput.placeholder = 'API 키 (LMStudio는 선택사항)';
    }
  }

  function switchTab(tabName) {
    console.log("Switching to tab:", tabName);
    
    elements.tabButtons.forEach(btn => btn.classList.remove("active"));
    elements.tabContents.forEach(content => content.classList.remove("active"));
    
    const selectedTabButton = document.querySelector(`[data-tab="${tabName}"]`);
    const selectedTabContent = document.querySelector(`#${tabName}-tab`);
    
    console.log("Selected tab button:", selectedTabButton);
    console.log("Selected tab content:", selectedTabContent);
    
    if (selectedTabButton) {
      selectedTabButton.classList.add("active");
    }
    if (selectedTabContent) {
      selectedTabContent.classList.add("active");
    }
  }

  // 사이트 제외 목록 렌더링
  function renderDisabledSitesList(sites) {
    if (!elements.disabledSitesList) return;
    
    elements.disabledSitesList.innerHTML = "";
    
    if (!sites || sites.length === 0) {
      elements.disabledSitesList.innerHTML = '<div class="disabled-site-item" style="color: #999; justify-content: center;">제외된 사이트 없음</div>';
      return;
    }
    
    sites.forEach(site => {
      const div = document.createElement("div");
      div.className = "disabled-site-item";
      
      const siteName = document.createElement("span");
      siteName.textContent = site;
      
      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-site-btn";
      removeBtn.innerHTML = "&times;";
      removeBtn.title = "삭제";
      removeBtn.onclick = () => removeSite(site);
      
      div.appendChild(siteName);
      div.appendChild(removeBtn);
      elements.disabledSitesList.appendChild(div);
    });
  }

  // 사이트 추가
  function addSite() {
    const site = elements.newSiteInput?.value?.trim();
    if (!site) return;
    
    let pattern = site;

    // 와일드카드가 없는 경우에만 URL 파싱 시도 (기존 로직 유지)
    if (!site.includes('*')) {
      try {
        if (site.startsWith('http')) {
          pattern = new URL(site).hostname;
        }
      } catch (e) {
        // 유효하지 않은 URL이면 입력값 그대로 사용
      }
    }
    
    chrome.storage.local.get(['disabledSites'], (result) => {
      const sites = result.disabledSites || [];
      if (!sites.includes(pattern)) {
        sites.push(pattern);
        saveSettingsDirectly({ disabledSites: sites });
        elements.newSiteInput.value = "";
        
        // 즉시 UI 업데이트 확인
        renderDisabledSitesList(sites);
      } else {
        alert("이미 제외 목록에 있는 사이트(패턴)입니다.");
      }
    });
  }

  // 사이트 삭제
  function removeSite(siteToRemove) {
    chrome.storage.local.get(['disabledSites'], (result) => {
      const sites = result.disabledSites || [];
      const newSites = sites.filter(site => site !== siteToRemove);
      saveSettingsDirectly({ disabledSites: newSites });
    });
  }

  // 설정을 직접 저장 (기존 saveSettings 함수와 별도로 부분 업데이트용)
  function saveSettingsDirectly(settingsUpdate) {
    chrome.storage.local.get(null, (currentSettings) => {
      const newSettings = { ...currentSettings, ...settingsUpdate };
      
      chrome.runtime.sendMessage({ action: "saveSettings", settings: newSettings }, (response) => {
        if (response && response.success) {
          // 성공 시 UI 업데이트 (필요 시)
          if (settingsUpdate.disabledSites) {
            renderDisabledSitesList(settingsUpdate.disabledSites);
          }
        } else {
          console.error("설정 저장 실패:", response);
        }
      });
    });
  }

  async function loadSettings() {
    try {
      const settings = await window.translationAPI.getSettings();
      console.log("로드된 설정:", settings);
      
      if (elements.apiProvider) elements.apiProvider.value = settings.apiProvider || 'openai';
      if (elements.apiUrl) elements.apiUrl.value = settings.apiUrl || 'https://api.openai.com/v1/';
      if (elements.apiKey) elements.apiKey.value = settings.apiKey || '';
      if (elements.apiModel) elements.apiModel.value = settings.apiModel || 'gpt-4o-mini';
      if (elements.learningLang) elements.learningLang.value = settings.learningLanguage || 'en';
      if (elements.translationLang) elements.translationLang.value = settings.defaultLanguage || 'ko';
      if (elements.isTooltipEnabled) elements.isTooltipEnabled.checked = settings.isTooltipEnabled !== false;
      
      // 제외 사이트 목록 렌더링
      if (settings.disabledSites) {
        renderDisabledSitesList(settings.disabledSites);
      }
      
    } catch (error) {
      console.error("설정 로드 오류:", error);
    }
  }

  function saveSettings() {
    try {
      chrome.storage.local.get(['disabledSites'], (result) => { 
        const settings = {
          apiProvider: elements.apiProvider?.value || 'openai',
          apiUrl: elements.apiUrl?.value || 'https://api.openai.com/v1/',
          apiKey: elements.apiKey?.value || '',
          apiModel: elements.apiModel?.value || 'gpt-4.1-nano',
          learningLanguage: elements.learningLang?.value || 'en',
          defaultLanguage: elements.translationLang?.value || 'ko',
          isTooltipEnabled: elements.isTooltipEnabled?.checked !== false,
          disabledSites: result.disabledSites || []
        };
  
        chrome.runtime.sendMessage({ action: "saveSettings", settings: settings }, (response) => {
          if (response && response.success) {
            console.log("설정 저장 완료");
            
            // 저장 완료 알림
            if (elements.saveBtn) {
              const originalText = elements.saveBtn.textContent;
              elements.saveBtn.textContent = "저장됨!";
              elements.saveBtn.style.backgroundColor = "#4CAF50";
              
              setTimeout(() => {
                elements.saveBtn.textContent = originalText;
                elements.saveBtn.style.backgroundColor = "";
              }, 2000);
            }
          } else {
            console.error("설정 저장 실패:", response);
            alert("설정 저장에 실패했습니다.");
          }
        });
      });
    } catch (error) {
      console.error("설정 저장 오류:", error);
      alert("설정 저장 중 오류가 발생했습니다.");
    }
  }

  // 이벤트 리스너 설정
  function setupEventListeners() {
    // 입력 이벤트 리스너
    if (elements.inputBox) {
      elements.inputBox.addEventListener("input", handleInput);
    }
    
    // 언어 변경 이벤트
    if (elements.translationLang) {
      elements.translationLang.addEventListener("change", handleInput);
    }
    if (elements.learningLang) {
      elements.learningLang.addEventListener("change", handleInput);
    }
    
    // 탭 버튼 이벤트
    elements.tabButtons.forEach(button => {
      button.addEventListener("click", () => {
        const tabName = button.getAttribute("data-tab");
        switchTab(tabName);
      });
    });
    
    // API 공급자 변경 이벤트
    if (elements.apiProvider) {
      elements.apiProvider.addEventListener("change", handleProviderChange);
    }
    
    // 설정 저장 버튼
    if (elements.saveBtn) {
      elements.saveBtn.addEventListener("click", saveSettings);
    }
    
    // 툴팁 토글 이벤트
    if (elements.isTooltipEnabled) {
      elements.isTooltipEnabled.addEventListener("change", (e) => {
        chrome.runtime.sendMessage({ 
          action: "toggleTooltip", 
          enabled: e.target.checked 
        }, (response) => {
          console.log("툴팁 토글 응답:", response);
        });
      });
    }

    // 사이트 추가 버튼 이벤트
    if (elements.addSiteBtn) {
      elements.addSiteBtn.addEventListener("click", addSite);
    }
    
    // 사이트 입력창 엔터 키 이벤트
    if (elements.newSiteInput) {
      elements.newSiteInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          addSite();
        }
      });
    }

    // 정보 툴팁 이벤트
    const infoIcon = document.querySelector(".info-icon");
    const infoTooltip = document.querySelector(".info-tooltip");
    const infoCloseBtn = document.querySelector(".info-tooltip-close");

    if (infoIcon && infoTooltip) {
      infoIcon.addEventListener("click", (e) => {
        e.stopPropagation();
        infoTooltip.classList.toggle("show");
      });

      // 외부 클릭 시 닫기
      document.addEventListener("click", (e) => {
        if (!infoTooltip.contains(e.target) && e.target !== infoIcon) {
          infoTooltip.classList.remove("show");
        }
      });
    }

    if (infoCloseBtn && infoTooltip) {
      infoCloseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        infoTooltip.classList.remove("show");
      });
    }
  }

  // 번역 취소 함수
  function cancelTranslation() {
    if (currentRequestId && window.translationAPI) {
      window.translationAPI.cancelTranslation(currentRequestId);
      isTranslating = false;
      if (elements.outputBox) {
        elements.outputBox.textContent = "번역이 취소되었습니다.";
      }
      currentRequestId = null;
    }
  }

  function isMacAndChangeShortcut() {
    const isMac = navigator.userAgent.includes("Mac");
    const shortcut = isMac ? "Command + B" : "Ctrl + B";
    document.querySelector(".shortcut").textContent = shortcut;
    return;
  }

  // 초기화 함수
  async function initialize() {
    console.log("사이드패널 초기화 시작");

    isMacAndChangeShortcut();
    
    // 이벤트 리스너 먼저 설정 (설정 로드 대기 없이 UI 동작 가능하도록)
    setupEventListeners();

    try {
      await waitForAPI();
      
      // 기본 탭 설정
      switchTab('translate');
      
      // 설정 로드
      await loadSettings();
      
      // 입력창에 포커스
      if (elements.inputBox) {
        elements.inputBox.focus();
      }
      
      console.log("사이드패널 초기화 완료");
    } catch (error) {
      console.error("초기화 오류:", error);
    }
  }



  initialize();

  // 설정 변경 메시지 수신
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "settingsUpdated") {
      console.log("사이드패널: 설정 업데이트 수신", message.settings);
      
      const settings = message.settings;
      if (!settings) return;

      // 제외 사이트 목록 업데이트
      if (settings.disabledSites) {
        renderDisabledSitesList(settings.disabledSites);
      }
      
      // 다른 UI 요소들도 필요시 업데이트
      if (settings.apiProvider && elements.apiProvider) elements.apiProvider.value = settings.apiProvider;
      if (settings.apiUrl && elements.apiUrl) elements.apiUrl.value = settings.apiUrl;
      if (settings.apiKey && elements.apiKey) elements.apiKey.value = settings.apiKey;
      if (settings.apiModel && elements.apiModel) elements.apiModel.value = settings.apiModel;
      if (settings.learningLanguage && elements.learningLang) elements.learningLang.value = settings.learningLanguage;
      if (settings.defaultLanguage && elements.translationLang) elements.translationLang.value = settings.defaultLanguage;
      if (settings.isTooltipEnabled !== undefined && elements.isTooltipEnabled) elements.isTooltipEnabled.checked = settings.isTooltipEnabled;
    }
  });
});