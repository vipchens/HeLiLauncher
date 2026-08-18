/**
 * 系统对话框 IPC 模块
 *
 * 提供原生文件/目录选择对话框
 */

const { ipcMain, dialog } = require('electron');

// 选择目录对话框
ipcMain.handle('dialog:select-directory', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择游戏客户端目录',
    properties: ['openDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, path: null };
  }

  return { canceled: false, path: result.filePaths[0] };
});

// 选择文件对话框（用于选择 Wow.exe）
ipcMain.handle('dialog:select-file', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择 Wow.exe',
    filters: [
      { name: '可执行文件', extensions: ['exe'] },
      { name: '所有文件', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, path: null };
  }

  return { canceled: false, path: result.filePaths[0] };
});
