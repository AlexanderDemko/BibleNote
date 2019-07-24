using BibleNote.Analytics.Services.DocumentProvider.Contracts;

namespace BibleNote.Analytics.Providers.OneNote.Navigation
{
    public class OneNoteDocumentId : IDocumentId
    {
        public int DocumentId { get; private set; }

        public string PageId { get; private set; }

        public bool IsReadonly { get { return false; } }

        public bool Changed { get; set; }        

        public OneNoteDocumentId(int documentId, string pageId)
        {
            DocumentId = documentId;
            PageId = pageId;            
        }
    }
}
