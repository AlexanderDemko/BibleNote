using BibleNote.Analytics.Contracts.Providers;
using System;

namespace BibleNote.Analytics.Providers.Web.Navigation
{
    public class WebDocumentId: IDocumentId
    {
        public int DocumentId { get; private set; }

        public Uri Uri { get; private set; }

        public bool IsReadonly { get { return true; } }

        public bool Changed { get { return false; } set { } }

        public WebDocumentId(int documentId, Uri uri)
        {
            DocumentId = documentId;
            Uri = uri;            
        }
    }
}
