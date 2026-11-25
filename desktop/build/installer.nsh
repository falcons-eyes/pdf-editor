; Register PDF Editor under "Open with" for .pdf without taking over the default PDF app.
; (electron-builder's fileAssociations would set HKCU\Software\Classes\.pdf's default value.)
!macro customInstall
  WriteRegStr SHCTX "Software\Classes\PDFEditor.pdf" "" "PDF Document"
  WriteRegStr SHCTX "Software\Classes\PDFEditor.pdf" "FriendlyTypeName" "PDF Document"
  WriteRegStr SHCTX "Software\Classes\PDFEditor.pdf\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHCTX "Software\Classes\PDFEditor.pdf\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr SHCTX "Software\Classes\.pdf\OpenWithProgids" "PDFEditor.pdf" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".pdf" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "PDF Editor"
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegValue SHCTX "Software\Classes\.pdf\OpenWithProgids" "PDFEditor.pdf"
  DeleteRegKey SHCTX "Software\Classes\PDFEditor.pdf"
  DeleteRegKey SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
