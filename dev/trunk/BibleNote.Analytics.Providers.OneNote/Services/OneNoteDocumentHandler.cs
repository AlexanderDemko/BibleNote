using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Providers.OneNote.Contracts;
using BibleNote.Analytics.Providers.OneNote.Navigation;
using HtmlAgilityPack;
using System;

namespace BibleNote.Analytics.Providers.OneNote.Services
{
    public class OneNoteDocumentHandler : IOneNoteDocumentHandler
    {
        public HtmlDocument HtmlDocument { get; private set; }

        public IDocumentId DocumentId { get; private set; }

        public OneNoteDocumentHandler(IDocumentId documentId)
        {
            DocumentId = documentId;
            HtmlDocument = ReadDocument(DocumentId);
        }

        private static HtmlDocument ReadDocument(IDocumentId documentId)
        {
            string html = null;

            if (documentId is OneNoteDocumentId)
            {
                using (var oneNoteApp = new OneNoteAppWrapper())
                {
                    html = oneNoteApp.GetPageContent(((OneNoteDocumentId)documentId).PageId);
                }
            }            

            if (html != null)
            {
                var htmlDoc = new HtmlDocument();
                htmlDoc.LoadHtml(html);
                return htmlDoc;
            }

            throw new NotSupportedException(documentId.GetType().Name);
        }

        public void SetDocumentChanged()
        {
            DocumentId.Changed = true;
        }

        public void Dispose()
        {
            if (!DocumentId.IsReadonly && DocumentId.Changed)
            {
                throw new NotImplementedException();
            }
        }
    }
}
