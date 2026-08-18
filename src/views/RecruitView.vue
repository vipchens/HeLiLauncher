<script setup lang="ts">
const docUrl = 'https://docs.qq.com/sheet/DY1NmbWd5dWprZXdW?tab=BB08J2'

function openInBrowser() {
  const electronAPI = (window as any).electronAPI
  if (electronAPI?.shellOpenExternal) {
    electronAPI.shellOpenExternal(docUrl)
  } else {
    window.open(docUrl, '_blank')
  }
}
</script>

<template>
  <div class="recruit-view">
    <!-- 顶部介绍 -->
    <div class="intro-card">
      <div class="intro-icon">
        <el-icon :size="32"><UserFilled /></el-icon>
      </div>
      <h2 class="intro-title">招募登记</h2>
      <p class="intro-text">填写招募登记表，加入河狸乐园，与众多勇士共赴艾泽拉斯的冒险</p>
    </div>

    <!-- 招募卡片 -->
    <div class="info-card">
      <div class="info-card-title">
        <el-icon><Document /></el-icon>
        <span>招募登记表</span>
      </div>

      <div class="recruit-content">
        <div class="doc-icon-box">
          <el-icon :size="56"><Document /></el-icon>
        </div>
        <p class="doc-desc">点击下方按钮，在系统浏览器中打开招募登记表进行填写</p>
        <p class="doc-url">{{ docUrl }}</p>
        <button class="action-btn gold" @click="openInBrowser">
          <el-icon><Link /></el-icon>
          <span>打开招募登记表</span>
        </button>
      </div>
    </div>

    <!-- 招募须知 -->
    <div class="info-card">
      <div class="info-card-title">
        <el-icon><InfoFilled /></el-icon>
        <span>登记说明</span>
      </div>
      <div class="notice-list">
        <div class="notice-item">
          <span class="notice-icon">📝</span>
          <span class="notice-text">登记表包含角色信息、游戏经历、在线时段等字段，请如实填写</span>
        </div>
        <div class="notice-item">
          <span class="notice-icon">🌐</span>
          <span class="notice-text">登记表通过腾讯文档打开，需登录腾讯账号方可编辑提交</span>
        </div>
        <div class="notice-item">
          <span class="notice-icon">⏰</span>
          <span class="notice-text">提交后管理员将在 24 小时内审核并联系您</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.recruit-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 顶部介绍 */
.intro-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 24px;
  background: linear-gradient(135deg, var(--color-bg-medium) 0%, var(--color-bg-dark) 100%);
  border: 1px solid var(--color-border);
  border-radius: var(--content-radius);
  text-align: center;
}

.intro-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #d4af37 0%, #8b7355 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #2a1f10;
  box-shadow: 0 0 30px rgba(255, 215, 0, 0.3);
  margin-bottom: 8px;
}

.intro-title {
  font-size: 22px;
  font-weight: 800;
  color: var(--color-primary);
  text-shadow: 0 0 12px rgba(255, 215, 0, 0.3);
}

.intro-text {
  font-size: 13px;
  color: var(--color-text-secondary);
  max-width: 500px;
}

/* 通用卡片 */
.info-card {
  background: var(--color-bg-medium);
  border: 1px solid var(--color-border);
  border-radius: var(--content-radius);
  padding: 24px;
}

.info-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);

  .el-icon {
    color: var(--color-primary);
    font-size: 18px;
  }
}

/* 招募内容 */
.recruit-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px 16px;
}

.doc-icon-box {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: rgba(255, 215, 0, 0.08);
  border: 1px solid rgba(255, 215, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
}

.doc-desc {
  font-size: 14px;
  color: var(--color-text-secondary);
  text-align: center;
  margin: 0;
}

.doc-url {
  font-size: 12px;
  color: var(--color-text-tertiary);
  word-break: break-all;
  text-align: center;
  margin: 0;
  max-width: 400px;
}

/* 通用按钮 */
.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px 36px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s ease;

  .el-icon { font-size: 17px; }

  &.gold {
    background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
    color: #2a1f10;
    box-shadow: 0 4px 15px rgba(212, 175, 55, 0.3);

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(212, 175, 55, 0.5);
    }
  }
}

/* 须知列表 */
.notice-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notice-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  background: var(--color-bg-light);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.notice-icon {
  flex-shrink: 0;
  width: 20px;
  text-align: center;
}

.notice-text {
  flex: 1;
}
</style>
