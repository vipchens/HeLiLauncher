/**
 * 系统外壳 IPC 模块
 *
 * 提供系统级操作：
 * - 打开外部链接（调用系统默认浏览器）
 *
 * 注意：sandbox 模式下 preload 无法直接使用 shell 模块，
 * 需通过 IPC 转发到主进程执行
 */

const { ipcMain, shell } = require('electron');

// 使用系统默认浏览器打开外部链接
ipcMain.handle('shell:open-external', async (_event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    console.error('[IPC] openExternal 失败:', err);
    return { success: false, error: err.message };
  }
});
