# DictFloat 开发日志与下一版规划

> 维护规则：以后每次整理 `next_develop_plan.md` 时，**最新版永远放在最前面**，旧版本按时间倒序依次放在后面。
>
> 每次开发固定输出：
>
> ```text
> DictFloat-vxx.zip
> DictFloat-vxx-store-upload.zip
> ```
>
> 本地开发包可以包含 `manifest.key` 和 `next_develop_plan.md`；Chrome Web Store 上传包必须移除 `manifest.key`，并保持包内容干净。

---

## DictFloat v0.6.9

### 本次讨论定稿

本次重点继续优化查词窗口界面布局与底部快速开关可见性：

1. `Settings` 从底部移到右上角标题栏。
2. 底部去掉“⚙ Settings”文字，只保留右上角齿轮。
3. 底部快速开关顺序改为：`词典 -> Online -> AI`。
4. 底部快速开关压缩成**单行横向滚动**，减少高度占用。
5. 修复长段落、长结果时底部开关容易被挤得看不见的问题。
6. 顺手再检查一遍界面，做一些明显不合理的细节优化。
7. AI 快速按钮继续保持“手动触发”，并避免同一个 Provider 重复连点时重复发请求。

### v0.6.9 已实现内容

#### 1. Settings 移到右上角

标题栏现在顺序为：

```text
DictFloat                            ⚙  −  ×
```

调整点：

- 去掉底部 `⚙ Settings` 按钮。
- 在标题栏右上角加入 `⚙` 图标按钮。
- 尺寸、点击区域与 `−`、`×` 保持一致。
- 点击后仍然打开扩展设置页。

#### 2. 底部快速开关压缩为单行

底部原先是多行：

```text
⚙ Settings
词典: ...
Online ... AI ...
```

现在改为一行横向滚动：

```text
词典: ✅1 ✅2 ✅3  ✅Online  AI: ☐1 ☐2 ☐3
```

这样：

- `Online` 放在 `词典` 后面。
- `AI` 放在 `Online` 后面。
- 面板高度明显减小。
- 在窄窗口里可以横向滚动，不再把底部撑得过高。

#### 3. 修复长内容时底部工具区不易看见

这次重点改了面板布局：

- `dictfloat-content` 改为 `flex: 1 1 auto`。
- `min-height` 从固定较大值改为 `0`。
- `dictfloat-footer` 明确为 `flex: 0 0 auto`。

这样长段落、长翻译、长 AI 输出时，**滚动的是中间内容区**，而不是把底部快速开关往外挤。

#### 4. AI 快速按钮性能细化

继续保持：

- AI Provider 默认不自动勾选。
- 用户点击底部 `AI: ☐1` 才手动运行对应 Provider。

并新增：

- 如果当前 query 下该 AI Provider 已经处于 `loading`，再次点击启用不会重复发起同一请求。
- 避免误触或连续点击造成重复请求。

#### 5. 细节优化

额外顺手做了几处界面优化：

- 底部按钮整体更紧凑。
- 标题栏齿轮按钮字号单独微调，更接近 `−`、`×` 的视觉重量。
- 快速开关行明确禁止换行，只允许横向滚动，避免布局抖动。

### v0.6.9 代码改动文件

```text
content.js
content.css
manifest.json
options.html
next_develop_plan.md
```

### v0.6.9 检查记录

执行检查：

```text
node --check content.js
python3 -m json.tool manifest.json
```

### 下一版 v0.7.0 规划

建议下一版继续优化：

1. 为底部 `词典` / `AI` 编号增加 hover tooltip，显示真实名称。
2. 检查 AI 长输出时是否需要增加“折叠 / 展开”按钮。
3. 评估是否给 AI 结果增加“停止 / 取消本次请求”的交互。
4. 检查移动端窄宽度下的底部快速开关可读性。
5. 继续统一商店文案、README 与设置界面的功能描述。

---

## DictFloat v0.6.8

### 本次讨论定稿

本次重点调整查词窗口里的快速开关：

1. 去掉页脚原来的 `Online: On / Off` 单独按钮。
2. 在查词页面底部增加一组更直接的快速开关。
3. `Online` 默认勾选，可以在查词界面直接开关。
4. `AI` 显示 Settings 中已经添加的 AI Providers。
5. AI Provider 默认不勾选；用户点击某一个 AI 编号后，立即对当前输入 / 当前划选句子执行该 AI。
6. 字典源也放到页脚快速开关里，使用编号展示，避免占用太多空间。
7. 所有快速开关保持小胶囊样式，并支持横向滚动，避免窗口变高太多。

### v0.6.8 已实现内容

#### 1. 查词页脚改为快速开关条

页脚结构调整为：

```text
⚙ Settings
词典: ✅1 ✅2 ✅3 ...
✅Online  AI: ☐1 ☐2 ☐3 ...
```

说明：

- `词典` 编号对应当前已配置的本地词库、Wudao、MDX/MDD 源。
- `Online` 对应在线兜底查询。
- `AI` 编号对应 Settings 中添加的 AI Providers。

#### 2. Online 可在查词界面直接开关

原来的 `Online: On` 按钮改为：

```text
✅Online
☐Online
```

