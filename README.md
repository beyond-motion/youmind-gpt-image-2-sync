# YouMind GPT Image 2 Sync

这个项目把 YouMind 的 GPT Image 2 公开提示词做成一条自动化链路：

1. 从 `https://youmind.com/youhome-api/prompts` 拉取 `model=gpt-image-2` 的公开分页数据。
2. 增量同步到飞书多维表格。
3. 生成 `site/data/prompts.json`，并通过 GitHub Actions 部署 `site/` 到 GitHub Pages。

## 本地命令

```bash
npm run fetch
npm run build:site
npm run serve:site
```

生成 GPT Image 2 提示词分析报告：

```bash
npm run analyze:framework
```

产物会写入 `analysis/`，包括 100 条高价值样本、数据摘要和 20 个创作模板。
站点构建会把 `analysis/prompt-analysis.json` 合入 `site/data/prompts.json`，用于筛选、卡片评分和创作拆解展示。
同时会把 `analysis/reports/` 下的专题报告复制到 `site/reports/`，方便 GitHub Pages 直接访问。

专题报告在 `analysis/reports/`：

- `production-grade-prompts.md`
- `text-typography-prompts.md`
- `reference-image-prompts.md`
- `ui-product-prompts.md`
- `visual-language-library.md`

站点能力：

- 按作品类型、模板、质量层级和 Top 100 样本筛选
- 查看每条提示词的创作拆解、质量评分和相似提示词
- 用 Prompt Builder 根据模板、主体、场景、构图、风格、光线和文字要求生成新提示词
- 从任意提示词一键带入 Builder，快速改造成同结构创作模板

如果要新建飞书多维表格：

```bash
npm run bootstrap:lark
```

运行后会生成 `.gpt-image-2.local.json`，里面包含 `baseToken` 和 `tableId`。

同步到飞书：

```bash
npm run ensure:lark
npm run sync:lark
```

`ensure:lark` 只会在已有表格里追加缺失的 YouMind 字段，不会删除或改写原来的测试字段。

如果要先刷新本机 `lark-cli` 登录态：

```bash
npm run sync:lark:local-auth
```

把 100 条高价值样本的分析标签写回飞书：

```bash
npm run sync:analysis:lark
```

## GitHub Actions

已配置 `.github/workflows/sync-and-deploy.yml`。

当前 workflow 会先用轻量探测检查 YouMind 首页签名；只有远端总量或前几条内容发生变化时，才会触发全量分页抓取。GitHub 托管 Runner 还会持久化抓取缓存，避免每次从零开始。

GitHub 托管 Runner 模式需要配置仓库 Secrets：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_BASE_TOKEN`
- `FEISHU_TABLE_ID`

自托管 Runner 模式可以复用本机 `lark-cli` 登录态。仓库 Variables 设置：

- `ENABLE_SELF_HOSTED_LARK_SYNC=1`

并确保 runner 有这些 labels：

- `self-hosted`
- `macOS`
- `ARM64`
- `youmind-sync`

## GitHub Pages

仓库 Settings 里把 Pages Source 设为 `GitHub Actions`。之后 workflow 会把 `site/` 作为 Pages artifact 部署。
