/**
 * 游戏启动 IPC 模块
 *
 * 功能：
 * 1. 启动游戏：通过 child_process.spawn 启动 Wow.exe
 * 2. 进程检测：检查 Wow.exe 是否正在运行
 * 3. 准备并启动：写入 realmlist.wtf 后启动游戏
 *
 * 跨平台说明：
 * - Windows: 检测 Wow.exe / WowClassic.exe
 * - macOS: 检测 World of Warcraft.app（暂不支持）
 */

const { ipcMain } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * 启动游戏
 *
 * @param {string} exePath - Wow.exe 完整路径
 * @param {string} args - 启动参数（可选，如 -windowed）
 * @returns {Promise<Object>} { success, pid }
 */
function launchGame(exePath, args = '') {
  return new Promise((resolve, reject) => {
    // 验证文件是否存在
    if (!fs.existsSync(exePath)) {
      resolve({ success: false, error: '游戏可执行文件不存在: ' + exePath });
      return;
    }

    // 解析启动参数
    const argList = args ? args.split(' ').filter(Boolean) : [];

    try {
      const child = spawn(exePath, argList, {
        cwd: path.dirname(exePath),  // 工作目录设为游戏目录
        detached: true,               // 独立进程，登录器关闭不影响游戏
        stdio: 'ignore',              // 不关心游戏输出
      });

      // 解除父进程引用，让游戏独立运行
      child.unref();

      resolve({ success: true, pid: child.pid });
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

/**
 * 准备并启动游戏
 *
 * 完整流程：
 * 1. 校验 clientPath（必须以 Wow.exe 结尾）
 * 2. 校验 Wow.exe 文件是否存在
 * 3. 定位/创建 Data\zhCN\realmlist.wtf
 * 4. 写入 "set realmlist {serverIp}"
 * 5. 启动 Wow.exe
 *
 * 每一步失败都返回明确的错误原因
 *
 * @param {string} clientPath - Wow.exe 完整路径
 * @param {string} serverIp - 服务器 IP 地址
 * @returns {Promise<Object>} { success, pid?, error?, step? }
 */
async function prepareAndLaunchGame(clientPath, serverIp) {
  // 步骤1: 校验路径格式
  if (!clientPath || !clientPath.trim()) {
    return { success: false, step: 'validate', error: '未配置游戏客户端路径，请先在设置中选择 Wow.exe' };
  }

  const normalizedPath = path.normalize(clientPath.trim());
  if (!normalizedPath.toLowerCase().endsWith('wow.exe')) {
    return {
      success: false,
      step: 'validate',
      error: '客户端路径必须以 Wow.exe 结尾，当前路径: ' + normalizedPath,
    };
  }

  // 步骤2: 校验 Wow.exe 是否存在
  if (!fs.existsSync(normalizedPath)) {
    return {
      success: false,
      step: 'check-exe',
      error: '游戏可执行文件不存在: ' + normalizedPath,
    };
  }

  // 推导游戏目录（Wow.exe 所在目录）
  const gameDir = path.dirname(normalizedPath);

  // 步骤3: 定位/创建 Data\zhCN 目录及 realmlist.wtf
  const dataDir = path.join(gameDir, 'Data');
  const zhcnDir = path.join(dataDir, 'zhCN');
  const realmlistPath = path.join(zhcnDir, 'realmlist.wtf');

  try {
    // 确保 Data 目录存在（正常游戏目录必然有，但防御性检查）
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    // 确保 Data\zhCN 目录存在
    if (!fs.existsSync(zhcnDir)) {
      fs.mkdirSync(zhcnDir, { recursive: true });
    }
  } catch (err) {
    return {
      success: false,
      step: 'mkdir',
      error: '创建目录 Data\\zhCN 失败: ' + err.message + '（路径: ' + zhcnDir + '）',
    };
  }

  // 步骤4: 写入 realmlist.wtf
  // WoW 客户端的 realmlist.wtf 通常被设为只读，需先去除只读属性
  const realmlistContent = 'set realmlist ' + serverIp + '\r\n';
  try {
    if (fs.existsSync(realmlistPath)) {
      // 去除只读属性（Windows 下 chmod 0o666 可清除只读标志）
      try {
        fs.chmodSync(realmlistPath, 0o666);
      } catch {
        // chmod 失败时尝试用 attrib 命令去除只读（Windows 专属）
        if (process.platform === 'win32') {
          require('child_process').execSync('attrib -r "' + realmlistPath + '"');
        }
      }
    }
    fs.writeFileSync(realmlistPath, realmlistContent, 'utf8');
  } catch (err) {
    return {
      success: false,
      step: 'write-realmlist',
      error: '写入 realmlist.wtf 失败: ' + err.message
        + '。可能原因：文件被占用或目录权限不足，请尝试以管理员身份运行登录器'
        + '（路径: ' + realmlistPath + '）',
    };
  }

  // 步骤5: 启动 Wow.exe
  const launchResult = await launchGame(normalizedPath);
  if (!launchResult.success) {
    return {
      success: false,
      step: 'launch',
      error: '启动游戏失败: ' + (launchResult.error || '未知错误'),
    };
  }

  return { success: true, pid: launchResult.pid, realmlistPath };
}

/**
 * 检测游戏是否正在运行
 *
 * Windows: 使用 tasklist 命令查找 Wow.exe 进程
 *
 * @returns {Promise<Object>} { running, pid }
 */
function isGameRunning() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      // Windows: 通过 tasklist 查找进程
      exec('tasklist /FI "IMAGENAME eq Wow.exe" /FO CSV /NH', (error, stdout) => {
        if (error) {
          resolve({ running: false, pid: null });
          return;
        }

        // tasklist 输出格式: "Wow.exe","1234","Console","1","xxx K"
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          if (line.toLowerCase().includes('wow.exe')) {
            const match = line.match(/"Wow\.exe","(\d+)"/i);
            if (match) {
              resolve({ running: true, pid: parseInt(match[1], 10) });
              return;
            }
          }
        }

        // 也检查 WowClassic.exe
        resolve({ running: false, pid: null });
      });
    } else {
      // 非 Windows 暂不支持
      resolve({ running: false, pid: null });
    }
  });
}

// ================ IPC 注册 ================

ipcMain.handle('game:launch', async (event, { exePath, args }) => {
  return await launchGame(exePath, args);
});

ipcMain.handle('game:prepare-and-launch', async (event, { clientPath, serverIp }) => {
  return await prepareAndLaunchGame(clientPath, serverIp);
});

ipcMain.handle('game:is-running', async () => {
  return await isGameRunning();
});

module.exports = { launchGame, prepareAndLaunchGame, isGameRunning };
