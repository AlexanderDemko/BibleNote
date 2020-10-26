using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using System;
using Microsoft.Extensions.DependencyInjection;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Threading;
using BibleNote.Analytics.Services.NavigationProvider;
using BibleNote.Analytics.Providers.OneNote.Services.DocumentProvider;

namespace BibleNote.Analytics.Providers.OneNote.Services.NavigationProvider
{
    public class OneNoteNavigationProvider : NavigationProviderBase<OneNoteDocumentId, OneNoteNavigationProviderParameters>, IDisposable
    {
        public override string Name { get; set; }
        public override string Description { get; set; }
        public override bool IsReadonly { get; set; }
        public override OneNoteNavigationProviderParameters Parameters { get; set; }

        private readonly IServiceProvider scopeProvider;

        public OneNoteNavigationProvider(IServiceProvider scopeProvider)
        {
            this.scopeProvider = scopeProvider;
            Parameters = new OneNoteNavigationProviderParameters();
        }

        public override IDocumentProvider GetProvider(OneNoteDocumentId document)
        {
            return scopeProvider.GetService<OneNoteProvider>();
        }

        public override Task<IEnumerable<OneNoteDocumentId>> LoadDocuments(bool newOnly, bool updateDb = true, CancellationToken cancellationToken = default)
        {
            throw new NotImplementedException(

                );   // todo
        }

        public void Dispose()
        {
            throw new NotImplementedException();
        }
    }
}
