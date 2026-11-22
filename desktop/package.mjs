import {version} from './version.mjs';
import fs from 'node:fs';
import path from 'node:path';
const ids=[];
function tree(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).map(entry=>{
    const p=path.join(dir,entry.name);
    if(entry.isDirectory())return '<Directory Id="dir_'+entry.name+'" Name="'+entry.name+'">'+tree(p)+'</Directory>';
    const id='file_'+ids.length;ids.push(id);
    const exe=entry.name==='XMarkdown.exe';
    const reg=exe?'<RegistryValue Root="HKCU" Key="Software\\Classes\\XMarkdown.Document\\shell\\open\\command" Type="string" Value="&quot;[#'+id+']&quot; &quot;%1&quot;"/><RegistryValue Root="HKCU" Key="Software\\Classes\\.md\\OpenWithProgids" Name="XMarkdown.Document" Type="string" Value=""/><Shortcut Id="StartLink" Directory="ProgramMenuFolder" Name="X Markdown" Target="[#'+id+']" WorkingDirectory="INSTALLDIR"/>':'';
    return '<Component Id="c_'+id+'" Guid="*" Win64="yes"><File Id="'+id+'" Source="'+p+'" KeyPath="yes"/>'+reg+'</Component>';
  }).join('');
}
const files=tree('build/app');
// The first stable release replaces the 1.0.0–1.0.3 preview installers.
const upgradePolicy = version === '1.0.0'
  ? '<Upgrade Id="C79489C7-75BA-4E36-AC1B-63A424D168BE"><UpgradeVersion Maximum="1.0.3" IncludeMaximum="yes" Property="OLDXMARKDOWN"/><UpgradeVersion Minimum="1.0.3" IncludeMinimum="no" OnlyDetect="yes" Property="NEWERXMARKDOWN"/></Upgrade><Condition Message="A newer version is installed.">Installed OR NOT NEWERXMARKDOWN</Condition><InstallExecuteSequence><RemoveExistingProducts After="InstallInitialize"/></InstallExecuteSequence>'
  : '<MajorUpgrade Schedule="afterInstallInitialize" DowngradeErrorMessage="A newer version is installed."/>';
fs.writeFileSync('build/package.wxs','<?xml version="1.0"?><Wix xmlns="http://schemas.microsoft.com/wix/2006/wi"><Product Id="*" Name="X Markdown" Language="1033" Codepage="936" Version="'+version+'" Manufacturer="PNBlance" UpgradeCode="C79489C7-75BA-4E36-AC1B-63A424D168BE"><Package InstallerVersion="500" Compressed="yes" InstallScope="perUser" Platform="x64"/><SetProperty Id="ARPINSTALLLOCATION" Value="[INSTALLDIR]" After="CostFinalize" Sequence="execute"/>'+upgradePolicy+'<Property Id="WIXUI_INSTALLDIR" Value="INSTALLDIR"/><UI><UIRef Id="WixUI_InstallDir"/><Publish Dialog="WelcomeDlg" Control="Next" Event="NewDialog" Value="InstallDirDlg" Order="10">NOT Installed</Publish><Publish Dialog="InstallDirDlg" Control="Back" Event="NewDialog" Value="WelcomeDlg" Order="10">1</Publish></UI><WixVariable Id="WixUIBannerBmp" Value="desktop/installer/banner.bmp"/><WixVariable Id="WixUIDialogBmp" Value="desktop/installer/welcome.bmp"/><Binary Id="XMarkdownLogo" SourceFile="desktop/installer/badge.bmp"/><MediaTemplate EmbedCab="yes" CompressionLevel="high"/><Directory Id="TARGETDIR" Name="SourceDir"><Directory Id="ProgramMenuFolder"/><Directory Id="LocalAppDataFolder"><Directory Id="INSTALLDIR" Name="X Markdown" ComponentGuidGenerationSeed="7BDBDCA5-27AC-452F-99B3-5BBEB6D71373">'+files+'</Directory></Directory></Directory><Feature Id="Editor" Title="X Markdown" Level="1">'+ids.map(id=>'<ComponentRef Id="c_'+id+'"/>').join('')+'</Feature></Product></Wix>');







