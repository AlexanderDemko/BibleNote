using BibleNote.Analytics.Providers.Html.Contracts;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;

namespace BibleNote.Analytics.Providers.Html
{
    public class WordDocumentConnector : IWordDocumentConnector
    {
        public IWordDocumentHandler Connect(IDocumentId documentId)
        {
            return new WordDocumentHandler(documentId);
        }
    }
}
