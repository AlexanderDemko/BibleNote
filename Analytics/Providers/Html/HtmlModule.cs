using BibleNote.Analytics.Common.DiContainer;
using BibleNote.Analytics.Providers.Html.Contracts;

namespace BibleNote.Analytics.Providers.Html
{
    public class HtmlModule : ModuleBase
    {
        protected override void InitServices(ServiceDescriptorsList services)
        {
            services
                .AddScoped<IHtmlDocumentConnector, HtmlDocumentConnector>()
                .AddScoped<IHtmlDocumentHandler, HtmlDocumentHandler>()                
                ;
        }
    }
}
