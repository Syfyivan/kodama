# GIF / sprite 桌宠素材目录

只想换一张自己的桌宠图片时，不需要把文件放进源码目录：在桌宠的「衣橱 → 自定义形象」中直接上传即可。这里的目录配置用于需要按状态提供多张素材的高级玩法。

这里存放内置成长伙伴与高级 GIF / APNG 素材包。默认提供四个可选家族：
`aetherling/`、`cloudfox/`、`moonbunny/`、`mossdragon/`，每个家族都包含
`egg.png → young.png → winged.png` 三阶段。衣橱里可直接选择；私人多状态素材包仍可通过
`config/render.local.js` 启用（见 `config/render.local.example.js`）。

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
