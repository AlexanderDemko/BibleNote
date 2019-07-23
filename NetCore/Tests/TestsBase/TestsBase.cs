using BibleNote.Analytics.Services.Configuration.Contracts;
using BibleNote.Analytics.Services.ModulesManager.Contracts;
using BibleNote.Analytics.Services.ModulesManager.Models.Exceptions;
using BibleNote.Tests.Analytics.Mocks;

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