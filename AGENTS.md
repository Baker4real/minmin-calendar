# Minmin Calendar Agent 入口

## 开始任务

1. 先读 `README.md`，以其中的项目结构、本地开发、验证和仓库卫生说明为现役入口。
2. 涉及 Room、日期、预测、日历语义、UX 或云函数时，先读 `CONTEXT.md`；按 `docs/adr/README.md` 的改动范围表读取对应 ADR，建议和实现都不得与之冲突；视觉工作同时读取 `DESIGN.md`。
3. 读取相关源码和测试后再修改。源码路径、云函数依赖和测试集合以当前文件树、各云函数自己的 `package.json` / `package-lock.json` 与测试文件为事实源，不在本文件维护副本。
4. 多 worktree 或子代理运行时，`.codegraph/` 索引只在主检出里（worktree 不带索引）；结构、调用流查询指回主仓库路径做只读检索，编辑仍在各自 worktree。

## 完成标准

- 从 `README.md` 的 Verification 选择覆盖改动面的检查；日期、Room、日历或页面共享行为变化时运行完整轻量检查组合。
- UI 变化还需在可用的微信开发者工具中验证小屏布局和相关端到端流程；环境不可用时明确记录未验证项。
- epic 级改动（一次 implement-spec / 多张子票收口）合并前，在 `docs/verification-log.md` 文末追加一条当日条目（要点、测试数、未验证项）；单张子票或小修不追加。
- 所有适用检查通过且 `git diff --check` 无错误后才声明完成，并报告未运行检查及残余风险。

## 工作流指针

- 私有 GitHub Issues：`docs/agents/issue-tracker.md`
- Triage 标签：`docs/agents/triage-labels.md`
- 领域文档与 ADR 路由：`docs/agents/domain.md`
