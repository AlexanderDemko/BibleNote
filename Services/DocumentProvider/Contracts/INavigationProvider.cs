using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.DocumentProvider.Contracts
{
    public interface INavigationProvider<T> where T: IDocumentId
    {
        string Name { get; set; }

        string Description { get; set; }

        bool IsReadonly { get; set; }

        string ParametersRaw { get; set; }

        IDocumentProvider GetProvider(T document);

        Task<IEnumerable<T>> LoadDocuments(bool newOnly, bool updateDb = true, CancellationToken cancellationToken = default);        
    }
}
