using System.Threading.Tasks;
using BibleNote.Providers.OneNote.Contracts;
using BibleNote.Services.DocumentProvider.Contracts;
using Microsoft.Extensions.Logging;

namespace BibleNote.Providers.OneNote.Services.DocumentProvider
{
    public class OneNoteDocumentConnector : IOneNoteDocumentConnector
    {
        private readonly ILogger _log;

        public OneNoteDocumentConnector(ILogger<OneNoteDocumentConnector> log)
        {
            _log = log;
        }

        public async Task<IXDocumentHandler> ConnectAsync(IDocumentId documentId)
        {
            var pageHandler = new OneNoteDocumentHandler(documentId, _log);
            await pageHandler.LoadPageContentAsync();
            return pageHandler;
        }
    }
}
