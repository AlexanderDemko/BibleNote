using BibleNote.Common.DiContainer;
using BibleNote.Providers.OneNote.Contracts;
using BibleNote.Providers.OneNote.Services.DocumentProvider;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Providers.OneNote
{
    public class OneNoteModule : ModuleBase
    {
        protected override void InitServices(IServiceCollection services)
        {
            services
                .AddScoped<IOneNoteDocumentConnector, OneNoteDocumentConnector>()
                .AddScoped<IXDocumentHandler, OneNoteDocumentHandler>()
                .AddScoped<OneNoteProvider>()
                ;
        }
    }
}
