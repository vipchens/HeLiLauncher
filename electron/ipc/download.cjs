/**
 * 文件下载 IPC 模块
 *
 * 核心功能：
 * 1. 单文件下载：支持 HTTP Range 断点续传 + CDN fallback + 失败重试
 * 2. 批量下载：并发控制 + 总进度事件推送（含速度计算）
 * 3. 下载取消：用户可随时取消下载
 * 4. 文件校验：下载完成后验证 SHA-256
 *
 * 使用 Node.js 原生 https 模块，无需额外依赖
 */

const { ipcMain, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { sha256File, ensureDir } = require('./utils.cjs');

// 下载取消标志
let downloadCancelled = false;

// CDN fallback 域名列表
const CDN_FALLBACKS = [
  'cdn.jsdmirror.com',
  'cdn.jsdelivr.net',
  'fastly.jsdelivr.net',
];

/**
 * 在 URL 中替换 CDN 域名
 * @param {string} url - 原始 URL
 * @param {string} newHost - 新域名
 * @returns {string} 替换后的 URL
 */
function replaceCdnHost(url, newHost) {
  for (const oldHost of CDN_FALLBACKS) {
    if (url.includes(oldHost)) {
      return url.replace(oldHost, newHost);
    }
  }
  return url;
}

/**
 * 获取 URL 的可用 CDN fallback 列表
 * @param {string} url - 原始 URL
 * @returns {string[]} 可用的 URL 列表（含原始 URL）
 */
function getCdnFallbackUrls(url) {
  const urls = [url];
  for (const host of CDN_FALLBACKS) {
    const altUrl = replaceCdnHost(url, host);
    if (!urls.includes(altUrl)) {
      urls.push(altUrl);
    }
  }
  return urls;
}

/**
 * 速度计算器（滑动窗口）
 */
class SpeedCalculator {
  constructor(windowMs = 1000) {
    this.windowMs = windowMs;
    this.samples = []; // { time, bytes }
  }

  /** 记录新数据 */
  record(bytes) {
    const now = Date.now();
    this.samples.push({ time: now, bytes });
    // 清理超出窗口的旧数据
    const cutoff = now - this.windowMs;
    this.samples = this.samples.filter((s) => s.time >= cutoff);
  }

  /** 获取当前速度（bytes/sec） */
  getSpeed() {
    if (this.samples.length === 0) return 0;
    const totalBytes = this.samples.reduce((sum, s) => sum + s.bytes, 0);
    const timeSpan = this.windowMs / 1000;
    return Math.round(totalBytes / timeSpan);
  }

  /** 重置 */
  reset() {
    this.samples = [];
  }
}

/**
 * 下载单个文件（支持断点续传 + CDN fallback + 自定义备用URL + 重试）
 *
 * @param {Object} config - 下载配置
 * @param {string} config.url - 主下载 URL（CDN）
 * @param {string} [config.fallbackUrl] - 额外的备用 URL（如 AccountServer 静态文件兜底）
 * @param {string} config.destPath - 保存路径（含文件名，.part 临时文件）
 * @param {Function} config.onProgress - 进度回调
 * @param {number} [config.maxRetry=3] - 最大重试次数
 * @returns {Promise<Object>} { success, downloaded, total }
 */
async function downloadFile({ url, fallbackUrl, destPath, onProgress, maxRetry = 3 }) {
  // 构建 URL 尝试顺序：CDN host 替换列表 + 自定义 fallbackUrl（最后）
  const urls = [...getCdnFallbackUrls(url)];
  if (fallbackUrl && !urls.includes(fallbackUrl)) {
    urls.push(fallbackUrl);
  }

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    // 尝试每个 URL
    for (const currentUrl of urls) {
      if (downloadCancelled) throw new Error('下载已取消');

      try {
        const result = await downloadFileOnce(currentUrl, destPath, onProgress);
        return result;
      } catch (err) {
        if (downloadCancelled) throw err;
        lastError = err;
        console.warn(`[Download] 尝试失败 (attempt ${attempt + 1}): ${currentUrl} - ${err.message}`);
      }
    }

    // 所有 URL 都失败，等待后重试
    if (attempt < maxRetry) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw lastError || new Error('下载失败');
}

/**
 * 执行单次下载（不做 fallback）
 */
function downloadFileOnce(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;

    // 检查断点续传
    let startBytes = 0;
    try {
      const stat = fs.statSync(destPath);
      startBytes = stat.size;
    } catch {
      // 文件不存在，从头开始
    }

    const options = {};
    if (startBytes > 0) {
      options.headers = { Range: `bytes=${startBytes}-` };
    }

    const speedCalc = new SpeedCalculator(1000);

    const request = client.get(url, options, (response) => {
      // 处理重定向
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFileOnce(response.headers.location, destPath, onProgress)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200 && response.statusCode !== 206) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const contentLength = parseInt(response.headers['content-length'] || '0', 10);
      const totalBytes = startBytes + contentLength;

      const writeStream = fs.createWriteStream(destPath, {
        flags: startBytes > 0 ? 'a' : 'w',
      });

      let downloadedBytes = startBytes;

      response.on('data', (chunk) => {
        if (downloadCancelled) {
          request.destroy();
          writeStream.destroy();
          reject(new Error('下载已取消'));
          return;
        }

        downloadedBytes += chunk.length;
        speedCalc.record(chunk.length);

        if (onProgress) {
          onProgress(downloadedBytes, totalBytes, speedCalc.getSpeed());
        }
      });

      response.pipe(writeStream);

      writeStream.on('finish', () => {
        writeStream.close();
        resolve({ success: true, downloaded: downloadedBytes, total: totalBytes });
      });

      writeStream.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });

    request.on('error', (err) => {
      reject(err);
    });

    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('下载超时'));
    });
  });
}

