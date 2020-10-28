using System;
using System.Threading.Tasks;
using System.Xml.Linq;
using BibleNote.Providers.OneNote.Contracts;
using BibleNote.Providers.OneNote.Services.NavigationProvider;
using BibleNote.Services.DocumentProvider.Contracts;
using Microsoft.Extensions.Logging;

namespace BibleNote.Providers.OneNote.Services.DocumentProvider
{
    public class OneNoteDocumentHandler : IXDocumentHandler
    {
        private readonly IOneNoteAppWrapper oneNoteApp;
        private readonly ILogger logger;

        public XDocument Document { get; private set; }

        public IDocumentId DocumentId { get; private set; }

        public OneNoteDocumentHandler(
            IDocumentId documentId,
            IOneNoteAppWrapper oneNoteApp,
            ILogger logger)
        {
            this.logger = logger;
            this.oneNoteApp = oneNoteApp;

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
                xml = await this.oneNoteApp.GetPageContentAsync(((OneNoteDocumentId)documentId).PageId);
                //html = Regex.Replace(html, "([^>])(\\n|&nbsp;)([^<])", "$1 $3");      // todo: разобраться, нужно ли это сейчас       
            }

            if (xml != null)
                return XDocument.Parse(xml);

            throw new NotSupportedException(documentId.GetType().Name);
        }

        public void SetDocumentChanged()
        {
            DocumentId.SetChanged();
        }

        public async ValueTask DisposeAsync()
        {
            if (!DocumentId.IsReadonly && DocumentId.Changed)
            {
                await this.oneNoteApp.UpdatePageContentAsync(Document);
            }
        }
    }
}
