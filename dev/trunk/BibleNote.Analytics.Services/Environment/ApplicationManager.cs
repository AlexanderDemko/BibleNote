using BibleNote.Analytics.Contracts;
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
        [Dependency]
        public IModulesManager ModulesManager { get; set; }

        private ModuleInfo _currentModuleInfo;
        public ModuleInfo CurrentModuleInfo
        {
            get { return _currentModuleInfo; }
        }

        public ApplicationManager()
        {
            ReloadInfo();
        }

        public void ReloadInfo()
        {
            _currentModuleInfo = ModulesManager.GetCurrentModuleInfo();
        }
    }
}
