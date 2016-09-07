using BibleNote.Analytics.Contracts.Environment;
using Microsoft.Practices.Unity;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using BibleNote.Analytics.Models.Scheme;
using BibleNote.Analytics.Models.Modules;

namespace BibleNote.Analytics.Services.Environment
{
    public class ApplicationManager : IApplicationManager
    {
        private readonly IModulesManager _modulesManager;
        private readonly IConfigurationManager _configurationManager;

        private ModuleInfo _currentModuleInfo;

        private Dictionary<string, XMLBIBLE> _biblesContent;
        private XMLBIBLE _currentBibleContent;

        private static readonly object _locker = new object();

        public ModuleInfo CurrentModuleInfo
        {
            get
            {
                return _currentModuleInfo;
            }
        }

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
            _currentModuleInfo = _modulesManager.GetCurrentModuleInfo();
            _biblesContent = new Dictionary<string, XMLBIBLE>();
            _currentBibleContent = null;
        }

        public XMLBIBLE GetBibleContent(string moduleShortName)
        {
            XMLBIBLE bibleContent;
            if (!_biblesContent.TryGetValue(moduleShortName, out bibleContent))
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
