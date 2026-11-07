# Script to generate Project Sunflower Android app launcher icons for all densities
Add-Type -AssemblyName System.Drawing

$baseDir = "android\app\src\main\res"

function Draw-SunflowerIcon {
    param (
        [int]$size,
        [string]$type # "square", "round", "foreground"
    )

    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $g.Clear([System.Drawing.Color]::Transparent)

    $scale = $size / 512.0
    $cx = $size / 2.0
    $cy = $size / 2.0

    if ($type -eq "foreground") {
        # Foreground for adaptive icon (108x108 base).
        # On adaptive icon, the safe central zone is 66% of the icon.
        # We draw the rounded card with the glowing border and sunflower centered within ~68% of the canvas.
        $cardSize = 348 * $scale
        $cardX = $cx - ($cardSize / 2.0)
        $cardY = $cy - ($cardSize / 2.0)
        $radius = 80 * $scale

        $rect = New-Object System.Drawing.RectangleF $cardX, $cardY, $cardSize, $cardSize
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddArc($rect.X, $rect.Y, $radius, $radius, 180, 90)
        $path.AddArc($rect.Right - $radius, $rect.Y, $radius, $radius, 270, 90)
        $path.AddArc($rect.Right - $radius, $rect.Bottom - $radius, $radius, $radius, 0, 90)
        $path.AddArc($rect.X, $rect.Bottom - $radius, $radius, $radius, 90, 90)
        $path.CloseFigure()

        # Canvas gradient fill
        $c1 = [System.Drawing.Color]::FromArgb(255, 11, 19, 41)
        $c2 = [System.Drawing.Color]::FromArgb(255, 15, 31, 66)
        $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.PointF $cardX, $cardY), (New-Object System.Drawing.PointF ($cardX + $cardSize), ($cardY + $cardSize)), $c1, $c2
        $g.FillPath($brush, $path)

        # Cyan/blue glowing boundary
        $penColor = [System.Drawing.Color]::FromArgb(230, 56, 189, 248)
        $pen = New-Object System.Drawing.Pen $penColor, (6.0 * $scale)
        $g.DrawPath($pen, $path)

        # Subtle blue ambient glow behind sunflower
        $glowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(50, 56, 189, 248))
        $glowR = 170 * $scale
        $g.FillEllipse($glowBrush, ($cx - $glowR / 2.0), ($cy - $glowR / 2.0), $glowR, $glowR)

        # Center sunflower
        Draw-Flower -g $g -cx $cx -cy $cy -flowerScale ($scale * 0.72)

    } elseif ($type -eq "round") {
        # Circular icon for roundIcon
        $radius = $size * 0.46
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddEllipse(($cx - $radius), ($cy - $radius), ($radius * 2), ($radius * 2))

        # Fill background
        $c1 = [System.Drawing.Color]::FromArgb(255, 11, 19, 41)
        $c2 = [System.Drawing.Color]::FromArgb(255, 15, 31, 66)
        $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.PointF 0, 0), (New-Object System.Drawing.PointF $size, $size), $c1, $c2
        $g.FillPath($brush, $path)

        # Cyan/blue glowing circular border
        $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(230, 56, 189, 248)), (7.0 * $scale)
        $g.DrawPath($pen, $path)

        # Ambient glow
        $glowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(50, 56, 189, 248))
        $glowR = 200 * $scale
        $g.FillEllipse($glowBrush, ($cx - $glowR / 2.0), ($cy - $glowR / 2.0), $glowR, $glowR)

        # Sunflower
        Draw-Flower -g $g -cx $cx -cy $cy -flowerScale ($scale * 0.75)

    } else {
        # Square legacy launcher icon with modern rounded corners
        $margin = 24 * $scale
        $cardSize = $size - (2 * $margin)
        $radius = 100 * $scale
        $rect = New-Object System.Drawing.RectangleF $margin, $margin, $cardSize, $cardSize

        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddArc($rect.X, $rect.Y, $radius, $radius, 180, 90)
        $path.AddArc($rect.Right - $radius, $rect.Y, $radius, $radius, 270, 90)
        $path.AddArc($rect.Right - $radius, $rect.Bottom - $radius, $radius, $radius, 0, 90)
        $path.AddArc($rect.X, $rect.Bottom - $radius, $radius, $radius, 90, 90)
        $path.CloseFigure()

        # Fill background
        $c1 = [System.Drawing.Color]::FromArgb(255, 11, 19, 41)
        $c2 = [System.Drawing.Color]::FromArgb(255, 15, 31, 66)
        $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.PointF 0, 0), (New-Object System.Drawing.PointF $size, $size), $c1, $c2
        $g.FillPath($brush, $path)

        # Cyan/blue glowing boundary
        $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(230, 56, 189, 248)), (7.0 * $scale)
        $g.DrawPath($pen, $path)

        # Ambient glow
        $glowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(50, 56, 189, 248))
        $glowR = 210 * $scale
        $g.FillEllipse($glowBrush, ($cx - $glowR / 2.0), ($cy - $glowR / 2.0), $glowR, $glowR)

        # Sunflower
        Draw-Flower -g $g -cx $cx -cy $cy -flowerScale ($scale * 0.75)
    }

    $g.Dispose()
    return $bmp
}

