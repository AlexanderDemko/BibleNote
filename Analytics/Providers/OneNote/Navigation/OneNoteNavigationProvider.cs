using BibleNote.Analytics.Providers.OneNote.Services;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
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
            return this.scopeProvider.GetService<OneNoteProvider>();
        }

        public Task<IEnumerable<OneNoteDocumentId>> LoadDocuments(bool newOnly, bool updateDb = false, CancellationToken cancellationToken = default)
        {
            throw new NotImplementedException();   // todo
        }
    }
}
