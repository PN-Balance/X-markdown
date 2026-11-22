# X Markdown

[English](./README.en.md)

作者 **PNBlance**。

轻量的 Windows x64 Markdown 查看与编辑器。可以直接阅读文件，也可以在分栏中编辑源码、查看实时预览。正式版 **1.0.0** 的安装包约 **2.44 MB**，使用系统的 Microsoft Edge WebView2 Runtime。

## 快速开始

1. 下载 [X Markdown 1.0.0 安装包](./X-Markdown-1.0.0-Setup.exe)。
2. 双击安装包，选择安装位置，完成后启动 **X Markdown**。
3. 按 **Ctrl+O** 打开 Markdown 文件，或直接输入新笔记。按 **F2** 并排查看源码和实时预览，按 **Ctrl+S** 保存。**F1** 切换为源码，**F3** 切换为预览。

## 项目结构

| 路径 | 内容 |
| --- | --- |
| `desktop/` | WinForms 与 WebView2 宿主、界面模板、Markdown 渲染、样式和构建脚本 |
| `desktop/installer/` | 安装向导图像和 MSI 样式脚本 |
| `build/`、`dist/` | 本机构建目录和安装包输出，均由 Git 忽略 |

## 开发

在仓库根目录执行以下命令构建 WebView 界面，需要 Node.js 和 npm。

```sh
npm ci
node desktop/bundle.mjs
```

界面输出至 `build/app/ui/`。修改 `desktop/index.template.html`、JavaScript 或 CSS 后重新构建。版本号统一维护在 `desktop/version.mjs`。

Windows 桌面构建使用 .NET Framework C# 编译器、Microsoft.Web.WebView2 SDK 和 WiX 3。宿主入口是 `desktop/EditorWindow.cs`，安装器入口是 `desktop/Setup.cs`。将宿主、WebView2 托管程序集、x64 加载器和随附许可放入 `build/app/` 后，执行 `node desktop/package.mjs` 生成 WiX 配置。使用 candle 和 light（WixUIExtension，zh-CN）生成 MSI，以 `desktop/installer/style-progress.ps1` 应用安装样式，然后以资源名 `XMarkdown.msi` 将 MSI 嵌入安装器。发布时分发生成的 Setup.exe。