点击后会直接切换 `state.settings.onlineLookup` 并保存到 `dictFloatSettings`。

当前已有查询时：

- 打开 Online：立即开始在线查询。
- 关闭 Online：清除当前 Online 结果并隐藏 Online 区块。

#### 3. AI Provider 改为查词界面手动触发

v0.6.7 之前，AI Provider 启用后可能会跟随句子翻译自动执行。

v0.6.8 改为：

- Settings 中添加几个 AI Provider，查词界面就显示几个编号。
- 默认全部不勾选。
- 点击 `AI: ☐1` 后，变为 `AI: ✅1`，并立即对当前 query 执行第 1 个 AI Provider。
- 再次点击取消勾选，并移除该 Provider 当前结果卡片。
- 切换新查询时，AI 勾选状态自动重置为未勾选。

这样避免每次划一句话都自动跑多个 AI，使用上更可控。

#### 4. 字典源快速开关

`词典:` 行显示所有查词源中的本地类来源：

- 本地 Glossary
- Wudao Offline
- MDX/MDD linked dictionaries

点击编号可以直接启用 / 禁用对应源，并保存到对应 storage：

```text
dictFloatDictionaries
dictFloatWudaoSource
dictFloatMdictSources
```

当前 query 已存在时：

- 本地词库切换后立即刷新显示。
- Wudao / MDX 源打开后会对当前 query 发起对应查询。
- 关闭后会隐藏当前结果。

#### 5. Sentence translation 与 AI 结果合并

为支持“点哪个 AI 就追加哪个结果”，`runSentenceTranslation()` 做了合并逻辑：

- 自动句子翻译仍按已启用翻译源执行。
- 手动点击 AI Provider 时，只追加或刷新对应 AI 卡片。
- 不再把已有翻译结果全部清空。
- Retry 单个 Provider 时也只刷新对应 Provider。

#### 6. UI 样式

新增小胶囊样式：

```text
dictfloat-quick-footer
dictfloat-footer-row
dictfloat-quick-row
dictfloat-quick-label
dictfloat-quick-chip
dictfloat-ai-chip
```

特性：

- 小尺寸。
- 横向滚动。
- 已启用状态使用绿色 accent。
- 深色模式适配。

### v0.6.8 代码改动文件

```text
content.js
content.css
manifest.json
options.html
next_develop_plan.md
```

### v0.6.8 检查记录

执行检查：

```text
node --check content.js
python3 -m json.tool manifest.json
```

### 下一版 v0.6.9 规划

建议下一版继续优化：

1. 快速开关显示真实名称的 tooltip，目前先用编号保持简洁。
2. 允许用户在 Settings 中选择是否显示“词典”快速开关。
3. 允许 AI 快速开关选择“仅本次查询”或“本次会话保持勾选”。
4. 支持把常用 AI Provider 固定成一个更明显的按钮，例如 `AI 精析`。
5. 检查页脚在 320px 窄宽度下的拥挤情况。

---

## DictFloat v0.6.7

### 本次讨论定稿

本次继续精调小圆点位置。用户给出多张带标注截图，核心要求是：

1. 小图标要更贴近**鼠标释放点 / 选择结束点**。
2. 箭头方向代表滑动方向，需要把方向判断真正用于定位。
3. **向左滑选**时，优先把小图标放在当前释放行的**左上外侧**，而不是左下。
4. **向右滑选**时，优先把小图标放在当前释放行的**右侧或右下外侧**，贴近结束位置。
5. 多行选区仍然优先锚定到离释放点最近的那一行，避免图标跑到整块选区的另一边。
6. 如果首选位置放不下，再回退到同侧其它位置或对侧位置。

### v0.6.7 已实现内容

#### 1. 小图标定位规则再次重写

本版不再简单优先“左下 / 右下”，而是改成更符合手势结束点的规则：

- 记录拖拽起点 `startX/startY` 与终点 `endX/endY`。
- 优先使用真实拖拽方向判断：
  - `endX < startX` 视为**向左滑选**
  - `endX > startX` 视为**向右滑选**
- 如果拖拽方向不明显，再退回用释放点相对选区中心的位置辅助判断。
- 继续使用 `range.getClientRects()` 取真实行级选区矩形；多行时选离释放点最近的行作为锚点。

#### 2. 向左滑选的优先锚点改为左上外侧

截图里用户期望的位置，普遍是：

```text
向左滑选 → 当前释放行的左上外侧
```

因此本版优先顺序改为：

```text
above-left
edge-left
below-left
...
```

这样不会像上一版那样总是掉到左下，导致还要再把鼠标挪过去。

#### 3. 向右滑选优先贴近结束行右侧

向右滑选时，优先顺序改为：

```text
below-right
edge-right
above-right
...
```

目标是让小图标贴近最后释放的那一行末尾，尽量落在右侧或右下外侧，更符合顺手点击的习惯。

#### 4. 增加“离释放点距离”评分

候选位置新增 `bubblePointerDistancePenalty()`：

- 候选点离释放点越远，罚分越高。
- 这样在左右都能放下时，会优先选择更贴近实际鼠标结束点的位置。

#### 5. 保留边界回退

