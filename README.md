# OpenPyCharm

面向 Python 的桌面 IDE，采用 Rust、Tauri 2、React 和 CodeMirror 6。

这是初始开发预览版。并非 JetBrains 产品；不承诺与 PyCharm 功能或插件兼容。

## 本次新增

- 独立应用名称、图标、二进制及应用标识 `dev.openpycharm.ide`。
- 独立开发模式标识和应用配置目录；保留原有版权与第三方许可证。
- 欢迎页提供“新建 Python 项目”，默认生成可运行示例、pytest 测试、Ruff / basedpyright 配置。
- 可用指定的 Python 解释器创建项目的 `.venv`；创建失败时保留文件并提供打开项目入口。
- 关闭自动更新源，避免预览版本被其他安装包覆盖。
- 直接读取 PyCharm 导出的 `settings.zip`，预览兼容项后合并，并自动备份原设置。

## Windows 开发

### Codex（ACP）自动安装

选择内置 Codex（ACP）后，OpenPyCharm 会在首次连接时自动安装固定版本的适配器。
安装和 npm 缓存位于应用用户数据目录的 `agents/managed-adapters/codex-acp/`，不依赖系统的 npx 临时缓存。
本机需要已有 Node.js 和 npm；首次安装需要网络，后续复用安装结果。
安装失败后可重新发起任务重试，缺失或不完整的安装会自动重装。自定义启动命令保持不变。
适配器安装不代替账号登录，使用前仍需完成 `codex login`。

### 开发依赖

需要 Node.js 22.18+、pnpm、Rust 1.96+、Visual Studio C++ Build Tools、Windows SDK 和 WebView2。

本机已在项目父目录的 `.openpycharm-tools` 中安装隔离 Rust 工具链。启动脚本优先使用该工具链，不修改系统 PATH。

```powershell
.\scripts\windows.ps1 -Task dev
```

生成带内嵌前端的 Windows 预览安装包：

```powershell
.\scripts\windows.ps1 -Task build
```

该命令使用 debug profile，便于初期诊断，不代表最终发布性能。安装包输出到 `target/debug/bundle/nsis/`。

## 版本更新

正式 Release 使用 GitHub Releases 提供版本检查和安装包更新。发布前需要在仓库的
GitHub Actions secrets 中配置：

- `TAURI_SIGNING_PRIVATE_KEY`：Tauri updater 私钥内容。
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：生成私钥时设置的密码。

发布工作流会生成签名安装包和 `latest.json` 更新清单。应用启动时会静默检查更新，
也可以从帮助菜单执行“检查更新”。下载完成后 OpenPyCharm 会自动重启并完成安装。

安装包使用独立的桌面启动逻辑，不需要本机存在构建源码。修改启动或打包配置后，应对安装后的可执行文件运行回归检查：

```powershell
.\scripts\verify-windows-startup.ps1 -Executable 'D:\path\to\OpenPyCharm\openpycharm.exe' -HideSources
```

此检查会临时移开本仓库的 `src` 目录，模拟用户机器没有构建源码的情况；检查结束后恢复目录并关闭测试进程。请在构建和编辑停止时运行。它检查进程存活及原生窗口创建，欢迎页和项目操作需另行验证。

## Python 开发流程

1. 在欢迎页选择 **New Python Project**。
2. 输入项目名称和位置，选择 **Python application** 模板。
3. 可勾选创建虚拟环境，指定 Python 3.10+ 可执行文件；默认使用 PATH 中的 `python`。
4. 创建后打开项目。信任自己创建的项目后，解释器、运行及调试等功能才能执行程序。
5. 按生成的 README 激活环境并安装工具：

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
python main.py
python -m pytest
```

IDE 复用上游的项目环境识别、LSP、debugpy、pytest、Git 和终端能力。不同项目、平台和高级操作仍需逐项验证，已验证范围记录在 [验证记录](docs/OPENPYCHARM-VERIFICATION.md)。

## 导入 PyCharm 配置

在欢迎页的“自定义”中选择 **导入 PyCharm 配置…**，或通过 **文件 → 管理 IDE 设置 → 导入设置…** 直接选择 PyCharm 导出的 `settings.zip`。预览兼容项后点击“导入”，应用会合并设置并显示原配置备份路径。

支持常规设置、部分外观与编辑器选项、配色、已映射快捷键、Python 缩进规则和部分终端设置。插件与解释器登记等未支持内容会列入导入报告，详见 [导入范围与恢复方法](docs/PYCHARM-SETTINGS-IMPORT.md)。

## 上游追踪与边界

固定上游提交：`38ac62f1a41ad04fbb2c522af5e19d4c6433e2c1`，上游版本 0.1.36，见 [来源记录](openpycharm.upstream.json)。

为减少同步成本，Rust 内部 crate、IPC 协议及项目内 `.openidea/` 格式保持兼容。应用级配置目录已隔离。

未新增 Django 深层语义分析、PyCharm 插件兼容或远程解释器功能。数据库、Notebook 等上游模块保留，但尚未作为本预览版的验收项。

## 许可证

Apache-2.0。保留 [LICENSE](LICENSE)、[第三方许可证](THIRD_PARTY_LICENSES.md) 和 [上游 README](docs/UPSTREAM_README.md)。正式公开发行前需确定最终品牌名称和自己的更新签名配置。
