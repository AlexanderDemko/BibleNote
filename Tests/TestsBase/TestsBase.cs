using BibleNote.Analytics.Common.DiContainer;
using BibleNote.Analytics.Services;
using BibleNote.Analytics.Services.Configuration.Contracts;
using BibleNote.Analytics.Services.ModulesManager.Contracts;
using BibleNote.Analytics.Services.ModulesManager.Models.Exceptions;
using BibleNote.Tests.Analytics.Mocks;
using Microsoft.Extensions.DependencyInjection;
using System;

namespace BibleNote.Tests.Analytics.TestsBase
{
    public abstract class TestsBase
    {
        protected ServiceProvider ServiceProvider { get; set; }
        protected IModulesManager ModulesManager { get; set; }
        protected IConfigurationManager MockConfigurationManager { get; set; }        

        public virtual void Init(Action<IServiceCollection> registerServicesAction = null)
        {
            MockConfigurationManager = new MockConfigurationManager();            

            var services = new ServiceCollection()
               .AddApplicatonServices<ServicesModule>()               
               .AddScoped(sp => MockConfigurationManager);

            registerServicesAction?.Invoke(services);

            ServiceProvider = services
               .AddLogging()
               .BuildServiceProvider();                        

            ModulesManager = ServiceProvider.GetService<IModulesManager>();

            try
            {
                ModulesManager.GetCurrentModuleInfo();
            }
            catch (ModuleNotFoundException)
            {
                ModulesManager.UploadModule(@"..\..\..\Data\Modules\rst\rst.bnm", "rst");
                ModulesManager.UploadModule(@"..\..\..\Data\Modules\kjv\kjv.bnm", "kjv");
            }
        }        
    }
}