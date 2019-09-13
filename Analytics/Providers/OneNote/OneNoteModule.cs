using BibleNote.Analytics.Common.DiContainer;
using BibleNote.Analytics.Providers.OneNote.Contracts;
using BibleNote.Analytics.Providers.OneNote.Services;

namespace BibleNote.Analytics.Providers.OneNote
{
    public class OneNoteModule : ModuleBase
    {
        protected override void InitServices(ServiceDescriptorsList services)
        {
            services
                .AddScoped<IOneNoteDocumentConnector, OneNoteDocumentConnector>()
                .AddScoped<IXDocumentHandler, OneNoteDocumentHandler>()
                ;
        }
    }
}