如果首选位置超出页面边界，仍然允许自动回退：

- 同侧其它位置
- 整体选区外侧位置
- 对侧位置

但默认优先级已经改成更符合截图期望的方向。

### v0.6.7 代码改动文件

```text
content.js
manifest.json
options.html
next_develop_plan.md
```

### v0.6.7 检查记录

执行检查：

```text
node --check content.js
python3 -m json.tool manifest.json
```

### 下一版 v0.6.8 规划

建议下一版继续围绕选择体验微调：

1. 增加可选的“小图标偏移量”高级设置。
2. 针对 PDF.js、沉浸式阅读、ChatGPT、GitHub 文档页分别验证并做兼容性修补。
3. 如果极端网页 `clientRects` 异常，可增加 debug 开关显示锚点信息。
4. 继续检查段落长选、多列布局、缩放页面下的小图标稳定性。

---

## DictFloat v0.6.6

### 本次讨论定稿

本版继续围绕句子翻译与 AI 精析拆分：

1. `Sentence translation` 只负责快速中文翻译，不暴露 Prompt 分类。
2. `AI Providers` 继续负责英语精析、语法、生词、技术英文解析等深度任务。
3. 新增的微软、混元、硅基流动、智谱 GLM、babel-lite 都先放入 `Sentence translation`。
4. Microsoft Translator 作为专门翻译 API 源处理。
5. Hunyuan / SiliconFlow / Zhipu GLM / babel-lite 作为 OpenAI-compatible 翻译源处理，内部固定“只翻译”提示词，设置页不显示 Prompt。
6. AI Provider 大块默认折叠，避免多个 Provider 时设置页过长。
7. 默认 DeepSeek 英语精析 Prompt 调整为更短、更适合 DictFloat 小窗口的四栏目输出。

### v0.6.6 已实现内容

#### 1. Sentence translation 新增翻译源

翻译源顺序调整为：

```text
1. Chrome Built-in Translator
2. Microsoft Translator
3. Hunyuan Translation
4. SiliconFlow Translation
5. Zhipu GLM Translation
6. babel-lite
7. Youdao Web Bridge
8. Baidu Web Bridge
9. Doubao Web Bridge
```

#### 2. Microsoft Translator 专门适配

新增 Microsoft Translator 配置：

- API Key
- Region
- Endpoint

默认 Endpoint：

```text
https://api.cognitive.microsofttranslator.com
```

调用 Microsoft Translator v3 风格接口：

```text
/translate?api-version=3.0&from=en&to=zh-Hans
```

如果后续需要自动识别源语言，可以把 from 改成 auto 或空值。

#### 3. OpenAI-compatible Translation Providers

新增以下可配置翻译源：

- Hunyuan Translation
- SiliconFlow Translation
- Zhipu GLM Translation
- babel-lite

每个源提供：

- API URL / Base URL
- API Key
- Model

内部固定翻译指令：

```text
Translate the user text into Simplified Chinese.
Only return the Chinese translation.
Do not explain.
Do not add notes.
```

这些源不显示 System Prompt / User Prompt Template，避免和 AI Providers 混淆。

#### 4. API Key 单独存储

新增句子翻译 API Key 存储：

```text
dictFloatTranslationSecrets
```

普通设置仍保存在：

```text
dictFloatSettings.sentenceTranslationConfigs
```

普通 backup / recovery 不包含 `dictFloatTranslationSecrets`，避免把用户密钥导出。

#### 5. AI Providers 默认折叠

AI Provider 卡片改为：

```text
▸ 1. DeepSeek 英语精析    model · api url
```

默认折叠，点击 `▸` 展开。新增 / 复制 Provider 时自动展开对应卡片；Test API 失败时也会展开对应卡片，方便直接修改配置。

#### 6. 默认 DeepSeek 英语精析 Prompt 调整

默认“英语全能解析 · 简洁版”改为四栏目输出：

```text
【中文句式翻译】
【中文意思翻译】
【生词详解】
【语法结构解析】
```

调整点：

- 去掉【规整后原句】输出。
- 【生词详解】放到【语法结构解析】前面。
- 语法结构解析要求重要句子成分用括号附带中文直译。
- 保留“禁止开场白 / 禁止总结 / 禁止第一步第二步”等硬约束。

#### 7. 版本与打包

- manifest version 更新为 `0.6.6`。
- 本地开发包输出为 `DictFloat-v0.6.6.zip`。
- Chrome Web Store 上传包输出为 `DictFloat-v0.6.6-store-upload.zip`。
- Store 上传包移除 `manifest.key`，并不包含 `next_develop_plan.md`。

### v0.6.6 检查记录

执行检查：

```text
node --check options.js
node --check content.js
node --check background.js
python3 -m json.tool manifest.json
```

检查目标：

- Options 页脚本语法正确。
- Content script 语法正确。
- Background service worker 语法正确。
- manifest.json 语法正确。
- ZIP 根目录直接包含 manifest.json。
- Store 上传包不包含 manifest.key。

### 下一版 v0.6.7 规划

建议下一版继续做体验增强，不再一次性加太多源：

