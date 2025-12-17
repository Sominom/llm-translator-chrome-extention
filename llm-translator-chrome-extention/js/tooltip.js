'use strict';

function loadCSS($href) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL($href);
  document.head.appendChild(link);
}

loadCSS("css/tooltip.css");

let isTooltipEnabled = true;
let tooltipContainer;
let tooltipText;
let tooltipCloseBtn;
let tooltipMenuBtn;
let tooltipMenuDropdown;
let isTranslating = false;
let lastSelectionText = "";
let disabledSites = [];
let lastSelectionRange = null;
let repositionScheduled = false;

function globToRegex(pattern) {
  // * 제외 특수 문자 이스케이프
  let regexString = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  // .*로 변환
  regexString = regexString.replace(/\*/g, '.*');
  // 전체 일치하도록 앵커 추가
  return new RegExp(`^${regexString}$`);
}

// URL 매칭 검사
function isUrlMatched(url, pattern) {
  // 패턴이 없으면 불일치
  if (!pattern) return false;
  
  // 와일드카드가 없는 경우 호스트네임 포함 여부 또는 정확한 호스트네임 일치 확인
  if (!pattern.includes('*')) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname === pattern || urlObj.hostname.endsWith('.' + pattern);
    } catch (e) {
      return false;
    }
  }

  // 와일드카드가 있는 경우
  const regex = globToRegex(pattern);
  return regex.test(url);
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

function initTooltip() {
  tooltipContainer = document.createElement("div");
  tooltipContainer.id = "translation-tooltip";

  tooltipText = document.createElement("div");
  tooltipText.id = "tooltip-text";

  // 메뉴 버튼 생성
  tooltipMenuBtn = document.createElement("button");
  tooltipMenuBtn.innerHTML = "⋮";
  tooltipMenuBtn.id = "tooltip-menu-btn";
  tooltipMenuBtn.title = "메뉴";
  tooltipMenuBtn.addEventListener("click", toggleMenu);

  // 메뉴 드롭다운 생성
  tooltipMenuDropdown = document.createElement("div");
  tooltipMenuDropdown.id = "tooltip-menu-dropdown";
  
  const disableItem = document.createElement("div");
  disableItem.className = "tooltip-menu-item";
  disableItem.textContent = "이 사이트에서 툴팁 사용 안함";
  disableItem.addEventListener("click", disableOnThisSite);
  
  tooltipMenuDropdown.appendChild(disableItem);

  tooltipCloseBtn = document.createElement("button");
  tooltipCloseBtn.innerHTML = "✕";
  tooltipCloseBtn.id = "tooltip-close-btn";
  tooltipCloseBtn.addEventListener("click", hideTooltip);

  tooltipContainer.appendChild(tooltipText);
  tooltipContainer.appendChild(tooltipMenuBtn);
  tooltipContainer.appendChild(tooltipMenuDropdown);
  tooltipContainer.appendChild(tooltipCloseBtn);
  document.body.appendChild(tooltipContainer);
}

// 메뉴 토글
function toggleMenu(e) {
  if (e) e.stopPropagation();
  if (tooltipMenuDropdown.style.display === "block") {
    tooltipMenuDropdown.style.display = "none";
  } else {
    tooltipMenuDropdown.style.display = "block";
  }
}

