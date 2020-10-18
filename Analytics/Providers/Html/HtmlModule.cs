using BibleNote.Analytics.Common.DiContainer;
using BibleNote.Analytics.Providers.Html.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Analytics.Providers.Html
{
    public class HtmlModule : ModuleBase
    {
        protected override void InitServices(IServiceCollection services)
        {
            services
                .AddScoped<IHtmlDocumentConnector, HtmlDocumentConnector>()     // todo: А почему Scoped?
                .AddScoped<IHtmlDocumentHandler, HtmlDocumentHandler>()    
                ;
        }
    }
}
