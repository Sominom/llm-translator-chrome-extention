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
    addSiteBtn: document.querySelector("#add-site-btn"),

    // Chat UI
    chatNewBtn: document.querySelector("#chat-new-btn"),
    chatMenuBtn: document.querySelector("#chat-menu-btn"),
    chatDrawerOverlay: document.querySelector("#chat-drawer-overlay"),
    chatDrawerClose: document.querySelector("#chat-drawer-close"),
    chatConversationList: document.querySelector("#chat-conversation-list"),
    chatMessages: document.querySelector("#chat-messages"),
    chatInput: document.querySelector("#chat-input"),
    chatSendBtn: document.querySelector("#chat-send-btn")
  };

  let isTranslating = false;
  let currentRequestId = null;

  // Chat state
  const CHAT_STORAGE_KEY_CONVERSATIONS = "chatConversations";
  const CHAT_STORAGE_KEY_ACTIVE_ID = "activeChatConversationId";
  const CHAT_MAX_CONVERSATIONS = 50;
  const CHAT_MAX_MESSAGES_PER_CONVO = 200;

  let chatConversations = [];
  let activeChatConversationId = null;
  let isChatStreaming = false;
  let currentChatRequestId = null;
  let chatPersistTimer = null;

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

    if (tabName === "chat" && elements.chatInput) {
      // 탭 전환 직후 포커싱(렌더/레이아웃 안정화)
      setTimeout(() => elements.chatInput?.focus(), 0);
    }
  }

  function nowTs() {
    return Date.now();
  }

  function formatRelativeTime(ts) {
    if (!ts) return "";
    const diff = Math.max(0, Date.now() - ts);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "방금";
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    return `${days}일 전`;
  }

  function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function deriveConversationTitle(convo) {
    const firstUser = convo?.messages?.find((m) => m.role === "user" && (m.content || "").trim());
    const raw = (firstUser?.content || "새 채팅").trim().replace(/\s+/g, " ");
    return raw.length > 24 ? `${raw.slice(0, 24)}…` : raw;
  }

  async function loadChatState() {
    return new Promise((resolve) => {
      chrome.storage.local.get([CHAT_STORAGE_KEY_CONVERSATIONS, CHAT_STORAGE_KEY_ACTIVE_ID], (result) => {
        const conversations = Array.isArray(result[CHAT_STORAGE_KEY_CONVERSATIONS])
          ? result[CHAT_STORAGE_KEY_CONVERSATIONS]
          : [];
        const activeId = typeof result[CHAT_STORAGE_KEY_ACTIVE_ID] === "string" ? result[CHAT_STORAGE_KEY_ACTIVE_ID] : null;
        resolve({ conversations, activeId });
      });
    });
  }

  async function saveChatState() {
    // 과도한 저장 방지: 디바운스 저장
    if (chatPersistTimer) {
      clearTimeout(chatPersistTimer);
    }
    chatPersistTimer = setTimeout(() => {
      const trimmedConversations = [...chatConversations]
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, CHAT_MAX_CONVERSATIONS)
        .map((c) => ({
          ...c,
          messages: Array.isArray(c.messages) ? c.messages.slice(-CHAT_MAX_MESSAGES_PER_CONVO) : []
        }));

      chrome.storage.local.set(
        {
          [CHAT_STORAGE_KEY_CONVERSATIONS]: trimmedConversations,
          [CHAT_STORAGE_KEY_ACTIVE_ID]: activeChatConversationId
        },
        () => {
          // noop
        }
      );
    }, 300);
  }

  function getActiveConversation() {
    if (!activeChatConversationId) return null;
    return chatConversations.find((c) => c.id === activeChatConversationId) || null;
  }

  function ensureActiveConversation() {
    let convo = getActiveConversation();
    if (convo) return convo;

    if (chatConversations.length > 0) {
      // 최신 대화로 복구
      chatConversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      activeChatConversationId = chatConversations[0].id;
      return chatConversations[0];
    }

    const newConvo = {
      id: createId("convo"),
      title: "새 채팅",
      createdAt: nowTs(),
      updatedAt: nowTs(),
      messages: []
    };
    chatConversations.unshift(newConvo);
    activeChatConversationId = newConvo.id;
    saveChatState();
    return newConvo;
  }

  function openChatDrawer() {
    if (!elements.chatDrawerOverlay) return;
    elements.chatDrawerOverlay.classList.add("open");
    elements.chatDrawerOverlay.setAttribute("aria-hidden", "false");
  }

  function closeChatDrawer() {
    if (!elements.chatDrawerOverlay) return;
    elements.chatDrawerOverlay.classList.remove("open");
    elements.chatDrawerOverlay.setAttribute("aria-hidden", "true");
  }

  function renderConversationList() {
    if (!elements.chatConversationList) return;

    elements.chatConversationList.innerHTML = "";

    const items = [...chatConversations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.style.color = "#999";
      empty.style.padding = "8px";
      empty.textContent = "대화가 없습니다. 새 채팅을 시작해보세요.";
      elements.chatConversationList.appendChild(empty);
      return;
    }

    items.forEach((convo) => {
      const row = document.createElement("div");
      row.className = `chat-conversation-item${convo.id === activeChatConversationId ? " active" : ""}`;
      row.setAttribute("data-conversation-id", convo.id);

      const text = document.createElement("div");
      text.className = "chat-conversation-text";

      const title = document.createElement("div");
      title.className = "chat-conversation-title";
      title.textContent = convo.title || "새 채팅";

      const subtitle = document.createElement("div");
      subtitle.className = "chat-conversation-subtitle";
      subtitle.textContent = `${formatRelativeTime(convo.updatedAt)} · ${convo.messages?.length || 0}개 메시지`;

      text.appendChild(title);
      text.appendChild(subtitle);

      const actions = document.createElement("div");
      actions.className = "chat-conversation-actions";

      const delBtn = document.createElement("button");
      delBtn.className = "chat-delete-btn";
      delBtn.type = "button";
      delBtn.title = "삭제";
      delBtn.textContent = "×";

      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteConversation(convo.id);
      });

      actions.appendChild(delBtn);

      row.appendChild(text);
      row.appendChild(actions);

      row.addEventListener("click", () => {
        selectConversation(convo.id);
        closeChatDrawer();
      });

      elements.chatConversationList.appendChild(row);
    });
  }

  function createChatMessageElement(msg) {
    const wrapper = document.createElement("div");
    wrapper.className = `chat-message ${msg.role === "user" ? "user" : "assistant"}`;
    wrapper.setAttribute("data-message-id", msg.id);

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.textContent = msg.content || "";

    const meta = document.createElement("div");
    meta.className = "chat-meta";
    meta.textContent = msg.role === "user" ? "나" : "AI";

    wrapper.appendChild(bubble);
    wrapper.appendChild(meta);
    return wrapper;
  }

  function renderChatMessages() {
    if (!elements.chatMessages) return;
    const convo = ensureActiveConversation();

    elements.chatMessages.innerHTML = "";

    if (!convo.messages || convo.messages.length === 0) {
      const empty = document.createElement("div");
      empty.style.color = "#999";
      empty.style.padding = "6px";
      empty.textContent = "새 채팅을 시작해보세요.";
      elements.chatMessages.appendChild(empty);
      return;
    }

    convo.messages.forEach((msg) => {
      if (msg.role !== "user" && msg.role !== "assistant") return;
      elements.chatMessages.appendChild(createChatMessageElement(msg));
    });

    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  }

  function appendMessageToConversation(convoId, message) {
    const convo = chatConversations.find((c) => c.id === convoId);
    if (!convo) return;
    convo.messages = Array.isArray(convo.messages) ? convo.messages : [];
    convo.messages.push(message);
    convo.updatedAt = nowTs();
    if (!convo.title || convo.title === "새 채팅") {
      convo.title = deriveConversationTitle(convo);
    }
    saveChatState();
  }

  function updateAssistantMessage(convoId, messageId, newText) {
    const convo = chatConversations.find((c) => c.id === convoId);
    if (!convo) return;
    const msg = convo.messages?.find((m) => m.id === messageId);
    if (msg) {
      msg.content = newText;
      convo.updatedAt = nowTs();
      saveChatState();
    }

    if (convoId === activeChatConversationId && elements.chatMessages) {
      const el = elements.chatMessages.querySelector(`[data-message-id="${messageId}"] .chat-bubble`);
      if (el) {
        el.textContent = newText;
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
      }
    }
  }

  function selectConversation(convoId) {
    const exists = chatConversations.some((c) => c.id === convoId);
    if (!exists) return;
    activeChatConversationId = convoId;
    saveChatState();
    renderConversationList();
    renderChatMessages();
  }

  function createNewConversation() {
    if (isChatStreaming) {
      alert("응답 생성 중에는 새 채팅을 만들 수 없습니다.");
      return;
    }

    const convo = {
      id: createId("convo"),
      title: "새 채팅",
      createdAt: nowTs(),
      updatedAt: nowTs(),
      messages: []
    };
    chatConversations.unshift(convo);
    activeChatConversationId = convo.id;
    saveChatState();
    renderConversationList();
    renderChatMessages();
    closeChatDrawer();
    elements.chatInput?.focus();
  }

  function deleteConversation(convoId) {
    const convo = chatConversations.find((c) => c.id === convoId);
    if (!convo) return;

    if (isChatStreaming && convoId === activeChatConversationId) {
      alert("응답 생성 중인 대화는 삭제할 수 없습니다.");
      return;
    }

    const ok = confirm(`이 대화를 삭제할까요?\n\n"${convo.title || "새 채팅"}"`);
    if (!ok) return;

    chatConversations = chatConversations.filter((c) => c.id !== convoId);

    if (activeChatConversationId === convoId) {
      activeChatConversationId = chatConversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]?.id || null;
      if (!activeChatConversationId) {
        // 모두 삭제된 경우 새 대화 생성
        const newConvo = {
          id: createId("convo"),
          title: "새 채팅",
          createdAt: nowTs(),
          updatedAt: nowTs(),
          messages: []
        };
        chatConversations.unshift(newConvo);
        activeChatConversationId = newConvo.id;
      }
    }

    saveChatState();
    renderConversationList();
    renderChatMessages();
  }

  function buildChatRequestMessages(convo) {
    const baseSystem = {
      role: "system",
      content: "당신은 도움이 되는 AI 어시스턴트입니다. 사용자의 질문에 정확하고 간결하게 답변하세요."
    };
    const history = (convo?.messages || [])
      .filter((m) => (m.role === "user" || m.role === "assistant") && (m.content || "").trim())
      .map((m) => ({ role: m.role, content: m.content }));
    return [baseSystem, ...history];
  }

  async function sendChatMessage() {
    const text = elements.chatInput?.value?.trim();
    if (!text) return;

    if (isChatStreaming) {
      console.log("이미 채팅 응답 생성 중입니다.");
      return;
    }

    try {
      await waitForAPI();
    } catch (e) {
      alert("API 모듈을 로드할 수 없습니다.");
      return;
    }

    const convo = ensureActiveConversation();
    const convoId = convo.id;

    // 사용자 메시지 추가
    const userMsg = { id: createId("msg"), role: "user", content: text, ts: nowTs() };
    appendMessageToConversation(convoId, userMsg);
    elements.chatInput.value = "";
    renderChatMessages();

    // 어시스턴트 플레이스홀더
    const assistantMsgId = createId("msg");
    const assistantMsg = { id: assistantMsgId, role: "assistant", content: "", ts: nowTs() };
    appendMessageToConversation(convoId, assistantMsg);
    renderChatMessages();

    isChatStreaming = true;
    currentChatRequestId = Date.now().toString();
    if (elements.chatSendBtn) elements.chatSendBtn.disabled = true;

    const requestMessages = buildChatRequestMessages(chatConversations.find((c) => c.id === convoId));

    try {
      await window.translationAPI.chatWithStream(requestMessages, {
        onStreamUpdate: (_chunk, accumulated) => {
          updateAssistantMessage(convoId, assistantMsgId, accumulated);
        },
        onComplete: (finalText) => {
          updateAssistantMessage(convoId, assistantMsgId, finalText);
        },
        onError: (error) => {
          console.error("채팅 오류:", error);
          updateAssistantMessage(convoId, assistantMsgId, `오류: ${error.message || "채팅 중 오류가 발생했습니다."}`);
        }
      });
    } finally {
      isChatStreaming = false;
      currentChatRequestId = null;
      if (elements.chatSendBtn) elements.chatSendBtn.disabled = false;
    }
  }

  async function initializeChat() {
    if (!elements.chatMessages) return;

    const { conversations, activeId } = await loadChatState();
    chatConversations = Array.isArray(conversations) ? conversations : [];
    activeChatConversationId = activeId;

    ensureActiveConversation();
    renderConversationList();
    renderChatMessages();
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
      if (elements.apiModel) elements.apiModel.value = settings.apiModel || 'gpt-4.1-nano';
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

    // Chat: 새 채팅
    if (elements.chatNewBtn) {
      elements.chatNewBtn.addEventListener("click", createNewConversation);
    }

    // Chat: 메뉴(대화 목록)
    if (elements.chatMenuBtn) {
      elements.chatMenuBtn.addEventListener("click", () => {
        renderConversationList();
        openChatDrawer();
      });
    }

    // Chat: 드로어 닫기
    if (elements.chatDrawerClose) {
      elements.chatDrawerClose.addEventListener("click", closeChatDrawer);
    }

    if (elements.chatDrawerOverlay) {
      elements.chatDrawerOverlay.addEventListener("click", (e) => {
        if (e.target === elements.chatDrawerOverlay) {
          closeChatDrawer();
        }
      });
    }

    // Chat: 전송 버튼
    if (elements.chatSendBtn) {
      elements.chatSendBtn.addEventListener("click", sendChatMessage);
    }

    // Chat: Enter 전송 / Shift+Enter 줄바꿈
    if (elements.chatInput) {
      // macOS 한글/일본어 등 IME 조합 입력 시 Enter가 "조합 확정"과 "Enter"로 중복 처리되며
      // 전송 후 textarea를 비워도 마지막 글자가 다시 남는 문제가 발생할 수 있어, 조합 중에는 전송을 막는다.
      let isChatComposing = false;

      elements.chatInput.addEventListener("compositionstart", () => {
        isChatComposing = true;
      });

      elements.chatInput.addEventListener("compositionend", () => {
        isChatComposing = false;
      });

      elements.chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          // IME 조합 중 Enter는 전송이 아니라 "조합 확정"이 우선
          // - e.isComposing: 표준 플래그(Chrome 지원)
          // - keyCode 229: 일부 IME에서 조합 키 입력을 나타내는 값(레거시 호환)
          if (e.isComposing || isChatComposing || e.keyCode === 229) {
            return;
          }
          e.preventDefault();
          sendChatMessage();
        }
      });
    }

    // ESC로 드로어 닫기
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeChatDrawer();
      }
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
    const shortcutElement = document.querySelector(".shortcut");
    if (shortcutElement) {
      shortcutElement.textContent = shortcut;
    }
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

      // 채팅 초기화(저장된 대화/active 복원)
      await initializeChat();
      
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