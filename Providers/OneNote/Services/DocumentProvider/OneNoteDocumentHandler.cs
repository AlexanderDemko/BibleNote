using BibleNote.Analytics.Providers.OneNote.Contracts;
using BibleNote.Analytics.Providers.OneNote.Services.NavigationProvider;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using Microsoft.Extensions.Logging;
using System;
using System.Threading.Tasks;
using System.Xml.Linq;

namespace BibleNote.Analytics.Providers.OneNote.Services.DocumentProvider
{
    public class OneNoteDocumentHandler : IXDocumentHandler, IAsyncDisposable
    {
        private readonly ILogger _log;

        public XDocument Document { get; private set; }

        public IDocumentId DocumentId { get; private set; }

        public OneNoteDocumentHandler(IDocumentId documentId, ILogger log)
        {
            _log = log;
            DocumentId = documentId;
        }

        public async Task LoadPageContentAsync()
        {
            Document = await ReadDocumentAsync(DocumentId);
        }

        private async Task<XDocument> ReadDocumentAsync(IDocumentId documentId)
        {
            string xml = null;

            if (documentId is OneNoteDocumentId)
            {
                using (var oneNoteApp = new OneNoteAppWrapper(_log))        // todo: не создавать
                {
                    xml = await oneNoteApp.GetPageContentAsync(((OneNoteDocumentId)documentId).PageId);
                    //html = Regex.Replace(html, "([^>])(\\n|&nbsp;)([^<])", "$1 $3");      // todo: разобраться, нужно ли это сейчас       
                }
            }

            if (xml != null)
                return XDocument.Parse(xml);

            throw new NotSupportedException(documentId.GetType().Name);
        }

        public void SetDocumentChanged()
        {
            DocumentId.SetChanged();
        }

        public void Dispose()
        {
        }

        public async ValueTask DisposeAsync()
        {
            if (!DocumentId.IsReadonly && DocumentId.Changed)
            {
                using (var oneNoteApp = new OneNoteAppWrapper(_log))
                {
                    await oneNoteApp.UpdatePageContentAsync(Document);
                }
            }
        }
    }
}