1. Sentence translation 的 API 源增加单独 Test API 按钮。
2. 翻译源配置块也支持默认折叠 / 展开状态记忆。
3. Microsoft Translator 支持源语言 auto / en 切换。
4. OpenAI-compatible Translation Providers 支持自定义 target language。
5. 结果区显示耗时、模型名、endpoint 简写。
6. 支持“只启用一个最快翻译源”和“并发翻译源先返回先显示”的模式。
7. AI Providers 折叠状态可记忆到设置中。
8. 继续优化 Chrome Web Store 隐私说明，明确句子翻译 API 和 AI Provider 的发送边界。

---
## DictFloat v0.6.5

### 本次讨论定稿

用户确认继续开发 v0.6.5，并补充 AI Provider 的设计原则：

1. AI 提示词可以做成默认值，但必须允许用户修改。
2. 用户修改提示词后，后续一直使用用户修改后的内容，不能被默认提示词覆盖。
3. API URL、Model、Provider Name、Temperature、Max Text Length、Max Output Tokens 等字段都可以预先填入默认值。
4. 所有预填内容都必须允许用户修改。
5. AI Provider 需要支持多个，逻辑类似词典源：可以启用/禁用，可以选择使用哪一个，每个 Provider 可以有不同提示词。

### v0.6.5 已实现内容

#### 1. Custom AI Provider 升级为 AI Providers

原 v0.6.4 只支持一个 Custom AI Provider。v0.6.5 改为多个 AI Provider 列表：

- 支持新增 AI Provider。
- 支持新增 DeepSeek 预设。
- 支持删除 Provider。
- 支持复制 Provider。
- 支持上移 / 下移排序。
- 每个 Provider 都有独立 Enable 开关。
- 结果区按普通翻译源 + AI Provider 顺序显示。

#### 2. 每个 AI Provider 独立配置

每个 Provider 支持独立设置：

- Provider name
- Model
- API URL / Base URL
- API Key
- Prompt preset
- System Prompt
- User Prompt Template
- Temperature
- Max text length
- Max output tokens
- Test API

#### 3. 默认提示词预填且可修改

内置默认 Prompt Preset：

- 英语全能解析 · 简洁版
- 只翻译 · 简洁版
- 技术英文 · PCIe/芯片版
- 自定义

默认 DeepSeek Provider 使用“英语全能解析 · 简洁版”。

关键规则：

- 默认提示词只作为初始化内容。
- 用户修改后会保存到 `dictFloatSettings.aiProviders`。
- 后续调用一直使用用户保存后的版本。
- 只有用户主动选择 preset 或点击 Reset prompt to preset，才会重新覆盖当前 Provider 的提示词。

#### 4. API Key 存储调整

v0.6.4：

```text
 dictFloatCustomAiSecret.apiKey
```

v0.6.5：

```text
 dictFloatAiSecrets[providerId].apiKey
```

兼容旧版本迁移：

- 如果用户已有 v0.6.4 的单 Provider 配置，会迁移为 `ai_legacy_custom`。
- 如果旧版 API Key 存在，会映射到迁移后的 Provider。
- 新版普通备份仍不导出 API Key。

#### 5. 测试功能升级

每个 AI Provider 卡片都有自己的 Test API。

默认测试文本：

```text
You've hit your usage limit.
```

这样可以直接验证默认英语解析提示词是否按固定栏目输出。

#### 6. 内容脚本调用逻辑

选中两个以上英文单词后，点击小圆点或按 Enter：

1. 按设置调用 Chrome Built-in / Youdao / Baidu / Doubao。
2. 再按 AI Provider 列表顺序调用所有已启用的 AI Provider。
3. 每个 AI Provider 在结果区独立显示为一张卡片。
4. 每张卡片支持 Copy / Retry。

#### 7. 版本与打包

- manifest version 更新为 0.6.5。
- 本地开发包输出为 `DictFloat-v0.6.5.zip`。
- Chrome Web Store 上传包输出为 `DictFloat-v0.6.5-store-upload.zip`。
- Store 上传包移除 `manifest.key`，并不包含 `next_develop_plan.md`。

### v0.6.5 检查记录

执行检查：

```text
node --check options.js
node --check content.js
node --check background.js
python3 -m json.tool manifest.json
```

检查目标：

- Options 页脚本语法正确。
- Content script 语法正确。
- Background service worker 语法正确。
- manifest.json 语法正确。
- ZIP 根目录直接包含 manifest.json。
- Store 上传包不包含 manifest.key。

### 下一版 v0.6.6 规划

建议下一版继续优化 AI Provider 体验：

1. AI Provider 结果并发执行：AI 源先返回先显示，网页桥接仍保持顺序，避免网页桥接互相干扰。
2. Provider 列表支持拖拽排序，而不只是上移 / 下移。
3. 支持导入 / 导出 AI Provider 配置，但默认继续排除 API Key。
4. 支持每个 Provider 选择触发场景：
   - 只处理句子 / 段落
   - 也处理单词
   - 仅手动 Retry 时调用
5. 支持每个 Provider 设置输出显示高度和折叠状态。
6. AI 结果卡片显示耗时、模型名、endpoint 简写。
7. 增加“恢复默认提示词库”按钮，不影响用户现有 Provider，除非用户明确覆盖。