/**
 * 批量下载文件
 *
 * @param {Array} files - 文件列表 [{ id, path, hash, size, url }]
 * @param {string} tempDir - 临时下载目录
 * @param {number} concurrency - 并发下载数
 * @param {BrowserWindow} win - 主窗口引用（用于发送进度事件）
 * @returns {Promise<Object>} { success, downloadedFiles }
 */
async function downloadBatch(files, tempDir, concurrency, win) {
  downloadCancelled = false;
  await ensureDir(tempDir);

  const downloadedFiles = [];
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  let totalDownloaded = 0;
  let completedCount = 0;

  const queue = [...files];
  const workers = [];

  async function downloadWorker() {
    while (queue.length > 0 && !downloadCancelled) {
      const file = queue.shift();
      if (!file) break;

      const tempPath = path.join(tempDir, file.id + '.part');
      const fileName = file.path.split('/').pop();

      try {
        const result = await downloadFile({
          url: file.url,
          fallbackUrl: file.fallbackUrl,
          destPath: tempPath,
          onProgress: (downloaded, total, speed) => {
            if (win && !win.isDestroyed()) {
              win.webContents.send('download:progress', {
                type: 'file',
                fileId: file.id,
                fileName: fileName,
                fileProgress: total > 0 ? Math.round((downloaded / total) * 100) : 0,
                fileDownloaded: downloaded,
                fileTotal: total,
                fileSpeed: speed,
                totalProgress: totalSize > 0 ? Math.round((totalDownloaded + downloaded) / totalSize * 100) : 0,
                totalDownloaded: totalDownloaded + downloaded,
                totalSize: totalSize,
                completedCount: completedCount,
                totalCount: files.length,
              });
            }
          },
        });

        // 下载完成后校验 hash
        const fileHash = await sha256File(tempPath);
        if (fileHash !== file.hash) {
          await fs.promises.unlink(tempPath).catch(() => {});
          throw new Error(`文件校验失败: ${fileName}`);
        }

        // 校验通过，重命名 .part 为最终文件名
        const finalTempPath = path.join(tempDir, file.id);
        await fs.promises.rename(tempPath, finalTempPath);

        downloadedFiles.push({
          tempPath: finalTempPath,
          targetPath: file.path,
          hash: file.hash,
        });

        totalDownloaded += file.size;
        completedCount++;

        if (win && !win.isDestroyed()) {
          win.webContents.send('download:progress', {
            type: 'completed',
            fileId: file.id,
            fileName: fileName,
            fileSpeed: 0,
            totalProgress: totalSize > 0 ? Math.round((totalDownloaded / totalSize) * 100) : 100,
            totalDownloaded: totalDownloaded,
            totalSize: totalSize,
            completedCount: completedCount,
            totalCount: files.length,
          });
        }
      } catch (error) {
        if (downloadCancelled) break;
        console.error(`[Download] Failed: ${file.path}`, error.message);
        throw error;
      }
    }
  }

  const workerCount = Math.min(concurrency, files.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(downloadWorker());
  }

  await Promise.all(workers);

  if (downloadCancelled) {
    return { success: false, error: '下载已取消', downloadedFiles };
  }

  return { success: true, downloadedFiles };
}

// ================ IPC 注册 ================

ipcMain.handle('download:batch', async (event, { files, tempDir, concurrency }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return await downloadBatch(files, tempDir, concurrency, win);
});

ipcMain.handle('download:cancel', async () => {
  downloadCancelled = true;
  return { success: true };
});

module.exports = { downloadFile, downloadBatch };
