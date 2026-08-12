# GIF / sprite 桌宠素材目录

只想换一张自己的桌宠图片时，不需要把文件放进源码目录：在桌宠的「衣橱 → 自定义形象」中直接上传即可。这里的目录配置用于需要按状态提供多张素材的高级玩法。

这里存放内置成长伙伴与高级 GIF / APNG 素材包。衣橱默认提供八个可选原创角色：
`aetherling/`、`cottonpod-hermit/`、`ferncurl-pangolin/`、`rainpouch-newt/`、
`little-undo/`、`pocket-glider/`、`nuonuo-seal/`、`upside-sprout/`。
每个角色都包含 `egg.png → young.png → winged.png` 三阶段，以及工作和休息姿势。
切换角色会保留现有成长进度；私人多状态素材包仍可通过 `config/render.local.js`
启用（见 `config/render.local.example.js`）。

`cloudfox/`、`moonbunny/` 与 `mossdragon/` 的旧素材仍保留在仓库和安装包里，
作为历史角色备用，但不占用当前八角色的衣橱顺序。

## 内置:slime（CC0,已随仓库分发）

`slime/` 是一只**随等级进化变色**的史莱姆(绿→蓝→黄→红→紫),
素材为 **"Slime (CC0)" by Rick Hoppmann**(https://opengameart.org/content/slime-0),
CC0 可商用、免署名(详见 `slime/LICENSE.txt`)。启用:

```
cp ../config/render.local.example.js ../config/render.local.js && pnpm start
```

等级阈值与配色在 `render.local.example.js` 的 `stages` 里可调。

## 内置:aetherling（Kodama 原创）

`aetherling/` 是 Kodama 的原创角色「键缝小鼠」：它住在键盘缝里，专门把
代码 bug 拖回窝。成长形态是「键帽小窝 → 键缝小鼠 → 捉虫能手」；工作、查看、
等待、完成、失败、点击和睡觉会切换为同一张角色设定稿里的对应动作，再回到
当前成长形态。V3 的 `*-animated.png` 是透明 APNG，动画发生在眼睛、耳朵、
手脚、尾巴和道具内部，不再依赖整张图片摇晃。完整设计归档见
`docs/design/keyboard-mouse/`。

任务刚开始会使用 `thinking-animated.png` 托腮思考；需要确认时使用
`waiting-animated.png` 从键帽后探头；主动投喂或稀有陪伴时使用
`eating-animated.png` 吃 Bug 饼干。三者与原有待机、工作、完成、失败、睡觉
共享同一角色识别点和 512×512 透明画布。

## 内置:八个逐帧等待角色（Kodama 原创）

八个角色的三个成长阶段都配有一份 512×512 透明 APNG：
`egg-idle-animated.png`、`young-idle-animated.png`、`winged-idle-animated.png`。
每份动画只播放一次，角色平时仍使用静态成长图；触发时才临时加载当前阶段的动画，
结束后回到原本状态，因此不会让 24 份动画同时常驻播放。

动作发生在角色内部，而不是整张图左右摇晃：键缝小鼠会动耳朵、爪子与尾巴；
棉桃寄居蟹会眨眼、举螯，棉桃也会轻轻开合；蕨卷甲会嗅闻并舒展蕨叶；雨囊鲵会
眨眼、低头并晃动水滴；小撤会闭眼并卷动纸带；兜兜鼯鼠会动耳朵、爪子和叶尾；
糯糯海豹会眨眼并拍鳍；倒长芽会眨眼并摆动问号芽与叶脚。

等待动作每次播放约 1.5～2.4 秒；启动后先安静 1～2 分钟，之后每次安静 3～6 分钟。
工作、面板操作、拖动、勿扰和省电模式都会暂停。没有逐帧素材的自定义或旧素材包
才会使用 CSS 轻动作兜底。

棉桃寄居蟹、蕨卷甲与雨囊鲵刻意使用三套不同的美术语言，避免在衣橱里像同一角色
换皮：棉桃寄居蟹是香草奶油、浅薄荷与蜜桃珊瑚组成的蓬松软质 3D；蕨卷甲是
祖母绿、绿松石与蜜糖黄组成的二维水粉绘本和纸雕层次；雨囊鲵是雨蓝、浅青与
珊瑚粉组成的水润果冻 3D。

这三只也使用单独的状态表情，不会常驻笑脸：默认形态安静观察，等待时疑惑，
工作时专注，只有完成、投喂或被互动时才明显开心；失败时只会短暂露出一点委屈，
睡觉时回到安稳表情。低频待机动作仍只在安静 3～6 分钟后偶尔眨眼、闭眼或轻动
身体，不会持续切换状态。

三套旧版低饱和素材保存在 `design/archive/companion-first-edition/`；配色已经区分、
但表情偏常驻开心的第二版保存在 `design/archive/companion-smiling-second-edition/`。
两份归档都不会进入安装包。

## 自定义:你自己的私人 GIF

## 用法

1. 在这里新建一个角色文件夹，例如 `capybara/`
2. 把 GIF 丢进去，按状态命名（最少放一个 `idle.gif`，其它缺失会回退到 idle）：
   - `idle.gif` 待机（必须）
   - `looking.gif` 收到飞书消息
   - `working.gif` 干活中
   - `waiting.gif` 需要你确认
   - `done.gif` 完成
   - `failed.gif` 失败
   - `tap.gif` 被点击
3. `cp ../config/render.local.example.js ../config/render.local.js`（如名字不是 `capybara` 就改里面的 `set`）
4. `pnpm start`

## ⚠️ 版权

未列入内置素材名单的自定义目录与 `config/render.local.js` 已 **gitignore**，
不会被提交或打包分发。
网上找的 GIF 多数有版权，**仅限本机私人使用，不要公开 / 分发 / 提交**。
对外发布请用默认的 Live2D 后端（官方免费可商用模型）。
