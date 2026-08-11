// Built-in appearance choices. The default mouse uses APNG frame animation;
// other families and custom uploads keep the existing static/CSS behavior.
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
  return GROWTH_STAGES.map(({ file, minLevel, label }, index) => ({
    file: files[index] || file,
    minLevel,
    label: labels[index] || label,
  }))
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
    id: 'cloudfox',
    set: 'cloudfox',
    label: '云朵狐',
    shortLabel: '云狐',
    symbol: '☁',
    description: '尾巴像软绵绵云朵的天空小狐',
    palette: ['#9fd8ff', '#fff4fb'],
    preview: 'young.png',
    stages: familyStages(['云纹狐蛋', '软云幼狐', '天穹翼狐']),
  },
  {
    id: 'moonbunny',
    set: 'moonbunny',
    label: '月光兔',
    shortLabel: '月兔',
    symbol: '☾',
    description: '安静陪伴深夜工作的月亮兔子',
    palette: ['#a9a8ff', '#f3e9ff'],
    preview: 'young.png',
    stages: familyStages(['月眠之卵', '月光幼兔', '星纱翼兔']),
  },
  {
    id: 'mossdragon',
    set: 'mossdragon',
    label: '苔苔龙',
    shortLabel: '苔龙',
    symbol: '❧',
    description: '头顶会发芽的森林迷你龙',
    palette: ['#86d6a0', '#e7f5bd'],
    preview: 'young.png',
    stages: familyStages(['苔纹龙蛋', '芽芽幼龙', '森翼苔龙']),
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
