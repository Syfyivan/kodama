// Built-in appearance choices. Every family keeps a static growth pose in
// memory and loads a short, single-play APNG only when its idle gesture runs.
export const PET_SKINS = [
  {
    id: 'forest',
    label: '澄空蓝',
    description: '清透的天青与晨露光泽',
    swatch: ['#79baf4', '#e6f7ff'],
  },
  {
    id: 'moon',
    label: '月雾蓝',
    description: '安静的蓝紫月光',
    swatch: ['#8faeff', '#e5dcff'],
  },
  {
    id: 'peach',
    label: '桃花糖',
    description: '温暖的粉橘色光晕',
    swatch: ['#ff9d9f', '#ffe3bd'],
  },
]

export const GROWTH_STAGES = [
  {
    id: 'egg',
    minLevel: 1,
    label: '芽生之蛋',
    shortLabel: '蛋灵',
    symbol: '◌',
    description: '正在听你和 Agent 的声音',
    file: 'egg.png',
  },
  {
    id: 'spirit',
    minLevel: 5,
    label: '林间幼灵',
    shortLabel: '幼灵',
    symbol: '✶',
    description: '开始学会回应和陪伴',
    file: 'young.png',
  },
  {
    id: 'winged',
    minLevel: 15,
    label: '星翼精灵',
    shortLabel: '翼灵',
    symbol: '✦',
    description: '长出翅膀，能量会随任务流动',
    file: 'winged.png',
  },
]

function familyStages(labels = [], files = []) {
  return GROWTH_STAGES.map(({ file, minLevel, label }, index) => {
    const resolvedFile = files[index] || file
    return {
      file: resolvedFile,
      idleFile: resolvedFile.replace(/\.png$/i, '-idle-animated.png'),
      minLevel,
      label: labels[index] || label,
    }
  })
}

function lightweightPoseMap() {
  return {
    thinking: 'working.png',
    looking: 'winged.png',
    working: 'working.png',
    replying: 'working.png',
    waiting: 'winged.png',
    eating: 'working.png',
    done: 'winged.png',
    failed: 'doze.png',
    tap: 'winged.png',
    hop: 'winged.png',
    wave: 'winged.png',
    doze: 'doze.png',
  }
}

function expressivePoseMap() {
  return {
    thinking: 'working.png',
    looking: 'waiting.png',
    working: 'working.png',
    replying: 'working.png',
    waiting: 'waiting.png',
    eating: 'done.png',
    done: 'done.png',
    failed: 'failed.png',
    tap: 'done.png',
    hop: 'done.png',
    wave: 'done.png',
    doze: 'doze.png',
  }
}

