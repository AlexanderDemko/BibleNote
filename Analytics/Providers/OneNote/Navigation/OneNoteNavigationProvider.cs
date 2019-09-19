using BibleNote.Analytics.Providers.OneNote.Contracts;
using BibleNote.Analytics.Providers.OneNote.Services;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Contracts;
using System;
using Microsoft.Extensions.DependencyInjection;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Threading;

namespace BibleNote.Analytics.Providers.OneNote.Navigation
{
    public class OneNoteNavigationProvider : INavigationProvider<OneNoteDocumentId>
    {
        public string Name { get; set; }
        public string Description { get; set; }
        public bool IsReadonly { get; set; }

        private readonly IServiceProvider scopeProvider;

        public OneNoteNavigationProvider(IServiceProvider scopeProvider)
        {
            this.scopeProvider = scopeProvider;
        }

        public IDocumentProvider GetProvider(OneNoteDocumentId document)
        {
            return new OneNoteProvider(
                   this.scopeProvider.GetService<IDocumentParserFactory>(),
                   this.scopeProvider.GetService<IOneNoteDocumentConnector>());
        }

        public async Task<IEnumerable<OneNoteDocumentId>> GetDocuments(bool newOnly, CancellationToken cancellationToken = default)
        {
            throw new NotImplementedException();
        }
    }
}
