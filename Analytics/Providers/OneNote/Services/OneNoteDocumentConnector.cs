using BibleNote.Analytics.Providers.OneNote.Contracts;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using Microsoft.Extensions.Logging;

namespace BibleNote.Analytics.Providers.OneNote.Services
{
    public class OneNoteDocumentConnector : IOneNoteDocumentConnector
    {
        private readonly ILogger _log;

        public OneNoteDocumentConnector(ILogger<OneNoteDocumentConnector> log)
        {
            _log = log;
        }

        public IXDocumentHandler Connect(IDocumentId documentId)
        {
            return new OneNoteDocumentHandler(documentId, _log);
        }
    }
}
