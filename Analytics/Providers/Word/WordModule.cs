using BibleNote.Analytics.Common.DiContainer;
using BibleNote.Analytics.Providers.Html.Contracts;

namespace BibleNote.Analytics.Providers.Html
{
    public class WordModule : ModuleBase
    {
        protected override void InitServices(ServiceDescriptorsList services)
        {
            services
                .AddScoped<IWordDocumentConnector, WordDocumentConnector>()
                .AddScoped<IWordDocumentHandler, WordDocumentHandler>()                
                ;
        }
    }
}
