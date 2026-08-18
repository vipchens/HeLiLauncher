/**
 * IPC 工具函数模块
 *
 * 提供文件系统操作的通用工具：
 * - SHA-256 流式计算（适合大文件，不占内存）
 * - 递归遍历目录
 * - 文件/目录操作辅助函数
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 计算文件的 SHA-256 哈希值（流式读取，适合大文件）
 * @param {string} filePath - 文件完整路径
 * @returns {Promise<string>} 64位十六进制哈希字符串
 */
function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    // 1MB 分块读取，避免大文件撑爆内存
    const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * 递归遍历目录，返回所有文件的相对路径
 * @param {string} dir - 要遍历的根目录
 * @param {string} base - 相对路径基准（内部递归用）
 * @returns {Promise<Array<{path: string, absolutePath: string, size: number}>>}
 */
async function walkDirectory(dir, base = '') {
  const results = [];
  let entries;

  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (e) {
    // 目录不存在或无权限，返回空数组
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = base ? path.join(base, entry.name) : entry.name;
    // 统一使用正斜杠（与远程清单路径格式一致）
    const normalizedPath = relativePath.replace(/\\/g, '/');

    if (entry.isDirectory()) {
      // 递归遍历子目录
      const subResults = await walkDirectory(fullPath, normalizedPath);
      results.push(...subResults);
    } else if (entry.isFile()) {
      const stat = await fs.promises.stat(fullPath);
      results.push({
        path: normalizedPath,
        absolutePath: fullPath,
        size: stat.size,
      });
    }
  }

  return results;
}

/**
 * 确保目录存在（递归创建）
 * @param {string} dirPath - 目录路径
 */
async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

/**
 * 复制文件
 * @param {string} src - 源文件路径
 * @param {string} dest - 目标文件路径
 */
async function copyFile(src, dest) {
  await ensureDir(path.dirname(dest));
  await fs.promises.copyFile(src, dest);
}

/**
 * 安全删除文件（文件不存在时不报错）
 * @param {string} filePath - 文件路径
 */
async function safeDeleteFile(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch (e) {
    // 文件不存在则忽略
    if (e.code !== 'ENOENT') throw e;
  }
}

/**
 * 格式化文件大小为人类可读文本
 * @param {number} bytes - 字节数
 * @returns {string} 如 "1.5 MB"
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

module.exports = {
  sha256File,
  walkDirectory,
  ensureDir,
  copyFile,
  safeDeleteFile,
  formatSize,
};
