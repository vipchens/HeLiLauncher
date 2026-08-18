/**
 * IPC 模块统一注册入口
 */

// 补丁更新：hash对比/应用/回滚
require('./patch.cjs');

// 文件下载：断点续传/并发/进度
require('./download.cjs');

// 游戏启动：启动/进程检测
require('./game.cjs');

// 配置管理：JSON读写
require('./config.cjs');

// 系统对话框：目录选择
require('./dialog.cjs');

// 系统外壳：打开外部链接
require('./shell.cjs');

// asar 增量热更新（B 方案核心，会被下方 updater.cjs 集成分支优先调用）
require('./asar-updater.cjs');

// 登录器自动更新：asar 增量优先 + NSIS 全量兜底
require('./updater.cjs');

console.log('[IPC] 所有模块已注册（asar-updater 已加载）');
