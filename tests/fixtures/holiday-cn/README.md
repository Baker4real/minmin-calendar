# holiday-cn fixtures

这些 JSON 文件是 NateScarlet/holiday-cn 对应年度数据文件的本地副本，供生成脚本与测试离线读取。

- 上游仓库：https://github.com/NateScarlet/holiday-cn
- 固定版本：`a8a8b4e8e960e1934a8b62aad34663a66a53b578`（2026-11-16 获取）
- 文件来源：`https://raw.githubusercontent.com/NateScarlet/holiday-cn/a8a8b4e8e960e1934a8b62aad34663a66a53b578/<year>.json`，其中 `<year>` 为 2025、2026 或 2027。
- 许可：MIT；上游 `LICENSE` 原文保存在同目录。

更新年度数据时，用同年上游文件替换对应本地副本并更新上述版本，再运行 README 中的 `holidays:generate` 命令；测试本身不得联网。
