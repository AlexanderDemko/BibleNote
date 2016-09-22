using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Providers.OneNote.Contracts;

namespace BibleNote.Analytics.Providers.OneNote.Services
{
    public class OneNoteDocumentConnector : IOneNoteDocumentConnector
    {
        public IHtmlDocumentHandler Connect(IDocumentId documentId)
        {
            return new OneNoteDocumentHandler(documentId);
        }
    }
}
