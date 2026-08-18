/**
 * 配置管理 IPC 模块
 *
 * 管理登录器的本地配置文件，存储在用户数据目录下：
 * Windows: C:\Users\{用户名}\AppData\Roaming\wow-launcher\config.json
 *
 * 配置文件包含：服务器地址、客户端路径、下载设置、偏好等
 */

const { ipcMain, app } = require('electron');
const fs = require('fs');
const path = require('path');
const { ensureDir } = require('./utils.cjs');

// 配置文件路径
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

// 默认配置
// 开发模式下可通过 ELECTRON_DEV_SERVER_IP 环境变量覆盖默认 IP
const DEFAULT_SERVER_IP = process.env.ELECTRON_DEV_SERVER_IP || '117.72.202.12';

const DEFAULT_CONFIG = {
  serverIp: DEFAULT_SERVER_IP,
  clientPath: '',
  localVersion: '0.0.0',
  settings: {
    autoCheck: true,
    autoStartGame: false,
    minimizeToTray: true,
    downloadConcurrency: 4,
    maxRetry: 5,
    backupEnabled: true,
  },
  lastCheckTime: null,
};

/**
 * 读取配置文件
 * 如果文件不存在则返回默认配置
 */
async function readConfig() {
  const configPath = getConfigPath();
  try {
    const content = await fs.promises.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    // 兼容旧版配置：将 serverUrl 迁移到 serverIp
    if (parsed.serverUrl && !parsed.serverIp) {
      const match = String(parsed.serverUrl).match(/(\d+\.\d+\.\d+\.\d+)/);
      if (match) {
        parsed.serverIp = match[1];
      }
      delete parsed.serverUrl;
    }
    // 合并默认值，防止新增字段缺失
    const merged = {
      ...DEFAULT_CONFIG,
      ...parsed,
      settings: { ...DEFAULT_CONFIG.settings, ...parsed.settings },
    };
    // 开发模式下，环境变量覆盖 serverIp（本地调试 vs 生产调试）
    if (process.env.ELECTRON_DEV_SERVER_IP) {
      merged.serverIp = process.env.ELECTRON_DEV_SERVER_IP;
    }
    return merged;
  } catch (e) {
    // 文件不存在或解析失败，返回默认配置
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * 写入配置文件
 */
async function writeConfig(config) {
  const configPath = getConfigPath();
  await ensureDir(path.dirname(configPath));
  await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  return { success: true };
}

// ================ IPC 注册 ================

ipcMain.handle('config:read', async () => {
  return await readConfig();
});

ipcMain.handle('config:write', async (event, { config }) => {
  return await writeConfig(config);
});

ipcMain.handle('app:version', () => {
  return app.getVersion();
});

ipcMain.handle('app:data-path', () => {
  return app.getPath('userData');
});

module.exports = { readConfig, writeConfig, getConfigPath };
