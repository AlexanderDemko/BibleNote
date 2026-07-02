using System.Collections.Generic;
using BibleNote.Services.Configuration.Contracts;
using BibleNote.Services.ModulesManager.Contracts;
using BibleNote.Services.ModulesManager.Scheme.Module;
using BibleNote.Services.ModulesManager.Scheme.ZefaniaXml;

namespace BibleNote.Services.ModulesManager
{
    class ApplicationManager : IApplicationManager
    {
        private readonly IModulesManager _modulesManager;
        private Dictionary<string, XMLBIBLE> _biblesContent;
        private XMLBIBLE _currentBibleContent;

        private static readonly object _locker = new object();

        public ModuleInfo CurrentModuleInfo { get; private set; }

        public XMLBIBLE CurrentBibleContent
        {
            get
            {
                if (_currentBibleContent == null)
                {
                    lock (_locker)
                    {
                        if (_currentBibleContent == null)
                            _currentBibleContent = _modulesManager.GetCurrentBibleContent();
                    }
                }

                return _currentBibleContent;
            }
        }

        public ApplicationManager(IModulesManager modulesManager)
        {
            _modulesManager = modulesManager;
            ReloadInfo();
        }

        public void ReloadInfo()
        {
            CurrentModuleInfo = _modulesManager.GetCurrentModuleInfo();
            _biblesContent = new Dictionary<string, XMLBIBLE>();
            _currentBibleContent = null;
        }

        public XMLBIBLE GetBibleContent(string moduleShortName)
        {
            if (!_biblesContent.TryGetValue(moduleShortName, out XMLBIBLE bibleContent))
            {
                lock (_locker)
                {
                    if (!_biblesContent.TryGetValue(moduleShortName, out bibleContent))
                    {
                        bibleContent = _modulesManager.GetModuleBibleContent(moduleShortName);
                        _biblesContent.Add(moduleShortName, bibleContent);
                    }
                }
            }

            return bibleContent;
        }
    }
}
