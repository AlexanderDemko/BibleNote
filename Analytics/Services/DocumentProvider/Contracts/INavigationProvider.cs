using System.Collections.Generic;

namespace BibleNote.Analytics.Services.DocumentProvider.Contracts
{
    public interface INavigationProvider<T> where T: IDocumentId
    {
        string Name { get; set; }

        string Description { get; set; }

        bool IsReadonly { get; set; }

        IDocumentProvider GetProvider(T document);

        IEnumerable<T> GetDocuments(bool newOnly);        
    }
}
