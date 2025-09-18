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
        .btn-stop {
            background: #ff4d4f;
            color: white;
        }
        .btn-stop:hover {
            background: #d9363e;
        }
        .btn-download {
            background: #52c41a;
            color: white;
        }
        .btn-download:hover {
            background: #389e0d;
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
            <div class="crawler-stats">
                <span>已爬取: <span id="crawled-count">0</span> 条</span>
                <span>状态: <span id="crawler-status">就绪</span></span>
            </div>
            <div class="crawler-buttons">
                <button class="crawler-btn btn-start" id="start-crawl">开始爬取</button>
                <button class="crawler-btn btn-stop" id="stop-crawl" disabled>停止</button>
                <button class="crawler-btn btn-download" id="download-csv" disabled>下载CSV</button>
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
    const stopBtn = container.querySelector('#stop-crawl');
    const downloadBtn = container.querySelector('#download-csv');
    const crawledCount = container.querySelector('#crawled-count');
    const crawlerStatus = container.querySelector('#crawler-status');
    const crawlerLog = container.querySelector('#crawler-log');

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

    // 状态变量
    let isCrawling = false;
    let stopRequested = false;
    let comments = [];
    let bv = '';
    let oid = '';
    let title = '';
    let nextPageID = '';
    let count = 0;
    let lastPauseTime = 0;
    let pageType = 0; // 1:视频, 2:番剧, 3:动态

    // 添加日志
    function addLog(message, type = 'info') {
        const now = new Date();
        const timeStr = now.toTimeString().substring(0, 8);
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';

        if (type === 'error') {
            logEntry.classList.add('log-error');
        } else if (type === 'warning') {
            logEntry.classList.add('log-warning');
        }

        logEntry.innerHTML = `<span class="log-time">[${timeStr}]</span> ${message}`;
        crawlerLog.appendChild(logEntry);
        // 自动滚动到底部
        crawlerLog.scrollTop = crawlerLog.scrollHeight;
    }

    // 获取当前页面类型和ID
    function getPageInfo() {
        const path = window.location.pathname;
        
        // 判断页面类型
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
                case 1: // 普通视频
                    url = `https://www.bilibili.com/video/${id}`;
                    type = '视频';
                    break;
                case 2: // 番剧
                    url = `https://www.bilibili.com/bangumi/play/${id}`;
                    type = '番剧';
                    break;
                case 3: // 动态
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
                if (response.ok) {
                    return response.text();
                }
                throw new Error(`获取页面失败: ${response.status}`);
            })
            .then(text => {
                // 提取oid
                let oid = "";
                switch (pageType) {
                    case 1: // 普通视频
                        const oidRegex = new RegExp(`"aid":(\\d+),"bvid":"${id}"`);
                        const oidMatch = text.match(oidRegex);
                        oid = oidMatch ? oidMatch[1] : "";
                        break;
                    case 2: // 番剧
                        const aidMatch = text.match(/"aid":(\d+),/);
                        oid = aidMatch ? aidMatch[1] : "";
                        break;
                    case 3: // 动态
                        const ridMatch = text.match(/"rid_str":"(\d+)"/);
                        oid = ridMatch ? ridMatch[1] : "";
                        break;
                }
                
                // 提取标题
                let title = "未识别";
                try {
                    const titleMatch = text.match(/<title>(.+?)<\/title>/);
                    if (titleMatch && titleMatch[1]) {
                        title = titleMatch[1];
                        // 移除B站后缀
                        if (title.includes('_哔哩哔哩_bilibili')) {
                            title = title.split('_哔哩哔哩_bilibili')[0];
                        }
                    }
                } catch (e) {
                    addLog(`标题提取失败: ${e.message}`, 'warning');
                }
                
                addLog(`页面类型: ${type}`);
                resolve({ oid, title });
            })
            .catch(error => {
                reject(new Error(`请求页面失败: ${error.message}`));
            });
        });
    }

    // MD5加密
    function md5(str) {
        return CryptoJS.MD5(str).toString();
    }

    // 获取B站Header
    function getHeader() {
        return {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
            'Referer': window.location.href
        };
    }

    // 发送请求
    function makeRequest(url) {
        return new Promise((resolve, reject) => {
            fetch(url, {
                credentials: 'include',
                headers: getHeader()
            })
            .then(response => {
                if (response.ok) {
                    return response.json();
                }
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

    // 爬取评论
    async function startCrawl(isSecond = true) {
        if (stopRequested) {
            isCrawling = false;
            stopRequested = false;
            crawlerStatus.textContent = '已停止';
            startBtn.disabled = false;
            stopBtn.disabled = true;
            downloadBtn.disabled = false;
            addLog('爬取已停止');
            return;
        }

        // 设置API参数
        let mode = 2; // 2为最新评论，3为热门评论
        let type = 1; // 普通视频和番剧为1，动态为11
        const plat = 1;
        const web_location = 1315875;
        const wts = Math.floor(Date.now() / 1000);

        // 动态页面特殊处理
        if (pageType === 3) {
            mode = 3;
            type = 11;
        }

        let url;
        if (nextPageID) {
            const pagination_str = JSON.stringify({ offset: nextPageID });
            const encoded_pagination = encodeURIComponent(pagination_str);
            const code = `mode=${mode}&oid=${oid}&pagination_str=${encoded_pagination}&plat=${plat}&type=${type}&web_location=${web_location}&wts=${wts}ea1db124af3c7062474693fa704f4ff8`;
            const w_rid = md5(code);
            url = `https://api.bilibili.com/x/v2/reply/wbi/main?oid=${oid}&type=${type}&mode=${mode}&pagination_str=${encodeURIComponent(pagination_str)}&plat=1&web_location=1315875&w_rid=${w_rid}&wts=${wts}`;
        } else {
            const pagination_str = JSON.stringify({ offset: "" });
            const encoded_pagination = encodeURIComponent(pagination_str);
            const code = `mode=${mode}&oid=${oid}&pagination_str=${encoded_pagination}&plat=${plat}&seek_rpid=&type=${type}&web_location=${web_location}&wts=${wts}ea1db124af3c7062474693fa704f4ff8`;
            const w_rid = md5(code);
            url = `https://api.bilibili.com/x/v2/reply/wbi/main?oid=${oid}&type=${type}&mode=${mode}&pagination_str=${encodeURIComponent(pagination_str)}&plat=1&seek_rpid=&web_location=1315875&w_rid=${w_rid}&wts=${wts}`;
        }

        try {
            const commentData = await makeRequest(url);
            
            if (!commentData.data || !commentData.data.replies) {
                throw new Error('未获取到评论数据');
            }

            for (const reply of commentData.data.replies) {
                if (stopRequested) break;
                
                count++;
                crawledCount.textContent = count;
                
                // 解析评论数据
                const comment = {
                    parent: reply.parent,
                    rpid: reply.rpid,
                    uid: reply.mid,
                    name: reply.member.uname,
                    level: reply.member.level_info.current_level,
                    sex: reply.member.sex,
                    avatar: reply.member.avatar,
                    vip: reply.member.vip.vipStatus ? "是" : "否",
                    IP: reply.reply_control?.location?.slice(5) || "未知",
                    context: reply.content.message,
                    reply_time: formatTime(new Date(reply.ctime * 1000).toISOString()), // 使用格式化后的时间
                    rereply: 0,
                    like: reply.like,
                    sign: reply.member.sign || ''
                };

                // 获取回复数
                if (reply.reply_control?.sub_reply_entry_text) {
                    const match = reply.reply_control.sub_reply_entry_text.match(/\d+/);
                    comment.rereply = match ? parseInt(match[0]) : 0;
                }

                comments.push(comment);
                
                // 爬取二级评论
                if (isSecond && comment.rereply > 0) {
                    await crawlSecondComments(oid, comment.rpid, comment.rereply, type);
                }
                
                // 每100条休息5秒
                if (count % 100 === 0 && count !== lastPauseTime) {
                    lastPauseTime = count;
                    addLog(`已爬取 ${count} 条评论，暂停5秒...`, 'warning');
                    crawlerStatus.textContent = '暂停中...';
                    
                    // 暂停5秒
                    await new Promise(resolve => {
                        const pauseInterval = setInterval(() => {
                            if (stopRequested) {
                                clearInterval(pauseInterval);
                                resolve();
                            }
                        }, 1000);
                        
                        setTimeout(() => {
                            clearInterval(pauseInterval);
                            crawlerStatus.textContent = '爬取中...';
                            addLog('暂停结束，继续爬取');
                            resolve();
                        }, 5000);
                    });
                }
            }

            // 获取下一页
            nextPageID = commentData.data?.cursor?.pagination_reply?.next_offset || 0;
            
            if (nextPageID && nextPageID !== 0) {
                addLog(`爬取下一页，当前已爬取 ${count} 条`);
                await new Promise(resolve => setTimeout(resolve, 500));
                await startCrawl(isSecond);
            } else {
                // 爬取完成
                isCrawling = false;
                crawlerStatus.textContent = '完成';
                startBtn.disabled = false;
                stopBtn.disabled = true;
                downloadBtn.disabled = false;
                addLog(`评论爬取完成！总共爬取 ${count} 条！`);
            }
        } catch (error) {
            isCrawling = false;
            crawlerStatus.textContent = '错误';
            startBtn.disabled = false;
            stopBtn.disabled = true;
            addLog(`爬取出错: ${error.message}`, 'error');
        }
    }

    // 爬取二级评论
    async function crawlSecondComments(oid, rootRpid, totalReplies, type) {
        const pageSize = 10;
        const totalPages = Math.ceil(totalReplies / pageSize);
        
        for (let page = 1; page <= totalPages; page++) {
            if (stopRequested) break;
            
            const url = `https://api.bilibili.com/x/v2/reply/reply?oid=${oid}&type=${type}&root=${rootRpid}&ps=${pageSize}&pn=${page}&web_location=333.788`;
            
            try {
                const replyData = await makeRequest(url);
                
                if (!replyData.data || !replyData.data.replies) {
                    continue;
                }
                
                for (const reply of replyData.data.replies) {
                    if (stopRequested) break;
                    
                    count++;
                    crawledCount.textContent = count;
                    
                    const comment = {
                        parent: reply.parent,
                        rpid: reply.rpid,
                        uid: reply.mid,
                        name: reply.member.uname,
                        level: reply.member.level_info.current_level,
                        sex: reply.member.sex,
                        avatar: reply.member.avatar,
                        vip: reply.member.vip.vipStatus ? "是" : "否",
                        IP: reply.reply_control?.location?.slice(5) || "未知",
                        context: reply.content.message,
                        reply_time: formatTime(new Date(reply.ctime * 1000).toISOString()), // 使用格式化后的时间
                        rereply: 0,
                        like: reply.like,
                        sign: reply.member.sign || ''
                    };
                    
                    comments.push(comment);
                    
                    // 每100条休息5秒
                    if (count % 100 === 0 && count !== lastPauseTime) {
                        lastPauseTime = count;
                        addLog(`已爬取 ${count} 条评论，暂停5秒...`, 'warning');
                        crawlerStatus.textContent = '暂停中...';
                        
                        // 暂停5秒
                        await new Promise(resolve => {
                            const pauseInterval = setInterval(() => {
                                if (stopRequested) {
                                    clearInterval(pauseInterval);
                                    resolve();
                                }
                            }, 1000);
                            
                            setTimeout(() => {
                                clearInterval(pauseInterval);
                                crawlerStatus.textContent = '爬取中...';
                                addLog('暂停结束，继续爬取');
                                resolve();
                            }, 5000);
                        });
                    }
                }
                
                // 每页之间稍作休息
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) {
                addLog(`二级评论爬取出错: ${error.message}`, 'error');
            }
        }
    }

    // 生成CSV并下载 - 修复中文乱码问题
    function downloadCSV() {
        if (comments.length === 0) {
            addLog('没有评论数据可下载', 'error');
            return;
        }
        
        // CSV表头
        const headers = ['序号', '上级评论ID', '评论ID', '用户ID', '用户名', '用户等级', '性别', '评论内容', '评论时间', '回复数', '点赞数', '个性签名', 'IP属地', '是否是大会员', '头像'];
        
        // 构建CSV内容 - 添加BOM头解决中文乱码问题
        const BOM = '\uFEFF'; // UTF-8 BOM
        let csvContent = BOM + headers.join(',') + '\n';
        
        comments.forEach((comment, index) => {
            const row = [
                index + 1,
                comment.parent,
                comment.rpid,
                comment.uid,
                `"${(comment.name || '').replace(/"/g, '""')}"`,
                comment.level,
                comment.sex,
                `"${(comment.context || '').replace(/"/g, '""')}"`,
                comment.reply_time, // 使用格式化后的时间
                comment.rereply,
                comment.like,
                `"${(comment.sign || '').replace(/"/g, '""')}"`,
                comment.IP,
                comment.vip,
                comment.avatar
            ];
            csvContent += row.join(',') + '\n';
        });
        
        // 发送下载请求到后台
        chrome.runtime.sendMessage({
            action: 'downloadCSV',
            csvContent: csvContent,
            filename: `${(title || 'B站评论').substring(0, 8)}_评论.csv`
        });
    }

    // 开始爬取按钮事件
    startBtn.addEventListener('click', async () => {
        if (isCrawling) return;
        
        isCrawling = true;
        stopRequested = false;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        downloadBtn.disabled = true;
        crawlerStatus.textContent = '爬取中...';
        crawledCount.textContent = '0';
        comments = [];
        count = 0;
        lastPauseTime = 0;
        
        // 清空日志
        crawlerLog.innerHTML = '';
        addLog('作者博客地址：ldyer.top  开始爬取评论...');
        
        try {
            // 获取当前页面信息
            const pageId = getPageInfo();
            if (!pageId) {
                throw new Error('无法获取页面ID');
            }
            
            const info = await getInformation(pageId);
            oid = info.oid;
            title = info.title;
            
            addLog(`页面标题: ${title}`);
            addLog(`页面oid: ${oid}`);
            
            nextPageID = '';
            await startCrawl(true);
        } catch (error) {
            isCrawling = false;
            crawlerStatus.textContent = '错误';
            startBtn.disabled = false;
            stopBtn.disabled = true;
            addLog(`初始化失败: ${error.message}`, 'error');
        }
    });

    // 停止按钮事件
    stopBtn.addEventListener('click', () => {
        if (isCrawling) {
            stopRequested = true;
            crawlerStatus.textContent = '停止中...';
            addLog('正在停止爬取...');
        }
    });

    // 下载按钮事件
    downloadBtn.addEventListener('click', () => {
        downloadCSV();
    });
}