export function welcomeCopyForGrowth(state = {}) {
  const level = Math.max(1, Math.floor(Number(state.level) || 1))
  const totalFed = Math.max(0, Math.floor(Number(state.totalFed) || 0))
  if (level === 1 && totalFed === 0) {
    return '🥚 我还是一颗蛋！继续使用 Agent，token 会喂我慢慢孵化'
  }
  return `欢迎回来！我已经 Lv.${level}，今天也一起成长吧 ✨`
}
