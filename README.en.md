# X Markdown

[简体中文](./README.md)

X Markdown is a lightweight Markdown viewer and editor for 64-bit Windows, developed by **PNBlance**. Read a document in preview mode or edit its source alongside a live preview. The **1.0.0** installer is approximately **2.44 MB** and uses the Microsoft Edge WebView2 Runtime installed on your system.

## Quick start

1. Download the [X Markdown 1.0.0 installer](./X-Markdown-1.0.0-Setup.exe).
2. Run the installer, choose an installation folder, then launch **X Markdown**.
3. Press **Ctrl+O** to open a Markdown file, or start typing a new note. Press **F2** for a split view with live preview and **Ctrl+S** to save. **F1** shows the source and **F3** shows the preview.

## Project layout

| Path | Contents |
| --- | --- |
| `desktop/` | WinForms and WebView2 host, UI template, Markdown renderer, styles, and build scripts |
| `desktop/installer/` | Installer artwork and MSI styling script |
| `build/`, `dist/` | Local build files and installer output. Git ignores both directories. |

## Development

To build the WebView interface, run these commands from the repository root with Node.js and npm installed.

```sh
npm ci
node desktop/bundle.mjs
```

The bundle is written to `build/app/ui/`. Rebuild it after editing `desktop/index.template.html`, JavaScript, or CSS. The version number is maintained in `desktop/version.mjs`.

The Windows desktop build requires the .NET Framework C# compiler, the Microsoft.Web.WebView2 SDK, and WiX 3. The desktop host entry point is `desktop/EditorWindow.cs`, and the installer entry point is `desktop/Setup.cs`.

To package a release, place the compiled host, WebView2 managed assemblies, x64 loader, and accompanying license in `build/app/`. Run `node desktop/package.mjs` to generate the WiX configuration. Build the MSI with Candle and Light using WixUIExtension and the zh-CN culture. Apply the installer styling with `desktop/installer/style-progress.ps1`, then embed the MSI in the setup executable under the resource name `XMarkdown.msi`. Distribute the resulting setup executable.
