/**
 * 补丁更新 IPC 模块
 *
 * 核心功能：
 * 1. 计算差异：扫描本地客户端文件，对比远程清单的 SHA-256
 * 2. 应用补丁：备份→替换→删除（含只读解除、进度推送、备份清理）
 * 3. 回滚：从备份恢复
 *
 * 安全考虑：
 * - 所有文件操作限制在 clientPath 目录下，防止路径穿越攻击
 */

const { ipcMain, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { sha256File, walkDirectory, ensureDir, copyFile, safeDeleteFile } = require('./utils.cjs');

/**
 * 解除文件只读属性
 * 先尝试 chmod，失败再用 Windows attrib 命令
 */
async function removeReadOnly(filePath) {
  try {
    await fs.promises.chmod(filePath, 0o666);
  } catch {
    try {
      execSync(`attrib -R "${filePath}"`);
    } catch {
      // 忽略失败，后续写入会报具体错误
    }
  }
}

/**
 * 规范化客户端路径
 * 如果 clientPath 指向 Wow.exe 文件，则取其所在目录作为客户端根目录
 */
function normalizeClientPath(clientPath) {
  if (!clientPath) return clientPath;
  const basename = path.basename(clientPath).toLowerCase();
  if (basename.endsWith('.exe')) {
    return path.dirname(clientPath);
  }
  return clientPath;
}

/**
 * 清理过期备份目录，保留最新 N 份
 * @param {string} clientPath - 客户端根目录
 * @param {number} maxBackups - 最大保留份数
 */
async function cleanupBackups(clientPath, maxBackups = 3) {
  const backupBase = path.join(clientPath, '.patch-backup');
  try {
    const entries = await fs.promises.readdir(backupBase, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => ({ name: e.name, path: path.join(backupBase, e.name) }))
      .sort((a, b) => b.name.localeCompare(a.name)); // 按时间戳降序

    // 删除超出 maxBackups 的旧备份
    for (let i = maxBackups; i < dirs.length; i++) {
      await fs.promises.rm(dirs[i].path, { recursive: true, force: true });
    }
  } catch {
    // 备份目录不存在，忽略
  }
}

/**
 * 计算本地文件与远程清单的差异
 *
 * @param {Object} manifest - 远程补丁清单 { files: [{ path, hash, action, size }] }
 * @param {string} clientPath - 客户端根目录
 * @returns {Object} { toDownload, toDelete, unchanged, totalDownloadSize }
 */
async function calculateDiff(manifest, clientPath) {
  clientPath = normalizeClientPath(clientPath);
  const toDownload = [];
  const toDelete = [];
  const unchanged = [];

  for (const file of manifest.files) {
    const localFilePath = path.join(clientPath, file.path);

    // 防止路径穿越：确保文件路径在 clientPath 内
    const resolvedPath = path.resolve(localFilePath);
    const resolvedBase = path.resolve(clientPath);
    if (!resolvedPath.startsWith(resolvedBase)) {
      console.warn(`[Patch] 跳过可疑路径: ${file.path}`);
      continue;
    }

    if (file.action === 'delete') {
      try {
        await fs.promises.access(localFilePath);
        toDelete.push(file);
      } catch {
        // 文件已不存在，跳过
      }
      continue;
    }

    try {
      await fs.promises.access(localFilePath);
      const localHash = await sha256File(localFilePath);
      if (localHash === file.hash) {
        unchanged.push(file);
      } else {
        toDownload.push(file);
      }
    } catch {
      toDownload.push(file);
    }
  }

  const totalDownloadSize = toDownload.reduce((sum, f) => sum + f.size, 0);
  return { toDownload, toDelete, unchanged, totalDownloadSize };
}

/**
 * 应用补丁
 *
 * 流程：
 * 1. 创建备份目录（时间戳命名）
 * 2. 备份将被覆盖/删除的文件（推送进度）
 * 3. 解除只读 → 移动已下载的文件到目标位置（推送进度）
 * 4. 删除标记为 delete 的文件（推送进度）
 * 5. 清理过期备份
 *
 * @param {Array} downloadedFiles - [{ tempPath, targetPath }] 临时文件→目标路径映射
 * @param {Array} toDelete - 需要删除的文件 [{ path, ... }]
 * @param {string} clientPath - 客户端根目录
 * @param {BrowserWindow} win - 主窗口引用（用于发送进度事件）
 * @returns {Object} { success, backupPath }
 */
async function applyPatches(downloadedFiles, toDelete, clientPath, win) {
  clientPath = normalizeClientPath(clientPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(clientPath, '.patch-backup', timestamp);
  await ensureDir(backupPath);

  const totalSteps = downloadedFiles.length + toDelete.length;
  let currentStep = 0;

  /**
   * 推送应用进度
   * @param {'backup'|'apply'|'delete'|'cleanup'} phase
   * @param {string} fileName
   */
  const sendProgress = (phase, fileName) => {
    currentStep++;
    if (win && !win.isDestroyed()) {
      win.webContents.send('patch:apply-progress', {
        phase,
        current: currentStep,
        total: totalSteps,
        fileName,
      });
    }
  };

  try {
    // 步骤1: 备份将被覆盖的文件
    for (const file of downloadedFiles) {
      const targetPath = path.join(clientPath, file.targetPath);
      const backupFilePath = path.join(backupPath, file.targetPath);

      try {
        await fs.promises.access(targetPath);
        await copyFile(targetPath, backupFilePath);
      } catch {
        // 文件不存在（新增文件），无需备份
      }
      sendProgress('backup', file.targetPath);
    }

    // 步骤2: 备份将被删除的文件
    for (const file of toDelete) {
      const targetPath = path.join(clientPath, file.path);
      const backupFilePath = path.join(backupPath, file.path);

      try {
        await fs.promises.access(targetPath);
        await copyFile(targetPath, backupFilePath);
      } catch {
        // 文件不存在，跳过
      }
      sendProgress('backup', file.path);
    }

    // 步骤3: 移动下载的文件到目标位置（覆盖）
    for (const file of downloadedFiles) {
      const targetPath = path.join(clientPath, file.targetPath);
      await ensureDir(path.dirname(targetPath));

      // 解除只读属性（MPQ 文件可能被设为只读）
      await removeReadOnly(targetPath);

      await fs.promises.copyFile(file.tempPath, targetPath);
      await safeDeleteFile(file.tempPath);
      sendProgress('apply', file.targetPath);
    }

    // 步骤4: 删除标记为 delete 的文件
    for (const file of toDelete) {
      const targetPath = path.join(clientPath, file.path);
      await removeReadOnly(targetPath);
      await safeDeleteFile(targetPath);
      sendProgress('delete', file.path);
    }

    // 步骤5: 清理过期备份
    await cleanupBackups(clientPath, 3);

    return { success: true, backupPath };
  } catch (error) {
    console.error('[Patch] Apply failed:', error);
    return { success: false, error: error.message, backupPath };
  }
}

/**
 * 回滚到备份版本
 *
 * @param {string} backupPath - 备份目录路径
 * @param {string} clientPath - 客户端根目录
 * @returns {Object} { success }
 */
async function rollback(backupPath, clientPath) {
  clientPath = normalizeClientPath(clientPath);
  try {
    const files = await walkDirectory(backupPath);

    for (const file of files) {
      const targetPath = path.join(clientPath, file.path);
      await ensureDir(path.dirname(targetPath));

      // 解除只读属性
      await removeReadOnly(targetPath);

      await fs.promises.copyFile(file.absolutePath, targetPath);
    }

    return { success: true };
  } catch (error) {
    console.error('[Patch] Rollback failed:', error);
    return { success: false, error: error.message };
  }
}

// ================ IPC 注册 ================

ipcMain.handle('patch:calculate-diff', async (event, { manifest, clientPath }) => {
  return await calculateDiff(manifest, clientPath);
});

ipcMain.handle('patch:apply', async (event, { downloadedFiles, toDelete, clientPath }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return await applyPatches(downloadedFiles, toDelete, clientPath, win);
});

ipcMain.handle('patch:rollback', async (event, { backupPath, clientPath }) => {
  return await rollback(backupPath, clientPath);
});

module.exports = { calculateDiff, applyPatches, rollback, cleanupBackups };
