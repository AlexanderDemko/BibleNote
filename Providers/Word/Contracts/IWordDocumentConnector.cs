using BibleNote.Services.DocumentProvider.Contracts;

namespace BibleNote.Providers.Word.Contracts
{
    public interface IWordDocumentConnector : IDocumentConnector<IWordDocumentHandler>
    {        
    }
}
