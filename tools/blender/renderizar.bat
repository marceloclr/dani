@echo off
rem Render no Blender do Construction 4D Studio (INC-23): acha o blender.exe, pergunta a qualidade e roda o script.
chcp 65001 >nul
setlocal enabledelayedexpansion
set "PASTA=%~dp0"
set "BLENDER="
for /d %%D in ("%ProgramFiles%\Blender Foundation\Blender *") do (
  if exist "%%D\blender.exe" set "BLENDER=%%D\blender.exe"
)
if not defined BLENDER (
  for /f "delims=" %%B in ('where blender 2^>nul') do if not defined BLENDER set "BLENDER=%%B"
)
if not defined BLENDER (
  echo Não achei o Blender. Instale o Blender 4.2 ou mais novo ^(blender.org^) e rode de novo.
  pause
  exit /b 1
)
echo Blender: !BLENDER!
echo.
echo   R = Rascunho: metade da resolução, rápido ^(para conferir^)
echo   F = Final: resolução cheia, com reflexos ^(demora horas^)
choice /c RF /n /m "Qualidade [R/F]: "
if errorlevel 2 (set "QUALIDADE=final") else (set "QUALIDADE=rascunho")
echo.
echo Renderizando em !QUALIDADE!. Pode fechar esta janela e rodar de novo: os quadros prontos são aproveitados.
echo.
"!BLENDER!" -b --factory-startup -P "%PASTA%dani_blender.py" -- "%PASTA%." !QUALIDADE!
echo.
if errorlevel 1 (echo O render parou com erro. Veja as mensagens acima.) else (echo Pronto. O MP4 está nesta pasta.)
pause