// 이 사이트에서 사용 안함 처리
async function disableOnThisSite(e) {
  if (e) e.stopPropagation(); // 이벤트 버블링 방지

  // 현재 URL 기반 패턴 생성 https://example.com/*
  const pattern = window.location.origin + "/*";
  
  // 메뉴 닫기
  toggleMenu(e);

  try {
    // 백그라운드에 사이트 추가 요청
    chrome.runtime.sendMessage({ 
      action: "addDisabledSite", 
      site: pattern 
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("통신 오류:", chrome.runtime.lastError);
        alert("오류가 발생했습니다: " + chrome.runtime.lastError.message);
        return;
      }

      if (response && response.success) {
        if (response.alreadyExists) {
          alert(`'${pattern}'은(는) 이미 비활성화된 패턴입니다.`);
        } else {
          alert(`'${pattern}' 사이트의 번역 툴팁이 비활성화되었습니다.\n설정 패널에서 관리할 수 있습니다.`);
          // 응답받은 설정으로 로컬 상태 업데이트
          if (response.settings && response.settings.disabledSites) {
            disabledSites = response.settings.disabledSites;
          }
        }
        hideTooltip();
      } else {
        console.error("사이트 제외 추가 실패:", response);
        alert("설정 저장에 실패했습니다.");
      }
    });

  } catch (error) {
    console.error("사이트 제외 설정 실패:", error);
    alert("오류가 발생했습니다: " + error.message);
  }
}

window.addEventListener('load', async () => {
  try {
    await waitForAPI();
    
    const settings = await window.translationAPI.getSettings();
    isTooltipEnabled = settings.isTooltipEnabled !== false;
    disabledSites = settings.disabledSites || [];
    
    if (isTooltipEnabled) {
      initTooltip();
      setupTextSelection();
    }
    
    console.log("툴팁 초기화 완료, 활성화 상태:", isTooltipEnabled);
  } catch (error) {
    console.error("툴팁 초기화 오류:", error);
  }
});

function setupTextSelection() {
  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      lastSelectionText = "";
    }
  });

  document.addEventListener("mouseup", async (event) => {
    if (!isTooltipEnabled || isTranslating) return;

    const selectedText = window.getSelection().toString().trim();
    const selection = window.getSelection();
    
    // 비활성화된 사이트인지 확인
    const currentUrl = window.location.href;
    const isDisabled = disabledSites.some(pattern => isUrlMatched(currentUrl, pattern));
    
    if (isDisabled) {
      hideTooltip();
      return;
    }

    if (selectedText && selectedText.length > 0 && selectedText.length < 1000) {
      if (selectedText === lastSelectionText) return;
      lastSelectionText = selectedText;
      if (selection && selection.rangeCount > 0) {
        lastSelectionRange = selection.getRangeAt(0).cloneRange();
      } else {
        lastSelectionRange = null;
      }

      try {
        await showTooltip(event, selectedText);
      } catch (error) {
        console.error("툴팁 표시 오류:", error);
      }
    } else {
      lastSelectionText = "";
      hideTooltip();
    }
  });
}

async function showTooltip(event, text) {
  if (!tooltipContainer || isTranslating) return;

  isTranslating = true;
  tooltipText.textContent = "번역 중...";
  tooltipContainer.style.display = "block";

  // 초기 위치(선택 영역 기준) 설정
  scheduleTooltipReposition();

  try {
    await window.translationAPI.translateWithStream(text, {
      onStreamUpdate: (chunk, accumulated, data) => {
        if (data.type === 'chunk') {
          tooltipText.textContent = accumulated;
          scheduleTooltipReposition();
        }
      },
      onComplete: (finalText) => {
        console.log("툴팁 번역 완료:", finalText);
        tooltipText.textContent = finalText;
        scheduleTooltipReposition();
      },
      onError: (error) => {
        console.error("툴팁 번역 오류:", error);
        tooltipText.textContent = error ? error.message : "번역 중 오류가 발생했습니다.";
        setTimeout(hideTooltip, 3000);
      }
    }, false);
  } catch (error) {
    console.error("툴팁 번역 오류:", error);
    tooltipText.textContent = error ? error.message : "번역 중 오류가 발생했습니다.";
    setTimeout(hideTooltip, 3000);
  } finally {
    isTranslating = false;
  }
}

function hideTooltip() {
  if (tooltipContainer) {
    tooltipContainer.style.display = "none";
    tooltipMenuDropdown.style.display = "none";
  }
  isTranslating = false;
  lastSelectionRange = null;
}

