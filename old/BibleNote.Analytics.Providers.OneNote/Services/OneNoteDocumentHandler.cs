using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Core.Contracts;
using BibleNote.Analytics.Providers.OneNote.Contracts;
using BibleNote.Analytics.Providers.OneNote.Navigation;
using System;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace BibleNote.Analytics.Providers.OneNote.Services
{
    public class OneNoteDocumentHandler : IXDocumentHandler
    {
        public XDocument Document { get; private set; }

        public IDocumentId DocumentId { get; private set; }

        public OneNoteDocumentHandler(IDocumentId documentId)
        {
            DocumentId = documentId;
            Document = ReadDocument(DocumentId);
        }

        private static XDocument ReadDocument(IDocumentId documentId)
        {
            string xml = null;

            if (documentId is OneNoteDocumentId)
            {
                using (var oneNoteApp = new OneNoteAppWrapper())
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
            DocumentId.Changed = true;
        }

        public void Dispose()
        {
            if (!DocumentId.IsReadonly && DocumentId.Changed)
            {
                using (var oneNoteApp = new OneNoteAppWrapper())
                {
                    oneNoteApp.UpdatePageContent(Document);
                }
            }
        }
    }
}
