using BibleNote.Analytics.Contracts.Environment;
using BibleNote.Analytics.Models.Common;
using Microsoft.Practices.Unity;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using BibleNote.Analytics.Models.Scheme;

namespace BibleNote.Analytics.Services.Environment
{
    public class ApplicationManager : IApplicationManager
    {
        private readonly IModulesManager _modulesManager;

        private ModuleInfo _currentModuleInfo;

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

        public ApplicationManager(IModulesManager modulesManager)
        {
            _modulesManager = modulesManager;
            ReloadInfo();
        }

        public void ReloadInfo()
        {
            _currentModuleInfo = _modulesManager.GetCurrentModuleInfo();            
        }
    }
}