function getSelectionAnchorClientRect() {
  // 마지막 선택 범위가 있으면 우선 사용 (스크롤/레이아웃 변화에도 따라감)
  const range = lastSelectionRange;
  if (!range) return null;

  const clientRects = range.getClientRects();
  const rect = clientRects && clientRects.length > 0 ? clientRects[0] : range.getBoundingClientRect();
  if (!rect) return null;

  // rect가 비어있는 경우 방어
  if (rect.width === 0 && rect.height === 0) return null;
  return rect;
}

function repositionTooltip() {
  if (!tooltipContainer) return;
  if (tooltipContainer.style.display !== "block") return;

  const anchorRect = getSelectionAnchorClientRect();
  if (!anchorRect) return;

  // 툴팁 크기(뷰포트 기준)
  const tooltipRect = tooltipContainer.getBoundingClientRect();

  // 기준 좌표는 "페이지 좌표"로 통일 (absolute 포지션)
  const viewportLeft = window.scrollX;
  const viewportTop = window.scrollY;
  const viewportRight = viewportLeft + window.innerWidth;
  const viewportBottom = viewportTop + window.innerHeight;

  // 기본: 선택 영역 우측 상단 기준으로 위쪽에 띄움
  let x = anchorRect.right + window.scrollX + 10;
  let y = anchorRect.top + window.scrollY - tooltipRect.height - 10;

  // 좌우 경계 보정
  if (x + tooltipRect.width > viewportRight) {
    x = anchorRect.left + window.scrollX - tooltipRect.width - 10;
  }
  if (x < viewportLeft + 10) {
    x = viewportLeft + 10;
  }

  // 상하 경계 보정
  if (y < viewportTop + 10) {
    y = anchorRect.bottom + window.scrollY + 10;
  }
  if (y + tooltipRect.height > viewportBottom - 10) {
    y = viewportBottom - tooltipRect.height - 10;
  }

  tooltipContainer.style.left = `${x}px`;
  tooltipContainer.style.top = `${y}px`;
}

function scheduleTooltipReposition() {
  if (repositionScheduled) return;
  repositionScheduled = true;
  requestAnimationFrame(() => {
    repositionScheduled = false;
    repositionTooltip();
  });
}

document.addEventListener("mousedown", (event) => {
  if (!tooltipContainer) return;

  if (!tooltipContainer.contains(event.target)) {
    hideTooltip();
  }
});

// 스크롤 시 툴팁을 숨기지 않고, 선택 영역 기준으로 위치를 갱신
// capture: true 로 설정해 overflow 컨테이너 스크롤도 잡음
document.addEventListener(
  "scroll",
  () => {
    if (!tooltipContainer) return;
    if (tooltipContainer.style.display !== "block") return;
    scheduleTooltipReposition();
  },
  { capture: true, passive: true }
);

window.addEventListener("resize", () => {
  if (!tooltipContainer) return;
  if (tooltipContainer.style.display !== "block") return;
  scheduleTooltipReposition();
});

// ESC 키로 툴팁 숨김
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideTooltip();
  }
});

// 백그라운드 메시지 수신
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "toggleTooltip") {
    isTooltipEnabled = message.enabled;
    
    if (!isTooltipEnabled) {
      hideTooltip();
    } else if (!tooltipContainer) {
      initTooltip();
      setupTextSelection();
    }
    
    sendResponse({ message: `툴팁이 ${isTooltipEnabled ? '활성화' : '비활성화'}되었습니다.` });
  } 
  else if (message.action === "settingsUpdated") {
    // 설정 업데이트 시 로컬 동기화
    if (message.settings) {
      if (message.settings.isTooltipEnabled !== undefined) {
        isTooltipEnabled = message.settings.isTooltipEnabled;
      }
      if (message.settings.disabledSites) {
        disabledSites = message.settings.disabledSites;
      }
    }
  }
});

console.log("툴팁 스크립트 로드");
