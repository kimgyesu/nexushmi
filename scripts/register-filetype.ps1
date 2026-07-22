# NexusHMI .nexus 파일 형식 + 아이콘 등록 스크립트
# 관리자 권한 자동 요청

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Add-Type -AssemblyName System.Drawing

$iconDir = "$env:ProgramData\NexusHMI"
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
$iconPath = "$iconDir\nexus.ico"

# ── 아이콘 생성 (32×32, NexusHMI 파란 배경 + 흰 파형) ──────────────────────────
function New-NexusIcon($path) {
    $sz = 32
    $bmp = New-Object System.Drawing.Bitmap($sz, $sz)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    # 둥근 파란 배경
    $bg = [System.Drawing.Color]::FromArgb(255, 20, 60, 180)
    $br = New-Object System.Drawing.SolidBrush($bg)
    $g.FillRectangle($br, 0, 0, $sz, $sz)
    $br.Dispose()

    # 흰색 파형 (SVG polyline 축소판)
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 2.5)
    $pen.StartCap  = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap    = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin  = [System.Drawing.Drawing2D.LineJoin]::Round
    $pts = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new(2,  16),
        [System.Drawing.PointF]::new(6,  16),
        [System.Drawing.PointF]::new(9,   8),
        [System.Drawing.PointF]::new(12, 24),
        [System.Drawing.PointF]::new(15, 12),
        [System.Drawing.PointF]::new(18, 20),
        [System.Drawing.PointF]::new(22, 16),
        [System.Drawing.PointF]::new(30, 16)
    )
    $g.DrawLines($pen, $pts)
    $pen.Dispose()
    $g.Dispose()

    # PNG → ICO 래핑 (Windows 탐색기가 인식하는 표준 형식)
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $png = $ms.ToArray(); $ms.Dispose(); $bmp.Dispose()

    $fs = [System.IO.File]::OpenWrite($path)
    $bw = New-Object System.IO.BinaryWriter($fs)
    $bw.Write([uint16]0)              # Reserved
    $bw.Write([uint16]1)              # Type: ICO
    $bw.Write([uint16]1)              # Images: 1
    # Directory entry
    $bw.Write([byte]$sz)              # Width
    $bw.Write([byte]$sz)              # Height
    $bw.Write([byte]0)                # Palette
    $bw.Write([byte]0)                # Reserved
    $bw.Write([uint16]1)              # Planes
    $bw.Write([uint16]32)             # Bit depth
    $bw.Write([uint32]$png.Length)    # Data size
    $bw.Write([uint32]22)             # Data offset (6+16)
    $bw.Write($png)
    $bw.Close(); $fs.Close()
}

New-NexusIcon $iconPath
Write-Host "  아이콘 생성: $iconPath" -ForegroundColor Cyan

# ── 레지스트리 등록 ──────────────────────────────────────────────────────────────
$ext     = "HKLM:\SOFTWARE\Classes\.nexus"
$prog    = "HKLM:\SOFTWARE\Classes\NexusHMI.Project"
$progIco = "$prog\DefaultIcon"
$progShl = "$prog\shell\open\command"

New-Item -Path $ext     -Force | Out-Null
Set-ItemProperty -Path $ext -Name "(Default)" -Value "NexusHMI.Project"
Set-ItemProperty -Path $ext -Name "Content Type" -Value "application/nexushmi"

New-Item -Path $prog    -Force | Out-Null
Set-ItemProperty -Path $prog -Name "(Default)" -Value "NexusHMI 프로젝트"

New-Item -Path $progIco -Force | Out-Null
Set-ItemProperty -Path $progIco -Name "(Default)" -Value "`"$iconPath`",0"

New-Item -Path $progShl -Force | Out-Null
Set-ItemProperty -Path $progShl -Name "(Default)" -Value "explorer.exe `"%1`""

# 탐색기 아이콘 캐시 갱신
$sig = @"
[DllImport("shell32.dll")] public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
"@
Add-Type -MemberDefinition $sig -Name WinAPI -Namespace Shell
[Shell.WinAPI]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)

Write-Host ""
Write-Host "✅ NexusHMI 파일 형식 등록 완료!" -ForegroundColor Green
Write-Host "   .nexus 파일에 NexusHMI 아이콘이 표시됩니다." -ForegroundColor White
Write-Host "   (탐색기에서 F5 새로고침 또는 재시작 후 적용)" -ForegroundColor Yellow
Write-Host ""
pause