---

## DictFloat v0.6.4

### 本次用户命令

继续开发 DictFloat v0.6.4，以 v0.6.3 作为参考包；以后每一次开发都输出：

```text
DictFloat-vxx.zip
DictFloat-vxx-store-upload.zip
```

并把本地讨论、开发日志、下一版规划统一维护在 `next_develop_plan.md`。

### v0.6.4 已实现内容

#### 1. 小圆点定位重做

定位规则从“只看选择方向”升级为：

```text
选区真实矩形决定不能压住文字；
鼠标释放点只作为辅助，用来判断更顺手的一侧和更接近的一行。
```

具体实现：

- 使用 `range.getClientRects()` 拿到真实行级选区矩形。
- 多行选择时，优先选择离鼠标释放点最近的那一行。
- 鼠标释放点在选区左半边时，圆点放左下角外侧。
- 鼠标释放点在选区右半边时，圆点放右下角外侧。
- 默认候选坐标为：

```js
// 右下外侧
left = rect.right + gap
top  = rect.bottom + gap

// 左下外侧
left = rect.left - bubbleSize - gap
top  = rect.bottom + gap
```

- 页面边界放不下时，再自动尝试同侧贴边、上方、对侧等 fallback。
- 圆点整体尽量在选区外，不再把短单词盖住。

#### 2. Settings 增加 Custom AI Provider

新增独立设置区：

```text
Custom AI Provider
```

字段：

```text
Enable Custom AI Provider
Provider Name
Model
API URL / Base URL
API Key
Show password
Temperature
Max Text Length
Max Output Tokens
System Prompt
User Prompt Template
Test API
```

兼容 OpenAI Chat Completions 风格接口：

- DeepSeek
- OpenAI / ChatGPT API
- 豆包 / 火山方舟 OpenAI-compatible endpoint
- OpenRouter
- One API
- New API
- LiteLLM
- 本地 OpenAI-compatible 代理

URL 处理规则：

```text
如果填写完整 /chat/completions 地址：直接使用。
如果填写 Base URL：自动补 /chat/completions。
```

例如：

```text
https://api.deepseek.com
=> https://api.deepseek.com/chat/completions

https://api.openai.com/v1
=> https://api.openai.com/v1/chat/completions

https://api.openai.com/v1/chat/completions
=> 原样使用
```

#### 3. 句子翻译来源顺序

两个以上英文单词触发句子翻译 / 解析。启用后来源顺序为：

```text
1. Chrome Built-in Translator
2. Youdao Web Bridge
3. Baidu Web Bridge
4. Doubao Web Bridge
5. Custom AI Provider
```

结果区使用原有 source card 样式，Custom AI 的卡片标题使用用户填写的 Provider Name。

#### 4. API Key 安全策略

本版将 API Key 单独保存：

```text
dictFloatCustomAiSecret.apiKey
```

普通设置保存：

```text
dictFloatSettings.customAiProvider
```

这样可以做到：

- API Key 保存在 `chrome.storage.local`。
- API Key 不写入网页 DOM。
- API Key 不进入普通 backup / recovery 导出列表。
- `next_develop_plan.md`、zip 包日志、普通备份中不包含用户密钥。

#### 5. 代码改动文件

```text
manifest.json
content.js
background.js
options.html
options.css
options.js
next_develop_plan.md
```

#### 6. 已执行检查

```bash
node --check content.js
node --check background.js
node --check options.js
python3 -m json.tool manifest.json
```

检查通过。

### v0.6.4 打包规则

本次输出两个包：

```text
DictFloat-v0.6.4.zip
DictFloat-v0.6.4-store-upload.zip
```

差异：

```text
DictFloat-v0.6.4.zip
- 本地开发包
- 包含 manifest.key
- 包含 next_develop_plan.md

DictFloat-v0.6.4-store-upload.zip
- Chrome Web Store 上传包
- 移除 manifest.key
- 不放开发日志，保持商店包干净
```

### v0.6.5 下一版规划

建议下一版先做这几件：

#### 1. Custom AI Provider 体验增强

- 增加一键示例填充：DeepSeek / OpenAI / Doubao / OpenRouter。
- 增加“只翻译 / 技术解析 / 逐句拆解 / 语法分析” Prompt Preset。
- Test API 增加更清楚的错误提示：鉴权失败、URL 错误、模型名错误、CORS/网络失败。

#### 2. 翻译结果展示增强

- 每个 Provider 卡片增加 Retry。
- Custom AI 卡片可以显示耗时。
- 长结果增加折叠 / 展开。
- 支持一键复制所有 Provider 结果。

#### 3. 隐私与商店文案更新

- 更新 Chrome Web Store 隐私说明：启用 Custom AI 后，只在用户手动触发时发送选中文本到用户配置的 endpoint。
- 明确说明 DictFloat 不内置第三方 API Key，不收集用户文本，不上传本地词库。

#### 4. 圆点定位继续细调

- 在 PDF 阅读器、沉浸式阅读器、ChatGPT 页面、GitHub 文档页上分别验证。
- 如果某些网页 selection rect 异常，增加 debug 标记开关。
- 可考虑在 Settings 里提供“小圆点位置偏移量”高级选项。

