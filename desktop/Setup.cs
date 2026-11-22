using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.Principal;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: System.Reflection.AssemblyCompany("PNBlance")]

internal static class Setup {
    const string Caption = "X Markdown 安装程序";
    static string ExistingDirectory() {
        using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Classes\XMarkdown.Document\shell\open\command")) {
            var command = key == null ? null : key.GetValue(null) as string;
            if (String.IsNullOrEmpty(command) || command[0] != '"') return null;
            int end = command.IndexOf('"', 1);
            if (end < 2) return null;
            string exe = command.Substring(1, end - 1);
            if (Path.IsPathRooted(exe) && String.Equals(Path.GetFileName(exe), "XMarkdown.exe", StringComparison.OrdinalIgnoreCase) && File.Exists(exe))
                return Path.GetDirectoryName(exe);
        }
        return null;
    }
    static string DefaultDirectory() {
        string existing=ExistingDirectory();
        if(existing!=null)return existing;
        string system=Path.GetPathRoot(Environment.SystemDirectory);
        var drives=DriveInfo.GetDrives();
        Array.Sort(drives,(a,b)=>StringComparer.OrdinalIgnoreCase.Compare(a.Name,b.Name));
        foreach(var drive in drives){
            if(String.Equals(drive.Name,system,StringComparison.OrdinalIgnoreCase) ||
               String.Equals(drive.Name,@"C:\",StringComparison.OrdinalIgnoreCase))continue;
            try{
                if(drive.DriveType==DriveType.Fixed && drive.IsReady && drive.AvailableFreeSpace>=32L*1024*1024)
                    return Path.Combine(drive.Name,"Xmarkdown");
            }catch(IOException){}catch(UnauthorizedAccessException){}
        }
        using(var picker=new FolderBrowserDialog{Description="请选择安装位置，安装程序将在所选目录下创建 Xmarkdown 文件夹。"}){
            if(picker.ShowDialog()!=DialogResult.OK)return null;
            return Path.Combine(picker.SelectedPath,"Xmarkdown");
        }
    }
    [STAThread] static int Main(string[] args) {
        try {
            var identity = WindowsIdentity.GetCurrent();
            var elevated = new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
            if (args.Length == 2 && args[0] == "--account" && args[1] != identity.User.Value)
                throw new InvalidOperationException("请使用原安装账户进行升级。当前提升权限使用了另一账户。");
            if (!elevated) {
                var start = new ProcessStartInfo(Application.ExecutablePath, "--account " + identity.User.Value) { UseShellExecute = true, Verb = "runas" };
                using (var child = Process.Start(start)) { child.WaitForExit(); return child.ExitCode; }
            }
            string directory = DefaultDirectory();
            if(directory==null)return 1602;
            string temp = Path.Combine(Path.GetTempPath(), "XMarkdown-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(temp);
            string msi = Path.Combine(temp, "XMarkdown.msi");
            string log = Path.Combine(Path.GetTempPath(), "XMarkdown-setup-" + Guid.NewGuid().ToString("N") + ".log");
            try {
                using (var input = Assembly.GetExecutingAssembly().GetManifestResourceStream("XMarkdown.msi"))
                using (var output = new FileStream(msi, FileMode.CreateNew, FileAccess.Write, FileShare.None)) input.CopyTo(output);
                string command = "/i \"" + msi + "\" /L*v \"" + log + "\"";
                if (directory != null) command += " INSTALLDIR=\"" + directory.TrimEnd('\\') + "\"";
                using (var process = Process.Start(new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "msiexec.exe"), command) { UseShellExecute = false })) {
                    process.WaitForExit();
                    int code = process.ExitCode;
                    if (code != 0 && code != 1602 && code != 3010 && code != 1641)
                        MessageBox.Show("安装未完成。错误码 " + code + "\n日志：" + log, Caption);
                    return code;
                }
            } finally { try { File.Delete(msi); Directory.Delete(temp); } catch (IOException) {} }
        } catch (System.ComponentModel.Win32Exception ex) {
            if (ex.NativeErrorCode == 1223) return 1602;
            MessageBox.Show(ex.Message, Caption); return 1;
        } catch (Exception ex) { MessageBox.Show(ex.Message, Caption); return 1; }
    }
}
