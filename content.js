// content.js
// 确保CryptoJS可用
if (typeof CryptoJS === 'undefined') {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('lib/crypto-js.min.js');
    script.onload = function() {
        this.remove();
        initCrawler();
    };
    (document.head || document.documentElement).appendChild(script);
} else {
    initCrawler();
}

// 统一重置 UI 状态的辅助函数
function resetCrawlerUI(statusText = '就绪') {
    isCrawling = false;
    isPaused = false;
    stopRequested = false;
    
    crawlerStatus.textContent = statusText;
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    downloadBtn.disabled = comments.length === 0; // 如果有数据则允许下载
    
    pauseBtn.textContent = '暂停';
    pauseBtn.classList.remove('btn-continue');
    pauseBtn.classList.add('btn-pause');
}


function initCrawler() {
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
        #bili-comment-crawler {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            background: white;
            border: 1px solid #e7e7e7;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 0;
            width: 300px;
            font-family: 'Microsoft YaHei', sans-serif;
            overflow: hidden;
        }
        .crawler-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 15px;
            background: #f5f5f5;
            cursor: pointer;
            border-bottom: 1px solid #eee;
        }
        .crawler-title {
            font-size: 16px;
            font-weight: bold;
            color: #00a1d6;
        }
        .crawler-toggle {
            font-size: 18px;
            color: #999;
            transition: transform 0.3s;
        }
        .crawler-body {
            padding: 15px;
            display: none;
        }
        .crawler-stats {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            color: #666;
            margin-bottom: 10px;
        }
        .crawler-buttons {
            display: flex;
            gap: 10px;
            margin-bottom: 10px;
        }
        .crawler-btn {
            flex: 1;
            padding: 8px 0;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        }
        .btn-start {
            background: #00a1d6;
            color: white;
        }
        .btn-start:hover {
            background: #0087b3;
        }
        .btn-pause {
            background: #ff0000ff;
            color: white;
        }
        .btn-pause:hover {
            background: #ff0000ff;
        }
        .btn-download {
            background: #52c41a;
            color: white;
        }
        .btn-download:hover {
            background: #389e0d;
        }
        /* 新增的继续按钮样式 */
        .btn-continue {
            background: #f59b15ff; 
            color: white;
        }
        .btn-continue:hover {
            background: #db7611ff;
        }
        .crawler-log {
            max-height: 150px;
            overflow-y: auto;
            font-size: 12px;
            color: #666;
            border: 1px solid #eee;
            border-radius: 4px;
            padding: 8px;
            background: #fafafa;
        }
        .log-entry {
            margin-bottom: 4px;
            line-height: 1.4;
        }
        .log-time {
            color: #999;
            margin-right: 5px;
        }
        .log-error {
            color: #ff4d4f;
        }
        .log-warning {
            color: #faad14;
        }
        .watermark {
            text-align: center;
            font-size: 10px;
            color: #aaa;
            padding: 5px;
            border-top: 1px solid #eee;
            background: #f9f9f9;
        }
        .expanded .crawler-toggle {
            transform: rotate(180deg);
        }
        .expanded .crawler-body {
            display: block;
        }
    `;
    document.head.appendChild(style);

    // 创建UI容器
    const container = document.createElement('div');
    container.id = 'bili-comment-crawler';
    container.innerHTML = `
        <div class="crawler-header">
            <div class="crawler-title">B站评论爬取工具</div>
            <div class="crawler-toggle">▼</div>
        </div>
        <div class="crawler-body">
        <div class="crawler-mode-select" style="margin-bottom: 10px;">
            <label><input type="radio" name="crawl-mode" value="comment" checked> 爬取评论</label>
            <label><input type="radio" name="crawl-mode" value="danmaku"> 爬取弹幕</label>
        </div>
            <div class="crawler-stats">
                <span>已爬取: <span id="crawled-count">0</span> 条</span>
                <span>状态: <span id="crawler-status">就绪</span></span>
            </div>
            <div class="crawler-buttons">
                <button class="crawler-btn btn-start" id="start-crawl">开始爬取</button>
                <button class="crawler-btn btn-pause" id="pause-crawl" disabled>暂停</button>
                <button class="crawler-btn btn-download" id="download-jsonl" disabled>下载JSONL</button>
            </div>
            <div class="crawler-log" id="crawler-log"></div>
        </div>
        <div class="watermark">Created by Ldyer</div>
    `;
    document.body.appendChild(container);

    // 获取UI元素
    const header = container.querySelector('.crawler-header');
    const toggleBtn = container.querySelector('.crawler-toggle');
    const body = container.querySelector('.crawler-body');
    const startBtn = container.querySelector('#start-crawl');
    const pauseBtn = container.querySelector('#pause-crawl');
    const downloadBtn = container.querySelector('#download-jsonl');
    const crawledCount = container.querySelector('#crawled-count');
    const crawlerStatus = container.querySelector('#crawler-status');
    const crawlerLog = container.querySelector('#crawler-log');


    // 【新增】获取模式选择的单选框节点列表
    const modeRadios = container.querySelectorAll('input[name="crawl-mode"]');


    // 折叠/展开功能
    let isExpanded = false;
    function togglePanel() {
        isExpanded = !isExpanded;
        if (isExpanded) {
            container.classList.add('expanded');
        } else {
            container.classList.remove('expanded');
        }
    }
    header.addEventListener('click', togglePanel);

    // 【新增】监听单选框切换事件
    modeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            // 如果正在爬取中，不允许切换（可以把单选框 disabled 掉，或者直接在这拦截）
            if (isCrawling) {
                e.preventDefault();
                addLog('爬取过程中无法切换模式！', 'warning');
                // 恢复回原来的选中状态
                document.querySelector(`input[name="crawl-mode"][value="${currentMode}"]`).checked = true;
                return;
            }

            // 更新当前模式变量
            currentMode = e.target.value;
            
            // 切换模式时，清空之前的计数和日志，显得更清晰
            count = 0;
            comments = [];
            crawledCount.textContent = '0';
            crawlerLog.innerHTML = '';
            addLog(`已切换为：${currentMode === 'comment' ? '评论' : '弹幕'}爬取模式`);
        });
    });

    // 状态变量
    let isCrawling = false;
    let isPaused = false;
    let stopRequested = false;
    let comments = [];
    let bv = '';
    let oid = '';
    let title = '';
    let nextPageID = '';
    let count = 0;
    let lastPauseTime = 0;
    let pageType = 0; // 1:视频, 2:番剧, 3:动态
    let currentMode = 'comment';

    // 添加日志
    function addLog(message, type = 'info') {
        const now = new Date();
        const timeStr = now.toTimeString().substring(0, 8);
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        if (type === 'error') logEntry.classList.add('log-error');
        if (type === 'warning') logEntry.classList.add('log-warning');
        logEntry.innerHTML = `<span class="log-time">[${timeStr}]</span> ${message}`;
        crawlerLog.appendChild(logEntry);
        crawlerLog.scrollTop = crawlerLog.scrollHeight;
    }

    // 简单睡眠
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 如果处于暂停，等待恢复
    async function waitIfPaused() {
        while (isPaused && !stopRequested) {
            await sleep(200);
        }
    }

    // 带暂停感知的等待（用于页面间短暂停顿或固定的5秒短暂停顿）
    async function pauseAwareSleep(ms) {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if (stopRequested) break;
            if (isPaused) await waitIfPaused();
            await sleep(200);
        }
    }

    // 获取当前页面类型和ID
    function getPageInfo() {
        const path = window.location.pathname;
        if (path.includes('/video/')) {
            pageType = 1;
            const bvMatch = path.match(/\/video\/(BV\w+)/);
            return bvMatch ? bvMatch[1] : '';
        } else if (path.includes('/bangumi/play/')) {
            pageType = 2;
            const bangumiMatch = path.match(/\/bangumi\/play\/(\w+)/);
            return bangumiMatch ? bangumiMatch[1] : '';
        } else if (path.includes('/opus/')) {
            pageType = 3;
            const opusMatch = path.match(/\/opus\/(\w+)/);
            return opusMatch ? opusMatch[1] : '';
        }
        return '';
    }

    // 获取视频oid和标题 - 支持多种页面类型
    async function getInformation(id) {
        return new Promise((resolve, reject) => {
            let url = '';
            let type = '';
            switch (pageType) {
                case 1:
                    url = `https://www.bilibili.com/video/${id}`;
                    type = '视频';
                    break;
                case 2:
                    url = `https://www.bilibili.com/bangumi/play/${id}`;
                    type = '番剧';
                    break;
                case 3:
                    url = `https://www.bilibili.com/opus/${id}`;
                    type = '动态';
                    break;
                default:
                    reject(new Error('未知页面类型'));
                    return;
            }

            fetch(url, {
                credentials: 'include',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
                    'Referer': window.location.href
                }
            })
            .then(response => {
                if (response.ok) return response.text();
                throw new Error(`获取页面失败: ${response.status}`);
            })
            .then(text => {
                let oid = '';
                let cid = '';
                switch (pageType) {
                    case 1: {
                        const oidRegex = new RegExp(`"aid":(\\d+),"bvid":"${id}"`);
                        const oidMatch = text.match(oidRegex);
                        oid = oidMatch ? oidMatch[1] : '';

                        // 提取视频的 cid
                        const cidMatch = text.match(/"cid":(\d+)/);
                        cid = cidMatch ? cidMatch[1] : '';
                        break;
                    }
                    case 2: {
                        const aidMatch = text.match(/"aid":(\d+),/);
                        oid = aidMatch ? aidMatch[1] : '';

                        // 提取视频的 cid
                        const cidMatch = text.match(/"cid":(\d+)/);
                        cid = cidMatch ? cidMatch[1] : '';
                        break;
                    }
                    case 3: {
                        const ridMatch = text.match(/"rid_str":"(\d+)"/);
                        oid = ridMatch ? ridMatch[1] : '';
                        break;
                    }
                }

                let title = '未识别';
                try {
                    const titleMatch = text.match(/<title>(.+?)<\/title>/);
                    if (titleMatch && titleMatch[1]) {
                        title = titleMatch[1];
                        if (title.includes('_哔哩哔哩_bilibili')) {
                            title = title.split('_哔哩哔哩_bilibili')[0];
                        }
                    }
                } catch (e) {
                    addLog(`标题提取失败: ${e.message}`, 'warning');
                }

                addLog(`页面类型: ${type}`);
                resolve({ oid, cid, title });
            })
            .catch(error => {
                reject(new Error(`请求页面失败: ${error.message}`));
            });
        });
    }

    // MD5 加密
    function md5(str) {
        return CryptoJS.MD5(str).toString();
    }

    // 获取请求头
    function getHeader() {
        return {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
            'Referer': window.location.href
        };
    }

    // 发送请求，返回 JSON
    function makeRequest(url) {
        return new Promise((resolve, reject) => {
            fetch(url, {
                credentials: 'include',
                headers: getHeader()
            })
            .then(response => {
                if (response.ok) return response.json();
                throw new Error(`请求失败: ${response.status}`);
            })
            .then(data => resolve(data))
            .catch(error => reject(error));
        });
    }

    // 格式化时间
    function formatTime(isoTime) {
        const date = new Date(isoTime);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    // 辅助函数：重置 UI
    function resetUIState(statusText) {
        isCrawling = false;
        crawlerStatus.textContent = statusText;
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        downloadBtn.disabled = false;
        pauseBtn.textContent = '暂停';
        pauseBtn.classList.remove('btn-continue');
        pauseBtn.classList.add('btn-pause');
    }


    // 爬取评论（迭代实现，支持暂停/继续）
    async function startCrawl(isSecond = true) {
        if (stopRequested) {
            isCrawling = false;
            stopRequested = false;
            crawlerStatus.textContent = '已停止';
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            downloadBtn.disabled = false;
            pauseBtn.textContent = '暂停';
            // 重置按钮样式
            pauseBtn.classList.remove('btn-continue');
            pauseBtn.classList.add('btn-pause');
            addLog('爬取已停止');
            return;
        }

        let mode = 2; // 2为最新评论，3为热门
        let type = 1; // 普通视频和番剧为1，动态为11
        const plat = 1;
        const web_location = 1315875;

        if (pageType === 3) {
            mode = 3;
            type = 11;
        }

        // 使用循环替代递归，避免调用栈过深
        let localNext = nextPageID || '';
        let continuePaging = true;

        while (continuePaging && !stopRequested) {
            await waitIfPaused();

            const wts = Math.floor(Date.now() / 1000);
            let url = '';

            if (localNext) {
                const pagination_str = JSON.stringify({ offset: localNext });
                const encoded_pagination = encodeURIComponent(pagination_str);
                const code = `mode=${mode}&oid=${oid}&pagination_str=${encoded_pagination}&plat=${plat}&type=${type}&web_location=${web_location}&wts=${wts}ea1db124af3c7062474693fa704f4ff8`;
                const w_rid = md5(code);
                url = `https://api.bilibili.com/x/v2/reply/wbi/main?oid=${oid}&type=${type}&mode=${mode}&pagination_str=${encodeURIComponent(pagination_str)}&plat=1&web_location=${web_location}&w_rid=${w_rid}&wts=${wts}`;
            } else {
                const pagination_str = JSON.stringify({ offset: "" });
                const encoded_pagination = encodeURIComponent(pagination_str);
                const code = `mode=${mode}&oid=${oid}&pagination_str=${encoded_pagination}&plat=${plat}&seek_rpid=&type=${type}&web_location=${web_location}&wts=${wts}ea1db124af3c7062474693fa704f4ff8`;
                const w_rid = md5(code);
                url = `https://api.bilibili.com/x/v2/reply/wbi/main?oid=${oid}&type=${type}&mode=${mode}&pagination_str=${encodeURIComponent(pagination_str)}&plat=1&seek_rpid=&web_location=${web_location}&w_rid=${w_rid}&wts=${wts}`;
            }

            let retry = 3;
            try {
                const commentData = await makeRequest(url);
                if (!commentData.data || !commentData.data.replies) {
                    throw new Error('未获取到评论数据');
                }

                for (const reply of commentData.data.replies) {
                    if (stopRequested) break;
                    await waitIfPaused();

                    count++;
                    crawledCount.textContent = count;

                    const comment = JSON.parse(JSON.stringify(reply));

                    if (reply.reply_control?.sub_reply_entry_text) {
                        const match = reply.reply_control.sub_reply_entry_text.match(/\d+/);
                        comment.rereply = match ? parseInt(match[0]) : 0;
                    }

                    comments.push(comment);

                    // 爬取二级评论
                    if (isSecond && comment.rereply > 0) {
                        await crawlSecondComments(oid, comment.rpid, comment.rereply, type);
                    }

                    // 每100条休息5秒（可被暂停/停止打断）
                    if (count % 100 === 0 && count !== lastPauseTime && count % 1000 !== 0) {
                        lastPauseTime = count;
                        addLog(`已爬取 ${count} 条评论，暂停5秒...`, 'warning');
                        crawlerStatus.textContent = '暂停中...';
                        await pauseAwareSleep(5000);
                        if (stopRequested) break;
                        // 如果在等待期间被用户暂停，pauseAwareSleep 会在恢复后返回
                        crawlerStatus.textContent = '爬取中...';
                        addLog('暂停结束，继续爬取');
                    }
                    // 每1000条休息30秒（可被暂停/停止打断）
                    if (count !== lastPauseTime && count % 1000 === 0) {
                        lastPauseTime = count;
                        addLog(`已爬取 ${count} 条评论，暂停30秒...`, 'warning');
                        crawlerStatus.textContent = '暂停中...';
                        await pauseAwareSleep(30000);
                        if (stopRequested) break;
                        // 如果在等待期间被用户暂停，pauseAwareSleep 会在恢复后返回
                        crawlerStatus.textContent = '爬取中...';
                        addLog('暂停结束，继续爬取');
                    }

                    // 每10000条分段下载
                    if (comments.length >= 10000) {
                        addLog(`已爬取 ${count} 条评论，下载中`, 'warning');
                        crawlerStatus.textContent = '暂停中...';
                        downloadJSONL(partial=true);
                        comments = []
                        if (stopRequested) break;
                        // 如果在等待期间被用户暂停，pauseAwareSleep 会在恢复后返回
                        crawlerStatus.textContent = '爬取中...';
                        addLog('暂停结束，继续爬取');
                    }
                }

                localNext = commentData.data?.cursor?.pagination_reply?.next_offset || 0;

                if (stopRequested) break;

                if (localNext && localNext !== 0) {
                    addLog(`爬取下一页，当前已爬取 ${count} 条`);
                    await pauseAwareSleep(500); // 页面间短暂休息
                    // 继续下一轮循环（localNext 已被更新）
                } else {
                    continuePaging = false;
                }
            } catch (error) {
                retry--;
                isCrawling = false;
                crawlerStatus.textContent = '错误';
                startBtn.disabled = false;
                pauseBtn.disabled = true;
                pauseBtn.textContent = '暂停';
                // 重置按钮样式
                pauseBtn.classList.remove('btn-continue');
                pauseBtn.classList.add('btn-pause');
                addLog(`爬取出错: ${error.message}`, 'error');
                if (retry)
                    continue
                return;
            }
        }

        if (stopRequested) {
            isCrawling = false;
            crawlerStatus.textContent = '已停止';
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            downloadBtn.disabled = false;
            pauseBtn.textContent = '暂停';
            // 重置按钮样式
            pauseBtn.classList.remove('btn-continue');
            pauseBtn.classList.add('btn-pause');
            addLog('爬取已停止');
            return;
        }

        // 爬取完成
        isCrawling = false;
        isPaused = false;
        crawlerStatus.textContent = '完成';
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        downloadBtn.disabled = false;
        pauseBtn.textContent = '暂停';
        // 重置按钮样式
        pauseBtn.classList.remove('btn-continue');
        pauseBtn.classList.add('btn-pause');
        addLog(`评论爬取完成！总共爬取 ${count} 条！`);
        downloadJSONL();
    }



    // 爬取二级评论
    async function crawlSecondComments(oid, rootRpid, totalReplies, type) {
        const pageSize = 10;
        const totalPages = Math.ceil(totalReplies / pageSize);

        for (let page = 1; page <= totalPages; page++) {
            if (stopRequested) break;
            await waitIfPaused();

            const url = `https://api.bilibili.com/x/v2/reply/reply?oid=${oid}&type=${type}&root=${rootRpid}&ps=${pageSize}&pn=${page}&web_location=333.788`;

            try {
                const replyData = await makeRequest(url);
                if (!replyData.data || !replyData.data.replies) continue;

                for (const reply of replyData.data.replies) {
                    if (stopRequested) break;
                    await waitIfPaused();

                    count++;
                    crawledCount.textContent = count;

                    const comment = JSON.parse(JSON.stringify(reply));

                    comments.push(comment);

                    if (count % 100 === 0 && count !== lastPauseTime) {
                        lastPauseTime = count;
                        addLog(`已爬取 ${count} 条评论，暂停5秒...`, 'warning');
                        crawlerStatus.textContent = '暂停中...';
                        await pauseAwareSleep(5000);
                        if (stopRequested) break;
                        crawlerStatus.textContent = '爬取中...';
                        addLog('暂停结束，继续爬取');
                    }
                }

                await pauseAwareSleep(300);
            } catch (error) {
                addLog(`二级评论爬取出错: ${error.message}`, 'error');
            }
        }
    }

// 爬取弹幕（支持暂停/继续、WBI鉴权）
    async function startCrawlDanmaku() {
        if (stopRequested) {
            isCrawling = false;
            stopRequested = false;
            crawlerStatus.textContent = '已停止';
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            downloadBtn.disabled = false;
            pauseBtn.textContent = '暂停';
            pauseBtn.classList.remove('btn-continue');
            pauseBtn.classList.add('btn-pause');
            addLog('弹幕爬取已停止');
            return;
        }
        
        // 获取你定义的包 (处理可能存在的未定义情况)
        const pb = window.protobuf || protobuf;
        const root = pb.roots["default"];
        const PrecompiledBilibiliDanmakuProto = root.PrecompiledBilibiliDanmakuProto;
        if (!PrecompiledBilibiliDanmakuProto) {
            addLog('找不到 Proto 包，请检查 danmaku.js 是否成功引入且包名正确', 'error');
            isCrawling = false;
            resetCrawlerUI(); // 恢复按钮状态
            return;
        }
        const DmSegMobileReply = PrecompiledBilibiliDanmakuProto.DmSegMobileReply;

        let segment_index = 1; // 弹幕按分段获取，1个分段代表视频的6分钟
        let continueCrawling = true;

        while (continueCrawling && !stopRequested) {
            await waitIfPaused();

            const wts = Math.floor(Date.now() / 1000);
            
            // 动态构造不同分段的参数
            let params = [];
            if (segment_index === 1) {
                // 第一段弹幕参数较多
                params = [
                    `type=1`,
                    `oid=${cid}`,                // 视频的 cid
                    `pid=${oid}`,                // 视频的 aid/oid
                    `segment_index=${segment_index}`,
                    `pull_mode=1`,               // 固定值
                    `ps=0`,                      // 固定值
                    `pe=120000`,                 // 固定值
                    `web_location=1315873`       // 网页端固定 location
                ];
            } else {
                // 后续段弹幕参数
                params = [
                    `type=1`,
                    `oid=${cid}`,                
                    `pid=${oid}`,                
                    `segment_index=${segment_index}`,
                    `web_location=1315873`
                ];
            }
            const paramsStr = params.join('&');
            // 复用评论爬取的固定 Salt 进行 MD5 加密
            const code = `${paramsStr}&wts=${wts}ea1db124af3c7062474693fa704f4ff8`;
            const w_rid = md5(code);
            
            // 拼接带 WBI 签名的新版 API URL
            const url = `https://api.bilibili.com/x/v2/dm/wbi/web/seg.so?${paramsStr}&w_rid=${w_rid}&wts=${wts}`;

            let retry = 3;
            try {
                // 发起请求，credentials: 'include' 会自动携带 B站 Cookie (包含 SESSDATA)
                // 这能保证获取到对应账号权限内最全的弹幕
                const response = await fetch(url, {
                    credentials: 'include',
                    headers: getHeader()
                });

                if (!(response.ok || response.status === 304)) // status 304 可能是 cdn cache
                    throw new Error(`HTTP状态码异常: ${response.status}`);
                
                const buffer = await response.arrayBuffer();
                // TODO: 当前逻辑为返回空数据视为结束
                //       可修改为根据视频时长设置最大 segment_index 
                //       max_index = duration // 360 +1
                if (buffer.byteLength === 0) {
                    addLog(`第 ${segment_index} 段数据为空，视为已到达末尾`);
                    continueCrawling = false;
                    break;
                }
                const bytes = Array.from(new Uint8Array(buffer)); // 不这么做会报 illegal buffer 错误...
                if (bytes[0] === 123 && bytes[1] === 34) {
                    const textDecoder = new TextDecoder();
                    throw new Error("B站返回了报错JSON，并非弹幕流: " + textDecoder.decode(bytes));
                }
                // 解析 Protobuf 数据
                const reader = new pb.Reader(bytes);
                const message = DmSegMobileReply.decode(reader);
                const decoded = DmSegMobileReply.toObject(message, { enums: String, bytes: String });
                if (decoded.elems && decoded.elems.length > 0) {
                    for (const elem of decoded.elems) {
                        if (stopRequested) break;
                        await waitIfPaused();

                        count++;
                        crawledCount.textContent = count;

                        // 数据清洗与映射
                        const danmaku = {
                            '序号': count,
                            '弹幕ID': elem.idStr || '',
                            '出现时间(秒)': (elem.progress / 1000).toFixed(2), // progress 单位是毫秒
                            '模式': elem.mode,
                            '字号': elem.fontsize,
                            '颜色': '#' + (elem.color || 0).toString(16).padStart(6, '0'),
                            '发送者Hash': elem.midHash || '',
                            '弹幕内容': elem.content || '',
                            '发送时间': formatTime(elem.ctime * 1000),
                            '权重': elem.weight || 0
                        };

                        // 复用 comments 数组来存放弹幕，这样可以完全兼容你现有的 downloadJSONL 逻辑
                        comments.push(danmaku);

                        // 复用：每 10000 条分段下载一次，防止内存溢出
                        if (comments.length >= 10000) {
                            addLog(`已爬取 ${count} 条弹幕，执行分段下载`, 'warning');
                            crawlerStatus.textContent = '分段下载中...';
                            downloadJSONL(true); // 调用你现有的下载函数，传 partial=true
                            comments = [];
                            if (stopRequested) break;
                            crawlerStatus.textContent = '爬取中...';
                            addLog('分段下载完成，继续爬取');
                        }
                    }
                    addLog(`已爬取第 ${segment_index} 段 (第${(segment_index-1)*6}至${segment_index*6}分钟)，获取 ${decoded.elems.length} 条弹幕`);
                } else {
                    // 解析成功但 elems 为空，说明也到底了
                    continueCrawling = false;
                }

                if (stopRequested) break;

                // 5. 进行下一段爬取前休眠 1~2 秒，避免被 B 站风控拦截
                segment_index++;
                await pauseAwareSleep(1500); 

            } catch (error) {
                retry--;
                addLog(`第 ${segment_index} 段爬取出错: ${error.message}`, 'error');
                if (retry === 0) {
                    continueCrawling = false;
                    isCrawling = false;
                    crawlerStatus.textContent = '错误';
                    startBtn.disabled = false;
                    pauseBtn.disabled = true;
                    pauseBtn.textContent = '暂停';
                    pauseBtn.classList.remove('btn-continue');
                    pauseBtn.classList.add('btn-pause');
                    return;
                } else {
                    addLog(`等待2秒后重试第 ${segment_index} 段...`, 'warning');
                    await pauseAwareSleep(2000);
                }
            }
        }

        // 爬取全部结束后的收尾工作
        if (stopRequested) {
            isCrawling = false;
            crawlerStatus.textContent = '已停止';
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            downloadBtn.disabled = false;
            pauseBtn.textContent = '暂停';
            pauseBtn.classList.remove('btn-continue');
            pauseBtn.classList.add('btn-pause');
            addLog('弹幕爬取已停止');
            return;
        }

        isCrawling = false;
        isPaused = false;
        crawlerStatus.textContent = '完成';
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        downloadBtn.disabled = false;
        pauseBtn.textContent = '暂停';
        pauseBtn.classList.remove('btn-continue');
        pauseBtn.classList.add('btn-pause');
        addLog(`弹幕爬取完成！总共爬取 ${count} 条！`);
        downloadJSONL(); // 触发最终下载
    }

    // 生成JSONL并下载
    function downloadJSONL(partial=false) {
        if (comments.length === 0) {
            addLog('没有评论数据可下载', 'error');
            return;
        }

        addLog('开始生成JSON文件...');

        try {
            const headers = ['序号', '上级评论ID', '评论ID', '用户ID', '用户名', '用户等级', '性别', '评论内容', '评论时间', '回复数', '点赞数', '个性签名', 'IP属地', '是否是大会员', '头像'];
            const BOM = '\uFEFF';
            let JSONLContent = "";

            const batchSize = 1000;
            for (let i = 0; i < comments.length; i += batchSize) {
                const batch = comments.slice(i, i + batchSize);
                batch.forEach((comment, _) => {
                    JSONLContent += JSON.stringify(comment) + '\n';
                });
            }

            const blob = new Blob([JSONLContent], { type: 'application/jsonl;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            const safeTitle = (title || `B站${currentMode === 'comment' ?'评论' :'弹幕' }`).replace(/[\/\\:*?"<>|]/g, '_').substring(0, 50);
            if (partial)
                a.download = `${oid}_${safeTitle}_${currentMode === 'comment' ?'评论' :'弹幕' }_${count}.jsonl`;
            else
                a.download = `${oid}_${safeTitle}_${currentMode === 'comment' ?'评论' :'弹幕' }_${Date.now()}.jsonl`;

            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                addLog(`JSONL文件已开始下载: ${a.download}`);
            }, 100);
        } catch (error) {
            addLog(`生成JSONL失败: ${error.message}`, 'error');
        }
    }

    // 开始爬取按钮事件
    startBtn.addEventListener('click', async () => {
        if (isCrawling) return;

        isCrawling = true;
        stopRequested = false;
        isPaused = false;
        startBtn.disabled = true;
        pauseBtn.disabled = false;
        downloadBtn.disabled = true; // 爬取过程中禁用下载
        crawlerStatus.textContent = '爬取中...';
        crawledCount.textContent = '0';
        comments = [];
        count = 0;
        lastPauseTime = 0;

        // 确保暂停按钮初始样式为黄色
        pauseBtn.classList.remove('btn-continue');
        pauseBtn.classList.add('btn-pause');
        pauseBtn.textContent = '暂停';

        // 清空日志
        crawlerLog.innerHTML = '';
        addLog('当前版本2.2');
        addLog('作者博客地址：ldyer.top')
        addLog('开始爬取评论...')

        try {
            const pageId = getPageInfo();
            if (!pageId) throw new Error('无法获取页面ID');
            const info = await getInformation(pageId);
            oid = info.oid;
            title = info.title;
            cid = info.cid;
            addLog(`页面标题: ${title}`);
            addLog(`页面oid: ${oid}`);
            if (cid) addLog(`页面cid: ${cid}`); // 打印 cid 以供调试
            nextPageID = '';
            if (currentMode === 'comment'){
                await startCrawl(true);
            }
            else if (currentMode === 'danmaku'){
                await startCrawlDanmaku(); // 跑新建的弹幕爬取逻辑
            }
            else {
                throw new Error('模式无效');
            }
        } catch (error) {
            isCrawling = false;
            crawlerStatus.textContent = '错误';
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            pauseBtn.textContent = '暂停';
            // 重置按钮样式
            pauseBtn.classList.remove('btn-continue');
            pauseBtn.classList.add('btn-pause');
            addLog(`初始化失败: ${error.message}`, 'error');
        }
    });

    // 暂停/继续按钮事件
    pauseBtn.addEventListener('click', () => {
        if (!isCrawling) return;
        if (!isPaused) {
            isPaused = true;
            pauseBtn.textContent = '继续';
            // 切换为绿色按钮样式
            pauseBtn.classList.remove('btn-pause');
            pauseBtn.classList.add('btn-continue');
            crawlerStatus.textContent = '已暂停';
            // 关键修改：暂停时启用下载按钮
            downloadBtn.disabled = false;
            addLog('爬取已暂停');
        } else {
            isPaused = false;
            pauseBtn.textContent = '暂停';
            // 切换回黄色按钮样式
            pauseBtn.classList.remove('btn-continue');
            pauseBtn.classList.add('btn-pause');
            crawlerStatus.textContent = '爬取中...';
            // 继续爬取时禁用下载按钮
            downloadBtn.disabled = true;
            addLog('继续爬取...');
        }
    });

    // 下载按钮事件
    downloadBtn.addEventListener('click', () => {
        downloadJSONL();
    });
}