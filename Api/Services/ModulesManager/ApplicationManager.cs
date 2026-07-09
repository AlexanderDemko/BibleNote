using System.Collections.Generic;
using BibleNote.Services.ModulesManager.Contracts;
using BibleNote.Services.ModulesManager.Scheme.Module;
using BibleNote.Services.ModulesManager.Scheme.ZefaniaXml;

namespace BibleNote.Services.ModulesManager
{
    class ApplicationManager : IApplicationManager
    {
        private readonly IModulesManager _modulesManager;
        private Dictionary<string, XMLBIBLE> _biblesContent;

        private static readonly object _locker = new object();

        public ModuleInfo CurrentModuleInfo => _modulesManager.GetCurrentModuleInfo();

        public XMLBIBLE CurrentBibleContent => GetBibleContent(CurrentModuleInfo.ShortName);

        public ApplicationManager(IModulesManager modulesManager)
        {
            _modulesManager = modulesManager;
            ReloadInfo();
        }

        public void ReloadInfo()
        {
            lock (_locker)
            {
                _biblesContent = new Dictionary<string, XMLBIBLE>();
            }
        }

        public XMLBIBLE GetBibleContent(string moduleShortName)
        {
            lock (_locker)
            {
                if (!_biblesContent.TryGetValue(moduleShortName, out XMLBIBLE bibleContent))
                {
                    bibleContent = _modulesManager.GetModuleBibleContent(moduleShortName);
                    _biblesContent.Add(moduleShortName, bibleContent);
                }

                return bibleContent;
            }
        }
    }
}
