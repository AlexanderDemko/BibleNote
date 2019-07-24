using BibleNote.Analytics.Contracts.Environment;
using BibleNote.Analytics.Models.Exceptions;
using BibleNote.Analytics.Services.Unity;
using BibleNote.Tests.Analytics.Mocks;
using Microsoft.Practices.Unity;

namespace BibleNote.Tests.Analytics.TestsBase
{
    public abstract class TestsBase
    {
        protected IModulesManager _modulesManager;
        protected IConfigurationManager _mockConfigurationManager;

        public virtual void Init()
        {
            DIContainer.InitWithDefaults();

            _mockConfigurationManager = new MockConfigurationManager();
            DIContainer.Container.RegisterInstance(_mockConfigurationManager);

            _modulesManager = DIContainer.Resolve<IModulesManager>();
            try
            {
                _modulesManager.GetCurrentModuleInfo();
            }
            catch (ModuleNotFoundException)
            {
                _modulesManager.UploadModule(@"..\..\..\Data\Modules\rst\rst.bnm", "rst");
                _modulesManager.UploadModule(@"..\..\..\Data\Modules\kjv\kjv.bnm", "kjv");
            }
        }
    }
}