---

### v0.6.4 本地讨论记录

命令：再调整圆点位置。向右选：圆点放在选区右下角外侧。如图1，红色方框位置。 向左选：圆点放在选区左下角外侧，如图2，红色方框位置。 怎么描述呢，应该就是如图3，理想位置。 第二个功能实现，api调用，使用deepseek或者豆包，或者chatgpt，我应该只需要填写，如图4中的内容即可。我都可以自定义。 先讨论清楚。

同意，先把两个事情分开定清楚：**小圆点定位规则** 和 **API 自定义调用规则**。

#### 1. 小圆点定位规则重新定义

你的图 1、图 2、图 3 表达得很清楚。现在的问题是之前还是有点把“鼠标释放点 / 圆心 / 选区外框”混在一起了。

正确规则应该是：

```text
向右选：
圆点放在选区最后一行的右下角外侧

向左选：
圆点放在选区第一行的左下角外侧
```

注意关键点是：**圆点整体在选区外面，不是圆心贴着角，也不是盖在文字上。**

也就是说，假设圆点直径是 `16px`，间距是 `4px`：

##### 向右选

```text
选区矩形右下角
        ↓
[ selected text blue area ]    ○
```

坐标逻辑：

```js
left = targetRect.right + gap
top  = targetRect.bottom + gap
```

圆点的**左边缘**在选区右边界外侧，不是圆心在右下角。

##### 向左选

```text
○    [ selected text blue area ]
     ↑
  选区矩形左下角
```

坐标逻辑：

```js
left = targetRect.left - bubbleSize - gap
top  = targetRect.bottom + gap
```

圆点的**右边缘**在选区左边界外侧，不是圆心在左下角。

##### 多行选区

不能再用整个大包围框 `getBoundingClientRect()`，因为它会把多行文字合成一个大矩形，导致向右选时图标跑到很远。

应该用：

```js
const rects = Array.from(range.getClientRects())
  .filter(r => r.width > 1 && r.height > 1);
```

然后：

```text
向右选：用最后一个 rect
向左选：用第一个 rect
```

这样你选一整段英文时，图标会落在最后一行文字末尾的右下角；向左选时，会落在第一行文字开头的左下角。

##### 边界处理

只有在页面边缘放不下时才换位置：

```text
右侧放不下 → 放到选区左下角外侧
左侧放不下 → 放到选区右下角外侧
下方放不下 → 放到上方外侧
```

但默认优先永远是：

```text
向右：右下角外侧
向左：左下角外侧
```

这部分我建议下一版直接改成硬规则，不再参考鼠标释放点做主定位，只用鼠标/selection direction 判断方向。

------

#### 2. API 调用功能应该怎么做

你图 4 这种配置方式是对的。你本质上需要的是一个 **OpenAI-Compatible 自定义 AI Provider**。

也就是用户只填这些：

```text
API Key
API URL / Base URL
Provider Name
Model
System Prompt
User Prompt
Temperature
Max Text Length
Max Paragraph Count
Test API
```

这样 DeepSeek、豆包火山方舟、OpenAI、OpenRouter、One API、New API、LiteLLM、本地代理都可以接入。

