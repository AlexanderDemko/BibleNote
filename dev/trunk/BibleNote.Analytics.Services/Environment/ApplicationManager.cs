using BibleNote.Analytics.Contracts.Environment;
using BibleNote.Analytics.Models.Common;
using Microsoft.Practices.Unity;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.Environment
{
    public class ApplicationManager : IApplicationManager
    {
        public IModulesManager ModulesManager { get; set; }

        private ModuleInfo _currentModuleInfo;
        public ModuleInfo CurrentModuleInfo
        {
            get { return _currentModuleInfo; }
        }

        public ApplicationManager(IModulesManager modulesManager)
        {
            ModulesManager = modulesManager;
            ReloadInfo();
        }

        public void ReloadInfo()
        {
            _currentModuleInfo = ModulesManager.GetCurrentModuleInfo();
        }
    }
}
