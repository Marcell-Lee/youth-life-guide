# 少年生活指南 · Youth Life Guide

面向 6—17 岁孩子及支持他们的大人的中文生活指南。从学习、朋友、情绪到日常选择，按具体问题找办法，也给孩子留下自己判断、尝试和调整的空间。

[在线阅读](https://marcell-lee.github.io/youth-life-guide/) · [交给你的 AI](skills/youth-life-guide/SKILL.md) · [Agent 使用说明](docs/agent使用说明.md)

## 阅读

共有 83 个主题、83 篇综合正文、79 篇小学稿、83 篇中学稿，每题附依据与核查。K058、K059、K078、K079 暂无小学稿。网站提供搜索、分龄阅读、大字模式与最近阅读记录，无需登录。

内容由 AI 辅助整理，尚未完成专业审阅及儿童试读；依据中的来源、编辑判断和未决项分别保留，不将格式检查当成专业确认。

## 给 Agent 使用

把下面这段和你的问题一起发给支持读取网页的 AI：

> 请读取并使用 https://raw.githubusercontent.com/Marcell-Lee/youth-life-guide/main/skills/youth-life-guide/SKILL.md 。若不能安装，请在当前对话使用。先查相关正文与依据，按年龄回答，附主题出处和阅读链接。我的问题是：……

技能名称是 `youth-life-guide`。可以将 `skills/youth-life-guide/` 复制到 agent 支持的技能目录；本仓库内的使用入口在 [AGENTS.md](AGENTS.md)。无需密钥、后台或 MCP 服务。

在线资料：[主题目录 Markdown](https://marcell-lee.github.io/youth-life-guide/agent/index.md) · [目录 JSON](https://marcell-lee.github.io/youth-life-guide/agent/index.json) · [版本与文件哈希](https://marcell-lee.github.io/youth-life-guide/agent/manifest.json)。

本地正文在 `topics/K编号/`，可从[源码主题目录](docs/主题目录.md)定位。先搜索相关主题，再完整读取所选年龄版本及 `依据与核查.md`，无需一次加载整本书。

## 本地构建与检查

需要 Node.js 22 或以上、npm 和 Git。公开网站及 agent 资料只需 Node.js，不需要 Python。

```sh
npm ci
npm run build
npm run preview
```

打开 `http://127.0.0.1:4173`。生成目录是 `dist/site/`，源码和构建产物分开维护。

```sh
npx playwright install chromium
npm test
```

提交到 main 后，GitHub Actions 检查正文、链接、哈希及桌面／手机阅读，再发布 GitHub Pages。旧阅读文件名和 `#K编号` 链接保持可用。

## 项目结构

```text
topics/       唯一正文来源：综合、小学、中学、依据
metadata/     稿件标注的年龄数据
skills/       可独立安装的 Agent 技能
build/        阅读网站、Agent 资源的构建与检查
docs/         使用与维护说明
```

作者的本地批注和内部工作目录不公开，也不是技能的数据来源。改文章时直接改 `topics/`，不要改生成文件；标题或可用版本改变后运行 `npm run catalog` 更新源码目录，测试会检查是否同步。欢迎通过 Issue 或 PR 指出具体主题和改进理由；请勿提交孩子的真实姓名、学校、住址或批注中的个人资料。

## 许可与署名

代码、构建工具与技能说明采用 [MIT](LICENSE)。`topics/` 原创正文、年龄数据和由其生成的阅读及 agent 内容采用 [CC BY 4.0](LICENSE-CONTENT)。第三方引文与外部资料保留各自权利，不因被引用而改变许可。

转载或改编正文请注明：**少年生活指南项目贡献者**，附[原项目链接](https://github.com/Marcell-Lee/youth-life-guide)和 [CC BY 4.0 许可](https://creativecommons.org/licenses/by/4.0/)，并说明修改。署名不表示原作者认可改编内容。

Agent 的检索与引用工作流参考 [HowToLiveBetter](https://github.com/eternity4719/HowToLiveBetter/tree/main/skills/life-decision-guide)；本项目技能与正文独立编写。