export const PET_FAMILIES = [
  {
    id: 'aetherling',
    set: 'aetherling',
    label: '键缝小鼠',
    shortLabel: '小鼠',
    symbol: '⌁',
    description: '住在键盘缝里、专门把代码 bug 拖回窝的小老鼠',
    palette: ['#d7a05e', '#f6dfb2'],
    preview: 'young.png',
    frameAnimation: true,
    stages: familyStages(
      ['键帽小窝', '键缝小鼠', '捉虫能手'],
      ['egg.png', 'young.png', 'winged.png'],
    ),
    map: {
      thinking: 'thinking-animated.png',
      looking: 'hero.png',
      working: 'working-animated.png',
      replying: 'working-animated.png',
      waiting: 'waiting-animated.png',
      eating: 'eating-animated.png',
      done: 'done-animated.png',
      failed: 'failed-animated.png',
      tap: 'failed-animated.png',
      hop: 'done-animated.png',
      wave: 'done-animated.png',
      doze: 'doze-animated.png',
    },
  },
  {
    id: 'cottonpod-hermit',
    set: 'cottonpod-hermit',
    label: '棉桃寄居蟹',
    shortLabel: '棉桃蟹',
    symbol: '❀',
    description: '把柔软棉桃当成小屋、情绪写在小脸上的寄居蟹',
    palette: ['#fff3d9', '#ffc8b2'],
    preview: 'young.png',
    stages: familyStages(['棉壳小窝', '棉桃幼蟹', '棉团巡游蟹']),
    map: expressivePoseMap(),
  },
  {
    id: 'ferncurl-pangolin',
    set: 'ferncurl-pangolin',
    label: '蕨卷甲',
    shortLabel: '卷卷甲',
    symbol: '❧',
    description: '背着一身卷曲蕨叶的小小穿山甲',
    palette: ['#21ae74', '#f2d83f'],
    preview: 'young.png',
    stages: familyStages(['蕨苞小卷', '蕨甲幼崽', '蕨冠卷甲']),
    map: expressivePoseMap(),
  },
  {
    id: 'rainpouch-newt',
    set: 'rainpouch-newt',
    label: '雨囊鲵',
    shortLabel: '雨囊鲵',
    symbol: '◌',
    description: '背着小雨囊、会认真照顾每一滴水的幼鲵',
    palette: ['#85b9ff', '#ffc0cf'],
    preview: 'young.png',
    stages: familyStages(['叶被小眠', '雨囊幼鲵', '晴雨守囊鲵']),
    map: expressivePoseMap(),
  },
  {
    id: 'little-undo',
    set: 'little-undo',
    label: '小撤',
    shortLabel: '小撤',
    symbol: '↶',
    description: '把失误轻轻卷回来、重新摆好的纸带小精灵',
    palette: ['#b9d8f6', '#f7e2a2'],
    preview: 'young.png',
    stages: familyStages(['键帽小撤', '回卷幼撤', '双环小撤']),
    map: lightweightPoseMap(),
  },
  {
    id: 'pocket-glider',
    set: 'pocket-glider',
    label: '兜兜鼯鼠',
    shortLabel: '兜兜',
    symbol: '⌒',
    description: '一直保持幼小体型、在核桃兜里收集果实的小鼯鼠',
    palette: ['#b7bd78', '#ead09a'],
    preview: 'young.png',
    stages: familyStages(['核桃小兜', '抱叶幼鼯', '藏果兜鼯']),
    map: lightweightPoseMap(),
  },
  {
    id: 'nuonuo-seal',
    set: 'nuonuo-seal',
    label: '糯糯海豹',
    shortLabel: '糯糯',
    symbol: '◡',
    description: '像一颗暖呼呼糯米团的圆润小海豹',
    palette: ['#fff7ed', '#f7c8aa'],
    preview: 'young.png',
    stages: familyStages(['糯团小眠', '糯糯幼豹', '海苔糯豹']),
    map: lightweightPoseMap(),
  },
  {
    id: 'upside-sprout',
    set: 'upside-sprout',
    label: '倒长芽',
    shortLabel: '倒长芽',
    symbol: '¿',
    description: '根会向上长、偶尔倒过来认真想问题的浅粉小芽',
    palette: ['#efd9dd', '#dce7c4'],
    preview: 'young.png',
    stages: familyStages(['眠籽小芽', '倒长幼芽', '问号长芽']),
    map: lightweightPoseMap(),
  },
]

export const DEFAULT_PET_FAMILY_ID = PET_FAMILIES[0].id

export function petFamilyById(id) {
  return PET_FAMILIES.find((family) => family.id === id) || PET_FAMILIES[0]
}

export const DEFAULT_SKIN_ID = PET_SKINS[0].id
export const DEFAULT_STAGE_SELECTION = 'auto'

export const DEFAULT_PET_RENDER = {
  backend: 'gif',
  gif: {
    set: petFamilyById(DEFAULT_PET_FAMILY_ID).set,
    displayWidth: 400,
    displayHeight: 400,
    stages: petFamilyById(DEFAULT_PET_FAMILY_ID).stages,
    map: petFamilyById(DEFAULT_PET_FAMILY_ID).map || {},
    frameAnimation: petFamilyById(DEFAULT_PET_FAMILY_ID).frameAnimation === true,
  },
}
