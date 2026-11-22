using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Text;
using System.Windows.Forms;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: System.Reflection.AssemblyCompany("PNBlance")]

class EditorWindow : Form {
    readonly WebView2 web = new WebView2();
    readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
    readonly List<string> visits=new List<string>();
    int visitIndex=-1;
    string path, initial, newline = Environment.NewLine;
    Encoding encoding = new UTF8Encoding(false, true);
    bool dirty, closing, fullscreen;
    Rectangle previousBounds;
    FormWindowState previousState;
    void ToggleFullscreen() {
        if (!fullscreen) {
            previousState = WindowState;
            previousBounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
            var screen = Screen.FromHandle(Handle);
            fullscreen = true;
            WindowState = FormWindowState.Normal;
            FormBorderStyle = FormBorderStyle.None;
            Padding = Padding.Empty;
            Bounds = screen.Bounds;
        } else {
            fullscreen = false;
            FormBorderStyle = FormBorderStyle.Sizable;
            Padding = new Padding(0,3,0,0);
            WindowState = FormWindowState.Normal;
            Bounds = previousBounds;
            WindowState = previousState;
        }
        Post(new { action="windowState", fullscreen=fullscreen, pinned=TopMost });
    }
    const string Page = "https://xmarkdown.local/index.html";

    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    protected override void OnHandleCreated(EventArgs e) {
        base.OnHandleCreated(e);
        int dark = 1, chrome = 0x231e1d;
        DwmSetWindowAttribute(Handle, 20, ref dark, 4);
        DwmSetWindowAttribute(Handle, 34, ref chrome, 4);
        DwmSetWindowAttribute(Handle, 35, ref chrome, 4);
    }

    [DllImport("user32.dll")]
    static extern bool IsZoomed(IntPtr hwnd);

    [DllImport("user32.dll")]
    static extern bool ReleaseCapture();
    [DllImport("user32.dll")]
    static extern IntPtr SendMessage(IntPtr hwnd,int msg,IntPtr wp,IntPtr lp);

