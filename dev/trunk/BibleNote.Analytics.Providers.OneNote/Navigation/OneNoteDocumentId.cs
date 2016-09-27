using BibleNote.Analytics.Contracts.Providers;

namespace BibleNote.Analytics.Providers.OneNote.Navigation
{
    public class OneNoteDocumentId : IDocumentId
    {
        public string PageId { get; private set; }

        public bool IsReadonly { get { return false; } }

        public bool Changed { get; set; }

        public OneNoteDocumentId(string pageId)
        {
            PageId = pageId;            
        }
    }
}
