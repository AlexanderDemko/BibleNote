# BibleNote

Bible study software

The next version of http://BibleNote.pro

## Progress
- Analytics
  - [x] Modules support
  - [x] Parallel verses support
  - [x] String parser
  - [x] Paragraph parser
  - [x] Document parser
  - [ ] Providers
    - [ ] FileSystem navigation provider
      - [x] Directory reader
      - [ ] File change watcher      
    - [ ] Web navigation provider
      - [ ] Web page loading
      - [ ] Web page caching
    - [ ] Html support
      - [x] Html read provider    
      - [ ] Html document linking
      - [ ] Html viewer
    - [ ] OneNote support
      - [x] OneNote navigation provider
      - [x] OneNote read provider
      - [ ] OneNote page linking
      - [ ] OneNote addin
    - [ ] Word support
    - [ ] Pdf support
  - [x] DB Storage
    - [x] Verse entries processing
    - [x] Verse relation processing
  - [ ] Background service
    - [ ] Automatic tasks
    - [ ] User actions handler
	- [ ] Divide reading and parsing documents into two different threads
  - [x] Move to .NET Core
- UI
  - [x] Platform for UI
  - [x] Navigation Providers management form
  - [ ] Common configuration form
  - [ ] Bible Verse reports form
  - [ ] Bible text form?
- Installer
  - [ ] Installer core
  - [ ] Version detector
  - [ ] Regedit editor  
- New web site
