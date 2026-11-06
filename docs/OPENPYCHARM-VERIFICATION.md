# OpenPyCharm 验证记录

日期：2026-11-05。此文档区分真实工具验证、组件测试和桌面界面验证，不将上游功能列表当作验收结果。

## 环境

- Windows x64；Node.js 24.12.0；pnpm 11.25.0。
- Rust 1.96.0，工具链位于项目父目录 `.openpycharm-tools`。
- Python 3.10.1；pytest 9.2.0；Ruff 0.17.3；basedpyright 1.40.2；debugpy 1.8.22。
- 真实 Python 示例：`D:/rea/OpenPyCharm-demo`，由本次项目模板生成。

## 已完成

- `pnpm typecheck`：通过。
- `pnpm build`：通过。上游存在较大前端 chunk 和部分无效动态导入警告，不阻止构建。
- 应用、欢迎页、项目创建、开发实例身份及翻译检查：19 个测试文件，161 项通过，4 项按上游条件跳过。
- 新增项目向导组件测试：成功创建、虚拟环境失败后恢复、拒绝非空目录。
- 模板写入通过 exclusive-create API，已有文件不会被静默覆盖。
- 真实模板创建 `.venv` 并安装开发依赖：通过。
- 示例运行输出 `Hello, OpenPyCharm!`。
- 示例 `pytest`：1 项通过；Ruff：通过；basedpyright：0 errors、0 warnings。
- `node scripts/verify-python-protocols.mjs D:/rea/OpenPyCharm-demo`：通过。LSP 返回 `pathlib.Path`；DAP 在第 2 行命中断点，读取 `name`，表达式求值返回 `OPENPYCHARM`，继续运行并正常结束。
- Windows 原生开发构建：编译成功，生成并启动 `target/debug/openpycharm.exe`。

## 最终复核

- 前端最终验证：类型检查通过，161 项测试通过、4 项跳过，见本机 `frontend-verification.log`。
- Rust 真实 debugpy 集成测试：`cargo test -p ide-dap --test debugpy -- --ignored --exact debugpy_end_to_end`，1 项通过，见本机 `debugpy-verification.log`。
- 内嵌前端的 Windows debug 可执行文件构建成功：`target/debug/openpycharm.exe`，运行不依赖 Vite 开发服务器。
- Windows NSIS 安装包生成成功：`target/debug/bundle/nsis/OpenPyCharm_0.1.36_x64-setup.exe`。首次打包遇到已启动测试实例的文件锁；关闭该实例后执行 `pnpm tauri bundle --debug --bundles nsis`，退出码为 0。安装及卸载流程尚未验收。
- 启动修复后的安装包已重新安装到临时目录；在隐藏构建源码的条件下进程保持运行并创建窗口，随后通过 WebView2/CDP 检查到欢迎页和 `New Python Project`。品牌清理后的最终安装包 SHA-256：`BD09EC1A37924CFF6F9BBB60D57BF6BA41EA7A4A983EF0CA33F5BE835D8534E7`。
- 打包提示未找到 `__TAURI_BUNDLE_TYPE`，可能影响 updater 包类型识别；本预览版已关闭更新源，自动更新不在验收范围内。
- 品牌清理后的安装包已生成：欢迎页副标题、关于页、内存状态、插件提示、语言设置、调试提示和安装包元数据均使用 OpenPyCharm 文案；内部协议标识与 `.openidea/` 兼容路径保留以避免破坏现有项目。
- 浏览器中检查了生产前端的欢迎页名称、图标和新建按钮；此项不证明原生文件操作成功。
- 原生开发窗口曾停留在启动画面，原因尚未确认。独立构建已启动，但用户按 Esc 停止界面自动操作后，没有继续原生界面验收；原生项目向导端到端流程尚未验证。
- host 信任检查回归测试已添加，但本轮运行在编译期间停止，未取得通过结果。

## 验证中发现并处理

### 安装后启动崩溃回归（2026-11-05）

- 旧安装包在隔离目录安装成功，但隐藏构建源码目录后，启动立即退出，退出码 101。
- 两次复现均报告 `src-tauri/src/lib.rs:56`：`failed to write TypeScript bindings`，系统错误码 3（找不到路径）。
- 原因：使用 `debug_assertions` 判断开发模式，导致 `tauri build --debug` 生成的安装包仍然运行开发启动逻辑，尝试写回编译时的 `src/bindings.ts`。
- 修复：开发身份、绑定导出和 MCP 调试桥改为同时要求 `debug_assertions` 与 Tauri 的 `dev` 条件；内嵌前端的安装构建不满足 `dev`。Windows 安装构建同时使用 GUI 子系统，避免额外控制台闪现。
- 新增 `scripts/verify-windows-startup.ps1`，使用真实安装后的程序和临时源码隔离复现；修复前此回归检查失败。

- 欢迎页创建虚拟环境原先被“必须打开项目”的前置条件阻挡。现在仅允许无项目窗口显式创建环境；已打开的未信任项目仍受信任检查限制。
- 调试库原有测试假设 `total 3` 必须在同一条输出消息中。真实 Windows 调试将其分为 `total` 和 ` 3\n`，实际断点、求值和退出均成功。测试已改为等待结束后汇总 stdout，再检查完整输出。
- 应用标识和开发标识独立；更新源为空。项目内 `.openidea/` 文件格式仍与上游共享。

## 复现

```powershell
.\scripts\windows.ps1 -Task verify
.\scripts\windows.ps1 -Task build
node scripts/create-python-example.ts D:/rea/another-python-project
```

示例创建命令要求目标目录尚不存在。随后按生成的 README 创建环境、安装开发依赖并运行；协议测试只连接本地语言服务器和调试器。

## 尚未覆盖

- release 优化构建的性能、签名安装包和自动更新服务。
- macOS/Linux 桌面运行；跨平台支持不能仅根据配置文件认定通过。
- Django 深层语义、复杂重构、Notebook、数据库、远程开发和第三方插件兼容。