DeepSeek 官方文档说明它的 API 格式兼容 OpenAI/Anthropic，所以用 OpenAI-Compatible 方式接是合理的。([DeepSeek API Docs](https://api-docs.deepseek.com/?utm_source=chatgpt.com)) OpenAI 的 Chat Completions 接口本身也是 `model + messages` 这种对话结构，适合我们做句子解析。([OpenAI 开发者](https://developers.openai.com/api/reference/chat-completions/overview/?utm_source=chatgpt.com)) 豆包这边应走火山方舟 API，火山方舟也有 Chat API、Base URL 与鉴权、以及三方工具/OpenAI API 兼容相关文档。([火山引擎](https://www.volcengine.com/docs/82379/1494384?utm_source=chatgpt.com))

------

#### 3. Settings 里建议新增这个区域

放在现在的 `Sentence translation` 后面，叫：

```text
Custom AI Provider
```

字段如下。

##### 基础开关

```text
Enable Custom AI: On / Off
```

开启后，选中两个以上英文单词时，DictFloat 除了网页桥接翻译，也会调用这个 AI Provider。

##### Provider Name

```text
Custom AI
```

用户可以改成：

```text
DeepSeek
Doubao
ChatGPT
OpenRouter
Kimi
Qwen
```

显示结果时就用这个名字作为来源卡片标题。

##### API Key

```text
sk-xxxx
```

旁边有：

```text
Show password
```

API Key 只保存在 `chrome.storage.local`，不写入页面 DOM，不参与导出，除非以后专门做“包含密钥的备份”选项。

##### API URL

这里要兼容两种输入。

用户填 Base URL：

```text
https://api.deepseek.com
```

程序自动补成：

```text
https://api.deepseek.com/chat/completions
```

用户填完整接口：

```text
https://api.openai.com/v1/chat/completions
```

程序直接使用，不再拼接。

判断规则：

```js
if url.endsWith('/chat/completions') {
  endpoint = url
} else {
  endpoint = url.replace(/\/$/, '') + '/chat/completions'
}
```

##### Model

```text
deepseek-chat
gpt-4o-mini
doubao-xxx
```

这里直接输入，先不做复杂下拉。因为不同服务商模型名变化太快，下拉反而麻烦。

##### Temperature

默认：

```text
0.2
```

英语解析建议低温度，稳定、少废话。

##### Max Text Length

默认：

```text
6000
```

和你现在长段落选中需求一致。

##### Max Output Tokens

建议加一个：

```text
4000
```

避免模型输出过长卡住。

------

#### 4. Prompt 设计

这里我建议分两个框：

```text
System Prompt
User Prompt Template
```

##### System Prompt

放你的“角色设定”。

例如：

```text
你是专业资深英语全能解析智能体。你必须严格按照指定流程解析用户输入的英文内容。输出使用中文，不闲聊，不省略核心内容。
```

##### User Prompt Template

用变量：

```text
请解析下面英文内容：

{{text}}
```

这样用户以后想改成“只翻译”“做技术英文解析”“做论文句子分析”，只要改 Prompt，不用改代码。

------

#### 5. 输出方式

现在选中多个词后，结果区应该像词典来源一样列出多个 source card。

定稿顺序：

```text
Sentence Translation / Analysis
────────────────────────
Chrome Built-in Translator
[结果]

Youdao Bridge
[结果]

Baidu Bridge
[结果]

Doubao Bridge
[结果]

Custom AI
[完整解析结果]
```

每个卡片右上角统一：

```text
Copy   Retry
```

按钮继续用 DictFloat 的小胶囊样式，不要突兀的大按钮。

------

#### 6. 调用逻辑

你之前说“两个以上单词就调用 AI”，我建议定为：

```text
选中 1 个英文词：
查词典、MDX、Wudao、Online

选中 2 个以上英文词：
点击小圆点后，直接调用所有已启用的句子翻译/AI Provider
```

也就是说，仍然保留你的要求：

```text
不再需要 Translate sentence 按钮
```

但要注意：不是“划选时立刻自动调用”，而是“点击小圆点后直接调用”。这样避免你只是想复制一段文字时，也自动把内容发给外部服务。

------

#### 7. Provider 顺序

Settings 里可以勾选：

```text
[✓] Chrome Built-in Translator
[✓] Youdao Web Bridge Experimental
[ ] Baidu Web Bridge Experimental
[ ] Doubao Web Bridge Experimental
[✓] Custom AI Provider
```

调用结果按固定顺序显示：

```text
1. Chrome Built-in Translator
2. Youdao Web Bridge Experimental
3. Baidu Web Bridge Experimental
4. Doubao Web Bridge Experimental
5. Custom AI Provider
```

之后可以再做拖拽排序，但第一版没必要。

------

#### 8. DeepSeek / OpenAI / 豆包填写示例

##### DeepSeek

```text
Provider Name:
DeepSeek

API URL:
https://api.deepseek.com

Model:
deepseek-chat

API Key:
你的 DeepSeek API Key
```

##### OpenAI / ChatGPT API

```text
Provider Name:
OpenAI

API URL:
https://api.openai.com/v1/chat/completions

Model:
gpt-4o-mini

API Key:
你的 OpenAI API Key
```

##### 豆包 / 火山方舟

```text
Provider Name:
Doubao

API URL:
火山方舟 OpenAI-compatible Chat Completions 地址

Model:
你在火山方舟开通的模型 / endpoint / model 名称

API Key:
火山方舟 API Key
```

豆包这里不要走网页 `doubao.com/chat/` 的 API Key，那是网页桥接。真正 API 调用走火山方舟。

------

#### 9. 隐私和审核说明要同步改

加上 Custom AI 后，Privacy 需要补一句：

```text
When Custom AI Provider is enabled and the user manually triggers sentence analysis, DictFloat sends only the selected or entered text to the user-configured AI endpoint for translation or analysis.
```

中文意思：

```text
当用户启用 Custom AI 并手动触发句子解析时，DictFloat 只会把用户选中或输入的文本发送到用户自己配置的 AI 接口，用于翻译或解析。
```

这个不属于 Remote Code，因为 API 返回的是文本，不是执行脚本。

------

#### 定稿建议

下一版我建议做成 **v0.6.4**：

```text
1. 修复小圆点定位：
   - 向右：最后一行选区右下角外侧
   - 向左：第一行选区左下角外侧
   - 圆点整体在选区外，不压住文字

2. Settings 增加 Custom AI Provider：
   - Enable
   - Provider Name
   - API Key
   - Show password
   - API URL
   - Model
   - System Prompt
   - User Prompt Template
   - Temperature
   - Max Text Length
   - Max Output Tokens
   - Test API

3. 选中两个以上英文单词后：
   - 点击小圆点直接调用所有已启用翻译/AI来源
   - Custom AI 作为第五个结果卡片显示
```

这个方案比较稳：**网页桥接继续保留，API 能力独立增强，所有配置都在 Settings，不破坏现在 DictFloat 的查词主线。**


> 命令：不再参考鼠标释放点做主定位，我觉得鼠标释放点作为辅助定位。比如，向左选，你要是，显示在右边，我需要再把鼠标拉过去。此时检查鼠标位置大概在左上角。然后定位矩形位置在左上角，然后就操作。你觉得如何？


我觉得你这个判断是对的：**鼠标释放点不能完全不用，它应该作为“方向与就近侧判断”的辅助依据。**

更准确的规则应该是：

```text
选区矩形决定“不能压住文字”
鼠标释放点决定“放在哪一侧更顺手”
```

也就是说，小圆点不应该直接跟着鼠标点跑，否则长段落会乱；但也不能完全不看鼠标点，否则向左选完后图标跑到右边，确实很反人类。

#### 最合理的定位规则

##### 1. 先拿到真实选区矩形

不是用整个大包围框，而是用：

```js
range.getClientRects()
```

得到每一行选中文字的矩形。

例如多行选区：

```text
第一行 rect
第二行 rect
第三行 rect
```

##### 2. 判断鼠标释放点靠近哪一行、哪一侧

鼠标释放点只用来判断：

```text
用户最后停在左边？
用户最后停在右边？
用户最后停在上半部分？
用户最后停在下半部分？
```

然后选择一个最接近鼠标释放点的 rect。

##### 3. 图标永远放在选区外侧

这是硬规则：

```text
不能覆盖选中文字
不能圆心贴边
必须是圆点整体在矩形外面
```

所以：

向右选，鼠标释放点通常在选区右下附近：

```text
[selected text]  ○
```

坐标：

```js
left = rect.right + gap
top  = rect.bottom + gap
```

向左选，鼠标释放点通常在选区左上或左下附近：

```text
○  [selected text]
```

坐标：

```js
left = rect.left - bubbleSize - gap
top  = rect.bottom + gap
```

你说的“向左选时鼠标大概在左上角，然后定位矩形位置在左上角”也合理。更精确一点应该是：

```text
向左选时，优先选最靠近鼠标释放点的那一行 rect，
然后把圆点放到这个 rect 的左下外侧。
```

这样不会要求你再把鼠标拉到右边。

#### 最终规则我建议这样定

```text
1. 取 selection 的所有 client rect。
2. 过滤掉宽高太小的 rect。
3. 根据鼠标释放点，找到距离最近的 rect。
4. 根据释放点相对选区中心的位置判断左右：
   - 鼠标在选区左半边：放左下外侧
   - 鼠标在选区右半边：放右下外侧
5. 圆点整体必须在选区矩形外，不能覆盖文字。
6. 如果放不下，再自动换到另一侧或上方。
```

这样比单纯“向左/向右选”更稳，因为有些浏览器或网页不容易准确判断 selection direction，但鼠标释放点非常直观。

#### 视觉结果

向右选：

```text
PCIe 8.0 specification is anticipated ...
                                      ○
```

向左选：

```text
○ PCIe 8.0 Specification Feature Objectives
```

短单词：

```text
word ○
```

或者靠左选：

```text
○ word
```

不会再出现圆点压住单词，也不会出现长段落时图标飞到很远的位置。

我建议下一版就按这个“**选区矩形为边界，鼠标释放点为就近侧辅助**”来改。

---

## DictFloat v0.6.3

> 命令：桥接过程中会主动把焦点拉回原网页，避免你被切到有道页面。这个功能目前，影响其他网页，其他网页操作一会儿，自动跳转到刚刚滑词翻译的网页上了。这样肯定不行。 另外，需要检查小图标，有时候单词选中比较短，把单词盖住了，就不能做到选中的词，肯定是矩形。矩形右下角或者左下角是小图标（圆形）的边所在的地方，而不是圆心等所在的地方。


已处理成 **DictFloat v0.6.3**。

`DictFloat-v0.6.3.zip`

`DictFloat-v0.6.3-store-upload.zip`

这次改了两处核心问题：

1. **彻底移除“桥接后拉回原网页焦点”逻辑**
   - 不再执行 `chrome.tabs.update(sourceTabId, { active: true })`
   - 不再执行 `chrome.windows.update(..., { focused: true })`
   - 桥接页仍然 `active: false` 创建或复用，但 DictFloat 不再主动切换任何 tab / window
   - 避免你在别的网页操作一会儿后，又被自动跳回刚才划词翻译的页面
2. **小圆点位置重新按“选区矩形边缘”计算**
   - 短单词不再用鼠标点当圆心附近参考，避免盖住单词
   - 向右选：圆点放在选区右下角外侧
   - 向左选：圆点放在选区左下角外侧
   - 多行段落不再用整个大包围框的右边界，而是用真实的首行/末行选区矩形，避免向右选段落时圆点跑很远

已检查：

- `background.js` 语法检查通过
- `content.js` 语法检查通过
- `bridge.js` 语法检查通过
- `options.js` 语法检查通过
- `manifest.json` 版本为 `0.6.3`
- Store 包已移除 `manifest.key`
- ZIP 根目录直接包含 `manifest.json`

真实有道 / 百度 / 豆包网页桥接仍需要在你的 Chrome 里验证，因为这里不能登录和操作这些网页的真实 DOM 状态。更新后请 Reload 扩展，并刷新测试网页。


---
