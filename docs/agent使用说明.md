# 将少年生活指南交给 Agent

## 不安装，直接使用

把以下提示发给支持联网读取的 AI，再补充问题：

> 请读取并使用 https://raw.githubusercontent.com/Marcell-Lee/youth-life-guide/main/skills/youth-life-guide/SKILL.md 。若不能安装，请在当前对话使用。先查相关正文与依据，按年龄回答，附主题出处和阅读链接。我的问题是：……

例如：“我十岁，喜欢画画，但不想参加比赛，还能继续吗？”或“孩子总等我安排，怎样把日常选择慢慢交给他？”

## 安装技能

从本仓库下载 `skills/youth-life-guide/`，复制到所用 agent 支持的技能目录。目录内的 `SKILL.md` 就是完整技能，无需 API 密钥和服务配置。重新加载该 agent 的技能后，使用名称 `youth-life-guide` 调用；具体目录及调用方式以所用工具为准。

也可以明确让有安装能力的 agent 下载并安装上述技能链接；不支持持久安装时只在当前对话读取。项目不会自动修改你的配置。

技能规则不内嵌整本正文，因此安装后可按需读取网站的当前发布内容。本地使用时，下载仓库并从 `topics/` 读取即可；完全离线需要提前下载正文，单个技能文件不包含正文。

## 静态资源接口 v1

所有 URL 都以 `https://marcell-lee.github.io/youth-life-guide/` 为前缀：

| 路径 | 用途 |
|---|---|
| `skills/youth-life-guide/SKILL.md` | 技能入口 |
| `agent/index.md` | 按主题浏览的目录 |
| `agent/index.json` | 结构化主题索引 |
| `agent/topics/K043/all.md` | 综合正文 |
| `agent/topics/K043/primary.md` | 小学稿（存在时） |
| `agent/topics/K043/secondary.md` | 中学稿 |
| `agent/topics/K043/evidence.md` | 依据与核查 |
| `agent/manifest.json` | 发布提交及资源哈希 |

供普通浏览器阅读的无脚本页面另在 `read/index.html`，单篇路径为 `read/primary/K043.html` 等。阅读页在切换版本时保持主题，缺少某个版本会明确给出其他可用版本；Agent 检索仍优先使用上表的 Markdown 与 JSON 接口。

JSON 顶层含 `schema_version`、`commit`、`base_url`、`content_license`、`age_note`、`topics`。每题含 `id`、`available_versions`、`versions`。`versions` 以 `all`、`primary`、`secondary`、`evidence` 为键，每项记录标题、年龄范围、正文 URL、阅读 URL、源文件路径与固定提交链接、源文件及产物的 SHA-256。正文项另含阅读页内嵌 Markdown 的哈希。

`age_range` 是 `{min,max}` 或 `null`，只转录已确认与稿件匹配的年龄标注。综合版和依据为 `null`，不能解释成适用于所有年龄。缺失的小学稿没有文件，也不出现在 `available_versions` 中。

阅读与 agent 正文来自同一次构建。机器可读正文沿用阅读页清理后的文字，仅重写相对链接；来源哈希用于核对同源，生成文件哈希用于核对下载完整性。依据保留完整资料卡。清单不包含自身的哈希。

## 读取失败与内容不足

网站无法访问时，技能提供 GitHub raw 的[源码主题目录](主题目录.md)及正文回退路径；已取得在线 JSON 目录时优先使用其中的 `commit` 固定版本。所有路径都无法读取时，明确说明没能核对，不把常识伪装成指南原文。源码目录的标题与可用版本由 `npm run catalog` 更新，测试会检查与正文是否一致。

没有覆盖的问题直接说明；缺少小学稿时不自动用中学稿替代。指南没有统一的证据等级，不自行添加 A/B/C 评级或假称已经过专业审阅。

## 维护与许可

修改 `topics/` 或 `metadata/` 后执行 `npm run build` 与 `npm test`。技能规则修改 `skills/youth-life-guide/SKILL.md`，构建会同步在线入口。根目录清单递归覆盖全部公开资源，作者批注与内部资料不在发布清单内。

代码及技能说明采用 MIT；原创正文采用 CC BY 4.0。分享或改编正文时注明项目贡献者、原项目、许可和所作修改；第三方资料保留各自权利。
