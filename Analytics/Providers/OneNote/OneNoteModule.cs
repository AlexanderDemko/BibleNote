using BibleNote.Analytics.Common.DiContainer;
using BibleNote.Analytics.Providers.OneNote.Contracts;
using BibleNote.Analytics.Providers.OneNote.Services;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Analytics.Providers.OneNote
{
    public class OneNoteModule : ModuleBase
    {
        protected override void InitServices(IServiceCollection services)
        {
            services
                .AddScoped<IOneNoteDocumentConnector, OneNoteDocumentConnector>()
                .AddScoped<IXDocumentHandler, OneNoteDocumentHandler>()
                ;
        }
    }
}
