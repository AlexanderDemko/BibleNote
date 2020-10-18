using BibleNote.Analytics.Common.DiContainer;
using BibleNote.Analytics.Providers.Html.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Analytics.Providers.Html
{
    public class WordModule : ModuleBase
    {
        protected override void InitServices(IServiceCollection services)
        {
            services
                .AddScoped<IWordDocumentConnector, WordDocumentConnector>()
                .AddScoped<IWordDocumentHandler, WordDocumentHandler>()                
                ;
        }
    }
}
