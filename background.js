// 在Manifest V3中，webRequest API的使用方式有所改变
chrome.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    const headers = details.requestHeaders;
    for (let i = 0; i < headers.length; i++) {
      if (headers[i].name.toLowerCase() === 'cookie') {
        return;
      }
    }
    
    // 添加Cookie
    headers.push({
      name: 'Cookie',
      value: chrome.cookies.get({
        url: details.url,
        name: 'SESSDATA'
      }).then(cookie => cookie ? cookie.value : '')
    });
    
    return { requestHeaders: headers };
  },
  { urls: ["https://*.bilibili.com/*"] },
  ["blocking", "requestHeaders", "extraHeaders"]
);

// 处理下载请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadJSONL') {
    const { JSONLContent, filename } = request;
    const blob = new Blob([JSONLContent], { type: 'application/jsonl;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    chrome.downloads.download({
      url: url,
      filename: filename,
      conflictAction: 'uniquify',
      saveAs: true
    }, () => {
      URL.revokeObjectURL(url);
    });
  }
});