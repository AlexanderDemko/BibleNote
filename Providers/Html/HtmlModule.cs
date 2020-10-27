using BibleNote.Common.DiContainer;
using BibleNote.Providers.Html.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Providers.Html
{
    public class HtmlModule : ModuleBase
    {
        protected override void InitServices(IServiceCollection services)
        {
            services
                .AddScoped<IHtmlDocumentConnector, HtmlDocumentConnector>()     // todo: А почему Scoped?
                .AddScoped<IHtmlDocumentHandler, HtmlDocumentHandler>()
                .AddScoped<HtmlProvider>();
                ;
        }
    }
}