    protected override void WndProc(ref Message m) {
        const int WM_NCCALCSIZE = 0x83, WM_NCHITTEST = 0x84;
        if (m.Msg == WM_NCCALCSIZE && m.WParam != IntPtr.Zero) {
            int top = Marshal.ReadInt32(m.LParam, 4);
            base.WndProc(ref m);
            // Maximized windows extend beyond the monitor by the resize frame.
            int inset = IsZoomed(m.HWnd) && !fullscreen
                ? Math.Max(0, Screen.FromHandle(m.HWnd).WorkingArea.Top - top) : 0;
            Marshal.WriteInt32(m.LParam, 4, top + inset);
            m.Result = IntPtr.Zero;
            return;
        }
        base.WndProc(ref m);
        if (m.Msg == WM_NCHITTEST && WindowState == FormWindowState.Normal && m.Result.ToInt32() == 1) {
            int packed = unchecked((int)m.LParam.ToInt64());
            Point point = PointToClient(new Point((short)packed, (short)(packed >> 16)));
            if (point.Y >= 0 && point.Y < Padding.Top) m.Result = new IntPtr(12);
        }
    }
    [STAThread] static void Main(string[] args) {
        Application.EnableVisualStyles();
        Application.Run(new EditorWindow(args.Length == 0 ? null : args[0]));
    }
    EditorWindow(string document) {
        initial = document;
        Text = "X Markdown"; Width = 1180; Height = 780; MinimumSize = new Size(600,420);
        BackColor = Color.FromArgb(29,30,35);
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        StartPosition = FormStartPosition.CenterScreen;
        Padding = new Padding(0, 3, 0, 0);
        Resize += delegate { Padding = WindowState==FormWindowState.Maximized || fullscreen ? Padding.Empty : new Padding(0,3,0,0); };
        web.DefaultBackgroundColor = BackColor;
        web.Dock = DockStyle.Fill; Controls.Add(web);
        Shown += async delegate {
            try {
                string profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"X Markdown","WebView");
                var environment = await CoreWebView2Environment.CreateAsync(null, profile, new CoreWebView2EnvironmentOptions("--host-resolver-rules=\"MAP xmarkdown.local 127.0.0.1\""));
                await web.EnsureCoreWebView2Async(environment);
                var core = web.CoreWebView2;
                core.Settings.IsNonClientRegionSupportEnabled = true;
                core.Settings.AreDefaultContextMenusEnabled=false;
                core.Settings.AreBrowserAcceleratorKeysEnabled=false;
                core.SetVirtualHostNameToFolderMapping("xmarkdown.local", Path.Combine(Application.StartupPath,"ui"),CoreWebView2HostResourceAccessKind.DenyCors);
                core.NavigationStarting += (s,e) => { if(e.Uri.Split('#')[0] != Page){e.Cancel=true;if(e.IsUserInitiated)OpenWebLink(e.Uri);} };
                core.NewWindowRequested += (s,e) => { e.Handled=true;if(e.IsUserInitiated)OpenWebLink(e.Uri); };
                core.WebMessageReceived += Receive;
                core.Navigate(Page);
            } catch(Exception ex) { MessageBox.Show("请检查 Microsoft Edge WebView2 运行时。\n"+ex.Message,Text); Close(); }
        };
        FormClosing += async (s,e) => {
            if (!dirty || closing) return;
            e.Cancel=true;
            var answer=await Prompt();
            if(answer==DialogResult.Cancel) return;
            try {
                if(answer==DialogResult.Yes) {
                    var snapshot=await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('source').value");
                    if(!Save(json.Deserialize<string>(snapshot),false)) return;
                }
                closing=true; BeginInvoke(new Action(Close));
            } catch(Exception ex){MessageBox.Show(ex.Message,Text);}
        };
    }
    System.Threading.Tasks.TaskCompletionSource<DialogResult> pendingChoice;
    async System.Threading.Tasks.Task<DialogResult> Prompt(){
        if(pendingChoice!=null)return DialogResult.Cancel;
        pendingChoice=new System.Threading.Tasks.TaskCompletionSource<DialogResult>();
        try{Post(new {action="askSave"});return await pendingChoice.Task;}
        finally{pendingChoice=null;}
    }
    void Post(object value){web.CoreWebView2.PostWebMessageAsJson(json.Serialize(value));}
    void Open(string next,int index=-1){
        byte[] bytes=File.ReadAllBytes(next);
        Encoding detected;
        string text;
        using(var reader=new StreamReader(new MemoryStream(bytes),new UTF8Encoding(false,true),true)){
            text=reader.ReadToEnd();detected=reader.CurrentEncoding;
        }
        bool bom = bytes.Length>=3 && bytes[0]==239 && bytes[1]==187 && bytes[2]==191;
        encoding = detected.CodePage==65001 ? new UTF8Encoding(bom,true) : detected;
        newline=text.Contains("\r\n")?"\r\n":text.Contains("\n")?"\n":Environment.NewLine;
        path=next;dirty=false;Text=Path.GetFileName(path)+" · X Markdown";
        if(index>=0)visitIndex=index;
        else if(visitIndex<0 || !String.Equals(visits[visitIndex],next,StringComparison.OrdinalIgnoreCase)){
            visits.RemoveRange(visitIndex+1,visits.Count-visitIndex-1);
            visits.Add(next);visitIndex=visits.Count-1;
        }
        Post(new {action="load",name=Path.GetFileName(path),path=path,text=text,back=visitIndex>0,forward=visitIndex<visits.Count-1});
    }
    bool Save(string text,bool asNew){
        string next=path;
        if(next==null || asNew) using(var dlg=new SaveFileDialog{Filter="Markdown|*.md|所有文件|*.*",FileName=path==null?"笔记.md":Path.GetFileName(path)}){
            if(dlg.ShowDialog(this)!=DialogResult.OK)return false;next=dlg.FileName;
        }
        string temp=Path.Combine(Path.GetDirectoryName(next),Guid.NewGuid()+".tmp");
        try{
            File.WriteAllText(temp,text.Replace("\r\n","\n").Replace("\n",newline),encoding);
            if(File.Exists(next))File.Replace(temp,next,null);else File.Move(temp,next);
        } finally {if(File.Exists(temp))File.Delete(temp);}
        path=next;dirty=false;Text=Path.GetFileName(path)+" · X Markdown";return true;
    }
    void OpenWebLink(string address){
        Uri uri;
        if(!Uri.TryCreate(address,UriKind.Absolute,out uri) ||
           (uri.Scheme!=Uri.UriSchemeHttps && uri.Scheme!=Uri.UriSchemeHttp) ||
           String.IsNullOrEmpty(uri.Host) || uri.Host=="xmarkdown.local")return;
        try{
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(uri.AbsoluteUri){UseShellExecute=true});
        }catch(System.ComponentModel.Win32Exception ex){MessageBox.Show(this,"无法打开默认浏览器。\n"+ex.Message,Text);}
    }
    async void Receive(object sender,CoreWebView2WebMessageReceivedEventArgs e){
        if(e.Source.Split('#')[0]!=Page)return;
        try{
            var data=json.Deserialize<Dictionary<string,object>>(e.WebMessageAsJson);
            string action=(string)data["action"];
            if(action=="fullscreen"){ToggleFullscreen();return;}
            if(action=="pin"){TopMost=!TopMost;Post(new {action="windowState",fullscreen=fullscreen,pinned=TopMost});return;}
            if(action=="saveChoice"){
                var choice=(string)data["choice"];
                if(pendingChoice!=null)pendingChoice.TrySetResult(choice=="save"?DialogResult.Yes:choice=="discard"?DialogResult.No:DialogResult.Cancel);
                return;
            }
            if(action=="fonts"){
                var names = new SortedSet<string>(StringComparer.CurrentCultureIgnoreCase);
                using(var fonts = new System.Drawing.Text.InstalledFontCollection()){
                    foreach(var family in fonts.Families) using(family){names.Add(family.Name);}
                }
                Post(new {action="fonts",names=new List<string>(names)});
                return;
            }
            if(action=="appearance"){
                var color = (string)data["color"];
                if(color=="light" || color=="dark"){
                    BackColor=color=="light"?Color.FromArgb(246,246,249):Color.FromArgb(29,30,35);
                    web.DefaultBackgroundColor=BackColor;
                    int frame=ColorTranslator.ToWin32(BackColor);
                    DwmSetWindowAttribute(Handle,34,ref frame,4);
                    DwmSetWindowAttribute(Handle,35,ref frame,4);
                }
                return;
            }
            if(action=="windowMenu"){
                Post(new {action="windowMenu",x=Convert.ToInt32(data["x"]),y=Convert.ToInt32(data["y"]),maximized=WindowState==FormWindowState.Maximized});
                return;
            }
            if(action=="dragWindow" || action=="moveWindow" || action=="sizeWindow"){
                if(fullscreen || (action=="dragWindow" && Control.MouseButtons!=MouseButtons.Left))return;
                ReleaseCapture();
                int command=action=="dragWindow"?0xf012:action=="moveWindow"?0xf010:0xf000;
                SendMessage(Handle,0x112,new IntPtr(command),IntPtr.Zero);return;
            }
            if(action=="minimize"){WindowState=FormWindowState.Minimized;return;}
            if(action=="maximize"){if(fullscreen){ToggleFullscreen();return;}WindowState=WindowState==FormWindowState.Maximized?FormWindowState.Normal:FormWindowState.Maximized;return;}
            if(action=="close"){Close();return;}
            if(action=="ready"){if(initial!=null){Open(Path.GetFullPath(initial));initial=null;}return;}
            if(action=="dirty"){dirty=true;return;}
            if(action=="feedback"){MessageBox.Show((string)data["message"],Text);return;}
            if(action=="browseDirectory"){
                string folder=(string)data["folder"];
                if(folder=="")folder=path==null?Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments):Path.GetDirectoryName(path);
                var entries=new List<object>();string parent=null;
                if(folder=="::drives"){
                    foreach(var drive in DriveInfo.GetDrives())entries.Add(new {name=drive.Name,path=drive.Name,dir=true});
                }else{
                    folder=Path.GetFullPath(folder);
                    var info=new DirectoryInfo(folder);parent=info.Parent==null?"::drives":info.Parent.FullName;
                    var dirs=info.GetDirectories();Array.Sort(dirs,(a,b)=>StringComparer.CurrentCultureIgnoreCase.Compare(a.Name,b.Name));
                    foreach(var d in dirs)entries.Add(new {name=d.Name,path=d.FullName,dir=true});
                    var files=info.GetFiles();Array.Sort(files,(a,b)=>StringComparer.CurrentCultureIgnoreCase.Compare(a.Name,b.Name));
                    foreach(var f in files)if(System.Text.RegularExpressions.Regex.IsMatch(f.Extension,@"^\.(md|markdown|mdown|txt)$",System.Text.RegularExpressions.RegexOptions.IgnoreCase))entries.Add(new {name=f.Name,path=f.FullName,dir=false});
                }
                Post(new {action="directory",folder=folder,parent=parent,entries=entries,locate=data.ContainsKey("locate") && Convert.ToBoolean(data["locate"])});return;
            }
            if(action=="outputPdf" || action=="outputHtml"){
                bool pdf=action=="outputPdf";
                using(var dlg=new SaveFileDialog{Filter=pdf?"PDF|*.pdf":"HTML|*.html",FileName=(path==null?"笔记":Path.GetFileNameWithoutExtension(path))+(pdf?".pdf":".html")}){
                    if(dlg.ShowDialog(this)!=DialogResult.OK)return;
                    string temp=Path.Combine(Path.GetDirectoryName(dlg.FileName),Guid.NewGuid()+(pdf?".pdf":".tmp"));
                    try{
                        if(pdf){if(!await web.CoreWebView2.PrintToPdfAsync(temp))throw new IOException("PDF 生成失败");}
                        else File.WriteAllText(temp,(string)data["html"],new UTF8Encoding(false));
                        if(File.Exists(dlg.FileName))File.Replace(temp,dlg.FileName,null);else File.Move(temp,dlg.FileName);
                    }finally{if(File.Exists(temp))File.Delete(temp);}
                }
                return;
            }
            string text=(string)data["text"];
            if(action=="navigate"||action=="openListed"){
                int index=action=="navigate"?visitIndex+Convert.ToInt32(data["step"]):-1;
                if(action=="navigate" && (index<0||index>=visits.Count))return;
                string next=index<0?(string)data["file"]:visits[index];
                if(!File.Exists(next))throw new FileNotFoundException("文件已移动或不存在",next);
                if(dirty){var answer=await Prompt();if(answer==DialogResult.Cancel || (answer==DialogResult.Yes&&!Save(text,false)))return;}
                Open(next,index);return;
            }
            if(action=="closeFile"){
                if(dirty){
                    var answer=await Prompt();
                    if(answer==DialogResult.Cancel || (answer==DialogResult.Yes && !Save(text,false)))return;
                }
                if(fullscreen)ToggleFullscreen();
                path=null;dirty=false;encoding=new UTF8Encoding(false,true);newline=Environment.NewLine;
                Text="X Markdown";Post(new {action="closed"});return;
            }
            if(action=="open")using(var dlg=new OpenFileDialog{Filter="Markdown|*.md;*.markdown;*.txt|所有文件|*.*"}){
                if(dlg.ShowDialog(this)!=DialogResult.OK)return;
                if(dirty){var answer=await Prompt();if(answer==DialogResult.Cancel || (answer==DialogResult.Yes && !Save(text,false)))return;}
                Open(dlg.FileName);
            }
            if((action=="save" || action=="saveAs") && Save(text,action=="saveAs"))
                Post(new {action="saved",path=path,name=Path.GetFileName(path),version=data["version"]});
        } catch(Exception ex){MessageBox.Show(ex.Message,Text);}
    }
}


