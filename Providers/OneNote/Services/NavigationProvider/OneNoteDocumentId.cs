using System;
using BibleNote.Services.DocumentProvider.Contracts;

namespace BibleNote.Providers.OneNote.Services.NavigationProvider
{
    public class OneNoteDocumentId : IDocumentId
    {
        public int DocumentId { get; private set; }

        public string PageId { get; private set; }

        public bool IsReadonly => false;

        public bool Changed { get; private set; }

        public OneNoteDocumentId(int documentId, string pageId)
        {
            DocumentId = documentId;
            PageId = pageId;
        }

        public void SetChanged()
        {
            Changed = true;
        }

        public void SetReadonly()
        {
            throw new NotSupportedException("OneNote pages cannot be readonly");
        }
    }
}
