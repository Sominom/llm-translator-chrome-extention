document.querySelector('#open-sidepanel').addEventListener('click', function (e) {
  e.preventDefault();
  
  chrome.runtime.sendMessage({ action: "openSidePanel" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("메시지 전송 실패:", chrome.runtime.lastError);
      alert("오류가 발생했습니다: " + chrome.runtime.lastError.message);
      return;
    }
    
    if (!response || !response.success) {
      console.error("사이드 패널 열기 실패:", response ? response.error : "Unknown error");
      alert("사이드 패널을 열 수 없습니다. 브라우저 우측 상단의 아이콘을 클릭해주세요.");
    }
  });
});
