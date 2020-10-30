using BibleNote.Common.DiContainer;
using BibleNote.Providers.OneNote.Contracts;
using BibleNote.Providers.OneNote.Services;
using BibleNote.Providers.OneNote.Services.DocumentProvider;
using BibleNote.Providers.OneNote.Services.NavigationProvider;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Providers.OneNote
{
    public class OneNoteModule : ModuleBase
    {
        protected override void InitServices(IServiceCollection services)
        {
            services
                .AddTransient<IOneNoteDocumentConnector, OneNoteDocumentConnector>()
                .AddTransient<OneNoteProvider>()
                .AddTransient<OneNoteNavigationProvider>()
                .AddScoped<IOneNoteAppWrapper, OneNoteAppWrapper>()
                .AddTransient<INotebookIterator, NotebookIterator>()
                ;
        }
    }
}
