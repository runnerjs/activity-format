# 贡献

Node.js ≥ 18，使用 pnpm。

GPX / TCX 的 XSD 测试会调用系统命令 `xmllint`（`test/xsd/`）。请先安装：

- Debian / Ubuntu：`sudo apt-get install -y libxml2-utils`
- Fedora：`sudo dnf install libxml2`
- macOS：系统一般自带 `/usr/bin/xmllint`；若没有，`brew install libxml2`

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm test:package
```

测试样例在 `test/fixtures/` 和 `demo/`，均使用合成运动数据。

- `pnpm fixtures:generate`：从固定参数重新生成 `test/fixtures/`，无需真实运动文件。包括故意保留的裸 `&`、无 GPS 点、多圈、多活动和 monitoring FIT。
- `pnpm test:package`：打包并安装到临时消费项目，验证 ESM/CJS 的解析与写出，以及不加载 Node 全局类型的 TypeScript 编译。安装依赖需要访问 npm registry。
- `npm pack` / `npm publish` 会通过 `prepack` 自动构建；`prepublishOnly` 负责发布前的类型检查和单元测试。

请勿把个人轨迹、账号或设备序列号加入公开测试文件。

公开 API 以 `src/index.ts` 为准。新增或删除根导出、改字段含义时请同步 `README.md` 与 `README.en.md`，并记入 `CHANGELOG.md`。
