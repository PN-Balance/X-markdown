param([Parameter(Mandatory)][string]$Package)
$ErrorActionPreference='Stop'
$installer=New-Object -ComObject WindowsInstaller.Installer
$database=$installer.OpenDatabase((Resolve-Path -LiteralPath $Package).Path,1)
function Set-Controls([string]$values,[string]$filter){
    $query=$database.OpenView("UPDATE Control SET $values WHERE Dialog_='ProgressDlg' AND $filter")
    $query.Execute()
    $query.Close()
}
# Keep MSI's SetProgress and ActionText event subscriptions and cancel handling.
Set-Controls "X=149,Y=23,Width=72,Height=72,Text='XMarkdownLogo'" "Control='BannerBitmap'"
foreach($state in 'Installing','Changing','Repairing','Removing','Updating'){
    Set-Controls 'X=46,Y=106,Width=278,Height=20' "Control='Title$state'"
    Set-Controls 'X=46,Y=164,Width=278,Height=24' "Control='Text$state'"
}
Set-Controls 'X=46,Y=141,Width=278,Height=9' "Control='ProgressBar'"
Set-Controls 'X=46,Y=191,Width=278,Height=14' "Control='ActionText'"
foreach($control in 'Back','Next','BannerLine','StatusLabel'){
    Set-Controls 'Attributes=0' "Control='$control'"
}
$database.Commit()
$null=[Runtime.InteropServices.Marshal]::FinalReleaseComObject($database)

