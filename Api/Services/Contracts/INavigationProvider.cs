using BibleNote.Domain.Entities;
using BibleNote.Domain.Enums;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Services.Contracts
{
    public interface INavigationProvider<T>
        where T : IDocumentId
    {
        NavigationProviderType Type { get; }

        int Id { get; set; }

        string Name { get; set; }

        string Description { get; set; }

        bool IsReadonly { get; set; }

        IDocumentProvider GetProvider(T document);

        Task<IEnumerable<T>> LoadDocuments(
            AnalysisSession analysisSession,
            bool newOnly = false,
            bool updateDb = true,
            CancellationToken cancellationToken = default);
    }
}
