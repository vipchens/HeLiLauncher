<script setup lang="ts">
/**
 * 通用弹窗组件
 *
 * 结构：Header（标题 + 关闭按钮）| Content（内容区，可滚动）| Footer（操作区，可选）
 *
 * 用法：
 *   <BaseDialog v-model:visible="show" title="标题" width="800px">
 *     <div>内容</div>
 *     <template #footer>
 *       <button>确定</button>
 *     </template>
 *   </BaseDialog>
 */
import { watch, onBeforeUnmount } from 'vue'

interface Props {
  visible?: boolean
  title?: string
  width?: string
  closeOnOverlay?: boolean
  closeOnEsc?: boolean
  showClose?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  title: '',
  width: '720px',
  closeOnOverlay: true,
  closeOnEsc: true,
  showClose: true,
})

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'close'): void
}>()

function closeDialog() {
  emit('update:visible', false)
  emit('close')
}

function onOverlayClick(e: MouseEvent) {
  if (e.target === e.currentTarget && props.closeOnOverlay) {
    closeDialog()
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.closeOnEsc && props.visible) {
    closeDialog()
  }
}

// ESC 键监听
watch(
  () => props.visible,
  (v) => {
    if (v) {
      document.addEventListener('keydown', onKeydown)
      document.body.style.overflow = 'hidden'
    } else {
      document.removeEventListener('keydown', onKeydown)
      document.body.style.overflow = ''
    }
  }
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="visible" class="base-dialog-overlay" @click="onOverlayClick">
        <div
          class="base-dialog"
          :style="{ width: width, maxWidth: width }"
          role="dialog"
          aria-modal="true"
        >
          <!-- Header: 标题 + 关闭按钮 -->
          <header class="base-dialog-header">
            <div class="base-dialog-title">{{ title }}</div>
            <button
              v-if="showClose"
              class="base-dialog-close"
              @click="closeDialog"
              title="关闭"
            >✕</button>
          </header>

          <!-- Content: 内容区，可滚动 -->
          <div class="base-dialog-content">
            <slot />
          </div>

          <!-- Footer: 操作区（可选） -->
          <footer v-if="$slots.footer" class="base-dialog-footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.base-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(3px);
  padding: 24px;
}

.base-dialog {
  position: relative;
  max-height: calc(100vh - 48px);
  /* 调亮背景：从 #3d2e1f → #4d3a24 / #1f160d → #2c2014，对比度更大，文字更清楚 */
  background: linear-gradient(180deg, #5a422a 0%, #2e2012 100%);
  border: 2px solid #8e7652;
  border-radius: 10px;
  box-shadow:
    0 0 0 1px #c29a64,
    0 20px 60px rgba(0, 0, 0, 0.85),
    inset 0 0 30px rgba(255, 255, 255, 0.04),
    inset 0 0 60px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ========== Header ========== */
.base-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(180deg, rgba(77, 58, 37, 0.6) 0%, rgba(46, 34, 22, 0.6) 100%);
  border-bottom: 1px solid #5a4a30;
  flex-shrink: 0;
}

.base-dialog-title {
  font-size: 18px;
  font-weight: 800;
  color: #ffd700;
  text-shadow: 0 0 8px rgba(255, 215, 0, 0.3), 2px 2px 0 #000;
  letter-spacing: 2px;
}

.base-dialog-close {
  width: 32px;
  height: 32px;
  background: linear-gradient(180deg, #c4503c 0%, #8a2a1a 100%);
  border: 2px solid #c06050;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.25s ease;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);

  &:hover {
    background: linear-gradient(180deg, #e0604c 0%, #a03a2a 100%);
    border-color: #ffd700;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.6), 0 0 8px rgba(255, 215, 0, 0.3);
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
}

/* ========== Content ========== */
.base-dialog-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px;

  /* 自定义滚动条 */
  &::-webkit-scrollbar {
    width: 10px;
  }
  &::-webkit-scrollbar-track {
    background: #1a130a;
    border-radius: 5px;
  }
  &::-webkit-scrollbar-thumb {
    background: #5a4a30;
    border-radius: 5px;
    &:hover {
      background: #7a6448;
    }
  }
}

/* ========== Footer ========== */
.base-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  background: linear-gradient(180deg, rgba(46, 34, 22, 0.8) 0%, rgba(30, 22, 14, 0.8) 100%);
  border-top: 1px solid #5a4a30;
  flex-shrink: 0;
}

/* ========== 过渡动画 ========== */
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.25s ease;

  .base-dialog {
    transition: transform 0.25s ease, opacity 0.25s ease;
  }
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;

  .base-dialog {
    transform: scale(0.96) translateY(-8px);
    opacity: 0;
  }
}

.dialog-fade-enter-to,
.dialog-fade-leave-from {
  opacity: 1;

  .base-dialog {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}

/* ========== 响应式 ========== */
@media (max-width: 768px) {
  .base-dialog-overlay {
    padding: 10px;
  }

  .base-dialog {
    max-height: calc(100vh - 20px);
    width: 100% !important;
  }

  .base-dialog-header {
    padding: 12px 14px;
  }

  .base-dialog-title {
    font-size: 16px;
  }

  .base-dialog-content {
    padding: 14px;
  }
}
</style>
