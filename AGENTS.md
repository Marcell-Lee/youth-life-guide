# Codebase Knowledge Graph (codebase-memory-mcp)

This project uses codebase-memory-mcp to maintain a knowledge graph of the codebase.
ALWAYS prefer MCP graph tools over grep/glob/file-search for code discovery.

Priority: `search_graph`, `trace_path`, `get_code_snippet`, `query_graph`, `get_architecture`.
Fall back to text search for string literals, configuration, non-code documents, or insufficient graph results.

# 使用少年生活指南

用本指南回答成长、日常选择或亲子问题时，先读 [skills/youth-life-guide/SKILL.md](skills/youth-life-guide/SKILL.md)，按主题、版本和依据查阅，再附出处回答。

# 修改项目

正文唯一来源是 `topics/`，年龄数据在 `metadata/`。阅读页与 agent 资料都由 `npm run build` 生成，不直接修改生成的 HTML、Markdown 或清单。

标题或可用版本变化后运行 `npm run catalog` 更新源码主题目录。修改后运行 `npm run build` 和 `npm test`；首次测试先执行 `npx playwright install chromium`。保留章节编号、阅读链接及源码与产物哈希对应关系。构建不得携带作者批注、本地路径、内部工作目录或个人数据。不得把 AI 核读改称专业审阅。
