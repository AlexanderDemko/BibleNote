using System.Collections.Generic;
using BibleNote.Analytics.Services.Configuration.Contracts;
using BibleNote.Analytics.Services.ModulesManager.Contracts;
using BibleNote.Analytics.Services.ModulesManager.Scheme.Module;
using BibleNote.Analytics.Services.ModulesManager.Scheme.ZefaniaXml;

namespace BibleNote.Analytics.Services.ModulesManager
{
    class ApplicationManager : IApplicationManager
    {
        private readonly IModulesManager _modulesManager;
        private readonly IConfigurationManager _configurationManager;
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

        public ApplicationManager(IModulesManager modulesManager, IConfigurationManager configurationManager)
        {
            _modulesManager = modulesManager;
            _configurationManager = configurationManager;
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
