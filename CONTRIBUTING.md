# 贡献

欢迎提 Issue 和 Pull Request。公开 API 以 `src/index.ts` 为准。

## 环境

1. Node.js ≥ 18，使用 pnpm
2. 安装 `xmllint`（GPX / TCX 的 XSD 测试会调用它）
   - Debian / Ubuntu：`sudo apt-get install -y libxml2-utils`
   - Fedora：`sudo dnf install libxml2`
   - macOS：通过 Homebrew 安装 `libxml2`：`brew install libxml2`；如果命令仍不可用，请按 Homebrew 提示将其 bin 目录加入 `PATH`
3. `pnpm install`

## 改代码时请遵守

- 类型、interface 放 `src/types.ts`（或 `src/types/`）；常量放 `constants.ts`，类型用 `typeof` 推导
- 同一来源模块的导入尽量合并；类型导入可使用 `import type`，不要求与值导入混合
- parser 输出、writer 输入都走统一 `Activity` 模型
- 公开测试只用合成数据（`test/fixtures/`、`demo/`），不要提交个人轨迹、账号或设备序列号
- 改了夹具生成逻辑后跑 `pnpm fixtures:generate`

## 提交 PR 前清单

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过
- [ ] 改了解析 / 写出行为：补了对应测试，且测试文件不是真实运动记录
- [ ] 改了根导出或字段含义：同步了 `README.md`、`README.en.md`，并记入 `CHANGELOG.md`
- [ ] 改了打包产物或公开类型：跑过 `pnpm test:package`

请从功能分支向 `main` 开 PR，写清改了什么、为什么改、怎么测的。CI 会在 Node 18 / 22 上跑 typecheck、test、test:package。
