using System;
using BibleNote.Services.Contracts;

namespace BibleNote.Providers.Web.DocumentId
{
    public class WebDocumentId : IDocumentId
    {
        public int DocumentId { get; private set; }

        public Uri Uri { get; private set; }

        public bool IsReadonly => true;

        public bool Changed => false;

        public WebDocumentId(int documentId, Uri uri)
        {
            DocumentId = documentId;
            Uri = uri;
        }

        public void SetChanged()
        {
            throw new NotSupportedException();
        }

        public void SetReadonly()
        {
            throw new NotSupportedException();
        }
    }
}
