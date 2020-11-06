using System;
using System.Reflection;
using BibleNote.Common.DiContainer;
using BibleNote.Middleware;
using BibleNote.Providers.FileSystem.Navigation;
using BibleNote.Providers.Html;
using BibleNote.Providers.OneNote;
using BibleNote.Services;
using BibleNote.Services.Configuration.Contracts;
using BibleNote.Services.ModulesManager.Contracts;
using BibleNote.Services.ModulesManager.Models.Exceptions;
using BibleNote.Tests.Mocks;
using MediatR;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Tests.TestsBase
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
               .AddApplicatonServices<HtmlModule>()
               .AddApplicatonServices<OneNoteModule>()
               .AddApplicatonServices<FileNavigationModule>()
               //.AddLogging(configure => configure.AddConsole())
               .AddSingleton(sp => MockConfigurationManager);

            services.AddMediatR(typeof(MiddlewareModule).Assembly);

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
                ModulesManager.UploadModule(@"..\..\..\..\Modules\rst\rst.bnm", "rst");
                ModulesManager.UploadModule(@"..\..\..\..\Modules\kjv\kjv.bnm", "kjv");
            }
        }        
    }
}