using BibleNote.Common.DiContainer;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Providers.FileSystem.Navigation
{
    public class FileNavigationModule : ModuleBase
    {
        protected override void InitServices(IServiceCollection services)
        {
            services
                .AddTransient<FileNavigationProvider>()
            ;
        }
    }
}