function Draw-Flower {
    param (
        $g,
        $cx,
        $cy,
        $flowerScale
    )

    # 1. Secondary amber depth petals (offset 22.5 deg)
    $secPetalBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(240, 245, 158, 11))
    for ($i = 0; $i -lt 8; $i++) {
        $angle = $i * 45 + 22.5
        $g.TranslateTransform($cx, $cy)
        $g.RotateTransform($angle)
        $petalPath = New-Object System.Drawing.Drawing2D.GraphicsPath
        $pTop = -80.0 * $flowerScale
        $pW = 14.0 * $flowerScale
        $pB = -16.0 * $flowerScale
        $petalPath.AddBezier(0, $pTop, $pW, ($pTop * 0.55), $pW, ($pB * 1.5), 0, $pB)
        $petalPath.AddBezier(0, $pB, -$pW, ($pB * 1.5), -$pW, ($pTop * 0.55), 0, $pTop)
        $g.FillPath($secPetalBrush, $petalPath)
        $g.ResetTransform()
    }

    # 2. Main golden petals (0, 45, 90...)
    $mainPetalBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 250, 204, 21))
    $tipBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 254, 240, 138))
    for ($i = 0; $i -lt 8; $i++) {
        $angle = $i * 45
        $g.TranslateTransform($cx, $cy)
        $g.RotateTransform($angle)
        $petalPath = New-Object System.Drawing.Drawing2D.GraphicsPath
        $pTop = -96.0 * $flowerScale
        $pW = 18.0 * $flowerScale
        $pB = -18.0 * $flowerScale
        $petalPath.AddBezier(0, $pTop, $pW, ($pTop * 0.58), $pW, ($pB * 1.5), 0, $pB)
        $petalPath.AddBezier(0, $pB, -$pW, ($pB * 1.5), -$pW, ($pTop * 0.58), 0, $pTop)
        $g.FillPath($mainPetalBrush, $petalPath)

        # Highlight tip
        $tipPath = New-Object System.Drawing.Drawing2D.GraphicsPath
        $tTop = $pTop
        $tW = $pW * 0.65
        $tB = $pTop * 0.6
        $tipPath.AddBezier(0, $tTop, $tW, ($tTop * 0.8), $tW, $tB, 0, $tB)
        $tipPath.AddBezier(0, $tB, -$tW, $tB, -$tW, ($tTop * 0.8), 0, $tTop)
        $g.FillPath($tipBrush, $tipPath)

        $g.ResetTransform()
    }

    # 3. Center seed disk (rich warm brown layers)
    $rOuter = 36.0 * $flowerScale
    $diskBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 120, 53, 15))
    $g.FillEllipse($diskBrush, ($cx - $rOuter), ($cy - $rOuter), ($rOuter * 2), ($rOuter * 2))

    $rMid = 24.0 * $flowerScale
    $diskMid = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(235, 146, 64, 14))
    $g.FillEllipse($diskMid, ($cx - $rMid), ($cy - $rMid), ($rMid * 2), ($rMid * 2))

    $rInner = 12.0 * $flowerScale
    $diskInner = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(210, 180, 83, 9))
    $g.FillEllipse($diskInner, ($cx - $rInner), ($cy - $rInner), ($rInner * 2), ($rInner * 2))
}

# Density definitions for standard Android mipmaps
$densities = @(
    @{ name = "mipmap-mdpi";    iconSize = 48;  fgSize = 108 },
    @{ name = "mipmap-hdpi";    iconSize = 72;  fgSize = 162 },
    @{ name = "mipmap-xhdpi";   iconSize = 96;  fgSize = 216 },
    @{ name = "mipmap-xxhdpi";  iconSize = 144; fgSize = 324 },
    @{ name = "mipmap-xxxhdpi"; iconSize = 192; fgSize = 432 }
)

foreach ($d in $densities) {
    $folder = Join-Path $baseDir $d.name
    if (-not (Test-Path $folder)) {
        New-Item -ItemType Directory -Path $folder -Force | Out-Null
    }

    Write-Host "Rendering $($d.name) (icon: $($d.iconSize)px, fg: $($d.fgSize)px)..."

    # 1. ic_launcher.png
    $icon = Draw-SunflowerIcon -size $d.iconSize -type "square"
    $iconPath = Join-Path $folder "ic_launcher.png"
    $icon.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $icon.Dispose()

    # 2. ic_launcher_round.png
    $round = Draw-SunflowerIcon -size $d.iconSize -type "round"
    $roundPath = Join-Path $folder "ic_launcher_round.png"
    $round.Save($roundPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $round.Dispose()

    # 3. ic_launcher_foreground.png
    $fg = Draw-SunflowerIcon -size $d.fgSize -type "foreground"
    $fgPath = Join-Path $folder "ic_launcher_foreground.png"
    $fg.Save($fgPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $fg.Dispose()
}

Write-Host "All Android icons generated successfully!"

