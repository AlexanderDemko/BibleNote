using BibleNote.Analytics.Providers.OneNote.Contracts;
using BibleNote.Analytics.Providers.OneNote.Navigation;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using Microsoft.Extensions.Logging;
using System;
using System.Xml.Linq;

namespace BibleNote.Analytics.Providers.OneNote.Services
{
    public class OneNoteDocumentHandler : IXDocumentHandler
    {
        private readonly ILogger _log;

        public XDocument Document { get; private set; }

        public IDocumentId DocumentId { get; private set; }

        public OneNoteDocumentHandler(IDocumentId documentId, ILogger log)
        {
            _log = log;
            DocumentId = documentId;
            Document = ReadDocument(DocumentId);
        }

        private XDocument ReadDocument(IDocumentId documentId)
        {
            string xml = null;

            if (documentId is OneNoteDocumentId)
            {
                using (var oneNoteApp = new OneNoteAppWrapper(_log))
                {
                    xml = oneNoteApp.GetPageContent(((OneNoteDocumentId)documentId).PageId);
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
            if (!DocumentId.IsReadonly && DocumentId.Changed)
            {
                using (var oneNoteApp = new OneNoteAppWrapper(_log))
                {
                    oneNoteApp.UpdatePageContent(Document);
                }
            }
        }
    }
}
