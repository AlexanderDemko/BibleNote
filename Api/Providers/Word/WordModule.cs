using BibleNote.Common.DiContainer;
using BibleNote.Providers.Word.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Providers.Word
{
    public class WordModule : ModuleBase
    {
        protected override void InitServices(IServiceCollection services)
        {
            services
                .AddTransient<IWordDocumentConnector, WordDocumentConnector>()
                ;
        }
    }
}
