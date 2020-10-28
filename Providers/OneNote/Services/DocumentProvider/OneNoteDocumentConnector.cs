using System.Threading.Tasks;
using BibleNote.Providers.OneNote.Contracts;
using BibleNote.Services.DocumentProvider.Contracts;
using Microsoft.Extensions.Logging;

namespace BibleNote.Providers.OneNote.Services.DocumentProvider
{
    public class OneNoteDocumentConnector : IOneNoteDocumentConnector
    {
        private readonly ILogger logger;
        private readonly IOneNoteAppWrapper oneNoteApp;

        public OneNoteDocumentConnector(
            ILogger<OneNoteDocumentConnector> logger,
            IOneNoteAppWrapper oneNoteApp)
        {
            this.logger = logger;
            this.oneNoteApp = oneNoteApp;
        }

        public async Task<IXDocumentHandler> ConnectAsync(IDocumentId documentId)
        {
            var pageHandler = new OneNoteDocumentHandler(documentId, this.oneNoteApp, this.logger);
            await pageHandler.LoadPageContentAsync();
            return pageHandler;
        }
    }
}
